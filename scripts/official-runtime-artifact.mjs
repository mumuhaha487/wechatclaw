import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export async function importOfficialRuntime(source, staging) {
  const manifest = JSON.parse(await fs.readFile(path.join(source, "runtime.json"), "utf8"));
  if (manifest.version !== 1 || manifest.platform !== "win32") throw new Error("Provide the Windows official-browser runtime prepared by scripts/vendor-official-runtime.mjs.");
  const extension = JSON.parse(await fs.readFile(path.join(source, "extension/manifest.json"), "utf8"));
  const id = createHash("sha256").update(Buffer.from(extension.key || "", "base64")).digest("hex").slice(0, 32).replace(/[0-9a-f]/g, c => String.fromCharCode(97 + parseInt(c, 16)));
  if (id !== "hehggadaopoacecdllhhajmbjkdcmajg" || !extension.permissions?.includes("nativeMessaging")) throw new Error("The bundled extension must be the original official ChatGPT extension.");
  for (const file of ["node/bin/node.exe", "node/bin/node_repl.exe", "plugin/scripts/browser-client.mjs", "plugin/scripts/browser-service.mjs", "plugin/extension-host/windows/x64/extension-host.exe"])
    if (!(await fs.stat(path.join(source, file))).isFile()) throw new Error("Missing official runtime file: " + file);
  await fs.cp(source, path.join(staging, "official-browser"), { recursive: true, dereference: true });
}
