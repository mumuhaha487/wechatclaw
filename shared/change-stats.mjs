export function groupChanges(changes = []) {
  const groups = new Map();
  for (const change of changes) {
    const key = change.path;
    if (!key) continue;
    const group = groups.get(key) || { ...change, diffs: [] };
    if (change.diff) group.diffs.push(change.diff);
    for (const diff of change.diffs || []) if (typeof diff === "string" && !group.diffs.includes(diff)) group.diffs.push(diff);
    if (change.stats) group.stats = change.stats;
    groups.set(key, group);
  }
  return [...groups.values()];
}
