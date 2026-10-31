# macOS 适配与对话保存

2026-11-01，当前源码与两端正式成品 **0.3.25**，以白色为主、黑色为辅，整体亮色。Mac 原生窗口和 WebKit 初始使用 aqua/白底，动态主题同步及主动选色保存继续保留。文件与手动网页共用右侧标签栏，按会话及目录隔离；Mac 原生状态同样提供单调 revision。混合标签和文件阅读位置仅在进程内，普通布局偏好现保存至加密 Store 并跨重启恢复；网站登录态仍未保证跨重启。已发送对话和当前任务审阅的加密保存机制不变。官方 ChatGPT 扩展自动调用尚未完成，微信/QQClaw 的自动浏览器任务会如实报告无法完成。最新验收、源码及成品指纹见根目录 `result.md`；下方早期交付记录保留为历史，不能作为当前官方插件成功的证据。

## 0.3.25 当前安装包与网页新窗口

唯一 release/macos/QQClaw.dmg，819,715 bytes，SHA-256 `3739974888AB530AF78FE1338C6150600146ED33931E4E7C6D514902AB55B9C1`。[云构建 41227468490](https://github.com/mumuhaha487/wechatclaw/actions/runs/41227468490) 成功，代码 `e1166079cf58dfcedb8af0e599681166560c8184`，实际 26 条 PASS。下载 ZIP 摘要与 GitHub upload digest 一致，CRC、唯一 DMG 条目及 UDIF koly 尾核查通过，云端完成双架构/签名检查、DMG 校验与只读挂载/安装复制、原生后台及数据重启检查。

WebKit 新窗口由 createWebViewWith 接受原始 configuration，返回真实新 WKWebView，保留源页、POST 请求体、opener 和命名窗口复用；webViewDidClose 关闭对应标签。默认关闭脚本自动弹窗。云组件仅在隔离视图中临时允许脚本弹窗以驱动 delegate，不是可信鼠标或完整产品 GUI 检查；无手势弹窗使用网页 timer，不能用携带宿主手势的 evaluateJavaScript 冒充无手势。

用户截图的 Windows 0x8000000E 在开发候选中复现为 WebView2 deferral 重复结束，已修复；Mac 不使用这套 deferral。原对话保存、独立用户数据和钥匙串策略不变。尚未 Apple 公证或用户 Mac 完整 GUI/输入法/线上微信验收，官方扩展自动浏览仍未接通。

## 0.3.24 历史安装包与浏览记录

唯一 `release/macos/QQClaw.dmg`，817,113 bytes，SHA-256 `E04D6507F9683C8E698AD680C2A44D09C2543C2C61B9C521315FDDCE755B0869`。[云构建 41223051740](https://github.com/mumuhaha487/wechatclaw/actions/runs/41223051740) 成功，代码 `ea341c16895c120a19e782ed56dfae376edc8714`，实际 24 条 PASS。上传 ZIP 摘要匹配、CRC、唯一 DMG 条目和 UDIF 尾检查通过。两次先前失败 run 及修正见 result.md，不能计为成功证据。

Mac 与 Windows 共用新面板布局：会话标题和提示只占左侧，右侧标签从主体顶部开始；默认随窗口比例变化，手动宽度跨重启保存，双击分隔线恢复比例，窄窗口保持可关闭覆盖面板。Windows 最终 298 条 UI/原生集成检查通过；这些检查不等于用户 Mac 的完整 GUI 验收。

浏览记录保存至用户数据目录 `browser-history.json`，使用 Vault/Keychain/AES-GCM 和原子写入，与对话、下载历史分开。成功 didFinish 记录最终 HTTP(S) 地址/标题，随后标题变化仅更新仍存在的记录并保留 ID/时间。去 fragment，同 URL 保留最近一次，全局最多 500 个网址；本系统用户在 QQClaw 内跨会话共用，不按微信账户隔离。地址联想和管理弹窗支持搜索/重开/单条删除、确认清除一小时/一天/全部。清除记录不删 Cookie、下载文件或聊天；文件损坏/写入失败保留原文件并报错。

浏览记录不写入 Codex 原生对话，也不会自动发给模型；已发送消息的 Codex 原生保存及 QQClaw 加密 Store 不变。仅卸载/替换 .app 不删除独立应用数据，主动清理应用数据、钥匙串或 Codex 数据则可能丢失，迁移电脑仍需导出并另行复制所需文件。Mac 云检查实际覆盖 WebKit 成功导航/去重/加密重载/删除、时间范围/500 URL/损坏保留；产品层延迟标题和整应用历史重启检查在 Windows，不冒充 Mac 完整 GUI 验收。仍未 Apple 公证，中文输入法、线上微信、全部 SPA/Cookie/网站权限未完整验收。官方 ChatGPT 扩展自动浏览仍未接通。

## 0.3.23 历史安装包

唯一release/macos/QQClaw.dmg，776,223 bytes，SHA-256 `A900EC41E8759A45C472B967B1A50B31A4FE0F0EA9DCF13E1ABDDF50657DED52`。[云构建41219830143](https://github.com/mumuhaha487/wechatclaw/actions/runs/41219830143)成功，代码`d6c620932aa8959242dced31e6a57a90bd96e2ee`，实际22条PASS，ZIP摘要与上传digest/CRC/UDIF检查通过。Windows最终224条UI/集成检查通过，原对话/账户比较保留。Mac原生下载已实测，不冒充完整产品实机GUI或官方扩展自动调用。

## 0.3.23 下载保存范围

原生 WKDownload 执行网页下载，结果保存在 ~/Downloads/QQClaw 的独立子目录；建议名称会去路径和非法字符，不覆盖同名文件。关闭网页或移除原会话后，下载继续运行，终态后释放隐藏源视图。下载记录独立保存到用户数据目录 browser-downloads.json，使用同一 Vault 的 Keychain/AES-GCM 加密与原子写入；退出整个应用会中断下载，重启显示中断并提示原网页重试，未实现自动续传。

下载记录与会话数据分开，原有对话写入 Codex 原生会话及加密 Store 的逻辑不变。清除下载记录、移除会话、替换应用都不会删除系统下载目录的文件；如用户主动删除应用数据，下载记录可能丢失，已保存的下载文件仍在系统下载目录。对话导出不打包这些下载文件，迁移电脑时需另行复制所需文件。钥匙串或保存路径失败会显示错误并保留旧文件，仍可取消已开始的下载。

本版云验证包含实际文件字节、关闭最后标签后完成、取消、加密历史重建实例读取、清除不删文件及真实历史写入失败后仍可取消。完整App重启下的下载记录检查运行于Windows；不把Mac重建管理器的检查写成Mac整套产品重启GUI验收。最新安装包指纹和云run见result.md。

## 0.3.22 历史安装包

唯一 `release/macos/QQClaw.dmg`，716,136 bytes，SHA-256 `3B27F67B654C0C995DBC09C62D29AF42336D363A169B1FA0DBE979A1067FD159`。[云构建41216927758](https://github.com/mumuhaha487/wechatclaw/actions/runs/41216927758)成功，代码 `bcfbf447316f447a08f0eb0605d124b8c809be07`。实际18条PASS覆盖既有双架构/安装映像/原生后台/菜单主题/手动网页/最后标签/释放/钥匙串/附件/布局/重启/文件快照审阅，并新增真实WKWebView加载本项目标签交互组件后，检查键盘/上下文菜单、焦点、禁用项及批量关闭的归属。

新增组件检查使用DOM事件和记录回调，不冒充可信鼠标拖动或完整产品GUI。149条产品界面检查运行于Windows；Mac拖动/中键/整机完整GUI/中文输入法/线上微信仍未实机验收，仍未Apple公证。下载ZIP摘要与GitHub上传digest一致、CRC及UDIF尾通过。标签/地址草稿仅在进程内，已保存对话和账户仍使用既有加密存储。本版官方扩展自动浏览继续未完成。

## 0.3.21 历史安装包

唯一 `release/macos/QQClaw.dmg`，712,569 bytes，SHA-256 `4C96EB665178E2B8C46EF210238DD546BEC9B91B4768F5169799B0D825003DD5`。[云构建41214700663](https://github.com/mumuhaha487/wechatclaw/actions/runs/41214700663)成功，代码 `2cfaf206ab23e3eb4857eb54e9fa47b3935a2674`。实际17条PASS含新增AppKit全局搜索/局部查找快捷键、当前会话门禁与WebKit分发，及既有双架构/安装、网页/释放、菜单/主题、钥匙串/附件/布局/后台重启、文件快照/审阅检查。下载artifact摘要、ZIP CRC及DMG文件尾已核对。

60条新产品搜索UI检查运行于Windows，另有32条会话及13条布局检查；未冒充用户Mac完整GUI/输入法/线上微信验收。查询和高亮属于进程内显示状态，对话与账户存储机制不变。仍未Apple公证，Swift5既有主线程隔离警告保留。

## 0.3.20 历史安装包

唯一 `release/macos/QQClaw.dmg`，705,042 bytes，SHA-256 `407D47BBED66B74421F9457580EA3CE298255F09077665D14338E094090B5FA8`。[云构建41211705711](https://github.com/mumuhaha487/wechatclaw/actions/runs/41211705711)成功，代码 `0c814fcaac90e18583bd9c172577c23de216b1f8`。实际16条PASS覆盖双架构安装映像、原生菜单/主题/手动网页及dispose、钥匙串/附件/布局/后台重启保存、文件快照/审阅。artifact摘要与上传digest一致，ZIP CRC及DMG尾已核对，旧包仅在项目外备份。

Windows实际EXE完成32条会话、26条亮色与图片、13条布局检查和119项核心回归。Mac本次验证Safari目标打包及上述原生链路，没有冒充用户Mac完整GUI/中文输入法或线上微信验收；未Apple公证，Swift5既有隔离警告保留。旧外观迁移light/version4后，主动选色仍保留；对话、账户及Codex原生历史存储机制不变。

## 0.3.19 历史安装包

唯一 `release/macos/QQClaw.dmg`，705,078 bytes，SHA-256 `CD8B20C160793B5512EE6236C1175E46E2145FA8211DD8BE007CBA0B0A3A218F`。[云构建 41210396857](https://github.com/mumuhaha487/wechatclaw/actions/runs/41210396857)成功，代码 `fa9ff369b81070673ba96e8de46f35f09528b062`。已读取实际原生验证输出，核对 artifact 摘要、ZIP CRC 和 DMG UDIF 尾，替换同名 DMG，旧包仅在项目外。

新增长用户消息折叠、可搜索/定位的会话目录，以及按会话记忆的进程内阅读锚点。29 条新增产品 UI 检查运行于真实 Windows EXE；Mac 通过 Safari 目标打包和既有原生/安装/钥匙串/布局恢复验证，未进行新增交互的 Mac 实机完整 GUI 验收。展开、目录和阅读状态不跨应用重启，不改变原始消息或 Codex 历史。

最低 macOS、双架构、本地签名未公证、网站登录态和官方扩展限制保持；完整人工 GUI/输入法/线上微信仍未验收，既有 Swift 主线程隔离警告仍保留。

## 0.3.18 历史安装包

唯一 `release/macos/QQClaw.dmg`，701,845 bytes，SHA-256 `301F6564F457E80F30E3748771E100FBF2DB6761825BE146FE008A3E0BF29807`。[云构建 41208966933](https://github.com/mumuhaha487/wechatclaw/actions/runs/41208966933)成功，代码 `845d874ea4d517072131d9e1b3dd3a09259121ee`。已读取实际验证输出并核对 artifact 摘要、ZIP CRC 和 DMG UDIF 文件尾，旧包仅在项目外备份。

除双架构、签名/安装、原生菜单/黑白主题、手动网页、附件与钥匙串保存外，本版真实云端检查了移除会话释放网页和观察器、幂等 dispose 与同 ID 重开，以及布局偏好经原生管道/钥匙串和后台重启恢复。普通布局跨重启保存已实现；网页/文件标签和未发送草稿仍只在进程内，网站登录态仍不跨重启保证。官方扩展自动化未接通，不把手动网页验证作为该功能通过。

仍支持 macOS 13.3+、Intel/Apple Silicon；本地签名，未 Apple 公证，未完成用户实机完整 GUI/输入法/线上微信验收。Swift 5 编译保留既有 KVO 主线程隔离警告；未保证 Swift 6 严格模式。Windows 同版 EXE 也已替换并重启，原账户/对话/Provider 保存核对通过。

## 历史成品记录（非当前版本）

- Windows：唯一 `release/QQClaw.exe`，589,312 字节，SHA-256 `A57DFE69A7474D7365A928AE45736AFC457AAFCDE2E4897C765DFB77709D7435`。真实 EXE 已完成输入任务、调用 Codex、内置浏览器填写/提交、显示真实结果的验证。正式程序在确认空闲后正常退出并替换，现已重启；现有 2 个账户、3 个会话保留，新版资源与后台已核对。
- Mac：唯一 `release/macos/QQClaw.dmg`，633,978 字节，SHA-256 `2d2c44f037fbfd139dd7432006d52ee744ea08ecd4a4ff0abf884e77e42fdff0`。macOS 13.3+、Intel / Apple Silicon Universal，ad hoc 签名，尚未 Apple 公证。Artifact 官方摘要、ZIP CRC 和 DMG UDIF 文件尾已核对。
- [云构建 41188625183](https://github.com/mumuhaha487/wechatclaw/actions/runs/41188625183)，应用代码 `18b9e8afd6f67db15c067cc99cfc968d1c1249fe`。通过双架构编译、签名、DMG 挂载安装、原生 WKWebView 打开/填写/提交/截图及协议限制、Node 发现、原生后台、钥匙串、保存与重启恢复检查。
- Windows 使用系统 WebView2，Mac 使用系统 WebKit。Mac 浏览器按账户隔离，但因兼容 macOS 13.3 使用内存数据存储，退出应用后网站登录态不保留；QQClaw 对话、账户和 Codex 原生历史仍正常持久保存。Windows 网站登录态保存在应用数据目录的 `browsers/` 中。
- 119 项既有回归、24 项浏览器检查及断开后重开检查通过；真实 Codex 全自动/询问模式的交互已验证。微信链路采用 API 夹具，模型和原生浏览器真实运行，已核对 typing、进度和最终出站、桌面消息不发微信以及原生历史。Mac 线上微信和完整人工 GUI 仍需实机验收。
- Google 实测触发人机验证，只能确认实际打开与如实回报，不能认定热点结果搜索成功。当前浏览器不支持自动上传/下载、跨域 iframe 内部操作；不绕过验证码或网站登录限制。

浏览器与数据模块索引见 [ARCHITECTURE.md](ARCHITECTURE.md)。对话文件保存格式与备份方法见下方“对话数据”相关章节，0.3.9 不改变保存位置。

## 0.3.8 历史成品与可选 Desktop 接续

- Mac：`release/macos/QQClaw.dmg`，575,226 字节，SHA-256 `e5287be773a1ef033affbf37bc9464c7a5b5e1e97190b37867911dbd5357674d`。仍为 macOS 13.3+、Intel / Apple Silicon 通用、ad hoc 签名且未 Apple 公证。
- 云构建：[GitHub Actions 41182366453](https://github.com/mumuhaha487/wechatclaw/actions/runs/41182366453)，应用源码提交 `85ed1aa382488f347d16f3d8750ea8059991d10d`。下载后核对 Artifact 摘要、ZIP CRC 与 DMG 文件尾；旧 DMG 仅保存在项目外。
- Windows：唯一 `release/QQClaw.exe`，568,832 字节，SHA-256 `8DF0CEDECC9DE266DAE1AC9DC07704C5E46BAED5F83597C7EAAA0ECB1B6ADEE3`。用户确认退出后替换，正式文件与已验证候选字节一致。已重新启动并确认 0.3.8 解压标记、运行后台及前端资源与 EXE 内嵌文件一致，后台启动日志已核对。替换前后账户/会话所在加密数据文件指纹一致。
- 本地通过 142 项检查（119 项既有回归、19 项接续检查、4 项本轮环境隔离/恢复检查）。独立 CODEX_HOME 与受控本地 API 下，真实 Codex 完成第三方调用、原线程关闭恢复、原生 fork、新进程恢复及继续回复，原线程保留 2 轮、副本独立完成 3 轮。
- 0.3.7 历史验证：119 项既有回归与 19 项新增检查通过。独立 CODEX_HOME 与本地受控 API 下，真实 Codex 完成第三方首轮、原生 fork、新进程恢复及继续回复；分别验证配置模型与动态默认模型，原线程保持 1 轮，副本独立完成 2 轮。额外确认未配置思考等级时不能传 null TOML 覆盖，已改为省略。
- Windows 原生 API 确认商店版 Desktop 可通过 AppUserModelID 检测，UUID/工作目录链接校验通过。Mac 云端检查 Desktop 链接编码和非法 threadId 拒绝。界面模拟验证 Windows 接续提示、来源保存、Mac 缺环境引导与 CLI 恢复，没有控制台错误；模拟页面不能代替原生 GUI 验收。

可选接续仍在会话菜单 **在 Codex Desktop 中继续**：已有原生历史复制为独立的 Codex 持久线程，空会话打开当前工作目录；Desktop 后续回复不会回传 QQClaw 或微信。QQClaw 自带浏览器的任务不需要此步骤，右上角入口现为「内置浏览器」。

「设置 → 运行环境 → Codex 来源」可选自动检测、Desktop 附带程序、独立 CLI 或手动指定。自动模式 Desktop 优先，失败回退 CLI；显式来源失败会提示配置。保存后后续任务采用新来源，模型目录随之刷新。切换不修改账户凭证或 Codex 的 config.toml。

副本使用本机配置和动态默认模型，权限重置为按需询问/工作区写入，不使用 QQClaw 临时 Provider。相同源历史复用副本，源历史更新后创建新副本；目录忙碌时拒绝接续。同一目录的两端操作需自行协调，副本不参加 QQClaw 的目录队列。

接续依靠官方深链接打开真正的 Desktop；QQClaw 无通用接口直接驱动其内置浏览器。历史接续要求相同 Codex 用户目录：Windows 检查用户/系统环境；Mac 按标准 `~/.codex` 检查，避免误把 QQClaw 进程的自定义环境当成会传递给 Launch Services。与已启动 Desktop 的实际自定义配置是否一致仍需用户确认。

## Mac 构建

需要 macOS 13.3 或更新版本、Xcode 15+ Command Line Tools（`xcode-select --install`）以及 Node.js 22.13+。

```sh
npm ci
npm run build:mac
```

唯一 Mac 分发包为 `release/macos/QQClaw.dmg`，包含 Apple Silicon 和 Intel 两种架构。用户无需编译：

1. 将 `QQClaw.dmg` 传到 Mac，双击打开。
2. 将 QQClaw 拖入旁边的 Applications（应用程序）文件夹。
3. 从 Mac「应用程序」双击 QQClaw，以后直接点击启动；安装完成可推出磁盘映像。
4. 当前版本尚未 Apple 公证。首次若被系统拦截，先尝试打开一次，再到「系统设置 → 隐私与安全性 → 仍要打开」确认。
5. 按软件内「前往配置」的引导安装 Node.js 22.13+ 和 Codex。首次配置好后无需重复安装。

DMG 中附中文安装说明。应用使用系统 AppKit、WebKit、Security 和 CryptoKit，不内置 Node.js、Codex CLI 或浏览器运行时。前端最低目标为 Safari 16.4，对应 macOS 13.3。

`npm run build` 自动选择 Windows 或 Mac；`npm run dev` 构建后启动本机应用。当前 Swift/AppKit 构建脚本在 macOS 上运行；Windows 可以提交代码到 GitHub Actions，由 macOS 云端机器编译，再下载真正的 Mac 应用。`npm run build:mac` 本身不在 Windows 上交叉运行 Xcode 工具链。

源码仓库为 [mumuhaha487/wechatclaw](https://github.com/mumuhaha487/wechatclaw)，按用户指定使用现有仓库。Windows 发起的构建使用 `.github/workflows/macos.yml`，由 GitHub 的 `macos-15` 托管机器执行。仓库上传内容仅为项目源码与必要资源，不包含本机账户数据、依赖目录或 Windows 成品。

以后在 Windows 上重建 Mac 版：

1. 将代码更新推送到该仓库的 `main` 分支。
2. 打开 [Mac 构建工作流](https://github.com/mumuhaha487/wechatclaw/actions/workflows/macos.yml)，点击 **Run workflow**。
3. 等待构建和原生数据保存自检通过，再在该次运行的 **Artifacts** 下载 `QQClaw-macOS-Universal`。
4. GitHub 下载的是产物容器 ZIP，解压一次得到最终安装包 `QQClaw.dmg`。本项目直接提供 `release/macos/QQClaw.dmg`，传到 Mac 双击，不需要再解压应用。

云端产物保留 7 天，源码长期保存在仓库，可随时重新构建。工作流只手动触发，不自动发布 Release。

默认应用使用本地 ad hoc 签名，未公证，首次运行可能受到 Gatekeeper 限制；不能当作已正式签名的发行版。公开分发可设置 `MACOS_SIGN_IDENTITY` 为已安装的 Developer ID Application 身份，构建会签名应用和 DMG。若还设置 `MACOS_NOTARY_PROFILE`，会提交完整 DMG 公证，检查 Accepted，并为 DMG 装订和验证票据；公证失败不产出正式包。证书和 Apple 凭证不放进源码。

## 兼容性实现与待验边界

| 位置 | 实现 |
| --- | --- |
| `native/macos/QQClaw.swift` | AppKit 窗口、WKWebView、本地资源协议、IPC、目录/文件选择、Finder、剪贴板、安装登录、关闭与后台进程组清理 |
| `native/macos/Info.plist` | Bundle 身份、版本、图标与最低系统 |
| `scripts/build-macos.mjs` | Safari 打包、双架构 Swift 编译、lipo 验证、签名、可选公证、唯一 DMG 安装包 |
| `scripts/macos-icon.mjs` | 构建时生成原创代码图标，无图像依赖 |
| `scripts/build-windows.mjs` | 原有 Windows 构建实现，固定 SDK 校验和单 EXE 路径继续保留 |
| `ui/app.mjs` | 统一桥接、Cmd+N/K、原生剪贴板、平台设置说明与安全的界面偏好缓存 |
| `shared/workspace.mjs` | Windows 路径继续忽略大小写，POSIX 保留大小写与合法反斜杠；`/` 根目录有效 |

Finder 启动时不会直接获得交互式 shell 的 PATH。Mac 宿主补查 Homebrew、官方安装目录、NVM、Volta、fnm、mise、asdf 等常见位置，也允许手动指定 Node。npm 一键安装使用用户目录 `~/.npm-global`，避免要求 sudo；执行的包命令仍为 `npm install -g @openai/codex`。安装成功重启，再检测 Codex。登录用私有 `.command` 文件打开系统 Terminal，正确引用程序路径，脚本不写 API Key。

WKWebView 只加载 `qqclaw://app/` 的本地资源，桥接只接受该来源主框架。钥匙串加解密只接受 Node 私有管道调用。管道写入使用独立串行队列，读取输出与 UI 不同步写入管道，避免重现双向管道死锁。关闭等待后台保存确认；保存错误或超时时，用户可取消退出。

云端已完成两种架构的 Swift 编译、Universal 合并校验、ad hoc 签名校验，并在 Apple Silicon macOS runner 上执行同源原生后台自检：Node 发现、辅助进程启动、私有管道 RPC、小消息响应、钥匙串加密、正常保存关闭及新后台进程恢复会话。另检查成品只链接系统库。

尚需 Mac 实机验证：完整 `.app` 图形界面、WKWebView 自定义协议/CSP/输入法、文件对话框与 Cmd 快捷键、更新签名后的钥匙串访问、各类 Node 安装方式、npm 安装/登录、系统退出与重启、真实微信消息/附件和 Intel 机器实际运行。Developer ID 签名和 Apple 公证尚未配置。云端后台自检不等于上述完整界面检查。

## 数据位置与卸载

| 数据 | Windows | macOS |
| --- | --- | --- |
| 应用账户、设置、会话快照 | `%LOCALAPPDATA%\QQClaw\state.json` | `~/Library/Application Support/QQClaw/state.json` |
| 应用加密 | 当前 Windows 用户 DPAPI | 钥匙串保存 AES-256 密钥，快照使用 AES-GCM |
| Codex 原生历史 | `$CODEX_HOME`，未指定则 `%USERPROFILE%\.codex` | `$CODEX_HOME`，未指定则 `~/.codex` |
| 独立对话备份 | `<Codex用户目录>/qqclaw/conversations` | `<Codex用户目录>/qqclaw/conversations` |

应用数据可用 `QQCLAW_DATA_DIR` 覆盖；独立对话备份可用 `QQCLAW_CONVERSATIONS_DIR` 覆盖。设置 → 运行环境展示实际路径，提供打开和恢复入口。

**删除 EXE 或将 .app 移到废纸篓，不会主动删除上述数据或钥匙串。** 本项目没有清理这些数据的卸载脚本。系统账户、钥匙串、Codex 目录被用户或第三方清理工具删除，以及磁盘损坏，仍需依靠个人备份。Windows DPAPI 快照不能直接在 Mac 解密，Mac 钥匙串密钥也不能从 Windows 还原；跨系统迁移使用独立 JSON/Markdown 对话备份，账户凭证需重新配置。

Codex 通过 `thread/start { ephemeral:false }` 创建原生持久会话，通过真实 `threadId` 恢复。只有实际发送首条消息后才保证产生原生历史。QQClaw 不伪造 Codex JSONL 或修改它的数据库；原生历史由 Codex 管理，可以在原电脑、相同 Codex 用户目录下运行 `codex resume <threadId>` 继续。其他 Codex 客户端是否把该来源会话列入侧栏，由客户端的过滤规则决定，不能保证自动显示。

独立备份每个有消息的会话保存一份 JSON 和一份 Markdown，原子替换并 fsync 文件。内容包括对话、过程消息、原工作目录、模型信息和原生 threadId，不复制模型服务配置或微信凭证。备份是可读文本，**附件仅记录路径，不复制附件本体**。移除 QQClaw 会话不删除备份或 Codex 历史。

「恢复缺失对话」只添加当前不存在的会话，不覆盖已有对话，不恢复微信待投递队列，不重新执行任务；权限重置为每次询问。缺少原自定义服务时临时使用本机服务，提示重新配置。跨电脑时还需要重新选择存在的工作目录、模型服务；恢复备份并不保证找回另一个 Codex 用户目录中不存在的原生上下文。

写入备份失败会明确报错，已写入的主快照保留；损坏、无法解密的数据保留原文件，程序不会静默重置覆盖。不要仅备份应用 EXE 或 .app，请同时备份应用数据、Codex 用户目录、独立对话目录和重要项目/附件。

## 本轮验证

- 119 项后端、微信协议与限额、长任务、持久保存和恢复检查通过；测试及依赖均在项目外。
- 使用真实 Codex CLI `0.165.0-alpha.1.2` 完成一次工具写入与读取任务，校验文件字节；关闭客户端后用新 Codex 进程读取原生 JSONL 对应的 thread，再继续原对话，成功复述上一轮口令，独立备份包含该轮结果。
- 独立测试验证删除应用数据后仍能从备份恢复、重复恢复不覆盖已有对话、移除会话仍保留备份、凭证不被导出、备份故障明确报错，以及 POSIX 路径大小写。
- GitHub macOS 云端 Swift 双架构编译、Universal/签名校验、Node 发现、原生后台管道、小消息 RPC、钥匙串加密及重启恢复自检通过。完整 GUI、Intel 实机、微信实际 Mac 链路尚未验证。

浏览器模拟 Mac 桥接已检查复制、设置中的 Mac 路径与保留说明、恢复对话提示与侧栏、动态模型菜单，无控制台错误；Safari 目标的前后端资源打包通过。此前 Windows 0.3.6 候选曾在项目外编译成功，当时未替换运行中的 0.3.5；现已由上文 0.3.7 正式交付状态取代。

## 0.3.6 DMG 构建记录（已由 0.3.7 替换）

- 文件：`release/macos/QQClaw.dmg`，556,351 字节，项目中只保留这一个 Mac 成品，不再保留旧 ZIP。
- SHA-256：`94064e42a606641fa62d5d979bfaf3080180d52ddec983e5ce4add741475cba5`。
- 成功构建：[GitHub Actions 41167706059](https://github.com/mumuhaha487/wechatclaw/actions/runs/41167706059)，源码提交 `0c9491378284d80788a2ac0f25247408aca447b5`。
- 云端真实验证：DMG 校验和有效、只读挂载成功、Applications 入口和中文安装说明存在、从安装映像复制应用成功；复制出的应用通过 Universal 双架构及签名检查。同源原生后台的启动、小消息 RPC、钥匙串加密、正常关闭和重开恢复自检通过。
- 下载后核对 GitHub Artifact SHA-256、外层 ZIP CRC 和 DMG UDIF 文件尾。测试代码、依赖及旧 ZIP 均在项目外，Windows EXE 未替换。
- 这次只改变分发和开发启动方式，应用版本仍为 0.3.6；完整图形界面、真实微信 Mac 链路与 Intel 实机等验收边界仍按上文保留。

## 首次 ZIP 构建证据（现已改为 DMG）

- 首次文件：`QQClaw.zip`，481,604 字节，内含唯一 `QQClaw.app`。该包由 DMG 安装包替代，不在项目中另留旧包。
- 最低 macOS：13.3；Mach-O 内含 `x86_64` 和 `arm64`。ZIP CRC 与可执行权限核对通过，无 Node/Codex 本体和用户数据。
- SHA-256：`387FDEAE759870D571B37CC54C933C9665E4553B9C5F0282CA10F1BA39AEF92C`。
- 成功构建：[GitHub Actions 41166453120](https://github.com/mumuhaha487/wechatclaw/actions/runs/41166453120)，构建源码提交 `b6a269bf99fa873cbf0e644ba9b83f4648487f86`。后续文档和仓库元数据更新不影响该原生代码。
- 临时自检 Swift 入口和工作数据仅在云端 runner 的临时目录生成，未加入项目，也未打入成品。自检失败则不上传产物。
- 本轮修复了 Swift 文件对话框 continuation 类型、lipo 参数顺序，以及 Foundation 定长管道读取导致小消息一直等待的问题；改为 `read(2)`，由真实云端小消息通信自检确认。
