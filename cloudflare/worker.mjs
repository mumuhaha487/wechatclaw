const json = (value, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export default {
  async fetch(request, env) {
    if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405 });
    const url = new URL(request.url), latest = await env.RELEASES.get("latest.json");
    const release = latest ? await latest.json() : null;
    if (["/api/version", "/version.json"].includes(url.pathname)) return release ? json(release) : json({ error: "新版正在准备中" }, 503);
    const download = /^\/download\/(?:(\d+\.\d+\.\d+)\/)?(QQClaw(?:-Setup)?\.exe)$/.exec(url.pathname);
    if (download) {
      if (!release) return new Response("安装包正在准备中", { status: 503 });
      if (!download[1]) return Response.redirect(`${url.origin}/download/${release.version}/${download[2]}`, 302);
      const object = await env.RELEASES.get(`releases/${download[1]}/${download[2]}`, { range: request.headers });
      if (!object) return new Response("安装包不存在，请重新检查最新版本。", { status: 404 });
      const partial = request.headers.has("range") && object.range;
      const headers = new Headers({ "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${download[2]}"`,
        "Content-Length": String(partial ? object.range.length : object.size), "Accept-Ranges": "bytes", "ETag": object.httpEtag,
        "Cache-Control": "public, max-age=31536000, immutable" });
      if (partial) headers.set("Content-Range", `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`);
      return new Response(request.method === "HEAD" ? null : object.body, { status: partial ? 206 : 200, headers });
    }
    if (url.pathname !== "/") return new Response("Not found", { status: 404 });
    const version = release ? `v${escape(release.version)}` : "新版正在准备中";
    const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Wechatclaw · 下载 QQClaw</title><style>*{box-sizing:border-box}body{margin:0;background:#fafafa;color:#181818;font:16px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei UI",sans-serif}main{max-width:800px;margin:auto;padding:80px 28px}header{display:flex;align-items:center;gap:12px;font-weight:600;letter-spacing:.01em}svg{width:30px;height:30px}h1{font-size:clamp(34px,6vw,54px);line-height:1.2;font-weight:600;letter-spacing:-.035em;margin:64px 0 22px}p{color:#666;max-width:600px}.version{font-size:14px;color:#777;margin-bottom:24px}.downloads{display:flex;gap:12px;flex-wrap:wrap;margin:32px 0 20px}a{color:inherit}.download{display:inline-flex;align-items:center;text-decoration:none;padding:12px 24px;background:#171717;color:white;border:1px solid #171717;border-radius:9px}.secondary{background:white;color:#222;border-color:#ddd}.detail{font-size:14px;color:#777}section{border-top:1px solid #e4e4e4;margin-top:64px;padding-top:24px}h2{font-size:19px;font-weight:600}footer{margin-top:64px;font-size:13px;color:#888}a:focus-visible{outline:3px solid #aaa;outline-offset:4px}</style><main><header><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M7 6h18v15H15l-8 6V6Z"/><path d="M12 12h8M12 16h5"/></svg>Wechatclaw</header><h1>在电脑上编程，<br>从微信里继续。</h1><p>QQClaw 将 Codex 和微信连接到同一个工作台。关闭窗口后可留在托盘，微信连接与任务继续运行。</p><div class="version">Windows 最新版本 · ${version}</div>${release ? '<div class="downloads"><a class="download" href="/download/QQClaw-Setup.exe">下载安装包</a><a class="download secondary" href="/download/QQClaw.exe">下载独立 EXE</a></div>' : ""}<p class="detail">Windows 10 / 11 · x64。安装包支持选择安装目录；已有程序会自动检查并下载更新。</p><section><h2>更新说明</h2><p>${escape(release?.notes || "安装包正在准备中，请稍后再来。")}</p><a class="detail" href="/api/version">查看版本信息</a></section><footer>QQClaw 为独立开源项目 · <a href="https://github.com/mumuhaha487/wechatclaw">查看项目</a></footer></main></html>`;
    return new Response(request.method === "HEAD" ? null : html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" } });
  },
};
