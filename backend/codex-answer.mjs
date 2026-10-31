import { goalSnapshot, goalStatusLabel } from "../shared/goal.mjs";
import { safeError } from "./store.mjs";
import { parseActionBlocksSafe } from "./wechat-actions.mjs";
import { workspaceKey } from "../shared/workspace.mjs";

// A persisted Codex goal can start another native turn after turn/completed.
// Keep one application run (and its workspace lock/channel) until that goal
// stops and the last native turn has actually finished. There is no task timer.
export async function answerTurns(client, session, turnParams, onEvent, { goal, prepare } = {}) {
  if (client.active) throw new Error("这个会话已有运行中的任务。");
  let current = goalSnapshot(session.goal, session.threadId);
  if (goal || prepare && session.threadId) {
    try {
      current = await client.readGoal(session);
      if (!current || current.objective !== session.goal?.objective || current.createdAt !== session.goal?.createdAt) session.goalMessageIndex = undefined;
      session.goal = current;
    }
    catch (error) {
      const missingThread = /^no rollout found for thread id |^thread not found/i.test(error.message);
      const unsupported = error.rpcCode === -32601 || /method not found|unknown method|unsupported method|unknown variant.*thread\/goal\/get|goals feature is disabled/i.test(error.message);
      if (goal?.resume || !missingThread && (goal || !unsupported)) throw error;
      current = null;
    }
    if (goal?.resume && !current) throw new Error("Codex中没有可继续的目标，请重新设置。");
    if (goal?.resume && current.status === "complete") throw new Error("这个目标已经完成，请设置新目标。");
  }
  if (goal?.objective && current && (current.objective !== goal.objective || current.status === "complete")) {
    // Older Codex builds retain accounting when goal/set changes an objective.
    // An explicit replacement starts a fresh native goal; resuming never clears
    // it. Historical goal usage remains in the application's run transcript.
    await client.clearGoal(session);
    current = null;
  }
  const active = client.active = {
    threadId: session.threadId, turnId: null, interrupted: false,
    permission: session.permission, goal: current,
  };
  let trackingGoal = Boolean(goal || active.goal?.status === "active"), starting = true, goalRevision = 0;
  const messages = new Map(), phases = new Map(), completed = [], completedIds = new Set(), reported = new Set(), early = [];
  return new Promise((resolve, reject) => {
    let settled = false, wakePrepared;
    const preparedTurn = new Promise(resolve => { wakePrepared = resolve; });
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      wakePrepared();
      client.off("notification", listener); client.off("closed", onClosed);
      if (client.active === active) client.active = null;
      client.dismissApprovals();
      if (error && (active.turnId || active.goal?.status === "active")) client.close(true);
      error ? reject(error) : resolve(result);
    };
    const progress = record => {
      if (!record.reply || reported.has(record.id)) return;
      reported.add(record.id);
      const parsed = parseActionBlocksSafe(record.reply);
      const text = [parsed.visibleText || (parsed.actions.send.length ? "本阶段包含附件。" : ""),
        parsed.discarded ? "（附件指令无法解析，相关文件未发送。）" : ""].filter(Boolean).join("\n");
      onEvent({ method: "qqclaw/goalProgress", params: { threadId: session.threadId, turnId: record.id, text, attachments: parsed.actions.send } });
    };
    const settleIdle = () => {
      if (settled || starting || active.turnId || !completed.length) return;
      const last = completed.at(-1);
      if (last.status !== "completed" && last.status !== "interrupted") {
        finish(new Error(safeError(last.error?.message || `Codex 任务状态：${last.status}`, [client.profile.apiKey])));
        return;
      }
      if (trackingGoal && active.goal?.status === "active" && !active.interrupted) return;
      if (trackingGoal) for (const record of completed.slice(0, -1)) progress(record);
      const status = active.interrupted || last.status === "interrupted" ? "任务已停止。"
        : trackingGoal && active.goal && active.goal.status !== "complete" ? `目标${goalStatusLabel(active.goal.status)}。` : "";
      let reply = last.reply;
      if (trackingGoal) {
        const files = new Map(), parsedFinal = parseActionBlocksSafe(last.reply);
        let discarded = 0;
        for (const record of completed) {
          const parsed = parseActionBlocksSafe(record.reply); discarded += parsed.discarded;
          for (const attachment of parsed.actions.send) files.set(workspaceKey(attachment.path), attachment);
        }
        // A file requested by an intermediate native turn must survive even if
        // the final summary does not repeat it. Delivery remains one outbox at
        // task end, so progress cannot consume its file slots.
        if (files.size || discarded) {
          const actions = { send: [...files.values()], ...(parsedFinal.actions.control.length ? { control: parsedFinal.actions.control } : {}) };
          reply = [parsedFinal.visibleText, discarded ? "（附件指令无法解析，相关文件未发送。）" : "",
            files.size || actions.control ? "```codex-weixin-actions\n" + JSON.stringify(actions) + "\n```" : ""].filter(Boolean).join("\n\n");
        }
      }
      finish(null, [reply, status].filter(Boolean).join("\n\n") || "已完成。");
    };
    const acceptGoal = value => {
      active.goal = goalSnapshot(value, session.threadId);
      goalRevision++;
      if (active.goal) trackingGoal = true;
      if (active.goal?.status !== "active") wakePrepared();
    };
    const refreshGoal = async () => {
      const revision = goalRevision;
      const snapshot = await client.readGoal(session);
      if (settled) return;
      // A live goal event received while metadata was in flight is newer.
      if (revision === goalRevision) acceptGoal(snapshot);
      settleIdle();
    };
    const onClosed = error => finish(error);
    const listener = ({ method, params: p }) => {
      if (settled || client.active !== active || p?.threadId !== session.threadId) return;
      try {
        if (method === "thread/goal/updated" || method === "thread/goal/cleared") {
          acceptGoal(method === "thread/goal/cleared" ? null : p.goal);
          onEvent({ method, params: p }); settleIdle(); return;
        }
        const turnId = p.turnId || p.turn?.id;
        if (method === "turn/started") {
          if (completedIds.has(turnId) || active.turnId && active.turnId !== turnId) return;
          if (trackingGoal) for (const record of completed) progress(record);
          active.turnId = turnId;
          wakePrepared();
          onEvent({ method, params: p });
          if (active.interrupted) client.interrupt().catch(error => finish(error));
          return;
        }
        if (!active.turnId && !completed.length && starting) { early.push({ method, params: p }); return; }
        if (turnId && turnId !== active.turnId) return;
        if (method === "item/started" && p.item?.type === "agentMessage" && p.item.phase) phases.set(p.item.id, p.item.phase);
        if (method === "item/completed" && p.item?.type === "agentMessage") {
          if (!p.item.phase && phases.has(p.item.id)) p = { ...p, item: { ...p.item, phase: phases.get(p.item.id) } };
          messages.set(p.item.id, p.item);
        }
        onEvent({ method, params: p });
        if (method !== "turn/completed" || completedIds.has(p.turn?.id)) return;
        const all = [...messages.values(), ...(p.turn.items || []).filter(item => item.type === "agentMessage" && !messages.has(item.id))];
        completed.push({ id: p.turn.id, status: p.turn.status, error: p.turn.error,
          reply: all.filter(item => item.phase !== "commentary").map(item => item.text).filter(Boolean).join("\n\n") });
        completedIds.add(p.turn.id); messages.clear(); phases.clear(); active.turnId = null;
        if (trackingGoal) refreshGoal().catch(error => finish(error));
        else settleIdle();
      } catch (error) { finish(error); }
    };
    client.on("notification", listener); client.on("closed", onClosed);
    (async () => {
      // thread/resume can itself start an active native goal. The observer and
      // application checkpoint must already exist before preparing the thread.
      if (prepare) await prepare();
      if (settled) return;
      active.threadId = session.threadId;
      // The resume response can precede turn/started. An active stored goal is
      // already scheduled by Codex; wait for that native event before sending
      // explicit input, rather than racing it with a second turn/start.
      if (prepare && current?.status === "active" && active.goal?.status === "active" && !active.turnId && !completed.length && !active.interrupted) await preparedTurn;
      if (settled) return;
      if (active.interrupted) {
        starting = false; await client.interrupt();
        if (!active.turnId && !completed.length) finish(null, "任务已停止。");
        else settleIdle();
        return;
      }
      if (goal?.resume && active.goal?.status === "complete") {
        starting = false;
        if (!active.turnId && !completed.length) finish(null, "目标已完成。");
        else settleIdle();
        return;
      }
      const activateGoal = async () => {
        const revision = goalRevision;
        const snapshot = await client.writeGoal(session, {
          ...(goal.resume ? {} : { objective: goal.objective }), status: "active",
          ...(goal.tokenBudget !== undefined ? { tokenBudget: goal.tokenBudget } : {}),
        });
        if (!settled && revision === goalRevision) acceptGoal(snapshot);
      };
      if (goal?.controlOnly) {
        // Setting an existing message as a goal and resuming are native goal
        // mutations. Do not replay their original user turn or send a duplicate
        // "continue" input; Codex schedules the goal continuation itself.
        if (!goal.resume || active.goal?.status !== "active" || goal.tokenBudget !== undefined) await activateGoal();
        if (settled) return;
        starting = false;
        if (active.interrupted) await client.interrupt();
        settleIdle(); return;
      }
      if (active.turnId) {
        // The native goal resumed before the explicit input arrived. Steer
        // that real turn once; starting a second turn would lose its ownership.
        await client.request("turn/steer", { threadId: session.threadId, expectedTurnId: active.turnId, input: turnParams.input });
      } else {
        const result = await client.request("turn/start", { ...turnParams, threadId: session.threadId });
        if (settled) return;
        if (!active.turnId && !completedIds.has(result.turn.id)) active.turnId = result.turn.id;
      }
      for (const event of early.splice(0)) listener(event);
      if (goal && !active.interrupted && !(goal.resume && active.goal?.status === "complete") && !completed.some(record => record.status !== "completed")) {
        await activateGoal();
      }
      starting = false;
      if (active.interrupted) await client.interrupt();
      settleIdle();
    })().catch(error => finish(error));
  });
}
