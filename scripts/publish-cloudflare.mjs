import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { createHash, createHmac } from "node:crypto";

const root = path.resolve(import.meta.dirname, "..");
const account = process.env.CLOUDFLARE_ACCOUNT_ID, token = process.env.CLOUDFLARE_API_TOKEN;
const access = process.env.R2_ACCESS_KEY_ID, secret = process.env.R2_SECRET_ACCESS_KEY;
const bucket = "wechatclaw-releases", worker = "wechatclaw", domain = "claw.inc.re";
const option = name => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
if (!account || !token) throw new Error("请通过环境变量配置 CLOUDFLARE_ACCOUNT_ID 和 CLOUDFLARE_API_TOKEN。");
async function api(route, options = {}) {
  const response = await fetch("https://api.cloudflare.com/client/v4" + route, { ...options, headers: { Authorization: "Bearer " + token, ...options.headers } });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(`Cloudflare HTTP ${response.status}: ${(data.errors || []).map(e => e.message).join("；")}`);
  return data.result;
}
const hmac = (key, value) => createHmac("sha256", key).update(value).digest();
async function put(key, body, size, contentType) {
  if (!access || !secret) throw new Error("请配置 R2_ACCESS_KEY_ID 和 R2_SECRET_ACCESS_KEY。");
  const url = new URL(`https://${account}.r2.cloudflarestorage.com/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`);
  const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ""), day = date.slice(0, 8), scope = `${day}/auto/s3/aws4_request`;
  const headers = `host:${url.host}\nx-amz-content-sha256:UNSIGNED-PAYLOAD\nx-amz-date:${date}\n`;
  const signed = "host;x-amz-content-sha256;x-amz-date";
  const canonical = `PUT\n${url.pathname}\n\n${headers}\n${signed}\nUNSIGNED-PAYLOAD`;
  const keyDate = hmac("AWS4" + secret, day), keyRegion = hmac(keyDate, "auto"), keyService = hmac(keyRegion, "s3"), keySign = hmac(keyService, "aws4_request");
  const signature = createHmac("sha256", keySign).update(`AWS4-HMAC-SHA256\n${date}\n${scope}\n${createHash("sha256").update(canonical).digest("hex")}`).digest("hex");
  const response = await fetch(url, { method: "PUT", headers: { "x-amz-date": date, "x-amz-content-sha256": "UNSIGNED-PAYLOAD", "Content-Type": contentType, "Content-Length": String(size), Authorization: `AWS4-HMAC-SHA256 Credential=${access}/${scope}, SignedHeaders=${signed}, Signature=${signature}` }, body, duplex: "half", signal: AbortSignal.timeout(20 * 60 * 1000) });
  if (!response.ok) throw new Error(`R2 上传 ${key} 失败（HTTP ${response.status}）。`);
}
const buckets = await api(`/accounts/${account}/r2/buckets`);
if (!buckets.buckets.some(value => value.name === bucket)) await api(`/accounts/${account}/r2/buckets`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: bucket }) });
const metadata = { main_module: "worker.mjs", compatibility_date: "2026-11-06", bindings: [{ type: "r2_bucket", name: "RELEASES", bucket_name: bucket }] };
const form = new FormData(); form.set("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
form.set("worker.mjs", new Blob([await fs.readFile(path.join(root, "cloudflare/worker.mjs"))], { type: "application/javascript+module" }), "worker.mjs");
await api(`/accounts/${account}/workers/scripts/${worker}`, { method: "PUT", body: form });
const zones = await api("/zones?name=inc.re");
if (!zones.length) throw new Error("当前账户中没有 inc.re 域名。");
await api(`/accounts/${account}/workers/domains`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hostname: domain, service: worker, environment: "production", zone_id: zones[0].id }) });
console.log(`Worker ${worker} 已部署，域名 https://${domain}`);
if (!process.argv.includes("--deploy-only")) {
  const manifest = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
  const directory = path.resolve(option("--release-directory") || path.join(root, "release"));
  const windows = {};
  for (const [kind, name] of [["installer", "QQClaw-Setup.exe"], ["portable", "QQClaw.exe"]]) {
    const file = path.join(directory, name), stat = await fs.stat(file), hash = createHash("sha256");
    for await (const bytes of createReadStream(file)) hash.update(bytes);
    windows[kind] = { url: `https://${domain}/download/${manifest.version}/${name}`, size: stat.size, sha256: hash.digest("hex") };
    await put(`releases/${manifest.version}/${name}`, createReadStream(file), stat.size, "application/octet-stream");
    console.log(`${name} 已上传`);
  }
  const body = Buffer.from(JSON.stringify({ version: manifest.version, publishedAt: new Date().toISOString(), notes: option("--notes") || "新增关闭到托盘、关闭方式设置、Windows 安装包和自动更新。", windows }, null, 2));
  await put("latest.json", body, body.length, "application/json");
  console.log(`版本 ${manifest.version} 已发布：https://${domain}/api/version`);
}
