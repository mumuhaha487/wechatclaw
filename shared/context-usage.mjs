// Codex `total` accumulates billing across turns. Only `last` describes the
// latest context sample; using total makes a long conversation stick at 100%.
export function contextSnapshot(usage) {
  const valid = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
  const last = usage?.last;
  const used = valid(last?.totalTokens) ? last.totalTokens
    : valid(last?.inputTokens) && valid(last?.outputTokens) ? last.inputTokens + last.outputTokens
    : null;
  const window = valid(usage?.modelContextWindow) && usage.modelContextWindow > 0
    ? usage.modelContextWindow : null;
  return { used, window, percent: used !== null && window !== null ? Math.min(100, used / window * 100) : null };
}
