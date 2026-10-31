// Preserve case on POSIX volumes (including case-sensitive APFS). Windows
// drive/UNC paths keep their identity even when a backup is read on a Mac.
export const workspaceKey = (value) => {
  const text = String(value || "");
  const windows = /^(?:[a-z]:[\\/]|\\\\)/i.test(text) ||
    (typeof process !== "undefined" && process.platform === "win32") ||
    (typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent));
  const key = (windows ? text.replace(/\\/g, "/") : text).replace(/\/+$/, "") || (text.startsWith("/") ? "/" : "");
  return windows ? key.toLowerCase() : key;
};
export const sameWorkspace = (a, b) => Boolean(a && b) && workspaceKey(a) === workspaceKey(b);
