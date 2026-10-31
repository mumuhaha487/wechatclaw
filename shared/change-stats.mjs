function lines(text) {
  const result = text.replace(/\r\n/g, "\n").split("\n");
  if (result.at(-1) === "") result.pop();
  return result;
}
// Exact edit distance with bounded work; complex/binary changes have no numeric
// count rather than an estimate presented as a measured diff.
export function lineChanges(before, after, budget = 2000000) {
  const a = lines(before), b = lines(after);
  let start = 0, endA = a.length, endB = b.length;
  while (start < endA && start < endB && a[start] === b[start]) start++;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const n = endA - start, m = endB - start;
  if (!n || !m) return { added: m, removed: n };
  if (n + m > 100000) return null;
  let frontier = new Map([[1, 0]]), work = 0;
  for (let distance = 0; distance <= n + m; distance++) {
    const next = new Map();
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      if (++work > budget) return null;
      let x = diagonal === -distance || (diagonal !== distance && (frontier.get(diagonal - 1) ?? -1) < (frontier.get(diagonal + 1) ?? -1))
        ? frontier.get(diagonal + 1) || 0 : (frontier.get(diagonal - 1) || 0) + 1;
      let y = x - diagonal;
      while (x < n && y < m && a[start + x] === b[start + y]) {
        x++; y++;
        if (++work > budget) return null;
      }
      if (x >= n && y >= m) return { added: (distance + m - n) / 2, removed: (distance + n - m) / 2 };
      next.set(diagonal, x);
    }
    frontier = next;
  }
  return null;
}

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
