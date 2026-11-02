import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const processes = text => text.split("\n").flatMap(line => {
  const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
  return match ? [{ pid: Number(match[1]), parent: Number(match[2]), executable: match[3] }] : [];
});

// Enumerate only the exact copied host and its actual application-owned
// descendants. Multiple private profiles can launch this same signed host.
export async function macOfficialTransports({ browserPid, applicationPid, nativeHost, timeoutMs = 22000 }) {
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
    const hosts = all.filter(value => value.executable === nativeHost && ownedBy(value, browserPid));
    const result = [];
    for (const host of hosts) {
      const sockets = await exec("/usr/sbin/lsof", ["-a", "-p", String(host.pid), "-U", "-Fn"]).catch(() => ({ stdout: "" }));
      const paths = [...new Set(sockets.stdout.split("\n").filter(line => /^n\/(?:private\/)?tmp\/codex-browser-use\/[a-f0-9-]{36}\.sock$/i.test(line)).map(line => line.slice(1)))];
      if (paths.length > 1) throw new Error("一个官方扩展宿主出现多个浏览通道。");
      if (paths.length === 1 && (await fs.stat(paths[0]).catch(error => { if (error.code !== "ENOENT") throw error; }))?.isSocket())
        result.push({ browserPid, applicationPid, hostPid: host.pid, nativeHost, paths, verifiedOwned: true });
    }
    if (result.length) return result;
    await new Promise(resolve => setTimeout(resolve, 250));
  } while (Date.now() < deadline);
  throw new Error("本会话的官方浏览器扩展未建立连接，请重试。");
}

export async function macOfficialTransport(options) {
  const result = await macOfficialTransports(options);
  if (result.length !== 1) throw new Error("本会话出现多个官方扩展宿主，需要进一步确认配置归属。");
  return result[0];
}
