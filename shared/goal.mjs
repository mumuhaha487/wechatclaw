export const GOAL_STATUSES = ["active", "paused", "blocked", "usageLimited", "budgetLimited", "complete"];

export function goalSnapshot(value, threadId) {
  if (!value || value.threadId !== threadId || typeof value.objective !== "string" || !GOAL_STATUSES.includes(value.status)) return null;
  return Object.fromEntries(["threadId", "objective", "status", "tokenBudget", "tokensUsed", "timeUsedSeconds", "createdAt", "updatedAt"]
    .filter(key => value[key] !== undefined).map(key => [key, value[key]]));
}

export function goalRequest(objective, tokenBudget) {
  objective = String(objective || "").trim();
  if (!objective || [...objective].length > 4000) throw new Error("目标需要填写1至4000个字符。");
  const result = { objective, status: "active" };
  if (tokenBudget !== undefined && tokenBudget !== null && tokenBudget !== "") {
    const budget = Number(tokenBudget);
    if (!Number.isSafeInteger(budget) || budget <= 0) throw new Error("目标Token预算必须是正整数；留空表示不设置预算。");
    result.tokenBudget = budget;
  }
  return result;
}

export function goalStatusLabel(status) {
  return { active: "进行中", paused: "已暂停", blocked: "遇到阻碍", usageLimited: "额度受限", budgetLimited: "已达预算", complete: "已完成" }[status] || "未知状态";
}
