import { sameWorkspace } from "./workspace.mjs";

// Persist identity and selection only. File contents remain in encrypted snapshots.
export function reviewView(value, sessions = []) {
  if (!value || typeof value !== "object" || typeof value.sessionId !== "string" ||
      typeof value.workspace !== "string" || typeof value.checkpointId !== "string" ||
      !Number.isInteger(value.message) || value.message < 0) return null;
  const session = sessions.find(s => s.id === value.sessionId);
  const checkpoint = session?.messages[value.message]?.runStats?.checkpoint;
  if (!checkpoint?.id || value.checkpointId !== checkpoint.id || !sameWorkspace(value.workspace, session.workspace)) return null;
  return {
    sessionId: session.id,
    workspace: session.workspace,
    message: value.message,
    checkpointId: checkpoint.id,
    relative: typeof value.relative === "string" && value.relative.length <= 4096 && !value.relative.includes("\0") ? value.relative : "",
    open: value.open === true,
  };
}
