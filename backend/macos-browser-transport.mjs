import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const processes = text => text.split("\n").flatMap(line => {
  const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
  return match ? [{ pid: Number(match[1]), parent: Number(match[2]), executable: match[3] }] : [];
});

// Look only for the exact host installed for this session, and follow its
// actual parent chain. Never select a global Desktop/Chrome socket by age.
export async function macOfficialTransport({ browserPid, applicationPid, nativeHost, profileDirectory, timeoutMs = 22000 }) {
  if (process.platform !== "darwin") throw new Error("Mac 官方浏览通道需要 macOS。");
  if (![browserPid, applicationPid].every(value => Number.isSafeInteger(value) && value > 0) || !path.isAbsolute(nativeHost))
    throw new Error("Mac 浏览器所属进程无效。");
  await exec("/usr/bin/codesign", ["--verify", "--strict", "-R=anchor apple generic and certificate leaf[subject.OU] = \"2DC432GLL2\"", nativeHost]);
  const deadline = Date.now() + timeoutMs;
  do {
    const all = processes((await exec("/bin/ps", ["-axo", "pid=,ppid=,comm="])).stdout);
    const ownedBy = (value, pid) => {
      const seen = new Set();
      while (value && !seen.has(value.pid)) {
        if (value.pid === pid) return true;
        seen.add(value.pid); value = all.find(item => item.pid === value.parent);
      }
      return false;
    };
    const browser = all.find(value => value.pid === browserPid);
    if (!browser || !ownedBy(browser, applicationPid)) throw new Error("本会话浏览器已退出或不属于当前应用。");
    let hosts = all.filter(value => value.executable === nativeHost && ownedBy(value, browserPid));
    if (profileDirectory) {
      const selected = [];
      for (const host of hosts) {
        const args = (await exec("/bin/ps", ["-p", String(host.pid), "-o", "args="])).stdout;
        // Chromium supplies the actual source profile in its standard native
        // messaging reconnect argument. Read it; never manufacture one.
        const encoded = args.match(/--reconnect-command=([A-Za-z0-9+/=_-]+)/)?.[1];
        if (!encoded) continue;
        let command;
        try { command = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")); } catch { continue; }
        if (!Array.isArray(command) || command.some(value => typeof value !== "string")) continue;
        const directory = command.find(value => value.startsWith("--user-data-dir="))?.slice("--user-data-dir=".length);
        const profile = command.find(value => value.startsWith("--profile-directory="))?.slice("--profile-directory=".length);
        if (directory && profile && path.resolve(directory, profile) === path.resolve(profileDirectory)) selected.push(host);
      }
      hosts = selected;
    }
    if (hosts.length > 1) throw new Error("本会话出现多个官方扩展宿主，无法唯一确定连接。");
    if (hosts.length === 1) {
      const sockets = await exec("/usr/sbin/lsof", ["-a", "-p", String(hosts[0].pid), "-U", "-Fn"]).catch(() => ({ stdout: "" }));
      const paths = [...new Set(sockets.stdout.split("\n").filter(line => /^n\/(?:private\/)?tmp\/codex-browser-use\/[a-f0-9-]{36}\.sock$/i.test(line)).map(line => line.slice(1)))];
      if (paths.length > 1) throw new Error("本会话出现多个官方浏览通道。");
      if (paths.length === 1 && (await fs.stat(paths[0])).isSocket())
        return { browserPid, applicationPid, hostPid: hosts[0].pid, nativeHost, profileDirectory, paths, verifiedOwned: true };
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  } while (Date.now() < deadline);
  throw new Error("本会话的官方浏览器扩展未建立连接，请重试。");
}
