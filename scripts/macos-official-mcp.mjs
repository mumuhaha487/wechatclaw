import fs from "node:fs/promises";
import path from "node:path";
import { openMacOfficialRuntime } from "../backend/macos-official-runtime.mjs";

async function main() {
try {
  if (!path.isAbsolute(process.argv[2] || "")) throw new Error("缺少内置 Mac 官方运行库目录。");
  const root = path.resolve(process.argv[2] || "");
  const manifest = JSON.parse(await fs.readFile(path.join(root, "runtime.json"), "utf8"));
  if (manifest.platform !== "darwin" || manifest.arch !== process.arch || !manifest.includesBrowserCli)
    throw new Error("内置Mac官方浏览运行库不完整。");
  const inside = relative => {
    if (typeof relative !== "string") throw new Error("官方运行库路径缺失。");
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) throw new Error("官方运行库路径无效。");
    return file;
  };
  const env = { ...process.env };
  delete env.QQCLAW_PROVIDER_API_KEY;
  const cli = inside(manifest.paths.codexCliPath);
  env.CODEX_CLI_PATH = cli;
  const runtime = await openMacOfficialRuntime({ cli, nodeRepl: inside(manifest.paths.nodeReplPath), cwd: env.CODEX_HOME, env });
  let stopping;
  const stop = () => stopping ||= (async () => {
    process.stdin.unpipe(runtime.stdin); process.stdin.destroy(); await runtime.close();
  })();
  runtime.stdout.pipe(process.stdout); runtime.stderr.pipe(process.stderr);
  process.stdout.once("error", stop); process.stderr.once("error", stop);
  process.stdin.pipe(runtime.stdin);
  process.stdin.once("error", () => { process.exitCode = 1; void stop(); });
  process.stdin.once("end", stop);
  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) process.once(signal, () => { void stop(); });
  void runtime.done.then(({ code, signal }) => { process.exitCode = code ?? (signal ? 1 : 0); return stop(); });
} catch (error) { process.stderr.write(error.message + "\n"); process.exitCode = 1; }

}
void main();
