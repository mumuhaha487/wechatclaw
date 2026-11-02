# QQClaw 本轮需求、实现与验收记录

## 最新交付范围：Windows（2026-11-02）

按用户最新要求，Mac 停留在已交付的 0.3.41，本轮不再继续新窗口内嵌等适配或云端探查。Windows 使用 release/QQClaw.exe，版本 0.3.41；最终成品核对与已有验收证据见交付说明.md。生产代码未为这次范围调整继续修改，不为文档变动重编成品。

Windows 已有真实启动、前端交互、Codex 回合、官方扩展浏览及受控微信加密文件协议证据；腾讯线上微信完整链路、官方 Blob 自动下载和完整物理 GUI/输入法/DPI等剩余项仍明确保留，不宣布原始完整目标全部通过。用户数据和原微信账户未为验收重置。

补充 Windows 主页交互检查：当前 0.3.41 前端配合真实 App/Store，实际通过文件预览、Ctrl+W 关闭、Ctrl+Shift+T 恢复、1000×680 窗口关闭面板、模型弹窗 Esc 关闭、视图菜单恢复面板共 6 项检查。1280×720 下聊天宽 582.98px、工作面板宽 367.35px，白色背景且无横向溢出；1000×680 时面板进入覆盖模式，关闭后聊天恢复 670px。没有发现需要修改生产代码的新故障，EXE 保持已交付的同一个文件。

本轮证据：C:/Users/admin/AppData/Local/Temp/qqclaw-windows-homepage-1571d95f，含 ui-acceptance.json、verification.json、backend-audit.json 和 homepage-final.png。客户端/服务端异常 0，chat.send 为 0；一个预设无发现端点的模型服务正常返回错误。原生环境、浏览器路由及模型发现为明确夹具，不算独立 EXE 或微信线上验收。检查中出现过定位器名称不匹配及非焦点容器按键失败，改用实际标签和键盘后通过；不将这些工具定位错误算作产品缺陷。临时页面已关闭，服务进程实际正常退出 0。

最终整体验收仍受阻：当前工具明确禁用了原生桌面控制，无法完成独立 EXE 的物理鼠标、输入法和 DPI 操作；腾讯线上检查没有启动原账户；原版官方组件明确不支持的 Blob 下载也没有用其他驱动替代。这些边界已连续记录于 0.3.39、0.3.40、0.3.41，不能靠重复前端检查补成通过。当前可执行的交付和针对性检查已完成，原始完整目标不标记完成；后续需相应环境或能力变化才能补齐上述证据。Mac 按用户最新要求冻结，不作为本轮继续开发项。

## 当前状态：0.3.41（2026-11-02）

两端同名成品已更新。本轮修复浏览后无法创建报告的实际问题，没有修改界面、官方扩展、官方运行库或其文件沙箱。完整目标继续active，原Windows进程95560未停止，原微信账户没有启动或收到本轮测试消息。

根因与修改：生产App/Bridge/WeChatApi配合真实模型和包内官方浏览组件，实际在Google搜索并核对了三条新闻；模型保存报告时却在浏览器Node REPL使用fs.writeFile，得到EPERM，附件未生成。backend/official-browser.mjs原指引“只使用mcp__node_repl的js工具”范围过宽。本轮把该限制明确限定于网页访问与操作；工作区文件、代码和报告使用Codex原生文件/命令工具，继续遵守当前会话目录与读写权限，先创建和核验文件再返回附件动作。

复测完整保留三阶段：第一轮真实Google读取成功但附件失败；修改后重新搜索时Google要求真人验证，该轮失败，没有绕过或改用其他网页驱动；随后恢复同一个真实Codex thread 01a19a38-2885-7261-88d2-116ee37a5d60，沿用此前已读取的来源，在绑定工作区用原生命令创建AI热点.md并成功完成模拟微信原生文件投递。没有将它称为修改后一次全新搜索到附件的完整通过。

报告3079字节，SHA256 0f655c4457404adda8bcc3015d35176af4a6a983b6a06be4082cec765bdf1c0d。生产上传协议的AES密文在本机CDN接收端解密后与工作区报告逐字节一致，明文MD5/大小、文件卡片中文名、len和AES Key编码均核对通过。实际返回1个原生文件卡片，输入状态有开始与结束；进度1条，各context内推送client_id不超过10条。同会话桌面消息在微信任务期间入队并最终完成，桌面专用标记未出现在微信投递内容中。

范围：使用实际已配置模型，没有夹具模型响应；腾讯请求及CDN由隔离的127.0.0.1 HTTP服务承接，检查的是生产请求序列化、轮询收件、授权回复、执行、进度、加密上传和文件卡片，没有声称腾讯线上接收或手机显示通过。原账户配置只读选取模型，原账户未启动。

Windows0.3.41空数据/系统PATH下使用包内Node v24.22.1启动真实后台通过，检查进程已退出。Mac云运行[41382706673](https://github.com/mumuhaha487/wechatclaw/actions/runs/41382706673)成功，原版官方输入、双配置归属、实际Swift主程序绑定、弹出页/查找/下载内容、加密保存/退出与Universal编译、签名、DMG校验通过。Mac官方浏览组件仍仅arm64，未Apple公证。

两端构建源码：657f255bc5db9c3f455c7bfc5f295cf72ad08b68，97个代码输入与Git副本一致（只规范化LF/CRLF）。Windows 307445248字节，SHA256 2b3c9f1f820027fdd6fc9152e69230c0cf744e424118f2922ef7c4d777ed6505；Mac 537127251字节，SHA256 90340f6e368c448390ece13da7164727dd86763346eb6c0f4393d2b5c5833783。

证据根：C:\Users\admin\AppData\Local\Temp\qqclaw-wechat-browser-18deeadf。首轮result.json/events.json/wechat-wire.json；retry为Google验证阻断；resume保存原会话恢复、真实命令、加密投递和桌面隔离的通过结果；integration-proof.json组合核对了三个阶段。package保存两端构建、源文件核对和交付回执。初次宿主Windows --import路径错误保留在bootstrap-path-error.txt，不计为产品故障。

补充真实上下文证据：这轮实际模型的Codex通知共21条。末条last=41737、total=655163、modelContextWindow=258400；生产前端计算函数使用当前last得16.152%，累计total虽超过窗口也不会据此显示100%。原始及计算结果在同一证据根real-context-samples.json。这是实际在线模型事件与生产计算函数核对，本轮没有为这组在线数值另录GUI；此前真实前端/CLI配合受控usage的显示检查仍保留。

未完成项保留：Google重新搜索被真人验证阻断的这一轮、腾讯线上微信整条链路、Mac官方tabs.new新普通窗口内嵌、Intel官方自动浏览、官方Blob下载与全部参考主页/物理GUI/输入法/DPI核验。没有使用替代自动浏览驱动，也不把局部检查当成整体验收。

以下为历史记录，不覆盖本节。


## 历史发现：浏览后报告未生成（后续结果见当前状态）

0.3.40 后续完整链路检查发现真实失败：生产 App/Bridge/WeChatApi、实际 Codex 模型和包内官方浏览组件已经完成 Google 搜索、三条来源核对、进度回传及同会话桌面消息排队；但模型在浏览器 Node REPL 中调用 fs.writeFile 保存 AI热点.md，官方沙箱返回 EPERM，因此没有生成或发送附件。本次检查没有通过，不能把前面的组件检查扩大成附件任务成功。

原因是 backend/official-browser.mjs 把“只使用 mcp__node_repl 的 js 工具”写成了整个任务的限制。源码已将限制明确限定于网页访问/操作，工作区文件和报告改用 Codex 原生文件或命令工具并遵守会话权限；官方插件、运行库及其沙箱未修改。后续复测结果见当前状态。

证据：C:/Users/admin/AppData/Local/Temp/qqclaw-wechat-browser-18deeadf 的 result.json、events.json、wechat-wire.json 及 transcripts。腾讯接口/CDN由隔离的本机HTTP服务器承接，使用的模型与官方浏览器是真实组件；未连接原微信账户。初次检查宿主的 --import Windows路径错误单独保留在 bootstrap-path-error.txt，修正后才运行上述真实任务，不将它计为产品故障。

## 历史状态：0.3.40（2026-11-02）

本轮改动及针对性检查已完成，两端同名成品已更新。完整目标继续active；不能把本轮验收扩大成线上微信及所有平台全部通过。原Windows进程95560未停止，原微信账户未启动或发送测试消息。

修复ui/app.mjs的官方扩展状态：启动检测和浏览面板使用同一个按会话保存的结果；合并同一会话的并发检测；检测期间的新连接事件优先，迟到快照不能覆盖；设置页不再读取其他会话残留的全局连接状态；未知状态显示待检测。打开、收起、关闭及回包不会改变用户的面板选择。backend/codex.mjs的clientInfo版本改为读取package.json，避免版本提示落后。

本轮真实前端检查通过：已内置组件显示待验证；人为延迟一条状态查询，收到新的已连接事件后再返回旧快照，界面仍为已连接；第二个会话在自身检测返回前显示待检测，未继承第一个会话的连接；两个并发入口只发出一条挂起查询；面板关闭后检测回包未重新打开它。连接状态及延迟RPC是明确夹具，不作为官方自动浏览证据。

另经真实App和官方Codex进程运行两轮隔离对话，上下文从待统计变为3.9%、10.1%；第二轮last=26100、total=36200、窗口258400，界面使用本轮last。服务端响应和usage由本机Responses夹具提供，不是线上模型计费检查。运行中可编辑18行草稿，切换会话并后退可恢复，完成回包后输入焦点/光标和撤销记录仍在。该检查先于连接状态修复执行，上下文算法与输入保留代码本轮未改。

Windows0.3.40在空数据、系统PATH下使用包内Node v24.22.1启动真实后台，检查进程已结束。Mac云运行[41378758379](https://github.com/mumuhaha487/wechatclaw/actions/runs/41378758379)成功：原版官方输入/中文事件、双配置归属、实际Swift主程序连接、弹出页/查找/下载内容、加密保存及退出，以及Universal编译、签名和DMG校验。官方浏览组件仍仅arm64，Mac未Apple公证。

两端构建源码：f514315f849de371b3d6a014050968c8aa238902，97个代码输入与Git副本一致（只规范化LF/CRLF）。Windows 307444736字节，SHA256 5cebe302435fc38a370ec7dffbe8f297fb392df6f8b9e87ac8869d454f8439e4；Mac 537131519字节，SHA256 8820586642bf4c97f0be432e5bb36611916e5d5b252355c67c82343e109a391d。

证据目录：C:\Users\admin\AppData\Local\Temp\qqclaw-homepage-326e0f8f。主要文件：context-ui.json/png、context-backend-audit.json、connection-ui.json/png、connection-backend-audit.json、standalone-verification.json、source-match.json及Mac云artifact。主页逐项操作与代码入口见[HOMEPAGE-PARITY.md](docs/HOMEPAGE-PARITY.md)。Git副本用户修改的docs/CODEX-WEIXIN-LICENSE.txt未覆盖或提交。

未完成项保留：Mac官方tabs.new新窗口内嵌、Intel官方自动浏览、官方Blob下载、线上微信完整闭环与全部参考主页/物理GUI/输入法/DPI核验。当前官方claimTab预备页接管通过，不宣称tabs.new通过；没有引入替代自动浏览驱动。

以下为历史记录，不覆盖本节。


## 历史状态：0.3.39（2026-11-02）

项目内同名 EXE/DMG 已更新，Node/npm 与原版官方浏览运行库内置。完整目标仍为 active。未停止旧 Windows 进程95560，未启动原微信账户或发送测试消息。项目内没有新增检查产物或第二份成品。

本轮修改：浏览器移除常驻连接说明行，工具栏精简为48px；官方扩展状态和配置入口移入“更多”菜单，加载进度线跟随工具栏位置。运行环境页修正“不内置Node.js”的过期文案；两端原生宿主报告当前Node是否来自包内，界面据实际结果显示。Windows一键安装Codex明确使用用户固定的 %APPDATA%/npm，避免全局CLI安装到随版本清理的内置Node目录。Mac原有 ~/.npm-global 目录继续保留。

实际检查：1280×720的真实前端/App/Store中，聊天约583px，右面板约367px，网页视口高562px，无横向溢出；常驻说明已移除，未知/已连接/未配置的菜单入口可用，配置入口确实打开运行环境页。面板关闭后30次后台状态更新仍保持关闭，再打开恢复浏览器标签。浏览器、连接、模型和环境为明确界面夹具，chat.send=0，前端/服务器异常0；一项预设无模型端点错误被正常处理，不计为产品真实服务故障。

Windows新包已在空数据目录、仅系统PATH下由包内Node v24.22.1启动真实后台，隔离进程已关闭。直接调用新EXE中的真实InstallCodex方法和包内Node，命令接收夹具核对了 install -g @openai/codex 与持久化npm前缀；没有联网安装、修改用户现有CLI或声称网络安装通过。

Mac云运行 [41375301038](https://github.com/mumuhaha487/wechatclaw/actions/runs/41375301038) 成功：原版官方DOM输入/实际中文input事件、截图、关闭和退出；两个真实独立配置归属；实际Swift Host加载本轮前端和空后台，原版prepare连接、链接弹出页、查找/焦点、关闭标签后的完整262144字节下载、加密保存和正常退出。新增实际nodeBundled/Node路径检查通过。Universal主程序与双架构Node/npm编译、签名和DMG格式校验通过；官方浏览组件仍仅arm64，未Apple公证。以上不能扩大成微信线上或物理输入法/DPI验收。

两端构建源码：7ae9ae460a02efc3fdcb3ad69b259dab12c28661；97个代码输入与Git副本核对一致（只规范化LF/CRLF）。Windows 307444224字节，SHA256 30d83d5b83f025421f67e8de5412cc53b1d29d8b090edfbfde48b4f5dd7876be；Mac 537017788字节，SHA256 289370545e0a87cf559e199c81b2b0fa920dffc3877bb69ebdd7465892c9e327。入口与数据位置见[交付说明](交付说明.md)。

证据目录：C:\Users\admin\AppData\Local\Temp\qqclaw-ui-039-c5ac68bd。UI截图与审计、真实打包安装方法核对、空目录启动和源码核对均在此。Mac证据artifact SHA256 2ba1f79fc9b8a2c016efed413fc14d4c67863a1d091721d6aaaa02f175ff4c19；安装包artifact SHA256 791f148fb3dd312e0c253985e86ef4f21e4eb93d4d7659456764e95efa27067f。Git副本用户修改的docs/CODEX-WEIXIN-LICENSE.txt未覆盖或提交。

待完成：Mac官方tabs.new新窗口内嵌、Intel原版浏览组件、官方Blob下载能力缺口、线上微信完整闭环与参考主页全部操作/物理GUI核验。现有官方claimTab接管本会话预备页可用，不宣称tabs.new已通过。没有引入替代自动浏览驱动。

以下是历史记录，不覆盖本节。


## 历史状态：0.3.38（2026-11-02）

同名EXE/DMG已更新，运行库内置，完整目标仍保持active。GitHub草稿已同步，只有两个同名附件，远端摘要与本地一致，尚未公开发布。Windows307443712字节；Mac537152609字节，Universal主程序，官方浏览组件为arm64。摘要及安装入口见交付说明。旧Windows进程95560未停止，原微信账户未启动或发测试消息，原数据未清理。

最新构建源码be09963ecdec11fb9514dcf61aa2f020bfa8a689，云检查41372684855整体成功：官方DOM中文输入实际事件、截图/关闭/退出，两个真实配置归属，主程序实际官方prepare连接、原版工具点击链接打开弹窗并正确选中，网页查找/实际firstResponder，关闭下载页后262144字节完整保存，加密历史/设置落盘与正常退出。Universal双架构编译、签名/DMG检查通过。Windows0.3.38空数据/系统PATH包内Node与后台启动通过；不等于真实模型、微信或物理输入检查。

关键入口：backend/official-browser.mjs、macos-official-runtime.mjs、macos-browser-transport.mjs、macos-browser-identity.mjs；native/cef/macos/CefBridge.mm；native/macos/QQClaw.swift、CefRuntime.swift、BrowserHost.swift（CefBrowserController）；scripts/macos-browser-runtime.mjs、macos-official-mcp.mjs、build-macos.mjs；.github/workflows/macos-official-browser.yml。

CEF固定156.0.15+gcf671c0+chromium156.0.8078.80，正式接口设置本应用独立浏览器钥匙串项；原Vault、mac1:AES-GCM及原数据目录不变。临时--vault-key子进程方案已删除。新配置等OnRequestContextInitialized完成后创建视图；每个Chrome视图保持自己的CefWindow生命周期，只移动现有WebKit应用界面。输入检查使用实际documentation提供的原版locator.fill，仍断言网页input事件，不依赖可选AX能力。

下一步：官方tabs.new新窗口嵌入、Intel原版浏览组件、线上微信完整闭环、Blob官方能力缺口和完整物理GUI/IME/DPI。不能因本轮组件通过宣布整体完成。不要借用开发聊天、Desktop、外部浏览器身份/管道或改用替代驱动。

本轮证据根C:/Users/admin/AppData/Local/Temp/qqclaw-mac-official-link-20261102。集成证据artifact SHA256 4b33dc389ef1a23532d9b99d659d01ff10e3b073e25828d076796cade78583bb；最终包artifact SHA256 5f73a656e4b8ff0e960e59b9462f55941d2ffea3cf26e068efa01d9fe3a471be。源码主目录D:/project/QQclaw，Git副本C:/Users/admin/AppData/Local/Temp/qqclaw-cloud-mac-20261031/source。Git副本用户修改的docs/CODEX-WEIXIN-LICENSE.txt不得覆盖或提交，SHA256 BFCB86ACF7015CC4D7F76AB0C1E8B9450F293D259AE9BD051FD4ABAA795F7EBB。

以下是历史记录，不覆盖本节。

本轮修复源于实际失败：多配置空指针、BrowserView析构时序、共享Chromium钥匙串授权等待、清理原版CLI子进程与临时目录的竞争，以及检查错误假定可选AX接口必有。所有原始失败仍在项目外证据根，最终检查没有放宽真实输入、标签移除、文件内容或退出0断言。GitHub草稿更新状态由交付说明记录，项目目录保持只有同名成品各一份。

## Mac后续源码：CEF Views与WebKit同窗验证（未集成正式软件）

本轮没有重编译或替换正式0.3.37 EXE/DMG，也没有启用Mac官方自动浏览。新增 native/cef/macos 原生桥、scripts/build-macos-browser.mjs及独立的组件云检查工作流，继续解决Mac接入的基础条件。Windows既有原版官方ChatGPT扩展与运行链路未改。

CEF固定版本154.0.34+g14c5a08+chromium-154.0.8037.98。官方示例将Chrome风格直接嵌入原生父窗口的方式限定在Windows/Linux；Mac采用同进程的CEF Chrome Views根窗口，WebKit界面容器位于同窗上层，以原生遮罩和hitTest区域露出实际CEF页面。本轮WebKit仅加载隔离HTML检查壳，没有加载正式QQClaw前端。模型工具没有走这条应用UI控制接口，未新增替代远控。此时尚未加载官方ChatGPT扩展，不称为Mac官方浏览任务通过。

三轮真实云结果分别保留：

1. [41345489487](https://github.com/mumuhaha487/wechatclaw/actions/runs/41345489487)：原生代码编译后，复制“Helper (Alerts).app”的CMake命令缺少VERBATIM，在括号处发生shell语法错误，尚未进入运行检查；修复参数转义，并使API版本定义同时作用于wrapper。
2. [41345865890](https://github.com/mumuhaha487/wechatclaw/actions/runs/41345865890)：构建和签名通过；原生程序实际运行后，8项中6项通过、两个尺寸断言失败，最终退出1。CEF默认FillLayout在下一次布局时把(700,80,320,540)重置为(0,0,1024,653)，重新打开后又占满1200×656。没有弱化原有断言。读取固定版本CefPanelImpl::Initialize源码确认其默认调用SetToFillLayout，随后使用公开BoxLayout的insets/flex保留所需浏览区域，并响应窗口布局变化。
3. [41346379388](https://github.com/mumuhaha487/wechatclaw/actions/runs/41346379388)：原8项全部通过，构建代码46f745bdb83b2c916107587a5a426679bc135cc1。真实HTTP本机页面返回200及标题，CEF与WebKit属于同一NSWindow，初始区域保持(700,80,320,540)，隐藏后CEF不可见、WebKit遮罩移除且命中区域恢复；改变窗口尺寸并重新打开后区域保持(780,90,280,450)。browser-closed/root-closed均实际收到，进程正常退出0。

该次为macosarm64原生组件检查，验证了实际窗口归属、CEF布局、遮罩存在及直接调用原生hitTest的结果；未验证完整QQClaw界面、遮罩实际画面、可信物理鼠标/焦点/输入法/DPI、Intel运行或微信/真实模型流程。CEF helper使用官方sandbox初始化，构建未传no-sandbox。日志仍包含backupd XPC无效连接、CEF Desktop Identity Consistency未配置OAuth和退出时SQLite flush任务警告；原始日志保留，不写成零错误或借此推导浏览器功能全部通过。

GitHub artifact摘要9f284182eb583053cbd62693af9e49a317efffba4f853d83c8e25f5b9d1e5551已核对，5个原生输入文件与当前源码逐项核对（只允许LF/CRLF规范化）。证据在 C:/Users/admin/AppData/Local/Temp/qqclaw-mac-views-4b38954，包括三轮原始日志、第二轮失败verification.json、第三轮verification.json/mac-browser-build.json及verified-mac-component.json。第三轮只上传证据，没有生成第二个项目内安装包；隔离进程/站点随检查正常结束。

当前native/macos/QQClaw.swift还没有调用新桥，backend/official-browser.mjs仍明确对Mac返回未接通。下一步必须接入生产Host的窗口/菜单/后端退出确认、会话与多标签归属、原版Mac官方运行库/扩展和专属传输；补齐Intel及真实官方浏览检查后才能打进正式Mac包。不能只替换窗口构造便宣称完成。完整goal保持active；Blob、完整原生GUI及微信闭环等原缺口同样保留。

来源：[OpenAI浏览器扩展](https://learn.chatgpt.com/docs/chrome-extension)、[固定CEF示例说明](https://github.com/chromiumembedded/cef/blob/14c5a08/tests/cefclient/README.md)、[默认FillLayout实现](https://github.com/chromiumembedded/cef/blob/14c5a08/libcef/browser/views/panel_impl.h)。以下0.3.37为已交付成品记录，不包含本节组件。

## 当前交付状态：0.3.37（2026-11-02）

本轮继续对照实际参考截图补齐主页行为。发现并修复：每次状态更新重建侧栏后滚动回顶、键盘焦点丢失；分隔线被状态更新移除而中断指针捕获；侧栏分隔线右半部分超出父元素后被裁掉；抓住分隔线中间移动时出现约3px起始偏移。

ui/app.mjs 现在保留侧栏滚动和当前控件焦点；项目/会话菜单在刷新后绑定新的同一行，Esc能回到该行。两侧分隔线持有指针期间只延后绘制，后台状态仍照常接收；抬起、取消、丢失捕获或窗口失焦后释放并绘制最新状态，宽度按真实指针位移变化。ui/desktop.css 将侧栏完整6px命中区放回父元素内，拖动时取消宽度动画。侧栏双击还原275px，键盘调整同步真实ARIA数值。

普通会话现在和项目会话一样支持就地展开/收起；默认6条，收起时保留当前较早会话。项目与会话增加鼠标右键、菜单键和Shift+F10，复用原有动作；打开菜单不切换当前会话。没有加入新的驱动或修改官方扩展。

实际CUA操作真实前端/App/Store：基线列表滚动1132在后台更新后变0，修复后保持1132；右键项目菜单后当前会话不变，后台刷新再Esc回原项目；键盘菜单可打开。普通会话6→9→6，最后选择的第9条仍显示。设置往返滚动1111.33保持不变。两侧最后一次实际拖动各接到2次真实后台状态事件，原分隔线均未脱离、指针捕获未丢失；另按住期间分别10/12次事件同样通过。最后侧栏320→368，实际移动48px；右面板367.35→399，实际移动32px并按整数取整，聊天仍约458.33px。关闭后继续收到状态更新，面板保持关闭。双击还原后1280×800布局为侧栏275、聊天582.98、右面板367.35，无横向溢出，亮色，版本v0.3.37。

这些是实际前端/App/Store的交互检查，环境、模型发现和原生网页路由是明确夹具。chat.send=0，客户端/服务端异常0，没有启动模型、原微信账户或替代浏览器驱动；不能扩大成独立EXE整套GUI、物理输入法或微信验收。检查工具的原始限制保留：最初服务器因阶段目录缺少qrcode解析路径未启动，补上仅项目外依赖链接后运行；前几次拖动未覆盖后台事件（计数0），没有算作并发通过；一次CUA在持续重绘时定位失败，重新读取命中区后使用实际按住/拖动验证。原始3px偏移及裁剪命中问题随后真实修复并复测。

Windows 307439616字节，SHA256 4a2e48ad344939d1d881af474212e12e0abb723e9708299ea13e5763f9f4786e；最终包已在空数据目录和仅系统PATH下启动包内Node v24.22.1及后台，检查进程已退出。Mac云运行[41343117836](https://github.com/mumuhaha487/wechatclaw/actions/runs/41343117836)成功，46条实际PASS，含内置Node/npm、Universal、签名、钥匙串及原生重启持久化；档案摘要与DMG格式核对通过。Mac 129549559字节，SHA256 e9cafc342587d943743e02e7349b69779d4c504758efb9af2a397af7acdc812e，最低13.5，未Apple公证。构建源码 2e392d71a2f9d1cc92c9f236e740b91442a06de1。

项目内同名release/QQClaw.exe及release/macos/QQClaw.dmg已更新，[GitHub 0.3.37草稿](https://github.com/mumuhaha487/wechatclaw/releases/tag/untagged-2a2c9cbf4e2a5718fa13)只有EXE/DMG各一个且摘要一致。现有旧PID95560未停止，原账户数据未清理；下一次启动项目内同名文件使用新版。原在用旧映像的项目外退出后清理机制保留，没有同时启动新版读写原账户。

证据在 C:/Users/admin/AppData/Local/Temp/qqclaw-sidebar-037-GIE03S：ui-verification.json、ui-final-audit.json、ui-final.png、standalone-verification.json、mac-verification.json及delivery-release.json。所有本轮检查进程和页面已退出。整体目标继续active：微信线上完整浏览、完整原生GUI/输入法/DPI、Mac官方扩展自动浏览、Blob官方下载及参考主页所有操作的一致性仍未完成；前一版真实Google/HTTP下载证据保留，本轮没有重复跑模型而冒充新证据。

本节为当前状态；以下保留历史记录，较旧的成品版本、未编译/未更新等描述不覆盖本节。安装入口与数据位置见[交付说明.md](交付说明.md)。

## 当前交付状态：0.3.36（2026-11-02）

两端安装文件已完成并更新到项目内唯一成品：release/QQClaw.exe 与 release/macos/QQClaw.dmg。Windows 内置 Node/npm、CEF、原版官方 ChatGPT 扩展与官方浏览运行库；Mac 内置双架构 Node/npm。原始完整目标仍为 active，不宣称全部验收通过。

- Windows：307438592 字节，SHA256 b482eb04d3e44715bc206c7e9495f4f21deac133fea15d87a65e1665a3b8ec0c。空数据目录、仅系统 PATH 下已实际启动包内 Node v24.22.1 和后台。
- Mac：129362354 字节，SHA256 3ad94470cdcf4f59a8234225bba52fdb31498f9987574da3241e683a96f90052；最低 macOS 13.5，Apple Silicon/Intel。云运行 [41339851338](https://github.com/mumuhaha487/wechatclaw/actions/runs/41339851338) 成功，下载档案摘要和 DMG 尾部已核对，46 条实际 PASS，包含钥匙串加密、原生后台重启的草稿/附件恢复。未 Apple 公证。
- [GitHub 0.3.36 草稿](https://github.com/mumuhaha487/wechatclaw/releases/tag/untagged-900d6977fcbca3aeeb9b)：远端与本地摘要一致，只有一个 EXE、一个 DMG；保持草稿，尚未公开发布。构建代码 d9ae586b59945f312267dd6032fd9ef42602f240。
- 已绕过文件占用对更新位置的影响：将运行中旧 EXE 移至项目外临时目录后放入新版，同名成品已核对摘要。没有停止旧 PID 95560，也没有同时启动新版访问原账户数据；现有窗口仍是旧版本，下一次启动项目内 EXE 才是新版。旧映像仅因进程占用暂存，后台清理脚本会在该进程退出后删除它。项目内没有第二个 EXE 或测试文件。
- 真实官方扩展组件已完成 Google“AI 热点”搜索、滚动及可见结果截图，HTTP 零字节下载取得官方保存路径。Blob 下载仍被原版官方运行库明确拒绝，不伪造成功、不使用替代驱动。
- 尚未完成：微信线上完整浏览交付、完整独立 EXE 的物理焦点/输入法/DPI、Mac 官方扩展自动浏览、Blob 自动下载、参考主页全部操作的一致性核验。真实 Google 组件结果不等同于这些项目全部通过。

本节是当前状态；下方保留各阶段原始记录，其中较旧的“未编译”“尚未替换”等描述只适用于当时。文件入口与数据位置见[交付说明.md](交付说明.md)。本轮打包、下载、安装位置更新的证据集中在 C:/Users/admin/AppData/Local/Temp/qqclaw-browser-036-LIwfus。

## 0.3.36：官方插件核验、真实Google与下载边界

已从Google官方更新接口取得ChatGPT扩展1.26.1020.11845的CRX3，验证签名且公钥对应官方ID hehggadaopoacecdllhhajmbjkdcmajg。核对39个运行文件：功能代码一致；4个图标PNG与商店包存在差异，manifest增加了加载解包扩展所需的key，Chrome的_metadata/verified_contents.json未随运行资源复制。没有把整个目录称为与签名档案逐字节一致；本轮没有替换或修改扩展。完整比较和签名证据在 C:/Users/admin/AppData/Local/Temp/qqclaw-official-download-capability-ka6xPW/official-extension-proof.json。

真实模型通过当前产品BrowserHost/C#/CEF/helper、原版官方扩展和Node REPL完成Google“AI 热点”搜索，读取AIHOT标题及https://aihot.news，并在后续复测用官方ax.scroll滚到实际可见结果，原版工具返回的截图已人工查看。第一次搜索截图只显示页顶；没有把它当作结果已可见的证据。后续滚动首次遇到detached accessibility element，读取新状态后成功；原始错误保留。没有绕过验证码或安全拦截，没有换搜索引擎、驱动或借用开发聊天浏览器的身份。

两轮真实下载核对：HTTP零字节附件均走官方等待→实际点击→官方path返回，并核对磁盘大小0、completed/available为真。Blob中文CSV与空Blob由官方downloadMedia明确返回“Blob downloads are not supported by this browser.”，首轮分别88/55ms，后续将两项合并调用共111ms，没有进入120秒等待。当前官方服务仅在blobDownloadsSupported为true时启用Blob；其Blob事件还要求tabId与来源绑定，当前扩展路径不具备这些支持，CEF自身门禁也拒绝Blob。单改CEF门禁只能落盘，无法完成官方下载协议，解释了之前的实验失败；Blob自动下载功能仍未完成。

本轮代码只调整backend/official-browser.mjs的内部运行指引：对已观察到的Blob链接先由官方downloadMedia校验能力；明确不支持时报告该项未完成，保留普通HTTP先等待后点击的流程，并按完成状态核对合法零字节文件。没有加入替代下载器、伪造官方事件或修改原版插件。复测任务没有再逐项提示API用法，实际按修改后的产品指引完成上述行为。

证据根 C:/Users/admin/AppData/Local/Temp/qqclaw-official-download-capability-ka6xPW：capability-verification.json、source-findings.json、google-probe/google-verification.json、guidance-probe/guidance-verification.json及原始model-events.json。三个检查宿主随后正常退出0；原微信账户未启动，原状态只读取得已配置模型，使用low思考等级进行有限检查，没有修改用户模型设置。这里验证的是实际组件链路，尚不等于独立EXE完整GUI/IME/DPI或微信线上交付。辅助核验脚本曾因C#正斜线参数、Chrome元数据/图标差异及下载调用分批而误报，已按原始数据修订，以上限制没有隐去。

Windows 0.3.36 已编译并完成空数据目录/仅系统 PATH 独立启动；Mac 云构建 41339851338 成功，46 条实际 PASS。最终成品、摘要和仍未完成项见本文件首节。

[0.3.35 GitHub草稿](https://github.com/mumuhaha487/wechatclaw/releases/tag/untagged-d3c45ecc8087c6dbf738)已更新，远端摘要与本地一致，最终仅一个EXE和一个DMG；Windows新版位于项目外成品链接，正式旧版未覆盖。

## 0.3.35：草稿持久化与主页改动打包

修复前一节实际发现的整页刷新丢草稿：新增 backend/composer-drafts.mjs 与 ui/composer-drafts.mjs，经 draft.read/draft.remember 保存文字、导入附件 ID 和目标选项，使用原有加密 Store 与原子写入。恢复时从原附件副本解析，不依赖用户原文件；缺失附件保留文字/记录并提示重新添加。普通 snapshot 不携带草稿，未发送内容不写入 Codex 历史或对话转录。发送请求未确认期间保留持久草稿，失败恢复后继续保存，接受后清空已发送的文字/附件；不自动执行恢复出的内容。

当前已通过：实际前端编辑后刷新恢复文字、原附件和目标选项；移除附件后刷新不复活；隔离发送失败后再刷新仍保留，隔离接受后刷新文字/附件为空。后两项只检查真实前端/App/Store 的结果处理，chat.send 被明确拒绝/接受夹具截获，没有启动 Codex 或微信任务。另以真实 App/Store 与 AES-GCM 测试 vault 验证40个并发更新保留最后版本、实际重开存储恢复、附件内容、新工作区草稿隔离、缺失附件提示和清空后重新打开不复活。

本轮证据：C:\Users\admin\AppData\Local\Temp\qqclaw-drafts-035-xz918M/ 下的构建/云记录，及 C:/Users/admin/AppData/Local/Temp/qqclaw-bundled-034-2yx9Jh/draft-backend-verification.json；前端在 qqclaw-home-034-fDuyPm/draft-ui-verification.json、qqclaw-home-034-ggBscl/send-rejected-verification.json、qqclaw-home-034-7chLQr/send-accepted-verification.json，均位于系统临时目录。一次辅助脚本直接使用 D: ESM 导入而失败，改用既有 esbuild 打包后检查通过；一次 CUA 目标选项查询把 aria-pressed 当成 checkbox 角色而超时，读取实际控件后更正，均非产品功能失败。

最终 Windows EXE 已在空数据目录、仅含系统目录的 PATH 下实际启动包内 Node v24.22.1/后台，随后关闭检查进程。最终 Mac [云运行41336591743](https://github.com/mumuhaha487/wechatclaw/actions/runs/41336591743) 成功，46条实际PASS，新增真实原生管道、钥匙串加密与后台重启后的草稿文字/图片附件/目标选项恢复。DMG档案摘要与GitHub一致，UDIF通过，唯一同名release/macos/QQClaw.dmg已更新。Windows 307438592字节，SHA256 e75e181ff408466388593b49a3942bb8d36a0637f764fdad35f5784c321970f0；Mac 129528149字节，SHA256 43ee0e87b55676a0a58f812312eb80e4e6d9fbf767a9cb39c3e4d2c33a20c086。构建代码29c17c12170f7dd547defddddb8f24d0cd30e31c。

初次云运行41336089839也成功；后续为首页无目录草稿补充new:归属，空项目/空会话检查通过后重建，最终采用上面运行。尝试取消初次运行返回409，重新读取确认其已成功结束，不当作构建失败。最新产物上传仍保留草稿状态。正式旧版进程与账户数据保留。完整目标仍 active，原生完整 GUI/IME/DPI、微信/Google闭环、Mac官方扩展和Blob官方下载等缺口没有按通过处理。

## 原始目标的当前核验范围

| 要求 | 当前证据与状态 |
| --- | --- |
| 白色为主、黑白亮色 | 当前CSS默认亮色，实际前端截图和交互已检查；完整原生窗口/DPI仍未直接验收 |
| 右侧可拖宽、收起、关闭，保护聊天空间 | 实际前端拖动/关闭/恢复及原生组件记录已具备；最终独立软件物理焦点、输入法与权限气泡仍待核验 |
| 使用原版官方ChatGPT插件 | Windows已内置原版组件，既有真实模型完成输入/官方下载/关闭标签，宿主签名与进程归属检查通过；本轮未重跑模型，不冒充新官方/微信闭环。Mac官方自动浏览仍未接通 |
| 尽可能复刻参考主页操作 | 已覆盖侧栏、新聊天/搜索/通知、会话展开/选中保留、面板标签/菜单/恢复、输入控件及草稿恢复等；尚未证明所有参考主页操作完全一致 |
| 上下文必须是真实变化 | 既有真实模型用量通知与渲染证据保留，未知值显示待统计，不是固定100%；本轮未改统计逻辑 |
| result.md记录需求、问题与证据 | 本文件保留原始目标和逐阶段记录，明确测试层级与未完成项；完整目标继续active |

## 主页交互补齐：后续源码（尚未重编译安装包）

对照用户提供的 image-1/image-3 中 Codex 实际界面继续修改：项目会话按最近更新时间排列，默认显示 5 条，支持展开全部/收起；收起时仍显示当前选中的较早会话。聊天标题栏移除重复的“内置浏览器、新建面板、展开面板”按钮，关闭面板后只保留一个带真实标签数量的恢复入口；面板打开时，新建/展开/收起/关闭由面板自己的工具栏提供。新网页仍可从“文件 → 新网页标签”、Ctrl/⌘+T 和面板入口打开。输入框圆角改为 18px，保持白色为主的中性色。

实际 CUA 点击真实前端/App/Store，核对 5→9→5 条列表、选择第 9 条后收起仍显示选中项、会话切换草稿保留、菜单新建网页、关闭/恢复面板后仍只有原来的 1 个标签、关闭最后标签后空组保持空、再关闭面板后计数消失。面板打开时聊天区约 583px、面板约 367px；标题栏只有菜单/目录两个按钮，关闭后加一个恢复按钮。最终 light、无横向溢出、圆角实际为18px，0条chat.send、0个界面异常。原生浏览器层及模型发现为明确夹具，不是新一轮原生软件、官方扩展或微信验收。证据及截图：C:/Users/admin/AppData/Local/Temp/qqclaw-home-034-yc7wsN/{verification.json,before.png,after.png}。

本轮同时实际观察到：整页刷新会清空尚未发送的草稿，现有草稿只保存在前端内存。该问题尚未修复，不能把“切换/面板操作保留”说成“刷新/重启保留”。下一步应在已有加密存储中持久保存草稿及合适的附件引用，覆盖刷新和重新启动；不能只改外观掩盖数据丢失。

本节源码尚未编入上一轮 0.3.34 EXE/DMG，GitHub 草稿资产和正式进程未更换。完整目标继续 active，既有完整 GUI/IME/DPI、微信/Google、Mac 官方浏览、Blob 下载等缺口保持。

## 当前进展：0.3.34 内置运行环境（2026-11-02）

用户已授权内置运行库，原先等待官方离线下载的阻塞已解除，目标保持 active。Windows 项目内 runtime/windows 已备齐原版官方 ChatGPT 扩展、Node REPL、Node/npm、CEF 和编译客户端；完整 EXE 会包含这些资源，不需要另装 Codex Desktop 或借用开发聊天的浏览器。Codex CLI 仍按需安装，登录及第三方 API 配置由用户在软件中完成。

真实模型已通过隔离的实际产品 BrowserHost/CEF/helper 和内置官方组件，完成 A/B 中文输入、官方下载 wait→click→download.path、45 字节内容核验、关闭 B 后实际移除、返回 A 读回。宿主签名/进程归属与唯一管道核验通过，检查进程正常退出 0。没有启动原微信账户、使用替代驱动或复制登录身份。证据位于项目外 C:/Users/admin/AppData/Local/Temp/qqclaw-bundled-034-2yx9Jh/official-verification.json 及 official-probe/。

Mac 最低系统为 13.5，与两个官方 Node 二进制的 LC_BUILD_VERSION 一致。此前 13.3 的声明已修正。Mac 新增内置官方 Node.js 24.22.1/npm 的 arm64 与 x64 发行包，按固定官方 SHA256 校验，按应用运行架构选用，安装 Codex 写入用户目录。Mac 官方扩展自动浏览尚未接通，不把普通 WKWebView 或 Windows 的结果算成 Mac 自动浏览通过。

独立 Windows EXE 已实际通过：全新空数据目录、仅含 Windows 系统目录的 PATH，后台确实由包内 Node.js v24.22.1 启动，已取得“后端已启动”日志；测试进程随后关闭。起初两次检查未通过：首次受旧长路径限制，第二次仅切换 .NET 选项仍不够，现以扩展路径修复；原始失败日志保留。首次解压进度窗口尚未做原生视觉截图验收。

Mac 云构建 [41333393550](https://github.com/mumuhaha487/wechatclaw/actions/runs/41333393550) 成功，45 条实际 PASS，包含包内 Node/npm 在仅含系统目录的 PATH 下运行、两种 Node 架构签名检查，以及既有安装/原生/持久化检查。已下载并核对 GitHub 档案摘要和 DMG 格式。Mac 编译代码为 f895ca054f98ed795b712d2277f7318e9c48f6c2；该构建包含最低系统 13.5 的修正；Windows 成品对应源码 4905d4b646c9f214330468128cbde964c8e56228。

本轮成品：Windows 307437568 字节，SHA256 25359812fb756e73e583c2acbf4f7d18b0f8883288c28efb33a47d6bc7f512d3；Mac 129551912 字节，SHA256 8af3d6c90e405f7ab4fe92cc964c92f3fc13bec790ec5b65d8e0c65871787041。成品暂存项目外 C:\Users\admin\AppData\Local\Temp\qqclaw-bundled-034-2yx9Jh，Mac 子目录 mac-compat/mac-verified，本地同名 release/macos/QQClaw.dmg 已更新。正式程序未停止，项目内未增加第二个 EXE。

[本轮 GitHub 草稿](https://github.com/mumuhaha487/wechatclaw/releases/tag/untagged-9ccec836087975db1b20)已更新为 0.3.34，仅一个 EXE 和一个 DMG，远端文件摘要与本地产物一致。本轮临时应用/浏览器检查进程已全部退出。

完整目标仍有待验证项：独立软件完整 GUI/焦点/中文输入法/DPI、微信线上浏览闭环、Google 搜索结果、Mac 官方扩展自动浏览及 Blob 官方下载。正式 0.3.32 程序未停止、账户与数据未清理。后面的记录属于历史阶段。

更新时间：2026-11-02。**0.3.33 Windows/Mac 阶段候选已编译并上传指定仓库的草稿发布，完整目标尚未验收通过。** 本地正式 Windows EXE 与 Mac 唯一安装包仍为 **0.3.32**，正式程序保持运行。源码已将 CEF 接到实际 BrowserHost、正式 helper 和可选打包流程，真实配置模型已通过原版官方扩展新建、读取、关闭检查页；组件检查不能当作正式 EXE 完整 GUI、微信、Google、全新电脑或 Mac 验收。该历史阶段原始目标曾标记 blocked（现为 active），完整范围保留；下方旧检查点中的“尚未接线”等描述只表示各阶段当时状态。

## 历史阻塞：官方原包下载要求交互认证（现已改为内置）

第三轮接续实际调用WinGet，从官方桌面页给出的Microsoft Store产品9PLM9XGG6VKS下载原始x64安装包，未安装程序。第一次因未接受包协议取消；第二次接受包协议并跳过离线许可证/依赖获取后，仍返回`0x8A150076 / APPINSTALLER_CLI_ERROR_AUTHENTICATION_INTERACTIVE_REQUIRED`。WinGet明确说明此下载通道要求Microsoft Entra身份及相应管理角色。本轮没有启动交互登录，没有取得安装包。

连续三轮已分别核对CLI市场、官方安装器/公开清单、官方Store取包，纯CLI新电脑的独立官方组件获取仍卡在外部来源/认证。需要可用官方离线包或具备下载权限的环境才能继续验证这条安装链。原生整套GUI、真实微信/Google、Mac官方自动浏览及特殊下载等原要求均保留，不能判为完成；现有0.3.33阶段候选保持。证据：项目外qqclaw-cli-browser-setup-C6DhbR/blocked-audit.json及official-store-package/的原始日志。目标按此外部阻塞处理，不以替代浏览器驱动或模拟测试缩减验收。

## 纯CLI新电脑安装入口核对（2026-11-02）

读取当前官方浏览器安装说明、插件说明及真实Codex 0.157.1的plugin帮助。官方浏览器页面描述桌面端Settings > Computer Use配置流程；通用插件页面说明CLI可用/plugins，但这不能推出Chrome运行库可独立安装。本机实际执行plugin list --available --json得到11个已安装、52个可用条目；chrome@openai-bundled来自Desktop生成的本地市场路径，当前可用列表未发现独立Chrome安装源。因此没有新增未经验证的安装命令；纯CLI新电脑自动准备官方运行库仍未完成，也不据此断言所有账户或未来版本都不支持。

证据在项目外qqclaw-cli-browser-setup-C6DhbR/catalog.json、findings.json和official-browser-setup.txt。参考：[官方浏览器设置](https://learn.chatgpt.com/docs/chrome-extension#set-up-your-browser)、[官方插件说明](https://learn.chatgpt.com/docs/plugins#overview)。本轮没有修改产品代码、安装插件或重建候选；正式程序和原微信账号未操作。下一步需要能独立获取官方运行库与插件的实际来源，不能用Desktop本地市场路径冒充新电脑下载入口。

补查官方安装器分发实现：按其实际URL拼接规则读取公开primary-runtime清单，HTTP 200，26.1030.10813的Windows档案为508,335,983字节。此清单属于办公依赖运行库，尚未证明包含浏览所需组件，未下载整个档案。当前官方安装包中实际找到cua_node/bin/node_repl.exe及plugins/openai-bundled/plugins/chrome/.codex-plugin/plugin.json；官方桌面下载页的Windows入口仍为Microsoft安装器。不能将办公依赖清单当作独立浏览安装入口。证据位于上述目录的vendor-distribution/distribution-findings.json及源片段。本轮仅补充分发来源证据，产品和候选未变。


## 交付补查修订：关闭面板后被迟到访问事件重新打开

2026-11-02补查复现：原0.3.33候选中，用户点击关闭后，迟到的browser-automation事件仍会展开面板；此前普通状态更新检查没有覆盖此路径。ui/app.mjs现使用已有browserHidden标记尊重本次界面运行中的显式关闭/收起，手动重新打开会解除隐藏。仅调整面板显示，不修改官方扩展、原生浏览器内核或后台任务。隔离前端实际完成原失败复现、修复后关闭/收起保持隐藏、手动恢复和草稿保留；事件和原生层为夹具，0条Codex/微信任务，不当作真实许可流程或完整EXE GUI通过。两次检查进程正常退出0，临时页已关闭。证据：项目外late-browser-access-8644248663954504a13aa1d2a081bf85/。

修订已编入同一0.3.33草稿：Windows 6370816字节，SHA-256 `a9e29f65dcbd684e0d83c36ac88756ca3fb1279fa3cf79d7de99d2eb493601c8`；59份脚本语法、79份源码及21个payload条目/可信资源检查通过，包内前端与复测字节一致。代码`f2c36984f33ad5f4075e323ff8a00158f6466645`的[Mac云构建41323956056](https://github.com/mumuhaha487/wechatclaw/actions/runs/41323956056)成功，44条实际PASS，80份构建输入匹配；DMG 885234字节，SHA-256 `7688094b66fe48a8309b3aa0e6b42eeaae242666061ba2918b18579d5c92b9a2`，档案摘要/CRC/UDIF通过。[草稿安装包](https://github.com/mumuhaha487/wechatclaw/releases/tag/untagged-0f6bbe94c404540f7bfb)仍仅一个EXE和一个DMG，未公开发布，正式0.3.32和PID95560未动。草稿修订时GitHub重生成临时URL，已读回最终地址并更新链接；下面旧检查点的摘要仅为历史记录。完整目标及既有缺口保持。

## 前一候选记录：0.3.33交付准备（原始目标未全部完成）

用户要求收住范围、准备交付。源码版本现为0.3.33；正式0.3.32程序及唯一EXE/DMG保持。面向用户的一页说明为[交付说明.md](交付说明.md)，列明可用功能、未完成要求及数据位置。候选采用此前验证的16db43df8376654c0bec29a907bde739内核；本轮未完成的Blob实验已撤回，源码逐字节恢复至原验证内核，没有用物理落盘冒充官方下载成功。

本轮实际新增证据：原内核真实gpt-6.1-sol/xhigh、11次原版官方Node REPL、一次站点与一次下载确认后，Blob下载等待120000ms超时，原生记录为空。实验内核ed438f63ef3eaefc5a14d8f3ab8d0eba经真实产品安装器19项及固定CEF解析器19项检查；相同官方任务能保存内容准确的31字节中文CSV，但官方等待仍超时，未返回download.path()，后续HTTP/Blob空文件均未执行。这次结果不通过，实验代码及二进制仅在项目外保存。官方扩展SHA256 8B89D42A93E8E209AA191F853B27812D41DC9B36CC1ECEA0DF41B0D90FEAD9EA未修改。

只读官方扩展源码发现Blob需blobDownloadsSupported===true及setBlobDownloadOrigin/完成事件契约；尚未取得当前宿主能力字段的确切返回，不能从函数存在推定已支持。公开[OpenAI官方说明](https://learn.chatgpt.com/docs/chrome-extension)仅确认扩展管理下载和站点确认，不证明Blob API。此次开发聊天的文档搜索不作为产品Google结果验收。证据为项目外blob-stage-ea15e9a440f5494fa04bc949999506d6/、official-special-2068b991f1464323a812921cbabf41d8/与official-special-d452e9373199408e8cc84b649409280d/。两个模型组件均root/backend正常退出0，未向原微信账号发测试。

0.3.33候选准备完成：Windows 6370816bytes，SHA256 `18388F4D4ACECA97D1213042D11783CA7A110EAA90C05A0906A883CD3D0C27D5`；反射版本0.3.33，59语法/79源码/21payload及可信资源核对通过。Mac代码提交`c3b608c4598cdb44c40826b98887d2570b86d9fb`的[云运行41320446527](https://github.com/mumuhaha487/wechatclaw/actions/runs/41320446527)成功，44条实际PASS；artifact13089630866 ZIP摘要`e3b0922e7177e78a2b63838b491942d77f5688d21c31942eb4049f77539f628d`与GitHub一致，CRC/UDIF通过。DMG 885211bytes，SHA256`f53af38e3f3d52d101532af0f7c44f6ddbed9d9fcaff0e84552ecbdf05f41dd8`。80项产品源码/workflow与该云提交按LF规范化一致。

已在指定仓库创建[0.3.33草稿候选](https://github.com/mumuhaha487/wechatclaw/releases/tag/untagged-0f6bbe94c404540f7bfb)，draft=true、prerelease=true，只有QQClaw.exe和QQClaw.dmg两份资产；上传后的大小与摘要逐一核对。草稿未公开发布。正式95560继续运行，项目release仍只有原正式0.3.32 EXE/DMG且摘要不变。Blob两轮模型组件及其确切CEF/helper PID复查无遗留，3个临时浏览器页已关闭。当前候选可交给用户检查；完整要求仍未全部通过，不能标记goal完成。原始目标继续active，正式程序不停止或替换；完整GUI/真实微信/Google结果、Mac官方扩展、仅CLI新电脑引导、特殊下载等缺口不缩减。

最后补做了最终候选EXE内嵌前端检查：直接提取payload中的JS/CSS/HTML及资源，JS/CSS未重建，HTML仅插入隔离桥；真实App/Store运行于项目外，原生浏览器、环境检测与模型发现使用明确夹具，没有向Codex或微信发送任务。CUA实际将面板从366.7px拖到510.3px，聊天区相应从583.0px变为439.3px；关闭最后标签为空组、关闭整个面板后聊天区扩展至950.3px，草稿保留，无横向溢出。侧栏收起后新聊天、搜索、通知各只有一个入口；恢复面板并双击分隔线回到366.7px。界面为light，根背景白色。

在同一打包前端回放此前真实模型报告，当前上下文显示4.8%（12,465/258,400）→12.5%（32,388/258,400），清空报告显示“待统计”；历史累计426,224未被误当成当前占用，状态更新没有重新打开已关闭面板。它是历史报告回放，不是新真实对话。项目外`delivery-0333-b079f43c9f674c98a515d42be6147292/packed-ui-30e7ab09be6c49cf8aab3d16ca73ad51/`保存资源来源摘要、CUA观测、截图、final-audit.json和verification.json；chat.send=0，前端/服务器未处理错误0，仅保留预期的模型发现夹具错误。检查服务器正常退出0，临时页已关闭。截图为隔离打包界面，网页和模型数据为夹具，不证明独立原生EXE、真实微信或Mac界面通过。本轮只补充交付证据，未改变候选二进制或重新构建。

## 前一源码检查点：整页刷新接续组件安装（未发布）

本轮修改 `native/CefBrowserInstaller.cs`、`ui/browser-component.mjs`、`ui/app.mjs`。安装任务由原生进程保存操作ID、单调递增版本、进度、取消中状态及成功/取消/失败结果；状态查询可恢复当前任务，终态通过事件通知，原页面的安装RPC丢失也能收尾。前端拒绝迟到的旧状态/进度，重复点击不再发起另一次安装；每个WebView文档使用独立RPC编号，旧文档响应不能误接到新请求。安装提交阶段仍不能取消，原有校验、文件lease、下载地址/摘要和原版官方扩展没有改变。

实际基线在原生安装器仍处于extract阶段时刷新页面，界面错误地恢复“修复组件”，取消入口消失。本轮CUA使用实际前端/App/Store和实际C#安装器，验证刷新后恢复同一ID及解压进度、安装按钮禁用、取消入口可用；从新页面取消后收到cancelled终态。另实际触发无效档案校验失败，刷新后仍显示错误并可重试；再开始正常修复，解压时刷新后释放检查暂停点，新页面实际收到succeeded并显示已安装、扩展仍未连接。4次有意发起的检查任务各对应一个原生操作：取消、测试文件缺失、来源校验失败、成功；没有把第2次误写成校验失败。

证据目录为项目外 `qqclaw-cef-contract-20261101/reload-install-fb6088bfb67a412fb1f5b63b53c1db3f/`，见ui-verification.json、fixed-final-audit.json、component-messages-fixed.jsonl及fixed-success.png。桥只在本轮较早的未发布诊断bundle `9b583538e14c9ea979b46e630b09472e` 中可逆移走resources.pak以触发修复，使用已有官方档案并由产品校验/解压，未重新做公网下载；检查暂停点和60秒上限仅在项目外桥，不在产品或Codex任务中。环境、模型发现和原生浏览器路由为明确夹具；chat.send=0，前端/服务器未处理错误0，预期失败RPC保留。不是正式EXE整套GUI、新电脑引导、微信或官方模型浏览验收。

7项控制器竞争检查和2项执行实际RPC/响应监听源码的独立JS上下文检查通过：包含旧查询晚于终态、旧进度不复活任务、重复点击，以及旧文档响应不会结算新请求。当前Windows候选为本阶段package-05b196be05da45e1a68abebba7e9f826/QQClaw.exe，6370816bytes，SHA256 `44A9D8CFA2BD0EA34368074A615AE69E033D5E1578C2A8FBEFECF14E3F45996F`；59脚本语法、79源码及21payload/可信资源核对通过；最后的跨平台编号调整后重新构建并再核对。Mac最终结果见下文。

Mac兼容补查发现应用从qqclaw://app加载，不能假定crypto.randomUUID总可用。当前改用getRandomValues生成128位文档编号，保持加密随机性及原有ui-前缀；2项实际RPC源码上下文检查按最终表达式重跑通过。新增云检查通过真实Resources处理器和非持久化WKWebView加载同一自定义协议，执行生产编号表达式并记录API可用性。此前a991425的43项云检查未覆盖此API；其包和日志保存到intermediate-a991425，不以旧绿灯代替这次兼容检查。CUA安装状态全过程是在该中间UI取得，后续仅更换编号生成API；两者范围分别保留，未伪称已重跑完整安装UI。

本轮检查自身的两项更正保留：首次失败档案写到阶段根目录而桥读取fixed子目录，实际是FileNotFoundException；修正路径后才真实取得“浏览器组件来源校验失败”。Node REPL直接导入esbuild遇到module未定义，随后改用项目外Node脚本正常打包；不把工具环境错误写成产品失败。


最终Mac云运行[41316394686](https://github.com/mumuhaha487/wechatclaw/actions/runs/41316394686)成功，代码提交`bd94b44e6a8cf4aa6bd1d204421459ff92339c8b`。44条实际PASS包含新增真实自定义协议检查；原生日志明确secure=true、randomUUID=function、getRandomValues=function，**当前云端WebKit并未复现UUID不可用，不能把此前风险假设写成已发生的故障**。生产getRandomValues表达式在该环境实际执行并生成不同的32位十六进制编号。随后最终前端另在namespace-ui完成CUA启动、设置导航、读取真实C#已安装状态和再次刷新：3次snapshot、2次组件检测，0chat.send、0未处理错误；它不是在最终编号下重新跑一遍全部安装流程，也不是Mac全界面验收。

最终Windows候选59脚本语法、21payload/可信资源、79源码逐字节核对通过。Mac下载ZIP摘要`40619ACE5A67DC0E43CD2C070B36431AC0A7BA61323F909200F43269F65B2E06`与artifact13087233758的GitHub digest一致，CRC及UDIF尾部通过；未发布DMG为885195bytes，SHA256`A884EBE75831F54802BCAAD31E723D220ACE0EC96AC51B5A02E15E8E8E9F92E4`。79项产品构建输入及当前workflow共80项按LF规范化与云提交匹配。见项目外reload-mac-verification.json、reload-cloud-source-match.json、current-reload-package.json。44项包含现有安装/Universal/签名/持久化/WK组件检查，不代表Mac官方扩展内核、物理键盘/IME、整套产品GUI或Apple公证。

收尾：基线、安装恢复和最终启动检查均正常退出0，本轮3个临时页面已关闭，按本轮确切路径/PID复查无遗留；正式95560仍运行，正式EXE/DMG摘要和唯一成品数量保持不变。没有向原微信账号发送消息。源码与报告已同步指定仓库，整体目标继续active，两端候选均未发布。

本节证明同一原生进程中前端整页刷新接续安装，不是退出软件后继续下载。旧章节“整页重载安装未测”由本节覆盖。正式0.3.32 EXE/DMG未替换，整体目标继续active；完整参考主页、原生画面/权限气泡/物理焦点/IME/其他DPI、真实微信/Google结果、Mac官方内核和仅CLI新电脑组件引导等仍未完成。

## 前一源码检查点：主页入口、刷新恢复与窗口可见性核对（未发布）

正式Windows/Mac成品仍0.3.32，未再次替换或停止正式程序。当前源码相较前一节新增4个产品文件改动；没有修改官方扩展、官方runtime、浏览器权限或原账号配置，也没有引入另一浏览器驱动。

| 文件 | 当前行为 |
| --- | --- |
| ui/app.mjs | 侧栏提供明确的“新聊天”行，搜索/任务通知放到品牌行；侧栏收起时保留相应入口，并移除同屏重复的主工具栏新建/搜索入口。刷新前端后读取已有原生网页状态，恢复当前标签；空组回到面板起点，恢复期间的关闭/切换意图优先。新会话沿用输入框当前服务、模型、思考等级和权限，避免已选第三方模型却因全局默认模型为空而创建失败 |
| ui/desktop.css、ui/icons.mjs | 白底黑字、浅灰侧栏，补充本地线条编辑图标、品牌行工具区和新聊天行；窄侧栏中的标题可省略，不挤掉功能按钮 |
| native/cef/BrowserEngine.cpp | 仅新增windowId、windowShown和surfaceShown诊断字段，直接读取实际原生窗口WS_VISIBLE。区分多个CEF标签共用一个Chrome窗口与多个独立嵌入窗口；没有改写页面visibilityState或禁用官方焦点模拟 |

### 页面可见性误判的确切原因

上一节的probe-335e页面visibility断言未通过被保留。本轮新增原生窗口ID及实际样式读取后，6项独立窗口检查通过；但真实官方扩展的同窗口A/B仍都报告visible。随后又启动**可见的隔离Form**复测，结果相同，排除了“仅因为父Form隐藏”的解释。没有以输入成功或内部show标记把这一步当成物理显示验收。

只读核对原版browser-service.mjs（SHA256 `1AF22149F394099EBF6C3D8AED8814A9362DDA4C0BB2369EF0C37AAF239A7696`）：attachTab会调用enableFocusEmulation，发出Emulation.setFocusEmulationEnabled(enabled=true)。固定Chromium154.0.8037.98的`content/browser/devtools/protocol/emulation_handler.cc`会调用IncrementCapturerCount，参数stay_hidden=false；`content/public/browser/web_contents.h:923`明确这种模式始终向renderer报告user-visible。因此，“后台标签的document.visibilityState必须hidden”不适用于当前原版官方运行时，不能通过篡改它来让断言变绿。完整链路、原文件摘要和固定公开源码保存在项目外official-visibility-source-evidence.json；未发出独立CDP指令。

初始viewport-verification.json中passed=false及两轮原始visibility报告都保留；更正后的official-tabs-verification.json只核验真实A/B输入、官方下载/路径、B关闭后实际移除以及最终A的原生区域。**物理标签显示/焦点验证仍为false**，没有把这次纠正扩大为完整GUI通过。共用同一HWND的多个标签windowShown均true只表示该窗口显示，不能据此宣称所有标签都在前台。

### 本轮实际证据

证据根仍为项目外`C:/Users/admin/AppData/Local/Temp/qqclaw-cef-contract-20261101/`。原生阶段`visibility-stage-5e2f5c0961fd49f4ba5b85f9500b6a8d`，C++源码SHA256 `0FE3B90DAF83E41FA6ADE1A2AB7099825CFF519EFBAB5DBB48AFFB0B1C42A6C2`，客户端DLL `1BD675A7750183BC9A474E1F75761D6C98100112AF70AAAC1C9B222F9C1C3D06`，bundle `16db43df8376654c0bec29a907bde739`，经产品安装器安装。

- `probe-ca1e595fcb0c446bb1f137a3e34bdf89`：6项实际BrowserHost/CEF检查通过，核对原生WS_VISIBLE及网页区域，覆盖明确选择、新建前台页、后台恢复、切回、面板隐藏/显示、关闭选中页后的继任者；根和后台正常退出0。这里的“显示”限定为原生窗口状态，非整屏截图或可信输入验收。
- `official-download-1e0e3c457b95486e85cac45d93a035ab`（隐藏Form）、`official-download-399062099b344a57aa1ac11a4ce9ac50`（可见Form）：真实gpt-6.1-sol/xhigh分别15/16次未修改的官方Node REPL调用。各一次自动prepare、站点/下载分别确认；在A写入并读回“QQClaw 输入验证”，按官方wait→click→path下载45字节；在B写入并读回“标签B验证”，实际关闭B、列出确认移除，再读A确认原输入保留。最终A区域501×600覆盖500×600，左上0/0，页面报告吻合。0 Responses夹具、0独立搜索/shell/替代驱动，当前C++/后端源码快照与4个实际运行二进制核对通过。并未证明独立软件完整GUI或物理焦点。
- `layout-ui-e1daa90965e3415b9fe2389357ca59c8`：CUA使用实际前端/App/Store，浏览器原生层/模型发现为明确夹具。实际拖动工作面板，466px时聊天区约484px、拖到550px上限时仍约400px、最小280px时约670px，无横向溢出；双击还原到约367px。实际关闭最后标签为空组、关闭面板后聊天区约950px，关闭/展开过程保留草稿。侧栏缩到220px后，品牌行按钮仍在边界内；设置页保留一个可用通知入口。新侧栏展开/收起各只有一个可用的新聊天、搜索、通知入口；搜索和通知均实际打开。截图为layout-sidebar-final.png，不是正式EXE或原生网页截图。
- 同一界面中发现并保留了新建会话的实际失败：当前自定义会话模型有效、全局defaultModel为空时，旧创建请求只传workspace，App返回“请填写要使用的模型 ID”。修复后从UI选择动态第三方模型vendor-next-1/ultra，新建会话实际保存providerId=second、model=vendor-next-1、effort=ultra、permission=read-only；全局默认模型仍为空，原两条会话及消息保留。界面检查期间chat.send=0；模型名来自隔离发现夹具，不是产品中的固定列表。verification.json保留初始session.create错误和检测/模型发现夹具的预期RPC错误，不能宣称所有RPC都成功。
- `layout-ui-62abd9beb3914be2a4484a34e93b5f5f`：真实前端/App控制原生状态返回延迟；读取期间关闭面板，再释放响应，面板保持关闭、聊天区约950px；重新展开恢复原标签，未创建新原生标签。该检查针对restoreBrowserPanel逻辑；之后仅另改新建会话参数传递，未改恢复函数。
- 上下文：CUA回放此前实际模型报告，显示12,604/258,400（4.9%）→25,410/258,400（9.8%），清空报告显示未知；这是实际渲染的统计文本与辅助说明，不是固定图片。新可见组件真实模型另取得34条tokenUsage通知，生产contextSnapshot计算从12,465（4.82%）变为32,388（12.53%），见visibility-real-context-evidence.json。回放与新真实模型证据分开，没有将回放宣称为新GUI发送任务。

当前项目外Windows候选`package-c4d566f0d0c44b8594a1904c39fe0bdd/QQClaw.exe`为6367744bytes，SHA256 `618F072FDFE557D35C052BCE01B58F183CF265A118C7BD3E8731314D1008F62C`。59脚本语法、79源码逐字节一致、21payload及可信资源核对通过。19查找/16下载历史/119后台等仍是前一节所列构建的既有结果；本轮新增原生代码只有诊断字段，未伪称这些检查又在新内核全部重跑。

[Mac云构建41311804049](https://github.com/mumuhaha487/wechatclaw/actions/runs/41311804049)成功，精确构建代码提交`9dd31321c044b7bc09a4cf7f3ecd35552ca5bfa7`。逐项日志核对43条实际执行PASS输出，含目标/转录、关闭标签/快照的JS检查及安装包、AppKit/WK、下载/查找、管道、钥匙串与重启保存等；排除了源码回显和0_build.txt汇总重复。Universal两架构、签名校验、DMG校验/只读挂载和安装复制由实际云流程核验。artifact13086240746下载ZIP摘要`E0EE00C0DECB1BB743F1A81E3B23BD1F335A14B34CDCB711A4B20D808595D0AA`与GitHub digest一致，CRC和UDIF尾部通过；未发布DMG在本阶段mac-verified/QQClaw.dmg，880658bytes，SHA256 `10D8719F1557D08D9530164738C605ADC011E8B5CE36CFB23E298E90FD3B03FE`。79个构建输入按LF规范化与该云提交一致，见visibility-cloud-source-match.json。它不是本次侧栏在用户Mac的GUI/IME验收，也未接通Mac官方扩展或完成Apple公证。

首次本地云日志计数脚本漏匹配PASS后的冒号，并选择了汇总日志；失败输出未当作构建失败或成功数字。修正为只统计每步骤带时间戳的实际PASS:行，保留原始ZIP和43行原始输出。收尾核对：6项原生窗口组件、隐藏/可见两个模型组件均root/backend正常退出0；两份界面服务器退出0。已逐个关闭本轮创建的7个临时浏览器检查页，未对其他页面发出关闭命令；清理后所选浏览器标签列表为空，不能据此声称用户原页面仍打开。正式PID95560继续运行，正式EXE和DMG摘要分别仍为`AEBFAC2BCBEF57EF5225B6E36D16BE88C3CCE9A723AFB3209B84459D1ACEE875`、`F693941A3CC0A57AD271075F0565D010EB28BF6534C7D89331FBA7B6EC4CBB75`，发布目录仍只有一个EXE和一个DMG。

**整体目标仍active，候选未发布。** 当前完整参考主页的逐项操作一致性、真实独立EXE中浏览器画面裁切/权限气泡、物理焦点/键盘/IME/其他DPI仍缺直接验收；原生矩形和官方页面截图不能替代整屏GUI。真实微信完整闭环、Google结果（此前被安全拦截）、Mac原版扩展内核、仅CLI全新电脑组件引导、特殊下载及安装中整页重载接续等既有缺口保留。正式95560不停止，不向原微信账号测试，不借开发聊天身份或替换官方驱动。

## 前一源码检查点：Chrome网页区域、标签同步与真实输入下载（未发布）

正式成品仍为0.3.32，本轮没有再次替换、停止或测试原微信账号。源码对原生Chrome工具栏作了窗口嵌入适配：保留普通Chrome窗口、原版官方扩展及沙箱，以实际renderer边界对齐应用面板；这不是CEF提供的隐藏工具栏API，不能代替完整GUI、原生权限气泡、键盘焦点、IME及其他DPI验收。

`native/cef/BrowserEngine.cpp` 新增真实网页区域测量、客户区边界过滤、每次几何变化后的状态发布及最多1物理像素取整容差。旧算法在两个父链均可见的renderer中直接选面积最大者，真实模型运行时选中了越界的后台矩形，导致surfaceLeft=10。只读调试取得确切候选后，改为先过滤越界项再选择；没有硬编码工具栏高度。`scripts/build-browser-engine.mjs` 为这些原生测量API增加延迟导入，保留沙箱启动条件。Chrome同根标签还须同步内部选择，现用公共SetFocus(true)，在创建回调退出后的UI任务中复核当前页/关闭/可见性；后台恢复、新选择和迟到任务不得盲目激活旧页。显示面板及关闭当前标签后也安排同步。

证据根：`C:/Users/admin/AppData/Local/Temp/qqclaw-cef-contract-20261101/`。最终阶段 `chrome-ui-stage-ed10daf2ba54410a8d12eee0ac8e3037`；C++源码SHA256 `43112D577AA3A9331ADF0235C21970B67C1EE66CAB1A7159F2554C4078FDEB88`，客户端DLL `44DF9532EF71E39E0A1E6E0C79E5C7AC433A7FA2FEC167784C2D02B21A8FBA44`，bundle `b5acb7d549ffde5096fbc2621d29e707`，经产品安装器安装。

| 检查 | 实际结果与范围 |
| --- | --- |
| 普通网页尺寸 | `probe-f2286654480742d98a4b537ac325d16f`：CUA逐项选择320×240、480×400、780×600、1160×840；每组12次原生状态与页面自身resize报告核对，左上0/0、完整覆盖面板、无尺寸振荡，最多1像素过扫。仅150%DPI、隐藏Form组件；正常退出0 |
| 真实模型输入、下载及尺寸 | `official-download-a7992457a9104ffcbe01c17a7bdccdf4`：真实gpt-6.1-sol/xhigh、12次原版官方Node REPL调用、一次自动prepare，站点和下载分别确认。实际输入并读回“QQClaw 输入验证”，按官方wait→click→path下载45字节，返回路径与原生记录及实际文件内容一致。最终网页501×601覆盖500×600面板，surfaceLeft/Top均0；页面自身334×400 CSS像素、DPR1.5与测量吻合。0 Responses夹具、0独立搜索/shell/替代驱动；当前源码与4个运行二进制核对通过，组件正常退出0。见viewport-verification.json。这是最终原生快照与页面报告，不能称该真实模型场景也做了12次连续独立尺寸采样 |
| 查找回归 | `probe-f3977e24412e4510ab59c94ad927515a`：19项实际BrowserHost/CEF原生查找断言通过，含导航/关闭/查找并发及实际renderer阻塞后恢复；正常退出0。没有把旧前端截图套用于本轮完整GUI |
| 下载/历史与退出保存 | `probe-6648c65224f144f0a4ed0bcc439051e2`：16项实际原生检查通过。CUA确认新的慢下载处于运行中后先关闭下载面板，再正常结束组件；独立进程重开加密记录，9条记录、最新cancelled、720896/8388608字节、无running，读取不改变保存文件摘要，根/后台正常退出0。首次尝试在下载面板覆盖时未真正触发结束且下载自然完成，保留该已完成记录；未将它写成取消成功。见active-exit-verification.json |
| 打包一致性 | 项目外 `package-293d77a25df648bb82bd115fd1d60a33/QQClaw.exe`，6369280bytes，SHA256 `3EB93F067E215CAABEB990CE82A105C899F2FFCC7CE43F9763845734D7F65EBC`。59个JS/MJS语法、79个源码逐字节一致、21个payload及可信资源核对通过。该候选尚未发布，运行库仍按需安装；既有119项后台回归是此前本轮后台未改状态下通过，没有伪称本次又重跑 |

必须保留的失败：两个旧真实模型目录 `official-download-c082077f85f54beeb7b6b1efb30b48cb`、`official-download-0b247e7efcfc418ea2b9813d6467019d` 的输入/下载成功而几何失败；父链可见性检查未修好问题。新阶段0bea2351首次启动因新增任务重复release发生原生崩溃；固定CEF CToCpp::Wrap源码说明传入引用已被消费，移除重复release后重编译、重跑以上检查。崩溃现场日志保留，正常dispose无法结束的确切隔离组件随后清理，未动正式程序。测试期间三次安装因同bundle仍持共享lease而被拒绝，保留失败并在先前组件实际退出后顺序重跑，没有绕过安装锁。详细索引见项目外chrome-ui-failure-notes.md。

补充的页面可见性检查 `probe-335e54b00f3444b7975fb831f54251d6` 仅第一项通过：新标签B已上报visible，旧窗口A仍上报visible，使“旧文档必须hidden”断言超时。只读GDB记录active=3、两个独立原生窗口的内部布局记录分别为show=true/false；已detach，没有调用目标函数或Win32 UI控制。**这些是内部记录，不足以证明实际桌面显示/焦点正确；该补充检查未通过，不能把6个计划项都写成成功。** 后续应区分Chrome同窗口标签切换与跨原生窗口隐藏，补独立GUI可见性/焦点证据，不能只依赖document.visibilityState或应用active ID。现场及最初未加载符号的调试输出一并保留。

**整体目标继续active，当前候选不替换正式版。** 已改善的窗口区域只得到上述组件证据；完整主页参考外观/拖宽/面板关闭、真实键盘与输入法、其他DPI、Chrome权限气泡及查找栏协同仍待验收。真实微信闭环、Google结果（此前仍为安全拦截失败）、Mac原版扩展内核、仅CLI新电脑官方组件安装引导、blob/特殊下载和整页重载安装进度接续仍未完成。Mac本轮未改源码、未新构建；此前Mac云构建不能充当这次Windows CEF适配的Mac证据。

收尾核对：本轮隔离组件及最终bundle进程已退出，临时IAB检查标签60至75已关闭，用户原taste-skill页面保留。补充标签检查rootExit=0但backendExit=1，明确按未通过记录，不以主进程正常退出掩盖断言失败。正式PID95560和两端.32成品保留；外部失败日志、源码快照和候选保留供继续核查，项目内没有加入测试文件或旧版程序。

## 前一源码检查点：同地址刷新后的查找状态与两端验证（未发布）

本轮复现并修复了前端查找的实际缺陷：同一 URL 从3处匹配刷新成5处后，原查找栏仍显示1/3，必须再次操作才更新。原生查找19项通过没有覆盖此场景，不能据此宣称前端完整正确。基线截图与原始结果保留。

| 文件 | 本轮行为与原因 |
| --- | --- |
| ui/browser-find.mjs、ui/app.mjs | 共用 browserFindContext，绑定实际选中标签的 navigationRevision；同地址刷新保留搜索词、清掉旧结果，加载结束后重查，即使中间 loading 状态被合并也能识别页面已变化。关闭查找后不会因刷新重开；组合输入未结束时不自动搜索。新序号仍拒绝迟到旧结果 |
| backend/app.mjs | browser.find 校验并转发可选的导航版本，旧客户端省略时保留兼容；拒绝非字符串、非法或过长版本，不交给原生层执行 |
| native/cef/BrowserEngine.cpp | 允许的主框架导航更新每标签版本并发布 loading=true；查找请求携带的版本不属于当前导航时返回 stale，旧 clear 不会清除新页面的查找 |
| native/BrowserHost.cs | WebView2 原生 NavigationId 以字符串传到前端；导航开始取消旧查找等待、重置查找状态，版本不匹配时返回 stale |
| native/macos/BrowserHost.swift、.github/workflows/macos.yml | WK 主导航更新版本、结束旧查找等待；状态与请求采用同一版本核对。云端增加实际同地址 reload、当前页面 find、旧 search/next/clear 隔离检查 |

本轮源码提交 **10e3124784f91fe1744105d790f82ad0b4d216e7** 已推送 work/official-browser-integration。证据根仍为项目外 `C:/Users/admin/AppData/Local/Temp/qqclaw-cef-contract-20261101/`，本轮阶段 `refresh-stage-26520b286bb04e7e96bcace94e5cf71d`。新 CEF bundle **69f220ac8d73af0bb077d43d7e1bd185**，源码 SHA256 `C8210D9031B495391DD7FF8E35DBE3AE7BD6857EBD87E4A9EBC5CD5AA1B116F3`，客户端 DLL SHA256 `5BB88ACA74DA8775A985ED1B4177C706FA3ED93C814FD1C439455BD0786DE614`。

- 基线 `probe-79e514dbcbf54e3198787f22668f47f4`：19项原生通过，但CUA刷新后仍1/3，再点击才1/5，属于确认的缺陷。修复后 `probe-61304ec493a24a7f981c87e1b073841a`：19项再次通过，CUA同地址刷新自动1/5，搜索词保留、再次刷新重算、关闭后刷新不复活。实际旧版本 search/next/clear 返回stale；旧clear后当前查找仍能到2/5。组件正常退出0。见 ui-refreshed-count.png、native-generation-verification.json、原始请求/响应和基线两张截图。
- `probe-a84933d066c64300bb709dfd83a1afd3`：6项实际手动 WebView2 原生检查通过，同地址刷新3→5、版本更替、过期请求隔离、当前查找移动和关闭空组；backendExit与rootExit均0。首轮检查包遗漏原有browser-page.js，open时失败、backendExit=1，失败目录未删；补入原有产品资源后重跑，不将rootExit0单独当通过。
- 同一69f内核 `probe-12c980c658ce42668875fcccb25707de`：16项实际下载/历史回归通过，CUA下载中关闭后，独立进程重开加密记录仍为8条、最新cancelled、720896/8388608字节、无running，存储读取不改变摘要，根正常退出0。此次导航状态修改后的下载退出行为已重新核对，不套用旧622e结果。
- 10项受控前端/实际App handler检查通过，包括合并掉中间loading的刷新、迟到结果、加载中改词/关闭、组合输入、URL/标签切换、标题变化不重复查找，以及后端验证/转发。这里只验证受控状态，不声称真实原生中文输入法、可信按键或完整GUI验收。119项既有回归、59个JS/MJS语法、79个构建源码与候选匹配、21个payload及可信资源核对通过。
- 当前内核 `official-download-89655943690941ce96d86cfb3ea7f592`：真实gpt-6.1-sol/xhigh、8次未修改的官方Node REPL调用、一次自动prepare、站点与下载分别确认，实际下载45字节及官方返回路径与原生记录一致，源码/固定构建/4个运行二进制核对通过，组件正常退出0。没有夹具Responses、独立搜索/shell或替代驱动。本轮检查器最初只匹配双引号且无选项的waitForEvent写法，对真实合法的单引号加timeoutMs形式误报；保留失败说明，改为同时严格验证登记→AX点击→等待→path的顺序及实际文件/返回路径，不修改扩展或放宽为仅连接成功。
- [Mac云构建与原生验证](https://github.com/mumuhaha487/wechatclaw/actions/runs/41294195243) 成功，精确构建提交10e3124；已从日志核对38条实际native PASS，包含本轮WK同地址刷新/旧请求隔离。Universal构建、安装器检查、钥匙串数据等沿用既有云端验证。artifact13078152371下载ZIP摘要与GitHub digest一致；项目外 mac-verified/QQClaw.dmg为880189bytes，SHA256 `26976E36F12350F8AF7772C8C231FB0058C7FF3AB0FF3638A60DC0CE21BA586A`，未发布。此项不证明Mac已能通过原版官方扩展自动浏览，也不是用户Mac实机GUI验收。

本轮Windows候选仍在项目外 `package-909947a9142646e89ff22c89f6526297/QQClaw.exe`，6304256bytes，SHA256 `C33A167B48BC338F5343818344CA70361D59BD7BBD5D8D3DD7894880A93EC4B5`。正式0.3.32 EXE/DMG没有替换，原微信账号、消息和全局配置未改。失败说明另见项目外 refresh-failure-notes.md。

**整体仍未完成。** 下一步优先处理新CEF仍显示原生Chrome控件造成的重复工具栏与参考外观差异，继续核对完整主页/面板拖宽、关闭/空组、焦点/输入法/DPI及Chrome/应用查找栏协同；不能用本轮组件截图代替完整GUI验收。真实微信完整链路、Google搜索结果、Mac官方扩展内核、仅CLI新电脑官方组件引导、blob/特殊下载和整页重载的安装进度接续仍缺。此前Google安全拦截保留为失败，禁止更换驱动或借用开发聊天身份来伪造通过。目标保持active。

## 前一源码检查点：下载退出收尾与最终内核复查（中间构建）

以下“当前/最终”只表示当时622e构建，最新源码以上节为准。

正式 Windows/Mac 仍是 0.3.32，本轮没有替换或停止正式程序。当前源码与下列项目外候选一致，整体目标仍 active；组件检查通过不代表完整软件已经验收。

本轮进一步修复下载和退出之间的竞态：

- `native/cef/BrowserEngine.cpp`：应用请求关闭标签/worker 时先取消下载，等待下载实际终态后关闭来源 browser。CEF 固定源码明确 browser 销毁后不再转发下载回调，因此不能先销毁再等结果。Chrome/扩展直接销毁页面而绕过应用关闭请求时，只记录未确认的 interrupted，不编造 cancelled/completed。
- `native/CefBrowserEngine.cs`：worker-exit 等真实 Exited 与 stdout EOF 都到达才通知，且只通知一次；关闭期间仍接收合法 download-progress。新增 exitDelivered，Close 还必须等最终通知在 UI 线程处理完成后才返回，避免父窗口先销毁而丢失最后状态。
- `native/BrowserHost.cs`：已关闭/已移除会话仍可更新属于同一 engine/owner 的既有下载记录；取消保留实际观察到的字节数。源文件完整索引与首次实现原因见下方前一检查点。

证据根 `C:/Users/admin/AppData/Local/Temp/qqclaw-cef-contract-20261101/`；本轮最终构建阶段为 `download-stage-3e2ea88024134b1ebb29798fb93a187c`。内核 bundle **622e037a0ff991781fa918443c12172f** 由产品安装器实际安装；C++ 源码 SHA256 `41310cc624f56daca2588ac8093bcb9d984a3579dc6ea1d9686760ec5a991fcd`，客户端 DLL SHA256 `D7A7DA677B14635DEF53ECE3272E9D278FA163D82E0A66F484D665D165FD3E2D`。

| 本轮实际复查 | 证据与结论 |
| --- | --- |
| 原生下载/历史及下载期间关闭 | `probe-f73f2dbb7d99467cbb5ae4ff910fb761`：16 项实际原生检查通过。CUA 使用原有下载面板启动 8 MiB 慢下载，观察实际取消按钮后关闭所属浏览器；独立进程重开加密存储读到 8 条记录，最新 cancelled、720896/8388608 字节，无 running，读取不改变存储摘要。根进程正常退出0。见 active-exit-verification.json、state-after-active-exit.json、ui-active-before-exit.png |
| 关闭返回时机 | current-download-exit-ordering.json 所指目录：8 项受控检查通过，包括 EOF 前不可完成、EOF 后仍须等 UI 通知、同一次退出仅通知一次及 owner 隔离。这些模拟 Exited/EOF 的检查不冒充真实进程验收 |
| 最终内核官方扩展下载 | `official-download-2e51e728f6c6423391812c590c233087`：真实 gpt-6.1-sol/xhigh，12 次原版官方 Node REPL 调用，一次 prepare、零手动准备，分别确认本机站点与下载。模型先登记 waitForEvent(download)，再真实点击并调用 download.path；路径与原生完成记录相同，45 字节逐字节一致，文件 SHA256 `8AAF9F6D6233CDD42660DBFB88E634A05C0F0944D1275EBF3B40DB4834E555C8`。源码快照、固定构建清单及4个运行二进制核对通过。无 Responses 夹具、独立搜索、shell 或替代驱动；根91320→CEF144248→native141788，组件正常退出0 |
| 网页查找回归 | 同阶段 `probe-ac716ead6e9545919887faf774eaabbd`：19 项实际原生检查通过，包括真实 renderer 阻塞时明确报查找错误、同一 worker 恢复、导航/关闭取消旧查找。CUA 使用原有 BrowserFind 核对1/3→2/3并关闭。根138540正常退出0；不是正式GUI、真实键盘/IME或同URL刷新前端状态验收 |
| 回归与打包 | 119 项既有后台回归、59 个 JS/MJS 语法检查通过；21 个 payload 条目、程序集可信资源及79个构建源码与候选核对通过。唯一新候选目录 `package-14476ace97ba4e47a4a593dda7b4a544/QQClaw.exe`，6291456 bytes，SHA256 `5B8198D341DCDEC2BE576EECEAA602D045F8E5FBE725EF11D40D7E558DF7AA46`，未发布；运行库仍按需安装 |

必须保留的失败与更正：旧 active-exit 检查的 cancelled 断言失败没有删除。`probe-84c88c5a9255455184de067c4f2feda5` 独立读取显示 `Download interrupted (20)`；固定SDK中20是 NETWORK_FAILED。检查后端与下载服务器同进程，旧 finish 先关闭服务器，真实断网先于浏览器取消，所以该断言不能用于证明回调丢失。检查现改为保持服务器存活，先调用产品 dispose 并等待，再结束服务器；没有把 interrupted 改写为 cancelled 或放宽断言。另有独立受控检查 `exit-ordering-738ca51927fc4bfc84288922390d932e` 真实复现 Close 过早返回，新增 exitDelivered 后才通过。这两类问题必须分开归因。前一内核3091的12次官方调用成功只是中间证据，不能代替本轮622e复查。完整失败记录保留在 download-failure-notes.md。

仍未完成：原生 Chrome 控件外观、完整参考主页/面板 GUI、真实焦点按键/中文输入法/DPI、原生/应用查找栏协同、同URL刷新前端查找状态、blob/特殊下载、真实微信完整链路、Google结果、Mac官方扩展内核、仅CLI新电脑官方组件引导，以及整页WebView重载的安装进度接续。此前Google安全拦截仍按失败保留；本机文件下载成功不代替Google搜索。当前工具禁用原生桌面控制，因此不能用本轮组件页截图声称完整EXE GUI已验收。正式 release 仍只有一个 EXE 和一个 DMG，原账户及会话数据未改。

## 前一源码检查点：CEF 下载、历史及官方扩展下载流程（中间构建）

本节的“最终/当前”表示该阶段当时状态；当前构建与退出复查以上节为准。

本轮继续原始完整目标，没有改变正式 0.3.32 EXE/DMG，也没有把组件检查作为完整软件交付。上一轮已产生代码修复和真实模型证据，属于进展。本轮将新内核连接到原有下载面板、下载目录和加密历史记录，保留原版官方 ChatGPT 扩展及其站点/下载确认。

| 文件索引 | 当前实现 |
| --- | --- |
| native/cef/BrowserEngine.cpp | 新增 DownloadHandler、KeyboardHandler 和成功主页面/标题事件。下载保存目的地由父应用分配；私有 UI 管道的 downloadPath/downloadCancel 只处理该 worker 的实际下载编号，拒绝目录外目标和现有文件；下载回调快照后按实际状态更新，取消/关闭来源标签/退出均收尾并释放回调引用 |
| native/CefBrowserEngine.cs | 原生 shortcut/history/download-start/download-progress 事件核对 owner 后转到应用 UI 线程；独立 worker-exit 事件只在实际进程结束后结算；配置传入原有下载目录，不信任页面指定路径 |
| native/BrowserHost.cs | 新内核事件复用 BrowserDownloads/BrowserHistory；HTTP 成功主页面入历史，下载和 HTTP 错误不入；标题后续更新、网址去重和现有 DPAPI 加密保存沿用。下载按 owner/engine/native ID 定位，每文件独立目录并沿用文件名清理；取消等待原生终态，不把取消请求被接收当作已停止；取消时保留已观察到的字节数 |
| native/Program.cs | browser.downloads 改用异步 HandleAsync，旧 WebView2 记录/操作仍走原有分支；未新增模型浏览器工具 |
| backend/official-browser.mjs | 模型指引明确使用官方 waitForEvent("download") → 点击 → 等待 → download.path()；没有登记等待的响应会被官方扩展拦截，不得通过修改扩展或底层下载行为绕过 |
| scripts/build-browser-engine.mjs | GetFocus/IsChild 使用延迟 USER32 导入，保留原有即时导入检查、真实 sandbox_info、固定 API/版本和摘要要求 |

原生快捷键已接到现有应用命令：Ctrl+F/G、F3、Esc、标签切换/关闭/恢复、地址栏、侧栏/面板、搜索、设置和新会话等。C++ 限定可见活动页及本窗口焦点，C# 再限定当前 owner/活动标签及命令名单，前端保留既有弹窗/会话门禁。**27 项仅验证键位映射和修饰键边界，未验证桌面真实焦点/输入、工具栏焦点或中文输入法，不写成原生按键验收通过。**

### 真实检查和候选

证据根继续为 `C:/Users/admin/AppData/Local/Temp/qqclaw-cef-contract-20261101/`。最终构建阶段 `download-stage-09fc43294ea64a529b02a0415c9beed5`，bundle `3091f164c0638da525f48a960fe5eec0` 由实际产品安装器生成，未手工复制拼装运行库。

- `probe-4ff058c6ada64068820f7551ada79556`：16 项真实原生检查通过，包括成功页面与延迟中文标题、刷新去重、404 排除、重定向最终页、HTTP 附件实际字节/中文名、同名隔离、保留名/路径清理、下载不污染页面历史、已接收进度后取消、不同 worker/owner 下载隔离、关闭来源标签后的实际 cancelled、另一会话关闭后保留已完成记录。
- 同目录 CUA 使用项目原有 BrowserDownloads/BrowserHistory，实际连接上述 CEF：完成和取消记录显示正确；通过界面启动一次 8 MiB 文件并实际完成，再启动一次并点击取消，终态显示已取消与704 KB已接收量；历史4条，搜索first只剩1条，点击后真正导航并关闭面板。未测试打开文件/系统文件管理器；未通过 UI 删除或清空记录。截图及观察在 ui-checks.json、ui-downloads.png、ui-download-cancel.png、ui-history-search.png。
- `probe-d0d3215872ba4e098ed32210bb5b6e31`：新内核下前轮19项查找原生检查重新通过；CUA另核对1/3→2/3和关闭。范围仍为隐藏Form组件，不证明正式全GUI。
- `persistence-72ae129baaec4787b07d2ba7d8445a92`：全新的独立Windows进程重开两组隔离加密记录。原生/CUA组9条下载、4条历史、6个已完成文件可用；官方模型组1条下载、2条历史、1个文件可用。两组状态文件读取前后摘要一致。此项验证现有存储构造函数与跨进程读取，不冒充完整软件退出重启或原用户数据迁移。
- 119 项既有后台回归、59 个 JS/MJS 语法通过；27项原生快捷键映射检查仅属函数检查。最新候选 `package-307f01c2739848b5b3f4c7855acec1a5/QQClaw.exe` 为6239744 bytes，SHA256 `E3ABCECC79F562AC552BF4E642238CCBB1C19277BD5A982B4A3E6B30994F8DD9`。21个payload条目、程序集可信资源、4个已安装二进制及79个构建相关源码核对通过。前一个02788b...候选不含最后的下载指引，仅作历史证据，不发布。

### 官方扩展实际下载：失败后按文档修正，再实际成功

第一次 `official-download-38d4c8c8a0a9402e87031b76521d4105` 已真实连接且点击链接，但未登记下载等待，官方扩展返回ERR_BLOCKED_BY_CLIENT、下载记录为空，**该次失败**。不能从“工具completed/浏览器connected”推导下载成功。已只读核对原版扩展的YM下载管理逻辑：未匹配下载intent时failResponse；waitForEvent先登记intent，再经过源站/下载授权继续响应。[OpenAI官方扩展文档](https://learn.chatgpt.com/docs/chrome-extension)说明其管理下载及站点确认；精确等待API和拦截行为依据本机当前官方runtime文档与未修改的扩展实现，未冒充该公开页面提供了所有内部接口说明。证据为 official-download-policy-evidence.json、openai-extension-docs-observed.txt 和原始失败事件/截图。

增加应用模型指引后，最终 `official-download-cce0f6511b67488a9dc2e76c9b6c8770` **实际成功**：QQClaw原配置 gpt-6.1-sol/xhigh，11次去重的官方Node REPL调用，1次prepareOfficial，0手动准备。CUA分别只批准一次本机站点访问和一次下载；模型按 waitForEvent → 官方AX点击 → await → download.path() 执行。官方返回路径与产品BrowserDownloads记录一致，状态completed/available=true，实际45字节逐字节一致，SHA256 `8AAF9F6D6233CDD42660DBFB88E634A05C0F0944D1275EBF3B40DB4834E555C8`。正式helper核对152492→CEF17092→native152776；当前源码快照匹配，0夹具Responses、0独立搜索/shell、0替代驱动。新建标签按任务保留至组件结束；文件没有由模型打开。见 verification.json、downloads.json、model-events.json、native-helper.json、qa-final.png。

### 崩溃根因、现场和未完成项

首轮新下载实现确实崩溃：下载早期的空文件名/目的地字段返回null，新增returnedString仍调用CEF userfree释放函数。实际线程栈为downloadUpdated→downloadState→returnedString(value=0)→libcef释放→异常处理；输入法CrashRpt只是显示异常提示，**不是归咎输入法，也没有禁用它**。崩溃处理框令进程保持存活并对窗口探测响应，关闭检查同时失败，不能称正常。已先保存gdb-stacks.txt、gdb-main-full.txt及进程树，再只清理该检查的9个确切进程；没有停止正式QQClaw。修复判空后重新安装新bundle，最终16项原生、界面取消、独立进程存储和官方模型下载均通过，最终组件正常退出与PID复查另有记录。编译准备失败、检查误将活动标签当目标标签、首轮崩溃与首次官方流程失败完整保留，见项目外 download-failure-notes.md。

整体目标继续active，候选不发布。仍缺原生Chrome控件外观与完整主页/面板GUI验收、真实焦点键盘/输入法/DPI、Chrome原生查找栏和应用查找栏协同、同URL刷新时前端查找状态的核对、blob/特殊下载类型、真实微信整链路、Google结果、Mac及仅CLI新电脑官方组件引导、整页WebView重载的安装进度接续等。Google此前验证码/安全拦截仍按失败保留；本轮自己的本机附件成功不能代替Google搜索。未改官方扩展、站点/下载确认、沙箱、开发聊天身份、用户全局配置或原微信账号。

## 前一源码检查点：原生网页查找与首次标签就绪（未发布）

正式成品仍是已启动的 0.3.32；本节代码仅在项目外候选中，未替换正式 EXE/DMG。当前改动位于 `native/cef/BrowserEngine.cpp` 和 `native/CefBrowserEngine.cs`，没有更换官方 ChatGPT 扩展、后台模型或微信传输逻辑。

| 修复 | 实现与原因 |
| --- | --- |
| CEF 网页查找缺失 | 接入固定 CEF 154 的 FindHandler，将 `browser.find` 的 search/next/previous/clear 对应到真实页面查找；返回实际总数与从 1 开始的位置，没有匹配时为 0/null |
| 连续请求与迟到结果 | 每页一次仅发一个原生请求，其余按序处理；依据实际回调的 Chromium identifier 区分结果，不将管道编号冒充原生编号；新搜索、清空、主页面导航、关闭与退出结算旧请求为 stale |
| 无响应页面 | 原生单次查找 10 秒未返回最终结果时明确报错并清空本页查找队列；不杀浏览器、不重试原动作、不暂停或限制 Codex 长任务；仅影响手动网页查找 |
| 空查询与边界 | 限制 512 个 UTF-16 单位，去除 Chromium 自身也会去除的 CR；空查询立即清空，避免等待不会出现的原生回调；单页队列最多 64 项 |
| 首次标签未创建就报告就绪 | 实际检查发现 prepareOfficial 会返回空 tabId，随后请求可能落到旧手动浏览器；现在先完成首个真实标签创建并发布状态，再发 ready，不用延时或自动重试掩盖竞态 |
| 原生 UTF-8 输出 | C# 明确以 UTF-8 读取新 worker 的 stdout/stderr，避免中文网页标题、网址等被系统默认编码破坏 |

固定版本实现依据包括本机保存的 `browser_host_base.cc`、`browser_contents_delegate.cc` 与 Chromium 154.0.8037.98 的 `components/find_in_page/find_tab_helper.cc`。CEF 的 findNext 在此版本传递为 Chromium 的 find_match；新会话以 true 才会同时选择匹配。结果等待 finalUpdate，未用猜测的计数或截图静态文字代替。

### 实际检查、证据与候选

证据根为 `C:/Users/admin/AppData/Local/Temp/qqclaw-cef-contract-20261101/`。最终原生与前端检查目录为 `find-stage-6cf690b891ab46e78091bf1221afa9dd/probe-b540fef4614c44b0a7d4f58d4d961b04`。

- 19 项实际原生检查通过：使用产品安装器安装本次摘要对应 bundle `36ffd1afc048e197f1f545f79bbbf905`，未手动拼装运行目录；实际 BrowserHost/C# 管道/CEF 完成可见匹配计数、大小写、首个匹配、前后循环、中文、未找到、CR 清空、9 次并发 next、快速换词、512/513 边界、双标签隔离、其他会话拒绝、导航与关闭结算。受控页面阻塞 renderer 12.5 秒时查找明确超时，恢复后同一 worker 又可查找。
- CUA 操作项目原有 `ui/browser-find.mjs` 并连接上述真实原生路由：needle 为 1/3→2/3→1/3，中文为 1/2→Enter 2/2→Shift+Enter 1/2；未找到时禁用前后按钮，Esc 和叉号确实关闭，再打开为空。证据为 `ui-checks.json`、`ui-find-needle.png`、`ui-find-chinese.png`。这是隐藏 Form 的组件页面，不是正式 EXE 全界面或原生网页焦点下的可信按键检查。
- 119 项既有后台回归通过；59 个 JS/MJS 语法检查通过。新候选 `find-stage-6cf690b891ab46e78091bf1221afa9dd/package-a93d86072df746cca89d83cb1af863ea/QQClaw.exe` 为 6097920 bytes，SHA-256 `7A16EA1611D1B27D5786BA7799A8DA732C7E316EB30B00A70F21665950B64F13`。程序集可信资源、21 个 payload 条目、4 个已安装二进制及 79 个构建相关源码逐字节核对通过；没有塞入大型 CEF/Codex/vendor Node REPL。
- 组件根程序 141572 正常结束，收到全部标签关闭确认，backend/root exit0；随后按确切根/worker PID 及直接子进程复查没有遗留。正式程序 PID95560 未停止。失败现场、旧候选和测试均保存在项目外，发布目录仍只有原来的一个 EXE 与一个 DMG。

### 自动冷启动与 Google 的真实结果

最终代码另在 `cold-local-f52fd5db4f874920897b4b7748c48909` 重新完成真实模型检查：使用本次产品安装器产出的 `36ffd1afc048e197f1f545f79bbbf905`，gpt-6.1-sol/xhigh，11 次去重后的官方 Node REPL 调用、一次 prepareOfficial、一次 localhost 站点确认，0 Responses 夹具、0 独立搜索/shell。没有手动准备操作；原版扩展新建标签964951073，读取主标题及说明原文，关闭后再次列出为空并确认removed=true，原有标签不受影响。模型/backend源码快照与当前文件核对一致；当前候选使用同一原生构建。正式 helper 核对根147088→CEF145708→native host148336，结束时标签全关闭、backend/root exit0，随后确切PID及直接子进程无遗留。证据为该目录verification.json、model-events.json、sources.json、runtime-provenance.json、native-helper.json、qa-final.png及cleanup-verification.json。该结果证明最终组件的自动连接、新建/读取/关闭，没有把本机页检查当Google、完整GUI、真实微信或Mac通过。

前一轮真实模型证据为 `cold-google-fe536aeee375440fb540b6fde503d0f9/verification.json`，使用当时产品安装器产出的 bundle `9b583538e14c9ea979b46e630b09472e`。没有手动准备按钮，真实配置 gpt-6.1-sol/xhigh 经一次 prepareOfficial、9 次官方 Node REPL 工具调用，自动新建标签、打开 Google 并实际提交“2026年11月1日 AI 热点”；CUA 仅允许一次对应站点访问。没有 Responses 夹具、独立搜索、shell 或其他浏览器驱动。

**Google 返回 `/sorry/index` unusual traffic，没有取得搜索结果，Google 需求未通过。** 模型在拦截后停止，未解验证码、未换浏览器/代理或替换驱动。根144640/worker154936/native156992与直接子进程复查无遗留，退出0，QA标签已关闭，见 cleanup-verification.json。该证据在本次查找/ready/UTF-8修订之前取得，不冒充最终所有字节的 Google 实测。

### 失败记录和未完成项

首轮新检查夹具传错产品安装器的 payload 目录，尚未启动浏览器；修正后实际发现空 tabId 的 ready 竞态，随后才修产品。另一次中文检查失败来自检查桥未像正式后台那样指定 UTF-8，修正夹具后中文通过，同时补齐产品 CEF stdout/stderr 的显式 UTF-8。准备错误、源码修复和最终通过分别保留，详见项目外 `find-failure-notes.md`。一次 QA 端口误填产生临时错误标签38，工具在 data URL 上拒绝绑定/关闭；不声称已关闭该页，也未绕过限制控制原生桌面。

CEF 原生 Chrome 控件仍可见（chromeControlsVisible=true），没有使用会变成 popup 的 Views 创建方式伪装完成外观。原生网页焦点下 Ctrl+F/F3 等快捷键转发尚未完成，Chrome 自己的查找栏与应用查找栏的交互未验收。下载/取消/历史、完整 GUI/拖宽/DPI/输入法、真实微信、Google结果、Mac、新电脑仅 CLI 的官方组件引导、WebView整页重载安装接续、参考主页全部操作仍待完成。**整体目标保持 active，候选不发布。**

## 前一源码检查点：浏览器组件按需安装、取消与修复（未发布）

源码已提供真实 Windows 安装器与设置入口，正式两端仍为0.3.32、未替换。安装器只下载固定版本官方 CEF 档，校验大小与SHA-256后在独立目录解压，验证运行资源和四个二进制，再替换目标目录。安装失败/取消保留原目录；最终提交阶段不接受取消，应用退出会等待安装收尾。组件下载不设前端100秒RPC超时，不影响Codex长任务；网络读写本身有60秒无响应限制。

| 新增/修改索引 | 当前责任 |
| --- | --- |
| native/CefBrowserInstaller.cs | 官方固定HTTPS地址、137799728字节及摘要；下载缓存、取消、暂存/校验/提交、失败恢复；只为公开运行库添加AppContainer RX；不改浏览器注册表、官方扩展或用户私有profile/会话 |
| native/CefBrowserRuntime.cs / CefBrowserEngine.cs | 内嵌清单严格核对官方URL/档案/配套bootstrap；每组件独立文件lease。worker启动前取得共享lease并持有至真实退出，安装器要求独占，避免使用中覆盖；启动失败释放lease并拒绝排队请求 |
| native/Program.cs / scripts/build-windows.mjs | 接入system.browserComponentStatus/installBrowserComponent/cancelBrowserComponent；进度由原生发送；解压子进程加入应用job；关闭时取消或等待安装完成；构建包含安装器源码 |
| ui/browser-component.mjs / ui/app.mjs | 亮色设置卡显示未安装、需修复、已校验；支持安装/修复、重新检测、真实进度、取消。页面切换保留安装任务；安装完成仍显示官方扩展的实际独立连接状态 |

实际证据均在项目外 qqclaw-cef-contract-20261101：

- `installer-probe-b0c1403a9628436195146363b043eb16/result.json`：19项原生检查通过。该新bundle初始不存在；真实从官方CDN下载并校验/安装，使用已安装文件启动实际CEF worker；worker持lease时拒绝覆盖，实际退出后可再次检查。另覆盖错误档案、原目录保留、重复安装共享任务、取消、暂存清理、公开目录RX，以及缺失resources.pak的检测/修复。没有把本机原有手动安装目录当作这次新安装成功。
- `installer-ui-d1ab6935f85e42c7b864d86e467344c5/audit.json`及installed-settings.png：CUA操作真实产品前端/App/Store和真实C#安装/取消/状态接口。实际点击修复、解压中取消、再次修复、安装期间切换到模型设置再回来；最终显示组件已安装且扩展仍未连接。2次安装、1次取消、3次状态检测；0chat.send、0pending、0waitingSaves、0前端/服务器未处理错误，1项预期models.list夹具错误。其他环境/浏览器/模型接口明确为夹具，**不是正式EXE GUI、真实微信或新电脑官方扩展安装验收**。
- 两个组件及UI检查服务正常退出0，按确切路径/父子关系复查无遗留；修复后的resources.pak存在，测试qa-backup已被验证后的目录替换清理。没有停止正式PID95560。CEF日志无FATAL或旧Sandbox cannot access executable匹配，但未验证可选on-device-model完整功能。
- 当前140项JS回归/许可/预算/引擎边界检查通过，59脚本语法检查通过；C#缺失组件并发失败检查再次编译运行，确认启动/排队请求失败且lease释放，无子进程创建。原生19项不是这140项中的模拟测试。

最终独立候选 `installer-package-ffd835d2dc4642b982ba2c8cd1a202b1/QQClaw.exe`：6028800 bytes，SHA-256 `51AF0F153533FE2A8CD495473EB1E82936F0E24EE8835EE4F91EB2662C4C7D6C`。程序集资源、payload21个条目/六个组件文件、安装目录四个二进制校验通过；大型运行库没有进入EXE。成品目录仍只有一个正式EXE和一个DMG。

证据保留问题如实记录：本轮首次编译复用了前轮host-package目录，覆盖了旧候选5476B370…；其当时的验证不再表示该路径仍保留原二进制。说明已保存host-package/artifact-superseded-note.md。之后改用带唯一ID的独立候选目录，当前源码、构建及验证记录均保留。正式成品未受影响。

**仍缺的关键环节：** 已实际读取[官方浏览器扩展说明](https://learn.chatgpt.com/docs/chrome-extension)，文档仍从桌面设置安装所需插件及商店扩展，未建立QQClaw仅CLI的新电脑自动安装契约。已核实当前CLI有plugin add命令；完全空的独立CODEX_HOME、无复制认证的plugin list返回installed=0/available=0，不能据此宣称市场已接通或CLI安装一定不可能。自己的CEF运行库安装成功不等于官方Node REPL/原生宿主/扩展已经准备好。

下一步先检查当前组件的**自动冷启动**：上轮真实模型检查前曾在QA页手动准备CEF，尚不能覆盖新会话不预先点击准备、直接由模型/微信任务启动的完整流程。需核对扩展原生宿主的启动时序；若出现等待，只能等待本应用所属的元数据就绪，不能借其他进程/管道或重发模型操作。随后使用本轮安装所得组件重跑官方扩展真实模型/Google。CEF普通Chrome控件、查找/下载/历史/快捷键、完整GUI及DPI/输入法、真实微信、Mac和完整参考主页仍缺。WebView整页重载/恢复期间的安装进度接续尚未检查，不能将页面切换检查扩大为重载恢复通过。整体目标仍active，当前候选未发布。

## 前一源码检查点：BrowserHost 接线与真实模型验证（未发布）

正式程序 PID 95560 与两端 .32 成品未停止、未替换。项目外的开发候选约 5.73 MiB，未安装到 release。项目内没有增加运行库、测试、依赖、旧版 EXE 或第二个成品。

| 当前代码索引 | 已实现行为 |
| --- | --- |
| native/BrowserHost.cs | prepareOfficial 选择 CEF；保留已有 WebView2 标签并合并会话状态；CEF 内部 ID 使用 cef:N，不冒充扩展 tabId；手动切换、关闭、后台恢复、空组重开；每会话短 profile；删除会话时复用同一关闭任务并拒绝迟到操作 |
| native/cef/BrowserEngine.cpp | 真实创建者 PID/父 HWND 归属检查；UI 新建同步得到真实标签 ID；恢复返回新 ID 并保留原选择；标签实际关闭后才确认，不自动补页 |
| native/CefBrowserEngine.cs | 独立限长写入队列；文件校验移出 UI 线程；启动任务去重、view 签名去重防状态/布局循环；嵌套响应合并；启动失败会拒绝等待中的操作；退出核对关闭确认及实际进程结束 |
| native/CefBrowserRuntime.cs | 从程序集 QQClaw.browser-engine 资源读取可信清单；按摘要计算独立安装目录；固定版本、文件名及摘要；VerifyOwnedWorker 不接受任意 CEF 路径或旁边替换的清单 |
| native/OfficialBrowser.cs | 同一 EXE helper→本应用 Node 后台→本应用 browser→官方 native host 的所属链；WebView2 保留微软签名要求，CEF 核对内嵌资源指定路径与四个二进制；官方 Node REPL/native host 继续校验 OpenAI 签名 |
| native/Program.cs | 调用异步浏览器焦点；将自己的 CEF worker 加入应用 job；退出先等待 BrowserHost 关闭，再关闭 job |
| backend/official-browser.mjs / backend/codex.mjs | 核对原生准备与 helper 的 engine 一致，CEF/chrome 与 WebView2/edge 对应；tabCreation 使用实际能力；只有本任务官方 node_repl/js 的成功工具元数据才标已连接，失败、别的回合/工具不算 |
| scripts/build-browser-engine.mjs / browser-engine-artifact.mjs / build-windows.mjs | 构建导出配套 bootstrap、chrome_elf、客户端、许可证与清单；导入时拒绝旧源码和损坏文件；可选 --browser-engine 嵌入可信程序集资源和小客户端；--output 允许项目外候选。大型 CEF、Codex、官方 Node REPL 未打进 EXE |

### 实际验证与限制

最终组件证据：`C:/Users/admin/AppData/Local/Temp/qqclaw-cef-contract-20261101/host-integration-2552e209e5ff4dab96ea84b084d7514e/verification.json`。原始动作、模型事件、正式 helper 输出、源码快照、两个令牌检查、官方返回截图及 QA 截图均在同目录。根程序 157032；A/B worker 为147932/142604，官方 helper 仅确认 A 的 native host38356。这是实际产品 BrowserHost/CefBrowserEngine/OfficialBrowserMetadata，**未改 helper 校验条件来迁就实验**。

- 精确采用 QQClaw 当前配置 gpt-6.1-sol/xhigh；9次官方 Node REPL 工具调用，0 Responses 夹具、0独立搜索或 shell 调用。实际新建扩展标签1662818320，读取正确主标题及说明，关闭后再列为空、createdTabRemoved=true。CUA 在检查页允许本次 localhost 站点访问；没有调用真实微信账户，没有复制开发聊天身份、管道或授权。
- CUA 操作了混合标签、只关闭当前原生标签、以新 ID 在后台恢复、关闭最后页后重开、两会话隔离、200次尺寸请求、显示/隐藏保留标签。B 的两次并发 dispose 都等待同一关闭过程，后续新建被拒绝。此次200次请求经过实际 BrowserHost，但没有把原生 surface 几何反馈导出到 QA，所以**不套用前轮“原生2次、499×599”数字**，也不证明拖条手感或真实显示比例。
- A/B 当时各4个 renderer 的 OS 令牌均受限、低于中完整性、在 job 中，无 --no-sandbox。network utility 没有相同令牌限制，不能写成全部 Chromium 服务均已沙箱化。正常结束时收到所有标签关闭确认，backend/root exit0；确切根/worker及其直接子进程复查无遗留。QA 最后显示的是关闭前缓存状态，不是关闭后的进程仍在。
- 真实模型完成后额外收紧了连接状态的回合/工具归属，以这轮真实响应回放覆盖成功及错误族；并添加 StartGuarded。C# 缺失运行库测试证明启动与同时排队的 state 请求都会失败且不创建进程。**这两处后续细化没有再跑真实模型，不把前一运行冒充最终所有字节的实机执行。**
- 119项既有回归、18项许可/消息预算/隔离检查和3项新增引擎/构建边界检查通过，58个 JS/MJS 语法检查通过。另有上述 C# 失败并发检查。候选已重新编译，反射核对 QQClaw.browser-engine 资源、payload 六个组件文件、四个安装二进制摘要通过；没有打包大型运行库。这些不等于安装入口验收。

候选记录：项目外 `host-package/build.json`、`verification.json`、`syntax.json`。最终 EXE 6010880 bytes，SHA-256 `5476B370F866D911E533DE2816D2DDC7489FD758F3BB3BE8062FD01187D18D91`。正式 release 的 EXE/DMG 摘要仍为 AEBFAC2B…EE875 / F693941A…BB75。

### 已定位的真实失败

第一次组件后台的 --import 传 Windows 路径而非 file URL，Node 启动失败；证据在 host-integration-ce64bac443cb4671ace10fc76a8f437b，未启动浏览器。修正后首轮真实启动在 host-integration-738567b72c8f41a1a59b44a7d3a914d5 因 chrome_elf.dll 证书要求失败，进程返回 -2147483645。不是“进程没退出就正常”。

已读取固定 CEF 源码 bootstrap_win.cc 和官方 Code Signing/Installer 文档：bootstrap 要求它与旁边的 chrome_elf、客户端 DLL 签名身份一致，也允许它们同时未签名。signed runtime 不包含匹配 bootstrap；此前误把 minimal 未签名 bootstrap 与 Spotify 签名 chrome_elf 混用。当前改为从同一固定官方 minimal 档取原版配套 bootstrap/chrome_elf，两者及自编客户端仍未签名；libcef 使用 signed 档原文件，Spotify 签名有效并固定 SHA-256。**没有剥除签名、跳过检查、加信任根、修改官方扩展或关闭沙箱；也不宣称整套应用已完成代码签名。**

运行库只在该候选摘要对应的 `%LOCALAPPDATA%/QQClaw/components/browser/<bundle>/Release` 中做实验安装，给公开运行库目录两个 AppContainer 组 RX，profile/日志/配置不在此树。新组件触发可选 on-device-model 的日志为 Unable to get gpu adapter，未出现旧可执行文件访问错误；仍未完成功能检查。Chrome 无效外部扩展注册项的 Missing value path 日志仍存在，未改用户注册表。扩展初装打开公开 ChatGPT 登录页，未输入凭据；此次不能写成仅 localhost 导航。

### 尚未完成与下一步

优先完成可分发的运行库安装/修复入口和仅安装 CLI 的全新电脑官方组件准备；目前实验由项目外脚本解压固定摘要官方档，**源码没有产品安装器**，普通 build 不含该资源时会明确报组件未包含。接着补新 CEF 的网页查找、下载/取消/历史、快捷键、焦点/DPI/输入法及控件外观。当前 chromeControlsVisible=true，不能将正式版本的 WebView2 功能或样式套到新内核。再做真实产品 GUI、微信收发与额度/附件、Google 结果、Mac 原版扩展内核和参考主页完整操作验收。整体目标仍 active，未发布开发候选。

## 历史源码检查点：原生 CEF worker 与 C# 桥接已入库，产品路由未接

本轮开始把前一原型整理为项目内的开发模块，仍未安装或发布。没有改 `native/BrowserHost.cs` 的路由、`native/OfficialBrowser.cs` 的签名/归属要求、`backend/official-browser.mjs` 的 tabCreation=false，也未改正式 Windows/Mac 成品。以下验证属于新 worker 的真实原生组件；前轮真实模型成功属于旧原型，**没有把两者拼成这份新 worker 已完成模型或微信验收**。

| 新增索引 | 责任与边界 |
| --- | --- |
| native/cef/BrowserEngine.cpp | Windows CEF 客户端 DLL，官方 bootstrap 转交真实 sandbox_info；API/sandbox hash 严格匹配；私有匿名管道只接应用 UI 控制，按 owner/标签定位；管理创建、选择、导航、停止、尺寸、隐藏、关闭及退出。新窗口只能在其 PID 与本进程一致时归入自身 surface；没有模型 MCP/HTTP/CDP 驱动 |
| native/CefBrowserEngine.cs | 每会话独立进程/profile；由调用方提供可信 EXE/DLL/libcef 摘要，不能信任下载目录自带 manifest；独立请求编号与 owner；合并拖宽请求；状态按 revision 拒绝迟到覆盖。退出等待原生剩余标签=0 的确认和真实 process exit；先排空 stdout 再处理 Exited，避免最终响应尚未送达便误报失败。15 秒是原生操作的软等待提示，不会因此杀进程、重试操作或给 Codex 长任务添加暂停/超时 |
| scripts/build-browser-engine.mjs / package.json | 新增 build:browser，使用固定官方 minimal SDK 与 bootstrap、固定摘要的 JSON 头文件；延迟导入 USER32/SHELL32并检查 PE；构建输出必须位于项目外。生成 DLL/EXE/组件 manifest 与 CEF、JSON 许可证；没有把大型 CEF/Codex 运行库塞入发布包。构建脚本尚未接到正式打包流程 |

CUA 在项目外检查页调用上述实际 C++/C# 模块，父窗口是隐藏的组件 Form，**不是产品主界面**。最终两个 worker PID 148380/143000，owner/profile 各自独立；检查根程序 PID142320。原生 GetClientRect 得到 480×400、780×600；选第一个标签后只关闭该标签，剩余标签保留；关闭最后一页时 activeTab=""、tabs=[]、nativeWindowCount=0，没有自动补页；重新打开只创建一页。A 的操作期间 B 的状态逐字相同，随后关闭 B 不改变 A。显示/隐藏请求保留原标签。200 次连续 SetView 合并为 **2 次原生 view**，最终499×599，队列清空。这里核对的是原生尺寸、请求状态和生命周期，不证明真实拖条手感、DPI/中文输入法、可信按键或渲染图与参考图一致。

最终通过范围见项目外 `C:/Users/admin/AppData/Local/Temp/qqclaw-cef-contract-20261101/surface-component-f3ed1f62791d433c8827e14c9def2228/verification.json`；含原始 actions/events、sources 快照、session-isolation.png、resize-coalesced.png 和退出记录。OS 令牌检查分别覆盖当时 A 的4个、B的5个 renderer，均受限、低于中完整性、在 job 内。C# Close 收到原生关闭确认且根程序退出0，按根/worker及已记录的 cmd/native-host 父子关系检查未发现遗留。最初一轮组件为 surface-component-48a770c6f9174dcaa03d981c2408ae50，C++/C# 有后续修订，不能拿其初轮结果覆盖最终源码。

当前真实模块仍保留普通 Chrome 控件（state 明示 chromeControlsVisible=true），**没有验收外观完成**。新建/关闭的 native ID 是内部标签定位，不声称与官方扩展 tabId 相同。尚未完成 BrowserHost 选择/混合标签路由、完整下载/查找/恢复和正式打包/安装；当前代码不能替代现有成品直接使用。

实际问题全部保留：第一轮 C# 编译因旧 csc 对正斜杠源路径解析异常失败；改 Windows 路径后通过。首个 C++ 编译有 ifstream 最烦人解析及嵌套 base 释放错误，均在运行前修复；另一次 PowerShell 参数逗号解析失败未进入编译。第一轮官方扩展自行打开公开的 ChatGPT 安装/登录页，未输入账号/凭据，故该轮不能描述为 localhost-only；最终 QA 通过 allowedOrigins=[] 阻止该页面导航，状态中的初始拒绝是预期结果，不写成零错误。Chrome 对本机两条无效外部扩展注册项仍记 Missing value path，未改注册表或隐去日志。

第一轮还记录 on-device-model 服务的 Sandbox cannot access executable：已读取固定 Chromium154.0.8037.98 sandbox_win.cc，确认该分支是 AppContainer 对程序文件的 READ/EXECUTE 检查。只对项目外 surface-build 的公开二进制/资源增加两个 AppContainer 组的读/执行权限，**没有给 profile、配置、日志、项目或整个用户目录增加权限，也未关闭沙箱**；before/after SDDL 保存为 surface-sandbox-acl.json。最终未再出现该错误，但没有再次实际触发并验证那个可选模型服务，所以只算已定位和准备运行库权限，不算该服务功能验收。正式依赖安装器还需纳入这一步。

最终构建 surface-notices-build 使用同一 C++ source SHA-256 `019FFD97C98456021094B296B2AFC5D01683E90191991E618F7CC3F4201D2177`，DLL SHA-256 `7744012DB8438046E4D9A4DDF6186EA2142C27EA82393E74A5D6C13440D036F1`，bootstrap仍0B6C80…4FEC，包含两份许可证；CUA实际执行的是前一 surface-build 中同源码的 DLL `BB8A300FDE975E71CB1B1609E507E06EC3EA01CBDD4991462B699807B2552A0F`。两者构建时间/输出位置不同，不声称二进制逐字一致。C# 源码 SHA-256 `E63FF91B6B465B287E94E30F801E3BB2E8EFBF1BE74E43B7723156B5768181A3`，随最终组件实际编译。旧119/10项应用回归没有在本轮重跑，因为这三个新模块尚未接入应用执行路径。

下一步优先完成现有 BrowserHost 的真实接线、共享原生窗口/标签映射、Chrome控件外观和可信运行库安装，再以这个新 worker 重跑官方扩展真实模型/微信链路。还缺 Google 成功结果、真实微信、Mac、完整主页复刻与正式 GUI 证据。整体目标保持 active；正式两端仍0.3.32，未停止或替换生产 PID95560。

## 前一组件进展：CEF 普通窗口与 Windows 沙箱（未发布、未替换产品内核）

原 WebView2 的自动新建标签负例仍然成立。为解决原版扩展只寻找普通窗口的问题，本轮在项目外实现 CEF C API 原型：提供 `GetDefaultClient()`，管理扩展创建的普通窗口，按稳定 browser ID 维护生命周期。只将本实验进程自身创建的 HWND 归入自己的父窗口；并非接管系统 Chrome 或开发聊天浏览器。

随后依照 [CEF 官方沙箱说明](https://chromiumembedded.github.io/cef/sandbox_setup.html)，使用匹配版本的官方 bootstrap EXE 加载自编客户端 DLL，向 `cef_execute_process` / `cef_initialize` 传入真实 sandbox_info。必须匹配 CEF API hash 和 sandbox compatibility hash；没有指针时直接退出，没有无沙箱回退。USER32/SHELL32 使用延迟导入，未跳过 API 校验。CEF 固定为 `154.0.34+g14c5a08+chromium-154.0.8037.98`，源码提交 `14c5a089e8452874cb1a556dc3fde26ed2d87723`，API `15400`。

| 检查 | 实际结果与限制 |
| --- | --- |
| 原版扩展、无沙箱原型 | `browser.tabs.new()` 得到标签 ID `1215031647`，打开受控 localhost，读回实际正文和官方截图。仅用于受控组件；不能分发或访问外站。旧夹具误写 WebView2，原文件保留并在 verification.json 明确纠正 |
| 原版扩展、官方 bootstrap 沙箱 | 协议 Responses 夹具创建 ID `522342409`、读取匹配正文；CUA 真实点击本次站点确认。OS 元数据检查 6 个 renderer 均 restricted、integrity RID=0、inJob=true，未带 --no-sandbox。不是只看配置字段 |
| **真实配置模型、官方扩展、CEF 沙箱** | `gpt-6.1-sol/xhigh` 实际调用 10 次官方 Node REPL 工具，创建 ID `1279560557`、打开 localhost、读回标题及说明，关闭该标签，再查询得到空列表并返回 `removed: true`。无 Responses 夹具请求、无独立搜索、无 shell 调用；1 次站点确认。这里仅确认本次新建的标签被移除，不能据此声称产品关闭最后一个标签的全部逻辑已覆盖 |
| 关闭清理 | 三轮官方组件均从 CUA 点击“结束检查”正常退出：backend exit=0、worker exited=true、cleanShutdown=true、remainingBrowsers=0。按确切 PID 及父子关系复核没有这些实验进程遗留；没有重启正式程序 |
| 上下文真实数据复核 | 从前轮真实模型事件重读 10 个 tokenUsage 样本，直接使用产品 `shared/context-usage.mjs`：12604/258400=4.9%，最终 25410/258400=9.8%；最终累计 total=199577。计算使用 last，未把累计费用用量当上下文。这是旧真实事件的复核，不冒充本轮新模型 UI 验收 |

证据根为项目外 `C:/Users/admin/AppData/Local/Temp/qqclaw-cef-contract-20261101/`。无沙箱原型：`official-probe-4fd70d1303604dafb5a462bb035d7f3d`；沙箱协议：`sandbox-official-probe-34e1f1669d654af29ccc88b421b74439`；真实模型：`real-model-sandbox-official-probe-1113015a71f4411c85c0e75c05d22875`。各目录保留 `verification.json`、原始 `result.json`、请求/事件、官方 `official-page.jpg`、CUA `qa-result.png`（无沙箱轮为 qa-ended.png）和退出结果；两次沙箱检查另有 `sandbox-token-audit.json`。版本、脚本及二进制摘要见 `provenance.json`，真实上下文见 `real-context-evidence.json`，失败及更正见 `failure-notes.md`。

原版扩展仍从安装位置读取，manifest/background SHA-256 与前轮相同；未修改或重新分发。实验 helper 只对自己的 CEF 子进程改用固定 EXE、客户端 DLL、libcef.dll 摘要检查，继续验证官方 Node REPL/native host 的 OpenAI 签名及父子链；**主项目 OfficialBrowser.cs 没改成放行任意 CEF 进程**。组件注入配置把 tabCreation 设为 true，以测试新内核；产品仍为 WebView2、tabCreation=false。没有把该组件配置改写成产品已支持新标签。

当前 NuGet libcef.dll 与 minimal 包 bootstrap.exe 的 Authenticode 为 NotSigned。官方 HTTPS 来源及发布索引摘要已核对，但这不等于签名有效，生产签名/安装和完整性流程还需实现。渲染进程的沙箱证据也不等于所有 Chromium 服务受同样限制：本次 network utility 默认 service-sandbox-type=none、令牌未受限。导航白名单只限制页面导航，不是完整网络隔离或全面安全审计。本轮没有在 CEF 上访问 Google。

此前原型失败并未隐藏：App struct 引用所有权错误导致初始化崩溃，保存 debugger.log 后修复；按 C API wrapper 指针移除造成退出挂起，保存 shutdown-debugger.log 后改稳定 ID；首次沙箱编译后 objdump 超默认缓冲失败，扩容后通过；另有 C# 旧编译器与两次 Python UTF-8 检查准备错误。所有细节和原失败路径留在上述项目外记录。

本轮**只更新项目报告和交接文档**，没有把 CEF 实验源码、测试或依赖放进项目，也没有更新 EXE/DMG。正式 EXE 摘要仍 `AEBFAC2BCBEF57EF5225B6E36D16BE88C3CCE9A723AFB3209B84459D1ACEE875`，DMG 仍 `F693941A3CC0A57AD271075F0565D010EB28BF6534C7D89331FBA7B6EC4CBB75`，PID 95560 仍在。此前 119/10 项回归是旧开发基线，本轮不冒称重新运行。

**下一步与剩余缺口：** 将有沙箱的 CEF worker 接入实际面板和标签状态，覆盖可调宽度、焦点、关闭/取消、下载/查找和每会话独立进程/profile；实现可信依赖安装与签名；复核真实模型/隔离微信到新内核的整条链路，再检查真实微信、Google 成功结果和 Mac。此处正常退出的是检查组件，不能代替正式软件 GUI、跨会话、长期任务和用户 Mac 的验收。整体 goal 保持 active。

## 未发布开发：官方扩展实际调用与当前阻碍

真实链路：产品 App / WeChatBridge → 独立 CodexClient 任务 → 未修改的官方 Node REPL、browser-service/client → QQClaw 自身活动任务许可 → 数字签名及父子进程归属检查 → 应用内 WebView2 的原版 ChatGPT 扩展。扩展 ID `hehggadaopoacecdllhhajmbjkdcmajg`。没有将官方运行组件复制进发行包，没有借用开发聊天、Desktop/IAB 的身份、管道或站点许可。完整索引见 [官方扩展接入记录](docs/OFFICIAL-BROWSER-INTEGRATION.md)。

| 检查 | 实际结果与范围 |
| --- | --- |
| 真实模型读取隔离网页 | 本机配置的 `gpt-6.1-sol` / `xhigh` 读取正确标题和正文，官方工具元数据及截图可复核；不是模型 Responses 夹具 |
| 隔离微信接口完整消息流程 | 真正 App / Bridge 接收指令，发送网站确认，经 `/allow` 指令继续，由真实模型使用官方扩展读取本机页并返回结果；4 条接口消息，typing 开始/结束正常，待发送和待确认均清空。微信网络 API 与保存接口是夹具，**不是线上微信或数据持久化验收**；该原生检查宿主没有文件快照接口，快照如实显示不可用 |
| 自动新建标签 | **失败**。原版扩展只查询 `normal` 窗口，WebView2 返回 `popup`；接管页面后重试仍报 `Created browser window has no id`。宿主收到新窗口事件但未形成扩展要求的普通窗口 ID。已在运行指引和连接状态明确披露；操作已有专用标签不等于修复新建标签 |
| Google 搜索 | 真实模型在已有空白页打开 Google，输入并提交“2026年11月1日 AI 热点”，随后进入 `google.com/sorry/` 人机验证；未操作验证码，**未取得搜索结果**。此轮还出现 1 次由用户全局 AGENTS.md 要求引起的无关首相搜索，因此不能判为全程仅用官方扩展通过 |
| 独立搜索限制修复 | 官方运行配置新增 `web_search="disabled"`。实际安装版 Codex 的 `config/read` 已确认生效；修复后的隔离微信真实模型检查中独立搜索和命令抓取均为 0。没有修改用户全局 AGENTS.md |
| 确认界面 | CUA 实测字段填写、密码掩码、刷新/切会话保留草稿、空值和超范围拒绝、拒绝清理、简单站点同意后恢复发送。1280×720 时卡片高约 374px，内容在卡片内滚动；0 未处理前端错误。确认传输是夹具 |
| 回归与编译 | 当前 119 项既有回归、10 项许可/任务/微信预算/启动失败清理检查通过。Windows 开发 EXE 已在项目外编译；仍是 .32 manifest，**未安装、未发布，不算正式 EXE GUI 验收** |

本次还修复了浏览器许可服务启动失败时本地 Provider 转接服务未清理的问题，覆盖“启动失败关闭监听端口→再次连接成功”的检查。

证据根目录：`C:/Users/admin/AppData/Local/Temp/qqclaw-host-contract-20261101/`。各子目录的 `verification.json`、`result.json` 与请求/事件记录注明了检查层级：

- `product-component-5779c1b6b4be4257a186aaa6c9b6d459`：真实模型首次读取本机页。
- `window-component-41dad7ef6fea45b28922a81eaa28d5ec`：接管后新建标签失败、原有页面访问成功。
- `window-component-5c0c399e25304f059642852f3c7380db`：Google 验证码及无关独立搜索失败记录。
- `window-component-c1621324a04e43d69567af820c30575f`：限制修复后的真实模型、隔离微信 `/allow` 与官方扩展消息流程，含 `official-page.jpg`。
- `approval-ui`：确认表单的 CUA 审计、尺寸和截图；`search-config/verification.json`：实际 CLI 配置确认。
- `development-build/build.json`：未发布 Windows 编译，718336 字节，SHA-256 `DA643F144038DE5D6E8863B464DE09F6016C8AB5C07F7E5EBAB8993B1FFBB03A`。

证据限制：旧回归脚本把上一份结果覆盖到 `regression-first-expanded.tap`，故该文件已不能代表最早那次 5 项历史夹具失败的原始输出。已修正脚本，情况记于项目外 `regression-evidence-note.md`。新增微信检查的第一次夹具有字符串引号语法错误，未进入任务，修复并通过预检后才运行成功；配置检查第一次因空 CODEX_HOME 目录未创建而失败，建好独立目录后通过。均不计作通过项。

**仍未完成：** 自动新建标签的内核兼容；真实线上微信与正式 EXE 完整验收；Google 成功返回结果；仅安装 CLI 的全新电脑获取官方运行组件；过长自定义数据目录兼容；macOS 原版扩展内核接入。当前 macOS 使用 WKWebView，不能将已有 DMG 构建成功或手动预览称为官方自动浏览已实现。没有把 CEF/CefSharp 文档中“支持部分扩展”的描述当成替代内核已验证，也未据此更换产品内核。

## 用户目标与不可替换的要求

最新用户要求为“要以白色为主，黑色为辅，整体亮色”。0.3.20 按此恢复亮色默认；下文 0.3.13～0.3.19 的黑色为主描述仅是历史记录，不再作为当前要求。主页布局与操作仍参考既有 Codex Desktop 图片。

1. 主页操作尽可能复刻参考 Codex Desktop 的可见行为；不能仅实现用户逐次点名的细节。
2. 右侧浏览器与工具面板可拖动调宽、收起、关闭，不能挤占近半窗口而压缩主要聊天区。
3. 关闭标签页必须真正移除；关闭最后一个标签不能自动重新创建标签。面板关闭与标签关闭分别定义清楚。
4. 浏览器自动化必须通过 **OpenAI 官方 ChatGPT 浏览器扩展**。自建 MCP、普通远控、替代扩展、借用开发聊天权限均不算完成；遇到困难记录实际原因，不得私自替换方案或宣布通过。
5. 上下文用量显示必须来自真实 Codex 事件，区分当前上下文与历史累计；缺失数据应明确显示未知，不能固定 100%。
6. 记录全部需求、代码索引、验证证据、问题及未完成项；不能以进程存在、单一导航或模拟测试推导全部通过。
7. 保留微信账户和工作目录绑定、第三方 API、动态模型及思考等级、typing、长任务执行与停止、消息/文件预算、桌面发起不回微信、Codex 原生对话保存、Windows/macOS 支持。

## 开始时发现的问题

| 项目 | 根因/证据 | 开始时状态 |
| --- | --- | --- |
| 面板宽度 | `ui/desktop.css` 使用 `clamp(360px,42vw,620px)`，没有右侧拖条 | 不符合 |
| 最后一个标签关闭 | Windows 与 macOS 的 BrowserHost 关闭后立即 NewTab | 不符合 |
| 官方扩展 | `backend/browser.mjs` 为项目自建 HTTP MCP，操作原生 WebView；并隔离官方 Desktop 插件 | 不符合本轮硬性要求 |
| 默认主题 | UI 与 Store 均默认为 dark，旧数据 appearanceVersion=1 迁移也设 dark | 不符合最新目标 |
| 上下文读数 | UI 当前函数需结合原始 tokenUsage 的 total、last、窗口数据查证 | 尚未验证 |
| 表面交互 | 需对照截图逐项核对；过去仅关闭第二个标签的测试遗漏最后标签问题 | 未完成全面验收 |

## 主要代码索引

| 文件 | 责任 |
| --- | --- |
| `ui/app.mjs` | 主页、侧栏/项目/会话、消息、输入框、面板、浏览器标签、上下文、UI 事件 |
| `ui/desktop.css` / `ui/app.css` | 桌面布局、主题、边界与响应式样式 |
| `ui/controls.mjs` / `ui/model-catalog.mjs` | 选择器、动态模型目录 |
| `ui/application-menu.mjs` / `ui/render-frame.mjs` | Windows 应用菜单、剪贴板目标核对；同一草稿刷新时保留编辑器及祖先的 DOM 连接，避免原生撤销被清空；0.3.16 新增 |
| `ui/attachments.mjs` / `ui/navigation.mjs` | 图片预览缓存/加载、应用导航历史；0.3.12 新增 |
| `ui/panel-tab-actions.mjs` | 标签菜单/中键/拖动与焦点，菜单归属核对；0.3.22新增 |
| `ui/message-search.mjs` | 跨会话只读全文搜索、消息定位、当前会话查找、分页及有界高亮；0.3.21 新增 |
| `ui/conversation-view.mjs` | 长用户消息的测量/折叠、会话目录筛选/键盘/定位、会话内阅读锚点；0.3.19 新增，仅控制展示 |
| `backend/desktop-attachments.mjs` | 桌面附件复制、标识解析、栅格图片识别、预览与大小限制；0.3.12 新增 |
| `backend/store.mjs` | 设置、会话、账户持久化与迁移，密钥加密与归档 |
| `shared/review-view.mjs` | 当前任务审阅选择及面板开关的身份核对；0.3.15 新增 |
| `backend/checkpoints.mjs` / `shared/change-stats.mjs` | 任务文件快照、加密内容、冲突预查/撤销/重做/恢复、真实逐文件行数；0.3.14 接入 |
| `backend/codex.mjs` | Codex app-server 生命周期、工具/权限/流式事件 |
| `backend/browser.mjs` | 手动 BrowserViewer、独立子进程浏览器隔离、官方扩展文件检测；不再提供自建 MCP |
| `backend/app.mjs` | 桌面 RPC、会话与微信协调 |
| `native/BrowserHost.cs` / `native/macos/BrowserHost.swift` | Windows/macOS 原生网页、标签与视图同步 |
| `native/Program.cs` / `native/macos/QQClaw.swift` | 宿主、桥接、窗口与系统功能 |
| `backend/conversations.mjs` | 用户数据目录之外的 Codex 原生对话归档 |
| `scripts/build.mjs` / `scripts/build-macos.mjs` | Windows / macOS 编译与打包 |
| `.github/workflows/macos.yml` | macOS 云构建 |

## 主页操作核对表

以下逐项记录实现及验证；未标有证据的项目均不能视为验收完成。

| 操作 | 实现/验证状态 |
| --- | --- |
| 侧栏展开收起、项目展开、新建、项目/会话菜单、搜索、历史 | 已有并核对菜单、重命名、搜索、历史、收起/重启保留；项目超过 20 条的“展开显示”入口已实现，未专门构造超 20 条实测 |
| 消息过程展开、耗时、复制、附件打开、滚动到底部 | 保留；新增消息时间/更多菜单、更改卡片与逐文件补丁展开。真实 Codex 文件变更已显示，状态刷新保留展开状态。复制及打开附件沿用现有功能，本轮未逐一覆盖系统剪贴板/资源管理器 |
| 输入、换行、发送、停止、任务排队、文件与工作目录入口 | 保留原实现；0.3.12 补充图片粘贴/文件拖入/多选/缩略图/放大预览，真实 Codex 图片识别已运行。系统多选对话框与 Mac 剪贴板仍未完整人工验收 |
| Provider/模型/思考等级/权限选择 | 沿用动态目录与 API 设置；既有回归通过。未把模型固定为截图中的名称 |
| 上下文读数及说明 | 已修复并用真实 token 事件、真实 EXE、零值/缺失/非法值/压缩回落样本核对 |
| 工具面板切换、拖宽、收起、关闭、展开还原 | Windows 真实 EXE 已测鼠标、键盘、双击、重启保留；文件面板同样可调宽和关闭 |
| 浏览器标签新建/选择/关闭/最后标签关闭、地址与搜索、前进后退、刷新停止 | 手动预览保留；本轮重点实测空组、首次只建一个、关闭唯一/后台标签及重开。Mac 原生云端实测最后标签关闭与空状态；前进后退等保留旧代码，本轮不宣称所有网络状态均已测试 |
| 窄屏、长文本、代码/表格/附件、弹窗、原生网页层遮挡 | Windows 四种窗口尺寸、20 号字体的长内容边界通过；微信弹窗可打开。没有以此推导所有图片、网站或窗口组合都通过 |
| 默认黑白亮色与设置持久化 | 最新使用appearanceVersion=4一次亮色迁移；之后主动选色保留，0.3.20的26条外观检查已核对；本次未重复全部图片矩阵 |
| 官方 ChatGPT 扩展安装、授权、真实调用 | **未完成**。提供官方入口和安装文件检测，未建立官方授权通道；未用替代工具算通过 |

## 验证边界

历史 0.3.10 测试只能证明当时自建浏览器的部分行为，不能证明本轮官方扩展要求。任何本轮验证都要说明是真实 UI、真实 Codex、模拟微信接口还是真实微信实发，不得混称。

测试、截图、依赖、临时编译和备份保存在项目外。正式目录只保留一份 Windows 程序及一份 macOS 安装包。替换运行程序前核对忙任务、排队及待回复，保存数据并正常退出。

## 本轮实现、实测证据与未完成项

已实现默认亮色及一次性迁移、面板拖宽/键盘调整/双击还原、收起/关闭/展开、最后标签真正关闭、空标签组、避免首次新建双标签、关闭后不被后台事件重新打开、当前上下文统计、更改卡片和补丁展开、消息时间/菜单、项目超过 20 条的展开入口。已完成下文列明的分层验证；官方扩展等未完成项仍保留，不能据此宣称全部完成。

### 官方扩展的实际阻碍（本轮硬性要求仍未完成）

已实际获取并阅读官方页面，日期 2026-10-31：

- <https://developers.openai.com/codex/browser> 明确写明：`Browser isn’t available in Codex CLI or the Codex IDE extension.` 内置浏览器由官方桌面应用提供。
- <https://developers.openai.com/codex/chrome-extension> 描述从官方桌面应用 Settings > Computer Use 安装 ChatGPT 扩展、配置授权、在官方桌面会话中调用。该页没有提供第三方独立 app-server 连接扩展的接口。
- <https://developers.openai.com/codex/computer-use> 说明官方桌面宿主负责工具、应用访问及授权。

同时只读核对了本机官方 browser 插件版本 `26.1023.50603` 的代码和已安装 Codex app-server 协议：

- 官方扩展的 Chrome 商店 ID 为 `hehggadaopoacecdllhhajmbjkdcmajg`，Edge 商店 ID 为 `odlomjlbamekndcpllcnffbgeohgkmjh`。
- 官方 browser-service 要求 `BROWSER_USE_ACCESS_PIPE_PATH` 与 `BROWSER_USE_ACCESS_VERIFYING_IDENTITY`，通过 `browser/access` 请求核验签名。缺失时真实错误是 `The browser access host is unavailable`。有插件文件、有扩展文件、有 Codex 可执行文件，都不能证明具备此授权通道。
- 已检查的 app-server 协议包含浏览器权限配置类型，但未找到可让 QQClaw 获得官方宿主授权、托管官方网页视图的公开连接接口。

未修改全局 Codex 配置，未复制其他聊天身份/令牌，未伪造授权服务，未重新打包官方专有插件。**本轮不把第三方替代方案作为完成。** 已移除项目自建的 HTTP MCP 和对它的强制调用提示；现有原生网页仅用于用户明确手动操作的预览，界面与设置会显示“官方扩展尚未接通”。这是公开报告的功能限制：微信/QQClaw 中自动操作浏览器目前不可用，不是已经修好的功能。

安装检测仅检查官方扩展 ID 的 manifest 文件，不代表扩展已启用、签名已验证或授权连接成功；检测结果与 `connected=false` 分开显示。不假造“已连接”状态。

### 分层验证与测试修正

- 119 项既有核心回归已通过，覆盖会话、队列、微信处理、Provider、存储、长任务等；不覆盖官方扩展成功调用。
- 真实 Windows EXE 已检查拖动、键盘调整、双击、展开还原、关闭唯一标签、重新导航、关闭后台标签、关闭面板后后台事件不重开；四种实际窗口尺寸的长内容边界检查通过。
- 第一次 UI 脚本在展开侧栏时选中了收起侧栏中保留的隐藏按钮，已修正测试选择可见按钮，并增加 collapsed 侧栏的 inert/隐藏处理，防止键盘进入隐藏区域。随后完整 UI 检查已重跑；补充检查使用独立数据副本，避免前次检查遗留的视图偏好影响初始条件。
- 固定 token 样本仅用于验证计算/UI，不能当作真实模型消耗证据。真实 Codex 请求与上下文事件核验已执行，数据如下。

## 最终实测证据（2026-10-31）

测试、依赖与截图均在项目外：`C:\Users\admin\AppData\Local\Temp\qqclaw-browser-native-20261031`。

| 证据文件 | 范围与结果 |
| --- | --- |
| `regression.tap` | 119 项既有核心回归通过。旧存储检查的版本期望从 0.3.10 更新为本轮 0.3.11；并非删除失败检查 |
| `v0311-core.json` / `.mjs` | 12 条上下文、旧配置迁移、主动主题选择保留、官方扩展文件识别/不误认其他扩展、安装不等于连接的检查 |
| `v0311-ui.json` / `.mjs` | 32 条真实 Windows EXE 操作记录：标签/面板关闭、拖宽、方向键、双击、展开、四种窗口边界、微信面板、设置状态、加密保存等；用固定长内容和 token 样本，不称真实模型证据 |
| `v0311-real-codex.json` / `.mjs` | 真实已安装 Codex：补丁创建 hello.txt、第二轮恢复并读文件、第三轮如实报告官方浏览器不可用；原生历史、独立备份、DPAPI 状态均保存 |
| `v0311-ui-more.json` / `.mjs` | 22 条补充真实 EXE 记录，读取上项实际会话的数据副本：真实占比、真实补丁、状态刷新保留展开、菜单/微信绑定入口、重命名、搜索/历史、文件预览、快捷键、重启后保留面板宽度/关闭/侧栏状态 |
| `QQClaw-0.3.11-light-preview.png` | 20 号字体及超长内容的压力场景截图，不当作正常字号的设计预览 |
| `QQClaw-0.3.11-real-preview.png` | 正常 14 号字体、真实 Codex 对话和实际 7.5% 读数的窗口截图 |

真实 token 事件：窗口为 **258,400**。第一轮 `last.totalTokens=18,818`，约 **7.3%**，同期历史累计为 56,197；第二轮 `last.totalTokens=19,066`，约 **7.4%**，历史累计为 94,256。界面以最近样本为准，缓存输入已经包含在 input 中，不重复相加。第三轮后的真实 EXE 截图显示约 **7.5%**。当前百分比表示“已用”，点击会显示剩余比例、当前 token 和窗口大小。

第三轮真实回复为：“当前 QQClaw 尚未接通官方 ChatGPT 浏览器插件的授权宿主，因此无法打开 Google 搜索 AI 热点。本次未使用任何替代浏览器或网络工具。” 已核对这轮没有浏览器 MCP 调用，没有改用 Playwright/curl 等命令。**这证明如实阻止替代方案，不证明官方浏览器目标完成。**

原生测试对话 ID：`01a19190-d848-7710-93e2-a12f12e4504d`；真实 rollout 路径记录在 `v0311-real-codex.json`。没有使用或修改用户原有会话进行模型验证。

## 0.3.11 基线：Mac 云构建与当时成品

运行代码提交：`4a781b5f1988f572f2f1b32712a6fb2cd6874879`。

[macOS 云构建与原生验证](https://github.com/mumuhaha487/wechatclaw/actions/runs/41194574424) 成功。验证了 Universal 双架构、DMG 校验/挂载/拖入应用程序复制、本地签名验证、系统库依赖、Node 检测、原生手动网页预览、关闭唯一标签/空组/首次新建、后台 IPC、钥匙串解密和重启持久化。下载 artifact ZIP 的 SHA-256 与 GitHub 上传日志中的 digest 一致。

Mac 未在用户自有实机上做完整 GUI 或线上微信验收，签名仍为本地签名，尚未 Apple 公证。Mac 网站登录态仍不跨应用重启保存；对话和账户是单独持久化的数据，不受此限制。

| 正式文件 | 大小 | SHA-256 |
| --- | --- | --- |
| `release/QQClaw.exe` | 599,040 bytes | `EA1D8B155DF77651EB48829A469B36655B3C3F0C14A8784D12ACFDF50B500B61` |
| `release/macos/QQClaw.dmg` | 659,661 bytes | `9021001223E09C28472F6891E5EAEA9868E771D0DD215922CFF3799AC6DB6557` |

正式目录只保留以上两份成品。旧成品、加密数据及日志备份放在项目外 `replacement-v0311`。替换前实际核对正式进程已退出，原数据为 2 个账户、3 个会话、134 条消息，运行/排队/待回复均为 0，随后替换同名程序并启动。

替换后的 `replacement-v0311/after.json` 逐项比较了原账户 ID、bot、目录绑定，原会话 ID、Codex threadId、每条消息的角色/文本/时间，以及 Provider ID、API 地址与 Key；三组保留检查均为 `true`。账户/会话/消息数量仍为 **2 / 3 / 134**，运行/排队/待回复均为 0，主题为 `light`，`appearanceVersion=2`。只输出比较结果，不在报告中公开凭据或消息内容。

启动后再次核对，正式路径为 `D:\project\QQclaw\release\QQClaw.exe`；运行资源目录为 `C:\Users\admin\AppData\Local\QQClaw\app\4B0E228517F3A711`，`.complete` 为 `0.3.11`。运行目录内 `backend.cjs` 与 `ui/app.js` 的 SHA-256 分别与正式 EXE 的内嵌 payload 完全一致，确认没有继续加载旧前后端资源。进程响应状态仅作为启动检查，不作为功能验收证据。最终报告同步属于文档提交，不改变上述运行代码、成品或云构建对应提交。

## 明确未完成与审核时不得省略的差异

1. **官方扩展授权及自动调用未完成**，因此“微信发一句话 → 官方扩展打开 Google → 搜索并回结果”尚不能执行。这是核心未达标项，不能以手动预览、negative test 或 macOS 构建成功替代。
2. 没有完成参考主页的所有 1:1 行为。外侧应用 rail、Windows 菜单和 Mac AppKit 菜单已在 0.3.16 补齐，文件/网页混合标签在 0.3.17、加密布局恢复在 0.3.18、长消息折叠和会话目录在 0.3.19 补齐。网页批注、官方扩展网站权限/完整历史/下载管理等仍未实现，也未证明所有菜单和快捷键均与参考一致。0.3.12 已有应用前进后退、图片粘贴/缩略图，不再把这些列为完全缺失；只提供已有实际作用的入口，不显示假的撤销或已连接按钮。
3. 逐轮撤销需要保存修改前内容并处理之后的外部修改冲突，不能拿 Git reset 冒充安全撤销。0.3.14 已建立文件快照、冲突核对、恢复事务及界面操作；详见文末限制。
4. 本轮没有线上微信实发验收，也没有新 Mac 实机完整 GUI 验收。119 项回归保留了微信相关行为的检查，但不等于线上证明。
5. 0.3.12 的附件入口与图片识别详见追加记录；系统剪贴板、全部图片格式和 Mac GUI 尚未全面人工验收。边界检查不等于所有图片和网站均无溢出。
6. 编译和以上检查已经完成，但整体目标保留未完成状态。后续需要官方支持的独立宿主授权/连接接口或进一步公开资料，不能偷用其他会话的私有连接、伪造身份或装替代扩展来填写“完成”。

## 0.3.12 继续开发记录

本次继续补齐参考主页的交互，未改变官方浏览器扩展硬性要求，也未重新引入替代自动化工具。新增：

- 输入框支持选择多个文件、拖入文件和粘贴剪贴板图片；发送前可移除。图片在输入区和历史消息内显示缩略图，可放大查看，长图按窗口边界缩放；用户图片卡片放在文字上方，避免横向挤压文字。
- 桌面附件复制到用户数据目录 `attachments/desktop/<UUID>/`。发送用导入标识重新解析，不接受任意文件路径充当标识；模型收到已保存附件的路径，支持的栅格图片另走 Codex 原生 `localImage` 输入。
- 每条消息最多 8 个附件，单个不超过 20 MiB，总计不超过 40 MiB。预览仅识别 PNG/JPEG/GIF/WebP 的文件头，预览上限 8 MiB；不渲染 SVG/HTML。预览缓存限制为 24 项及 24 MiB 字符总量，缩略图按队列加载。图片是否被第三方模型接受仍由服务能力决定。
- 切换会话/项目及进入设置保留各自文字与附件草稿；状态刷新保留长草稿高度。**草稿目前仅保留在当前进程，未发送内容不跨重启保存。** 已发送附件副本与消息可跨重启恢复。移除未发送附件不会删除其数据目录副本，目前没有自动清理未引用副本的机制。
- 主页和设置提供应用前进/后退，分别记录会话、工作区与设置页；与网页预览的导航历史独立。支持 Windows Alt+←/→、Mac ⌘[/]，会话/项目行可用键盘进入。

测试证据在项目外 `C:\Users\admin\AppData\Local\Temp\qqclaw-v0312-20261031`：

| 文件 | 实际范围 |
| --- | --- |
| `core.test.mjs` / `core.tap` | 11 项通过：附件复制/原文件移除、栅格识别、非法标识/内容/数量/大小、已变化文件、导航分支/容量、桌面消息与原生图片输入。首次测试的假客户端遗漏 interrupt 清理方法，补齐测试替身后重跑通过，未修改产品清理逻辑来迁就测试 |
| `regression.tap` | 119 项既有核心回归通过；版本期望更新为 0.3.12 |
| `ui-test.mjs` / `ui-test.json` | 24 条真实候选 EXE 检查；粘贴/拖入事件为测试程序派发，实际 FileReader、UI、IPC、附件落盘、Codex 调用与重启均为真实执行，不冒充系统剪贴板或人工多选对话框验收 |
| `final-ui.mjs` / `final-ui.json` | 最终候选 11 条补充操作：会话键盘选择、图片卡片布局、设置导航、长草稿刷新、1800×1100/1500×1000/1100×760/900×680 四种实际窗口边界、无前端异常。修正了初版在较窄 CSS 视口隐藏应用导航的问题 |
| `send-failure.mjs` / `send-failure.json` | 8 条发送错误检查：延迟请求并由真实后端拒绝无效附件，确认切换会话后合并恢复旧内容和新草稿、同时导入附件不会丢失或一直加载、新会话连续点击发送仅创建/发送一次。为隔离错误路径，测试拦截和延迟 UI 桥请求，不将其称真实模型或微信测试 |
| `QQClaw-0.3.12-final.png` | 最终候选真实 EXE 截图；内容为以下图片识别的实际结果，未当作浏览器成功证明 |

最终版本真实图片识别线程为 `01a191b7-b191-7e82-a5b1-59bb8435b6ae`。输入图包含 `VERIFY 7319`，真实 Codex 回复 `7319`，未执行命令工具；原生 rollout 路径见 `ui-test.json`。该轮 `last.totalTokens=21843`、窗口 `258400`，界面显示约 8.5%，累计量 42125 未用于当前占比。

测试中曾在流式文本刚出现 `7319` 时立即读取消息快照，早于最终消息入库，导致断言失败；记录保留在 `ui-test-stream-race.log`。已将等待条件改为带操作栏的最终回复，并在最终 EXE 上重新完成 24 条操作与真实识图、重启检查；随后 11 条布局/导航检查也重新通过。没有删除该断言或拿中间流式输出充当完成证据。

## 0.3.12 当前成品、云构建及升级核对

运行代码提交为 `5c5db604fdb0cdfe56f2013766c51c8454ac6ca3`。之前 `66a0a2e` 的云构建也成功，但最终交付使用包含发送错误恢复修复的上述提交。

[最终 Mac 云构建](https://github.com/mumuhaha487/wechatclaw/actions/runs/41196938039) 成功。已读取实际运行输出，确认 Universal `x86_64 arm64`、DMG 校验/挂载/应用复制、签名/系统库、Node 检测、原生手动网页预览、最后标签关闭、后台 IPC、附件导入及栅格预览、钥匙串加密、后台重启后附件和会话恢复。下载 artifact ZIP SHA-256 为 `dadc7406d000fec4ccc3c2d3c5107863aa72d1d6c8e86f6743f4c62b4e937344`，与上传日志的 digest 一致。日志 ZIP、下载包及 `macos-release.json` 留在项目外。

| 当前唯一成品 | 大小 | SHA-256 |
| --- | --- | --- |
| `release/QQClaw.exe` | 603,648 bytes | `54D25DCC484E99F5A6CF2D695DC45EC7844A134F3A492ED947BBB3A2CFE032E1` |
| `release/macos/QQClaw.dmg` | 666,583 bytes | `8E813AA7594063717D9894818F0041796C9EA39B0556CF194B77E8D9AD0D3720` |

升级前确认无运行、排队和待回复任务，保存加密状态/日志/旧成品到项目外 `replacement-v0312`，正常退出后替换同名文件并启动；正式目录中只有上述 Windows 程序和 Mac 安装包。`replacement-v0312/after.json` 确认原 **2 个账户、3 个会话、134 条消息** 保留，账户身份/目录绑定、原会话 threadId 和逐条消息、Provider API 地址及 Key 比较均通过。没有拿真实用户会话发测试任务。

`runtime-audit.json` 进一步核对正式程序的运行目录为 `C:\Users\admin\AppData\Local\QQClaw\app\56CD5AC93C089E5F`，`.complete=0.3.12`，运行的 `backend.cjs` 和 `ui/app.js` 分别与正式 EXE 内嵌 payload 的 SHA-256 一致。进程响应仅证明启动，没有用它代替上述实际操作检查。

没有将本次附件与导航改动宣称为全部主页 1:1。**官方扩展授权与自动调用仍未接通**；线上微信、系统剪贴板/多选文件对话框的完整人工操作，以及 Mac 完整人工 GUI 尚未验收。Mac 仍为本地签名、未 Apple 公证。其余未完成项及禁止替代方案的边界继续有效。


## 0.3.13 黑白深色与图片边界

遵循最新截图反馈，默认深黑框架、深灰工作区、白色文字和灰阶控件。强调色变量统一为 `--accent`，无绿色主题。Windows 启动背景和 macOS 原生标题栏/WebView 背景随主题同步，减少启动白色闪屏。旧设置经 `appearanceVersion=3` 迁移为 dark 一次，之后用户在设置中切换亮色或跟随系统仍持久保存。

图片预览不再用固定的“视口高度减 200px”作为图片高度；弹窗由窗口可用空间限制，标题和底栏占固定布局空间，图片区取剩余空间并保持原图比例。超宽图、长图、大图均完整缩放，缩略图、长文件名与消息卡片保留边界，关闭按钮始终留在弹窗内。网页自身内容的配色由网页决定，不将白色网页像素强行反色。

验证材料放在项目外 `C:\Users\admin\AppData\Local\Temp\qqclaw-v0313-20261031`：

- `appearance-ui.mjs` / `appearance-ui.json`：26 条真实候选 EXE 检查。覆盖旧亮色数据迁移、灰阶强调色、历史图片及底栏、6000×240 宽图、240×6000 长图、4000×3000 大图在 1800×1100 / 1500×1000 / 1100×760 / 1000×680 四种实际窗口下的边界与关闭操作，20 号字体、设置主题切换、重启保存、网页预览空页和前端错误。
- `QQClaw-0.3.13-dark.png`、`QQClaw-0.3.13-dark-panel.png`、`QQClaw-0.3.13-tall-image.png`：实际候选窗口截图，已人工查看。使用隔离数据，未向用户微信账户或原会话发送测试消息。
- `regression.tap`：119 项既有回归通过，包含账户、会话、Provider、文件及微信核心逻辑；不等于本轮线上微信实发测试。
- 首次执行遗漏项目外测试依赖加载器，未进入程序；补上加载器后运行。随后测试最后一步误用隐藏的 `panel-browser` 入口导致超时，改为真实顶部的 `open-browser-window` 后完整重跑 26 条通过。没有为测试改产品入口或放宽断言。

Windows 同名正式程序已在确认运行/排队/待回复均为 0 后正常关闭、替换并重启。新 EXE 为 604,160 bytes，SHA-256 `8615AC4BE4CCFA3F55656BB32EE44E69A20D191BEAE659C6EE258F50B6253542`。原账户/消息/配置保留比较见 `replacement-v0313/after.json`；升级前加密数据和旧 EXE 保存在项目外。

本次只交付外观与图片边界调整。`backend/checkpoints.mjs`、`shared/change-stats.mjs` 是上轮开始但尚未接入、未验收的开发中模块，不在运行 bundle 内，不能据此声称逐轮撤销已实现。官方扩展接入和其余主页差异仍未完成，整体目标继续保留。


0.3.13 运行代码提交为 `bd24eadfb9c32a0ec8ecdd2adb38bb1eb7f889cd`。[本次 Mac 云构建](https://github.com/mumuhaha487/wechatclaw/actions/runs/41198403060) 成功；已读取实际执行输出，确认 Universal `x86_64 arm64`、DMG 校验/挂载/应用复制、签名/系统库、Node 检测、原生窗口和 WKWebView 主题切换、手动网页预览/最后标签关闭、附件导入/预览、钥匙串、后台重启后附件和会话持久化。artifact ZIP SHA-256 为 `e3a90c8374d2547b71110e098d4172b48b795edad7638d2c9aadb48d0691f9b1`，与上传日志 digest 一致。新版 `release/macos/QQClaw.dmg` 为 **667,437 bytes**，SHA-256 `48B37417D1FE7D60790358A9D96927ABD8F568363AD0BF960FEBEAF8250E3A52`，已替换同名安装包；旧包保存在项目外。Mac 未做用户实机完整人工 GUI 检查，仍为本地签名、未 Apple 公证。

正式数据复核仍为 **2 个账户、3 个会话、134 条消息**；账户身份/目录、threadId/逐条消息、Provider URL/Key 保留比较均为 true，主题为 dark、appearanceVersion=3。正式 Windows 运行资源目录为 `C:\Users\admin\AppData\Local\QQClaw\app\3C4C6D76E50BB34A`，`.complete=0.3.13`。`runtime-audit.json` 验证实际运行的后台、UI JavaScript、两份 CSS 及 HTML 分别与正式 EXE 内嵌资源完全一致；CSS 和 HTML 也与当前源文件一致。测试、截图、构建依赖、加密备份和旧成品均留在项目外，release 中继续仅有一份 Windows EXE 和一份 Mac DMG。


## 0.3.14 更改卡片、任务审阅与文件撤销

对照参考主页，文件更改卡片默认显示 3 个文件，支持“再显示”、真实逐文件新增/删除行数、“查看更改”、“撤销”、“重新应用”。审阅对应点击的消息和任务快照，展示每个文件的修改前/后内容、删除/新增状态，不依赖 Git。切换会话、文件、项目或面板时使用异步序号和目标身份核对，防止旧内容串入新页面。保留早期消息的工具补丁预览，不为没有快照的历史消息造撤销入口。

`backend/checkpoints.mjs` 在真正启动每轮 Codex 前保存文件，任务成功、停止或报错后记录结束状态。命令产生的文件变化同样可见，不只读取 fileChange 事件。文件和清单分别用 AES-256-GCM 加密，随机密钥由系统凭据保护；不把文件原文或密钥放进 UI 状态。工作目录身份、父路径、文件类型、内容 hash 和权限都会核对；全部冲突及解密预查通过后才写文件。失败会尝试回滚，回滚未完成时保留原事务方向并显示“恢复操作前状态”。未完成恢复的目录会限制新 Codex 任务、其他撤销、Desktop 接续及移除关联会话，避免继续写入混合状态。正常退出会等待正在进行的文件操作，崩溃后的事务状态会重新核对。

撤销和 Codex/微信任务、目录接续共享工作目录锁；桌面点击撤销不向微信推送。撤销不会回滚聊天历史；后续 turn/start.additionalContext 明确通知 Codex 文件已改变，并要求读取当前文件。已有原生 Codex 历史和独立对话归档继续保存。

本功能的边界必须保留：

- 统计的是任务开始到结束之间的目录文件变化，无法区分期间其他程序的编辑；卡片和按钮提示了这一范围。结束后另行修改的文件会触发冲突。并发外部程序可在任何文件系统检查后继续写入，本功能不宣称跨进程原子事务；恢复时应停止外部编辑。
- 忽略 `.git`、`node_modules`、`.venv`、`venv`、`__pycache__`、`.next`、`.nuxt`、`.cache` 及 QQClaw 数据目录。工作区在应用数据目录内时明确显示不可用；不再把它误报为空快照。
- 单轮最多 5,000 个文件、20,000 个目录项、64 MiB 文件内容；快照总空间限制为 512 MiB（事务清单写入可有少量额外空间）。超限仅停用新快照，Codex 任务继续，已有快照保留，没有自动删除历史快照的策略。
- 链接变化、文件/目录类型互换、特殊文件或采集时变化会禁用本轮撤销。文件撤销不会删除新建空目录，也不恢复空目录本身。二进制与大文件可以恢复内容，文本审阅只显示 256 KiB 以内的有效 UTF-8。
- 快照属于 QQClaw 用户数据，不等同于 Codex 原生历史或独立对话备份；只复制源码/EXE 不携带用户快照。未完成采集时应用被中断，不会在重启后把后来变化冒认为本轮改动。
- 事务记录验证的是普通进程中断/写入失败恢复，不宣称对整机断电有持久化保障。本轮没有借助 Git reset，也没有进行官方浏览器功能的替代实现。

验证证据均在项目外 `C:\Users\admin\AppData\Local\Temp\qqclaw-v0314-20261031`：

| 文件 | 实际验证范围 |
| --- | --- |
| `checkpoints.test.mjs` / `checkpoints.tap` | 17 项：独立 LCS 对照行数、新增/删除/移动/二进制、加密内容、外部冲突、写成功后报错的回滚、部分回滚及再次恢复失败、清单提交失败、损坏内容、越界/链接/根目录替换、容量/排除目录、特殊文件名、App RPC/失败任务、Codex 上下文、重启后恢复限制 |
| `checkpoint-ui.mjs` / `checkpoint-ui.json` | 最终候选真实 EXE 的 17 条检查：真实 Codex 修改 5 文件、3 行默认列表/展开、真实行数、无 Git 审阅/删除前后、4 种窗口边界、实际撤销/重新应用、外部冲突保留文件、重启持久化、下一轮真实 Codex 读取撤销后的内容、读取任务不生成假更改卡片、前端错误检查 |
| `regression.tap` | 119 项既有回归通过；不冒充线上微信实发测试 |
| `QQClaw-0.3.14-changes.png` / `QQClaw-0.3.14-after-undo.png` | 实际候选窗口截图，已查看；保持最新要求的黑白深色，未把浏览器尚未接通写成成功 |

第一次真实任务测试将工作区建在测试应用数据目录内，文件实际修改成功但快照规则将它们排除，脚本一直等待更改卡片。已正常关闭该隔离候选，修正产品为明确提示不可用，并把测试工作区移到独立目录。最终候选已完整重跑两轮真实 Codex（修改任务、撤销后只读任务）及全部 17 条 UI 检查；没有修改用户原会话或向原微信账户发送测试消息。

Windows 已在确认原运行/排队/待回复均为 0 后正常关闭、替换同名 EXE 并重启。最终文件为 **612,352 bytes**，SHA-256 `ECDD40DEE880CC4DE92F5191FA205D560ED27263164A78AFFFB84BE20C0201BA`。升级前原加密数据、日志和旧程序保存于项目外 `replacement-v0314`。本轮继续是目标的阶段进展，官方扩展和未复刻的主页行为仍未完成。


0.3.14 运行代码提交为 `e0463903763540fc902fda9064314f3ab556a553`。[最终 Mac 云构建](https://github.com/mumuhaha487/wechatclaw/actions/runs/41200200916) 成功。除 Universal `x86_64 arm64`、DMG、签名/系统库、Node、原生窗口主题、手动网页预览/标签、附件、钥匙串和重启持久化外，新增的 macOS 文件撤销/重新应用、权限位恢复、实例重建后恢复、写入失败回滚、外部编辑冲突均实际执行通过。未做用户 Mac 完整人工 GUI 验收，仍为本地签名、未 Apple 公证。

最新同名 `release/macos/QQClaw.dmg` 为 **675986 bytes**，SHA-256 `4B2FECFA09833B404F35DDE5905A0C2D2EDF86C45E15354C303149AAFC1FCB88`。artifact ZIP SHA-256 `0e55a65c3d131795c6df39d9fefcefba415cba63150919fe0827f2fe04a89f36` 与 GitHub 上传日志一致，ZIP CRC 和 DMG 文件尾已核对。旧安装包留在项目外，项目内继续只有一份 EXE 和一份 DMG。

`replacement-v0314/after.json` 核对升级时原 2 个微信账户、3 个会话、134 条消息及其身份/目录绑定、threadId/逐条消息、Provider URL/Key 均保留，主题保持 dark、appearanceVersion=3。`runtime-audit.json` 核对正式 Windows 实际资源目录 `C:\Users\admin\AppData\Local\QQClaw\app\90D7E2C56C46A468` 的 `.complete=0.3.14`；后台、UI JavaScript、CSS 和 HTML 均与正式 EXE 内嵌资源一致，CSS/HTML 也与当前源文件相同。没有只凭进程存在宣称验收。

任务审阅当前选择的快照/文件不跨应用重启保存，重启后可从对应消息的更改卡片重新打开；面板宽度和开关仍保存。这仍是主页复刻的待补齐细节。官方扩展授权与自动调用、原生外侧应用 rail/菜单和其余未复刻行为继续未完成，本轮不得标记整体目标达成。


## 0.3.15 任务审阅位置恢复

源码与两端正式包均已更新为 0.3.15，Windows 已正常替换启动，Mac 云构建与原生检查成功。保持最新黑白深色主题和图片边界规则。

`shared/review-view.mjs` 用会话 ID、工作目录、消息索引和快照 ID 核对审阅身份。`review.remember` 将当前任务、文件选择及面板开关保存到现有加密 Store，Windows/macOS 从后台恢复，不依赖网页 localStorage。关闭后重启保持关闭，再展开可继续查看原文件；切换到其他会话或面板会清除旧任务选择。快照读取也核对预期 ID，拒绝内容已被替换的消息。它只保存当前任务审阅选择，不包含审阅正文、草稿或其他设置页面。

首次 UI 检查已通过审阅重启、禁用网页存储、面板开关及延迟返回隔离；随后在 1000×680 窗口执行隐藏的顶部“新建面板”按钮，脚本超时。已把后续操作恢复至 1800×1100 后重跑；没有改变产品隐藏规则或使用强制点击。首次夹具还误把工具数写成 toolCount，导致截图显示 undefined；已修正为产品实际的 tools 字段并重跑，未冒充真实模型结果。4 项审阅持久化及 119 项既有回归已通过。最终候选又发现“重启后直接点展开放大面板”缺少快照加载，已补齐，并在最终 EXE 上完整重跑 16 条 UI 检查全部通过。


0.3.15 验证材料保存在项目外 `C:\Users\admin\AppData\Local\Temp\qqclaw-v0315-20261031`：

| 文件 | 实际范围 |
| --- | --- |
| `review.test.mjs` / `review.tap` | 4 项通过：真实文件快照结合 Store 重建、消息/工作目录/快照身份变化、快速切换后正常退出保存最后状态、非法路径和多余字段。此单元夹具的凭据方法用 base64 替身，不据此声称加密验收 |
| `review-ui.mjs` / `review-ui.json` / `review-ui.log` | 最终候选 EXE 16 条通过：真实 DPAPI 数据和真实文件快照；清空/禁用网页存储后重启恢复、重复点击当前会话、关闭/收起/放大、旧请求延迟返回隔离、1800×1100/1500×1000/1100×760/1000×680 边界、切换面板/删除会话/工作目录变化后的重启，不存在未捕获前端错误 |
| `QQClaw-0.3.15-review.png` | 最终 EXE 实际截图，已查看。内容为隔离夹具，不冒充真实模型或线上微信任务 |
| `regression.tap` | 119 项既有核心回归通过；本轮不重复声称完成线上微信实发测试 |
| `replacement-v0315/before.json` / `after.json` | 正常替换前后原 2 个微信账户、3 个会话、134 条消息、账户身份/目录绑定、threadId/逐条消息和 Provider URL/Key 均保留，主题 dark、appearanceVersion=3；旧成品和加密数据留在项目外 |
| `runtime-audit.json` | 正式 Windows 后台确实使用 `C:\Users\admin\AppData\Local\QQClaw\app\5C1507D78C38754A`，`.complete=0.3.15`。后台、UI JS、两份 CSS、HTML 与正式 EXE 内嵌资源 hash 一致；CSS/HTML 与源码一致。初次审计脚本未匹配 .NET ZIP 路径分隔符，修正读取方式后完成核对，未改产品资源 |
| `macos-release.json` / `logs-41201359113.zip` | 已读取实际执行日志，确认本轮新增 Mac 审阅选择、面板关闭状态、快照 ID 校验和清除持久化检查通过；既有文件撤销/权限/回滚/冲突、Universal、DMG、原生后台/钥匙串/重启、主题及手动网页预览等也通过 |

运行代码提交为 `18642514cd4947772631268031f659497afc42dd`。[Mac 云构建](https://github.com/mumuhaha487/wechatclaw/actions/runs/41201359113) 成功。下载 artifact ZIP SHA-256 `66674f8d4caf33850cec2e79c797638ff9ca7bf9a71a59dc75925d379cc7fbc0` 与上传日志 digest 相同，ZIP CRC、DMG 文件尾校验通过，正式同名包已替换：

| 当前唯一成品 | 大小 | SHA-256 |
| --- | --- | --- |
| `release/QQClaw.exe` | 612,864 bytes | `3EEEC3615AA4689142EE136B8F6A16AF5A87DA1F0294A62DB3EE37459A53D01F` |
| `release/macos/QQClaw.dmg` | 677,235 bytes | `F3155448F0924A9E2B5B2CDF5134D6CE86D2D44DE959F226B4F2C9F940602A2C` |

本项只恢复当前任务审阅，不保存各会话独立的审阅历史；选择其他会话或面板后会清除。任务快照丢失/损坏会显示真实错误，不静默换成其他文件。未发送草稿依旧仅在进程内；其他视图偏好（包括普通面板类型/宽度）仍沿用网页存储，Mac 临时 WebKit 数据存储不具备已验证的跨重启保证，不能把本轮任务审阅修复扩大宣称为全部视图偏好已持久化。

官方 ChatGPT 扩展授权与自动调用、原生外侧应用 rail/菜单及其他未复刻行为仍未完成。Mac 未做用户实机完整人工 GUI 验收，仍为本地签名、未 Apple 公证。没有使用替代远控或自建浏览器 MCP，本轮整体目标继续未完成。测试、截图、构建依赖、旧版本和备份均在项目外，项目内 release 继续只有各平台一份成品。


## 0.3.16 外侧导航、应用菜单与黑白图片边界复核

遵循最新要求，应用框架为 `#111111`，聊天区 `#171717`，控件为灰阶，文字 `#f2f2f2`。没有绿色主题强调色。现有图片边界实现已在本轮最终候选 EXE 重新检查：宽图、长图和大图按弹窗剩余空间完整等比缩放，标题及关闭按钮不越出窗口，历史消息卡片和长文件名也受容器限制。网页本身的内容保留其配色，不对外部网页强行反色。

对照参考主页补齐外侧应用导航栏：工作台、会话历史、通知，底部为微信和设置。侧栏收起后这些入口仍可用，原侧栏底部的重复按钮已移除。Windows 使用单一全局标题栏及文件/编辑/视图/帮助菜单，支持 Alt+F/E/V/H、F10、方向键、Home/End、Escape。新聊天、打开项目/工作目录、设置/运行环境、面板开关/展开、网页预览、字号和帮助链接调用现有真实 action。Mac 使用 AppKit 系统菜单，保留系统 Edit responder chain，通过 `window.menuState` 同步门禁、勾选和字号边界，`menu-action` 交给现有 UI。

编辑菜单支持当前输入框的撤销、重做、剪切、复制、粘贴及全选。Windows `clipboard.read` 只对应用 UI 提供文本、图片和文件列表，沿用现有附件导入/预览，不是模型的浏览器工具。异步返回会核对会话、输入值和选择范围，切换会话后不会写入其他草稿。菜单执行后恢复原控件焦点。

实际检查发现“保存并重新插入同一个 textarea 节点”仍会清空 Chromium 原生撤销记录；最终实现改为 `ui/render-frame.mjs` 保留同一草稿输入节点及祖先的 DOM 连接，只更新周边内容。侧栏、字号和后台状态刷新后原生撤销可用。中文合成输入期间延迟整体渲染，结束后更新。本轮自动检查通过合成事件验证节点未被替换，**不等于人工中文输入法和所有 Mac 输入法验收**。切换会话、设置页或重启后不承诺保留原生撤销栈；草稿文字和附件仍按现有会话隔离，未发送草稿仍不跨重启保存。

验证材料均在项目外 `C:\Users\admin\AppData\Local\Temp\qqclaw-v0316-20261031`：

| 证据 | 实际范围 |
| --- | --- |
| `shell-ui.mjs` / `shell-ui.json` / `shell-ui.log` | 最终 EXE 37 条：导航/菜单、键盘和焦点、真实系统剪贴板文字/图片/文件、刷新后撤销、会话草稿隔离、合成事件、异步粘贴取消、字号保存、侧栏拖动、微信面板、工作面板勾选与关闭、4 种窗口边界、真实创建新会话、前端异常 |
| `appearance-ui.mjs` / `appearance-ui.json` / `appearance-ui.log` | 26 条：旧数据迁移、黑白强调色、历史图片预览/底栏、6000×240 宽图、240×6000 长图、4000×3000 大图在 1800×1100 / 1500×1000 / 1100×760 / 1000×680 实际窗口中的边界与关闭、20 号字、主题切换及重启、网页预览空页 |
| `review-ui.mjs` / `review-ui.json` / `review-ui.log` | 16 条真实文件快照及隔离加密数据检查：审阅选择重启/禁用网页存储恢复、面板开关/展开、延迟返回隔离、4 种窗口边界、切换面板/移除会话/目录身份变化后不恢复旧快照 |
| `review.test.mjs` / `review.tap` | 4 项审阅持久化检查；凭据方法为 base64 夹具，不能据此声称加密验收 |
| `regression.tap` | 119 项既有核心回归通过，不冒充本轮线上微信实发 |
| `QQClaw-0.3.16-shell.png` / `QQClaw-0.3.16-menu.png` / `QQClaw-0.3.16-dark.png` / `QQClaw-0.3.16-tall-image.png` / `QQClaw-0.3.16-dark-panel.png` | 实际候选窗口截图，已查看。使用隔离数据，未向原用户微信或会话发测试消息。图片识别的历史内容来自此前独立测试，不冒充本轮新模型任务 |
| `replacement-v0316/before.json` / `after.json` / `runtime-audit.json` | 原 2 个账户、3 个会话、134 条消息及身份/目录绑定、threadId/逐条消息、Provider URL/Key 均保留；正式运行资源来自新版同名 EXE |

检查中的失败及处理：首次粘贴和新建聊天断言未等待异步 RPC 完成，补上最终 UI 状态等待；侧栏拖动在展开动画中取边界，最终等待宽度稳定并通过 elementFromPoint 确认分隔条命中，未放宽宽度断言。编辑菜单关闭后未还原焦点、输入框断开 DOM 清空撤销属于实际实现缺陷，已修正并重新完整执行 37 条检查。系统剪贴板夹具一次写图片遇到系统暂时占用，为夹具增加有限重试并在 finally 恢复原 DataObject。一次语法检查从临时目录使用相对路径失败，之后从源码根目录对实际源文件检查通过。

Windows 已确认运行/排队/待回复为 0，备份原加密数据和旧程序后正常退出、替换并重启。正式 `release/QQClaw.exe` 为 **620,032 bytes**，SHA-256 `5D6A78A1B6E2904DD8CF6F0F9EB35C12CF9C38C68E3AC950BFB7A6263403FC1C`。实际运行目录为 `C:\Users\admin\AppData\Local\QQClaw\app\CF2020D79F08355D`，`.complete=0.3.16`；后台、UI JS、两份 CSS 和 HTML 与正式 EXE 内嵌资源 hash 相同，CSS/HTML 与源码相同。没有仅用进程存在代替界面检查。

运行代码提交为 `51ca9b0f41b7c61e2ba9b970806d7ece539d16f0`。首次 [Mac 云验证 41203897725](https://github.com/mumuhaha487/wechatclaw/actions/runs/41203897725) 双架构编译成功，但新增菜单测试初始化 JavaScript 最后返回函数对象，WebKit 报不支持该返回类型；已在夹具末尾显式返回 true，保留原菜单功能断言，提交 `7b54ba4873f8468579390cd01d4d926cf5c560fa`，重新构建已通过，见下方最终记录。未把失败的构建作为安装包交付。

本轮重新读取的官方文档及 hash 保存在 `official-docs.json` 和三份 HTML/TXT，developers.openai.com 对应路径现在重定向至 [Browser](https://learn.chatgpt.com/docs/browser)、[Chrome extension](https://learn.chatgpt.com/docs/chrome-extension)、[App Server](https://learn.chatgpt.com/docs/app-server)。Browser 文档仍明确 CLI/IDE 不提供该浏览器；扩展通过官方桌面 Settings → Computer Use 管理。app-server 的控制 socket/WebSocket 描述没有提供 QQClaw 取得官方扩展宿主授权的公开接口，WebSocket 也标为 experimental/不支持生产，不能据此声称已连接官方浏览器。未读取当前开发聊天的私有宿主身份、令牌或连接，未安装替代扩展。

**最新黑白外观与图片边界已按上述范围验证，但整体目标仍未完成。** 官方扩展授权与自动调用继续未接通；混合文件/浏览器标签、网页批注、网站权限/历史/下载等参考主页行为仍未实现。Mac 完整人工 GUI、人工输入法及线上微信完整实发本轮未验收，Mac 普通视图偏好/网站登录态仍沿用临时 WebKit 存储，不具备已验证的跨重启保证；Mac 包仍为本地签名、未 Apple 公证。测试、截图、构建依赖、备份和旧版留在项目外，项目 release 继续只保留各平台一份成品。


0.3.16 最终 [Mac 云构建 41204082568](https://github.com/mumuhaha487/wechatclaw/actions/runs/41204082568) 成功。已读取实际输出（不只检查 workflow 成功标记）：Universal `x86_64 arm64`、DMG 校验/挂载/应用复制、签名和系统库、Node 发现、AppKit 文件/视图/帮助菜单、配置门禁/勾选/字号边界及 WebKit 命令分发、原生主题/手动网页标签、附件、钥匙串、后台正常退出/重启和数据持久化均执行通过。macOS 的文件撤销/权限/回滚/外部冲突及审阅位置恢复检查也通过。未进行用户 Mac 完整人工 GUI 验收，仍为本地签名、未 Apple 公证；本次没有用这些原生检查扩大声称 Mac UI/输入法人工验收或官方扩展可用。Swift 5 编译仍显示既有 BrowserHost KVO 的主线程隔离警告，未切换 Swift 6 严格语言模式，也未将该警告解释为已解决。

`macos-release.json` 和 `logs-41204082568.zip` 保留核验结果。下载 artifact ZIP SHA-256 `08A3A16AC69388A80A707427A400FD62F0FB794CDFA3743B7A015899203179DB` 与 GitHub 上传日志 digest 相同；ZIP CRC、DMG UDIF 文件尾通过，已备份旧 DMG 并替换同名文件。当前项目仅有：

| 唯一成品 | 大小 | SHA-256 |
| --- | --- | --- |
| `release/QQClaw.exe` | 620,032 bytes | `5D6A78A1B6E2904DD8CF6F0F9EB35C12CF9C38C68E3AC950BFB7A6263403FC1C` |
| `release/macos/QQClaw.dmg` | 691,063 bytes | `2A095B36E8AB495123EE88F0E3695C0A1DC3E5FFC165863EC63CF76E35A3E205` |

最新黑白/图片边界阶段已交付；总体目标保持未完成，官方扩展及上文其他缺口继续保留，未标记整体通过。


## 0.3.17 黑白外观、图片边界与混合标签

继续遵循最新黑白深色要求，界面框架 #111111、聊天区 #171717、文字 #f2f2f2，应用强调色为灰阶。历史消息缩略图、待发送附件以及预览弹窗受容器约束，图片按剩余空间完整等比缩放，长文件名省略，关闭及底栏操作保持在窗口内；外部网页保留自身配色。

新增文件与手动网页共用的右侧标签栏，按会话/工作目录隔离。消息本地链接、工作区文本附件及文件管理器可打开独立文件；Markdown 可切换源码、打开文档相对链接，#L 行号定位到源码。提供刷新、在文件夹显示、关闭及键盘切换，各文件保留进程内阅读位置，横向标签滚动在后台刷新后保留。文件最多16个、网页最多12个；文本预览仍限512 KiB，二进制和工作区越界路径拒绝。消息或文档 HTTP 链接由用户点击打开手动预览，不是模型自动操作。

代码索引：ui/panel-tabs.mjs 管理标签及本地链接解析；ui/app.mjs 管理混合面板、读取请求序号与视图；backend/app.mjs 的 workspace.read 返回 canonical 相对路径，workspace.reveal 复用 realpath 工作区检查。两端 BrowserHost 状态增加单调 revision，UI 拒绝倒序状态，防止旧状态复活已关闭网页；迟到文件读取按 owner、标签存在性和 revision 校验。

检查中发现并修复：相对/绝对文件 canonical 合并可能丢失显式行号，现只由最新读取传递 pendingLine，定位时清零水平阅读位置；DOM 刷新可能让末尾标签滚回开头，现按会话/工作区保存标签横向滚动并在选中项变化时滚入可见区域。首次扩展检查在真实候选上暴露行号问题，未将该失败记录为通过。较早的文件延迟夹具等待自己暂扣的 RPC，已修正为检查请求已暂扣；回归输出曾与脚本写入同一路径冲突、单元启动漏导入外部依赖，均修正启动命令后完整重跑，不修改产品来满足夹具。

验证材料在项目外 C:\Users\admin\AppData\Local\Temp\qqclaw-v0317-20261031。最终安装包、各检查数量、正式替换数据比较与 Mac 实际 CI 结论将在完成后追加。

限制保持明确：文件标签、未发送草稿和文件阅读位置不跨重启保存；已发送对话、Codex 原生历史和当前任务审阅继续按既有机制保存。上游 wechat-actions.mjs 会把含绝对文件链接的整行转成附件并去掉该行，若多个链接同行可能连带移除文字；本轮未修改这一上游兼容语义，夹具采用分行链接及真实附件卡片。官方扩展授权/自动调用仍未接通，网页批注、网站权限/历史/下载等仍未复刻；Mac 普通视图偏好与网站登录态未保证跨重启，未进行用户 Mac 完整人工 GUI/输入法验收、未 Apple 公证。本轮没有向原会话或微信账户发送测试消息，也没有用手动 WebView 检查冒充官方扩展或微信自动搜索通过。整体目标保持未完成。


### 0.3.17 最终验证及正式交付

最终 Windows EXE 的实际检查如下，材料均位于上文项目外目录；使用隔离加密数据、真实文件和本地网页夹具，未向原账户发送测试消息：

| 证据 | 实际范围及结果 |
| --- | --- |
| tabs-extra-ui.mjs / tabs-extra-ui.json / tabs-extra-ui.log | 35 条通过：混合标签、相对/绝对文件合并、Markdown/源码与文档相对链接、#L 行号、文件真实刷新/删除错误、HTTP 链接用户打开、后台网页刷新不抢文件、旧原生状态不复活网页、文件关闭/会话切换后的延迟读取隔离、长标签栏横向位置、Home/End/方向键/Ctrl+W/Ctrl+Tab、4 种窗口边界、关闭再展开、空组和前端异常 |
| appearance-ui.mjs / appearance-ui.json / appearance-ui.log | 26 条通过：黑白深色及迁移、历史附件、6000×240 宽图/240×6000 长图/4000×3000 大图，在1800×1100、1500×1000、1100×760、1000×680内完整等比缩放、关闭和底栏、20号字、主动切换主题及重启保存、网页空页 |
| review-ui.mjs / review-ui.json / review-ui.log | 16 条通过：当前任务审阅跨重启、清空及禁用网页存储、关闭/展开/放大、旧响应隔离、4种窗口边界、面板/会话/目录变化后的恢复边界 |
| tabs.test.mjs / review.test.mjs / units.tap | 14 项通过：10项标签/本地链接及canonical行号合并、4项审阅持久化。审阅单元的凭据为base64夹具；真实UI另用DPAPI，不能混称单元加密验证 |
| regression.tap / regression-run.log | 119项核心回归通过；最终UI修正后重新运行上述14项单元及77条UI，未扩大声称线上微信实发 |
| QQClaw-0.3.17-dark.png / QQClaw-0.3.17-tall-image.png / QQClaw-0.3.17-file-browser.png | 实际候选截图，已查看；截图是隔离数据，图片识别历史回复来自此前独立检查，不冒充本轮新模型执行 |
| replacement-v0317/before.json / after.json / runtime-audit.json | 正常退出前运行/排队/待回复均为0；备份加密状态及旧成品后替换、重启。原2个微信账户、3会话、134条消息、身份/目录绑定、threadId及逐条消息、Provider URL/Key均保留 |

正式 Windows PID 在替换时为 148688，实际资源目录为 `C:\Users\admin\AppData\Local\QQClaw\app\B3C480F6D5BEB2C4`，`.complete=0.3.17`；后台、UI JS、两份CSS及HTML与正式EXE内嵌资源一致，CSS/HTML亦与本地源码一致。真实UI操作检查与资源核验共同作为证据，没有只用进程存活作为验收。

运行代码提交为 `f9fe789a19e986606c75f29f3d813b582d4bb88e`。[Mac云构建](https://github.com/mumuhaha487/wechatclaw/actions/runs/41206676693)成功。已读取实际输出：Universal x86_64/arm64、DMG校验/挂载/应用复制、签名与系统库、Node发现、AppKit菜单、主题、手动原生网页及关闭最后标签/空状态/单调revision检查、附件、钥匙串及原生后台退出/重启保存均执行通过；文件撤销/权限/回滚/冲突和当前任务审阅恢复也通过。Swift 5 模式仍有既有 BrowserHost KVO 主线程隔离警告，验证夹具也有NSApp/menu隔离警告，未宣称Swift 6严格模式通过。Mac未做用户实机完整GUI/输入法验收，仍为本地签名、未Apple公证。

`macos-release.json`、`logs-41206676693.zip`保存核验结果。artifact ZIP SHA-256为`F66BA781646B23B20484E762439289363D48281181BE367DF6B92FD6AF3E0FB8`，与GitHub上传日志digest相同；ZIP CRC及DMG UDIF文件尾通过。旧DMG已在项目外备份，项目继续仅有各平台一份同名成品：

| 唯一成品 | 大小 | SHA-256 |
| --- | --- | --- |
| release/QQClaw.exe | 624,128 bytes | `C6A481D159CAB288CC2AFFD431679B449A25118DF3FB2BDEBF6FC94E37138D41` |
| release/macos/QQClaw.dmg | 695,527 bytes | `5FC30B44DE7E4B63C26C68122F6733BE0BACC2CC9CCD7925F1D695E2DCB3AAE9` |

本阶段黑白配色、图片边界和混合标签已按上述范围交付。官方ChatGPT扩展、前述浏览器其他能力及持久化边界继续作为未完成项保留，整体目标仍未完成。项目内没有新增测试、截图、依赖、备份或旧成品。


## 0.3.18 布局持久化、黑白外观与网页生命周期修复

本轮继续参考主页操作，保持最新黑白深色要求。发现旧的侧栏/普通面板偏好及当前会话依赖 localStorage，Mac 临时 WebKit 不保证保留；已新增 shared/view-preferences.mjs 的白名单和有效实体校验、ui/view-preferences.mjs 的一次迁移/后台权威缓存、App view.remember 与 Store 加密保存。布局只保存会话/项目引用、项目折叠、侧栏和普通面板宽度/开关/类型/展开状态，不保存网页令牌、密码或文件内容。已删除实体引用会被清除，活动会话优先绑定其实际工作目录；文件/网页标签及草稿仍仅在进程内。

本轮还发现会话移除未释放隐藏原生网页。App 现按会话序列化网页命令，移除期间拒绝新任务、定向停止和等待旧操作，然后调用 Windows/Mac dispose；关闭网页标签先定向取消该标签导航，防止等待未响应网站超时。UI 过滤关闭中的标签，避免停止导航期间的新状态把标签重新加回；清理失败保留会话并报错。正常退出等待会话移除操作，未打开网页的会话不创建原生视图。

检查中发现的真实问题及修复：侧栏连续方向键读取动画中的宽度导致步长错误，改为读取目标宽度；关闭文件管理器、重启再展开时原先没有加载入口，已补齐 toggle/maximize 的文件管理器读取。早期关闭检查读到停止导航后的中间状态，定位为关闭命令尚未入队，现定向停止和入队同步启动，并加 UI 关闭中标记。未放宽最后标签必须为空的断言。

材料位于项目外 `C:\Users\admin\AppData\Local\Temp\qqclaw-v0318-20261031`。用户本次附图是旧版浅色界面；最新要求为“不要绿色，黑白为主，大部分黑色”，因此没有沿用旧目标中的亮色文字。主窗口、侧栏、输入框、图片预览和手动网页空页均使用中性深灰/黑色与白色文字，按钮、焦点边框也采用灰阶。网页实际内容和用户图片本身保持原样。

图片边界沿用实际剩余空间约束：消息和输入栏缩略图使用容器上限，预览弹窗以纵向弹性布局为标题和底栏预留高度，图片使用等比 contain。长文件名截断，图片不会挤走关闭按钮或文件入口；没有只用裁剪掩盖图片超出。

| 证据 | 实际范围及结果 |
| --- | --- |
| `appearance-ui.json` / `.log` / `.mjs` | 26 条真实候选 EXE 检查通过：深色及迁移、灰阶强调色、历史附件、6000×240 宽图/240×6000 长图/4000×3000 大图，在 1800×1100、1500×1000、1100×760、1000×680 内缩放，关闭与底栏、20 号字体、主动切换主题及重启保留 |
| `layout-ui.json` / `.log` / `.mjs` | 13 条通过：禁用 localStorage 后的真实 DPAPI 布局保存、当前会话、项目折叠、宽度/开关/展开、重启及重新读取文件管理器、四种窗口边界 |
| `lifecycle-ui.json` / `.log` / `.mjs` | 40 条通过：混合标签与文件操作、真实网页独立 HTTP 心跳、移除一个会话后其心跳停止而另一个继续、真实未响应网页关闭在 5 秒内取消且标签不复活、主动关闭没有取消导航错误 toast |
| `review-ui.json` / `.log` / `.mjs` | 16 条通过：审阅保存、恢复、清空、关闭/展开/放大、异步隔离及四种窗口边界 |
| `units.tap` | 23 项通过：5 项布局白名单、4 项网页生命周期、10 项标签/本地链接、4 项审阅 |
| `regression.tap` | 119 项既有核心回归通过 |

最终候选包含主动关闭时忽略过期导航错误的修正，随后已重跑 40 条生命周期和 13 条布局 UI 检查；26 条外观与 16 条审阅检查运行于该 toast 修正前的同版候选，没有把它们写成最终补丁后的全量重跑。所有 UI 结果未捕获错误列表均为空；这不是线上微信实发或官方扩展验收。

Windows 正式替换前运行/排队/待回复均为 0，备份加密数据和旧 EXE 后正常退出、替换同名程序、重启。`replacement-v0318/after.json` 确认原 **2 个账户、3 个会话、134 条消息**及账户身份/目录绑定、原生 threadId、逐条消息和 Provider URL/Key 全部保留；没有向这些账户或会话发送测试消息。

正式 EXE 为 627,200 bytes，SHA-256 `676690185BF44EF4432B5426419B733915FDE95DDC3C373E1A7D0F2D35F56BDE`。重启 PID 为 151356，实际资源目录 `C:\Users\admin\AppData\Local\QQClaw\app\7B272DF97DE88F67`，`.complete=0.3.18`。`runtime-audit.json` 确认后台使用该目录，后台和 UI 资源与 EXE 内嵌内容一致，CSS/HTML 亦与项目源码一致。

最终运行代码为 `845d874ea4d517072131d9e1b3dd3a09259121ee`，[Mac 云构建 41208966933](https://github.com/mumuhaha487/wechatclaw/actions/runs/41208966933)成功，已读取实际 PASS 输出，未仅凭绿色状态推断验证完成：Universal x86_64/arm64、DMG 校验/只读挂载/应用复制、签名及系统库依赖、Node 发现、原生菜单和黑白主题切换、手动 WKWebView 及最后标签空组、原生 dispose 释放网页/观察器且幂等并可重开、布局经 native pipe/钥匙串加密后后台重启恢复、附件及会话保存均执行通过。文件快照撤销/权限/回滚/外部修改冲突及任务审阅恢复亦通过。

下载的 artifact ZIP SHA-256 为 `B91003341DB587CCD293DB48343D5E0E79CAD9CE20ACA01E9D3C51508702D3F1`，与 GitHub 上传日志 digest 一致；ZIP CRC 和 DMG UDIF 文件尾均通过。旧 DMG 备份在项目外，最终元数据保存为 `macos-release.json`。项目仍仅有以下两份同名成品：

| 唯一成品 | 大小 | SHA-256 |
| --- | --- | --- |
| `release/QQClaw.exe` | 627,200 bytes | `676690185BF44EF4432B5426419B733915FDE95DDC3C373E1A7D0F2D35F56BDE` |
| `release/macos/QQClaw.dmg` | 701,845 bytes | `301F6564F457E80F30E3748771E100FBF2DB6761825BE146FE008A3E0BF29807` |

Mac 仍为本地签名、未 Apple 公证，未在用户 Mac 上做完整 GUI/中文输入法/线上微信人工验收。Swift 5 模式仍有既有 KVO changed 主线程隔离警告，云端临时验证入口还有 NSApp/mainMenu 隔离警告；未宣称 Swift 6 严格模式通过。文档最终同步不改变上述构建代码及包。

官方 ChatGPT 扩展授权/自动调用仍未接通，未使用其他远控替代；网页批注、网站权限/历史/下载、Mac 网站登录态、完整人工 GUI/输入法和公证等未完成项保留，整体目标仍未完成。项目没有新增测试、截图、依赖、备份和旧成品。

## 0.3.19 参考主页的长消息与会话目录

上一目标阶段有实质进展：0.3.18 正式成品已替换、重启、核对资源和数据，并完成 Mac 同版构建。本次重新读取全部四张参考图，图 1/3 实际为亮色 Codex Desktop，图 2/4 为深色 QQClaw；不按正文错位的第一/第二称呼判断。保留后来直接指定的黑色为主配色，继续补齐参考主页的交互。

- 长用户消息超过实际八行时默认折叠，提供“显示更多/收起”。按行高和实际内容高度测量，适配窗口、字体及字号；短消息没有多余按钮，纯附件消息没有空文字气泡。全文仍在 DOM 和后台原消息中，折叠不会截短发给 Codex 的内容。
- 顶部“会话目录”列出当前会话所有用户提问和纯附件消息；按全文搜索，可用方向键/Home/End/Enter 定位，Escape/Tab 返回入口，切换会话或点击外部时关闭目录。文字使用 textContent，不把消息内容当 HTML；点击时核对会话及原消息身份，过期目录不能跳到另一条消息。
- 已展开消息、各会话历史阅读位置及目录筛选在普通后台刷新中保留。会话切换后回到原先的历史位置；阅读锚点核对原消息，避免直接复用另一个会话的滚动像素。以上均只在进程内保存，不宣称跨应用重启保存草稿、展开或目录。
- 实测发现旧 max-width:850px 样式直接隐藏全部顶部面板图标，新目录也因此消失；已改为保留图标，网页预览在窄窗口显示带标题/无障碍标签的紧凑图标，原入口仍可操作。

检查材料在项目外 `C:\Users\admin\AppData\Local\Temp\qqclaw-v0319-20261031`。`conversation-ui.json` 的 29 条真实 EXE 检查、`appearance-ui.json` 的 26 条图片/黑白主题检查、`layout-ui.json` 的 13 条布局重启和边界检查及 119 项核心回归均通过，前端错误列表为空。全部使用隔离 DPAPI 数据和示例消息，未向原微信账户发消息，未执行模型任务。第一次会话检查发现并修复窄窗口入口隐藏；随后快照比较发现 Store 初始化已清理夹具 assistant 结尾空白，改为对比初始化后的真实快照，再完整重跑，没有删除“操作不改消息/模型/任务”的断言。

Windows 在确认运行/排队/待回复均为 0 后正常退出、备份、替换同名 EXE 并重启。`replacement-v0319/after.json` 确认原 2 个账户、3 个会话、134 条消息、目录绑定、threadId 和 Provider URL/Key 全部保留。正式 EXE 为 629,760 bytes，SHA-256 `3C8F78CEBB41D4B2CA57C3060EBBACFBC9654171F36F752F13A27F92C08EC84F`；PID 142464，资源目录 `C:\Users\admin\AppData\Local\QQClaw\app\2A26FB5D512BC642`，`.complete=0.3.19`。`runtime-audit.json` 核实运行后台和全部 UI 资源匹配 EXE 内嵌内容及 CSS/HTML 源码。

代码提交为 `fa9ff369b81070673ba96e8de46f35f09528b062`，[Mac 云构建 41210396857](https://github.com/mumuhaha487/wechatclaw/actions/runs/41210396857)成功。已读取实际 16 条 PASS 输出，覆盖 Universal 双架构、安装映像/签名、菜单/主题、原生手动网页与 dispose、布局/附件经钥匙串及后台重启恢复、文件快照/审阅等既有范围。新目录/折叠/阅读交互的 29 条完整产品 UI 检查运行于 Windows；Mac 本次验证其 Safari 目标打包及既有原生链路，**没有把这些写成新增交互已在 Mac 实机完整验证**。

artifact ZIP 摘要 `83F0C238DBA0B753A878873048F79115560B45537010348FF53089BD05C18B6A` 与 GitHub 上传 digest 一致，ZIP CRC 与 DMG UDIF 尾通过。`macos-release.json` 保存完整元数据。正式 Mac 安装包 `release/macos/QQClaw.dmg` 为 705,078 bytes，SHA-256 `CD8B20C160793B5512EE6236C1175E46E2145FA8211DD8BE007CBA0B0A3A218F`，旧 DMG 在项目外备份。项目仍各保留一份 EXE/DMG，测试、依赖、截图、备份和旧成品均在项目外。Mac 未 Apple 公证、未用户实机完整 GUI/输入法/线上微信验收，Swift 5 中既有主线程隔离警告仍为 7 条，未宣称 Swift 6 严格模式通过。

官方 ChatGPT 扩展授权/自动调用仍未接通，不能把新增目录、手动网页或外观检查当作该目标完成。参考主页的网页批注、下载/网站权限/完整历史、全部菜单及跨平台人工 GUI 等差异继续保留，整体目标保持 active。


## 0.3.20 白色为主、黑色为辅

本轮最新直接要求为“要以白色为主，黑色为辅，整体亮色”，覆盖此前的黑色为主偏好。当前聊天和输入区为白色，侧栏/框架为浅灰，文字及主要按钮为黑灰色。没有沿用旧深色默认，也没有重新引入绿色强调色。

代码索引：`backend/store.mjs` 默认 `theme=light`，`appearanceVersion=4` 将旧外观一次迁移到亮色；之后主动选择暗色/系统主题会保留。`ui/app.mjs` 初始状态、`ui/index.html` 首帧及 `ui/desktop.css` 均使用亮色。Windows `native/Program.cs` 的启动窗口/WebView2 背景为白色，Mac `native/macos/QQClaw.swift` 的窗口/WebKit 初始为 aqua/白底，两端 `window.theme` 仍支持动态切换。`.github/workflows/macos.yml` 的新数据默认断言同步为 light/version4。

输入框自动增高前后捕获和恢复阅读状态：已经在底部时继续跟随，阅读历史时保留消息锚点。新增检查最初失败；定位发现固定等待500毫秒时，长历史的平滑滚动还没到达底部。改为先等待实际滚动几何达到底部，再检查输入后的高度和位置，保留原来的严格底部/历史锚点断言，最终通过。实际输入前距底部2.333像素；输入框从60增至180像素后，距底部约-0.333像素（DPI舍入）。没有把未完成滚动直接当成产品缺陷，或通过放宽断言掩盖问题。

证据位于项目外 `C:\Users\admin\AppData\Local\Temp\qqclaw-v0320-20261031`：

| 证据 | 实际范围及结果 |
| --- | --- |
| `conversation-ui.json` / `.mjs` / `.log` | 32条真实候选EXE检查通过：新安装亮色、长消息全文/折叠/目录与键盘、会话独立阅读位置、状态刷新、四种窗口及大字号、长草稿增高跟随/历史锚点、展示操作不改消息或触发模型任务 |
| `appearance-ui.json` / `.mjs` / `.log` | 26条通过：真实DPAPI旧dark/version3数据升级至light/version4、白底黑字、灰阶强调色、历史图片及6000×240/240×6000/4000×3000图片、四种窗口内等比缩放/关闭/底栏、大字号、主动暗色重启保留、切回亮色重启保存、网页空页 |
| `layout-ui.json` / `.mjs` / `.log` | 13条通过：禁用网页存储后的加密布局保存、当前会话/项目折叠/侧栏及普通面板宽度与开关、重启和文件管理器加载、四种窗口边界 |
| `regression.tap` | 119项既有核心回归通过；运行于本版后端，之后未修改后端代码 |
| `QQClaw-0.3.20-light.png` / `...light-panel.png` / `...tall-image.png` | 已查看实际隔离EXE截图：白色聊天和网页面板、浅灰侧栏、长图在弹窗剩余空间内完整等比显示。图片识别回复为此前检查的历史，不冒充本轮新模型执行 |
| `candidate-source-match.json` | 编译候选与最终9份相关源码逐字节一致；后续仅更新报告文档 |
| `replacement-v0320/before.json` / `after.json` / `runtime-audit.json` | 替换前运行/排队/待回复均为0，备份加密数据和旧成品后正常关闭、替换唯一EXE并重启；原2账户、3会话、134消息、身份/目录绑定、threadId及逐条消息、Provider URL/Key保留。主题迁移为light/version4，运行资源及源码一致 |

以上71条UI检查的未捕获前端错误列表均为空。检查使用隔离数据，未向原微信账户/原会话发送测试消息，也未执行模型任务。图片通过实际自然尺寸和容器几何核验，没有仅用裁剪隐藏溢出。

Windows正式EXE为629,760 bytes，SHA-256 `9E1C05A8F37F94EAFA5EFF64A9D6C615BE9A9147CB647E02A5ECE9CBE8B3FF7E`。正常重启PID为154932，运行目录为 `C:\Users\admin\AppData\Local\QQClaw\app\20B5F21A41E2BC1F`，`.complete=0.3.20`。后台和全部UI资源匹配EXE内嵌内容，CSS/HTML也与项目源码一致。

运行代码提交 `0c814fcaac90e18583bd9c172577c23de216b1f8`，已推送指定仓库；[Mac云构建41211705711](https://github.com/mumuhaha487/wechatclaw/actions/runs/41211705711)成功，已读取实际执行的16条PASS：Universal x86_64/arm64、DMG校验/只读挂载/安装复制、签名和系统库、Node发现、AppKit菜单/主题切换、手动WKWebView与最后标签关闭及dispose、附件与布局经原生管道/钥匙串加密后重启恢复、文件快照/权限/回滚/冲突及任务审阅保存。新增目录/折叠/阅读交互的完整产品UI检查运行于Windows，未称为Mac用户实机完整GUI验收。

`macos-release.json` 和 `logs-41211705711.zip` 保存核验结果。artifact ZIP SHA-256 为 `4CA58B3516A85D667453405C9A8147867977B6947AF0883D7679655F73F64AB6`，与上传日志digest一致；ZIP CRC、唯一DMG条目和UDIF文件尾均通过。旧包在项目外备份后替换同名DMG，最终成品如下。项目内没有新增测试、截图、依赖、备份或旧版。

| 唯一成品 | 大小 | SHA-256 |
| --- | --- | --- |
| `release/QQClaw.exe` | 629,760 bytes | `9E1C05A8F37F94EAFA5EFF64A9D6C615BE9A9147CB647E02A5ECE9CBE8B3FF7E` |
| `release/macos/QQClaw.dmg` | 705,042 bytes | `407D47BBED66B74421F9457580EA3CE298255F09077665D14338E094090B5FA8` |

本阶段亮色调整已按上述范围验证并交付两端成品，整体目标保持未完成。官方ChatGPT扩展授权/自动调用仍未接通，网页批注、完整历史/下载/权限及全部主页菜单1:1仍有差异。Mac未Apple公证、未用户实机完整GUI/中文输入法/线上微信验收；Swift5模式的既有主线程隔离警告仍保留，不宣称Swift6严格模式通过。这些限制不因本轮亮色变化而消失。


## 0.3.21 全文搜索、消息定位与会话内查找

上一阶段0.3.20的亮色默认、图片边界和两端成品替换有实际交付证据，属于实质进展。本轮继续对照已读取的参考主页补齐操作，发现旧搜索入口只查名称/目录，无法查正文，顶部也缺少明确的会话省略菜单。

新增 `ui/message-search.mjs`：全局搜索覆盖全部已保存消息、过程文字和附件名，保持字面量大小写不敏感匹配，特殊字符不作为正则。空查询每个会话列一次，非空查询按元数据/具体消息列出，按最近更新会话排序；每次展开60条，显示完整总数。结果含角色/原文片段，使用textContent/文字节点高亮，不把内容当HTML。结果不变的后台快照保留DOM节点，避免打断点击或焦点。跳转前核对原会话及消息身份，展开折叠区并定位原消息；会话被移除时清除旧结果并返回查询框。

会话内查找支持Ctrl/⌘+F、编辑菜单及顶部省略菜单。Enter/F3或Ctrl/⌘+G前进，Shift反向并可循环，Escape关闭。按实际渲染文字收集完整位置，支持跨Markdown粗体等文本节点匹配，保留代码与链接结构。最后补充独立段落/附件边界分组：行内粗体/链接可跨节点匹配，独立段落、代码区块和附件之间不会拼出假匹配；最终候选的新增3条边界检查通过。所有出现都参与计数和导航，只为当前消息中所选匹配附近最多201处创建标记；4000处密集重复词的完整计数、末尾导航和节点上限已实测。关闭或清空移除标记，切换会话关闭局部查找，刷新保留查询/焦点/阅读位置；不改源消息、模型或草稿。

查询上限512字符，查询/高亮仅在进程内保留。全局搜索基于已保存原文；局部查找基于渲染正文和显示的附件名称。未发送草稿、未完成实时流和网页内容不在会话搜索范围内。本轮不以这些显示状态冒充Codex对话存储。

检查发现并修复两个实际问题：窄窗口的覆盖面板出现时，查找栏会挡住面板关闭按钮，现暂时隐藏并保留查询，面板关闭后恢复。查找命令/搜索结果需要展示聊天时先收起遮挡面板；从设置页执行局部查找会回到当前对话。新顶部省略菜单被旧外部点击监听立即移除，已补齐入口识别。两次失败材料保留在项目外，修正后完整重跑60条新UI检查，没有用强制点击或放宽边界断言掩盖问题。

代码索引：`ui/message-search.mjs`、`ui/conversation-view.mjs` 的reveal、`ui/app.mjs`、`ui/application-menu.mjs`、`ui/desktop.css`；Mac菜单和hasSession门禁在 `native/macos/QQClaw.swift`，原生验证在 `.github/workflows/macos.yml`。Windows原生仅更新版本；本轮未修改微信/Codex后台和存储源码。

材料在项目外 `C:\Users\admin\AppData\Local\Temp\qqclaw-v0321-20261031`：

| 证据 | 实际范围及结果 |
| --- | --- |
| `search-ui.json` / `.mjs` / `.log` | 60条真实EXE检查通过：跨会话正文/字面量/附件/HTML安全、折叠区定位、75结果分批及全部访问、键盘/焦点/不变节点、跨Markdown高亮、循环/F3/4000处密集匹配、清空/代码结构、草稿/阅读位置、四窗口/大字号、覆盖面板/设置页/菜单、移除旧结果及不改消息/触发任务 |
| `conversation-ui.json` / `.mjs` / `.log` | 最终候选32条既有长消息/目录/阅读位置及长草稿增高检查通过 |
| `layout-ui.json` / `.mjs` / `.log` | 最终候选13条禁用网页存储后的加密布局/当前会话/面板、重启及四种窗口边界检查通过 |
| `search.test.mjs` / `search.tap` | 8项只读搜索语义检查通过：最近顺序、真实消息索引、特殊字符、附件/emoji、目录、过程、长消息末尾和不改原数据 |
| `regression.tap` | 119项核心回归通过；本轮后台未修改，后续UI修正没有冒充重跑后端检查 |
| `QQClaw-0.3.21-fulltext-search.png` / `...chat-find.png` | 已查看实际隔离EXE截图，白底/浅灰/黑色，搜索弹窗按内容收缩，局部查找使用灰阶高亮 |
| `candidate-source-match.json` | 最终候选与9份相关源码逐字节一致，云验证工作流不冒充EXE内资源 |
| `search-ui-first-failure.log` / `search-ui-second-failure.log` / 对应PNG | 分别定位覆盖面板关闭按钮被挡、顶部省略菜单立即消失，未删除失败记录 |

105条最终UI检查的未捕获前端错误列表均为空，全部使用隔离DPAPI数据和示例消息，未向原微信账户/会话发送测试消息，未执行模型任务。0.3.20的26条图片预览矩阵属于上一版本证据，本轮未重新执行全部图片矩阵，不把旧检查写成本版新执行。

Windows确认运行/排队/待回复均为0后，备份加密状态及旧成品，正常关闭、替换唯一EXE并重启。第一次替换后2账户/3会话/134消息及身份/绑定/逐条消息/Provider比较全部通过；最终边界补丁替换后的复核发现账户数变化。最终数据复核为1个连接账户、1条已断开身份记录、3个会话、134条消息。缺少的原账户ID/用户身份与retainedAccounts完全对应，记录仅含身份，不含登录令牌；当前源码只有显式wechat.disconnect路径会移出账户并写该记录，启动迁移不会移出账户。该状态与断开连接流程一致，但现有日志没有调用者/时间审计，不能确定是谁何时断开，也不能将其写成原2个连接账户均保留。原会话/threadId/逐条消息、剩余账户目录绑定及Provider URL/Key比较均通过；没有恢复已断开账户。安全比较见项目外account-audit.json。

最终重启PID为150120，运行目录 `C:\Users\admin\AppData\Local\QQClaw\app\E1DD6A17A1717F20`，`.complete=0.3.21`。`runtime-audit.json` 确认后台和全部UI与EXE内嵌资源一致，CSS/HTML与源码一致。当前运行/排队/待回复均为0。

代码提交 `2cfaf206ab23e3eb4857eb54e9fa47b3935a2674`，[Mac云构建41214700663](https://github.com/mumuhaha487/wechatclaw/actions/runs/41214700663)成功。已读取实际17条PASS，新增AppKit搜索/查找快捷键、无当前会话时禁用查找及事件送达WebKit的检查；其余双架构、DMG校验/只读挂载/安装复制、签名/系统库、Node、菜单/主题、手动网页/最后标签/dispose、钥匙串及布局/附件/后台重启、文件快照/权限/冲突/回滚和审阅保存继续通过。60条新产品UI运行于Windows，没有冒充用户Mac完整GUI验收。Swift5既有主线程隔离警告保留，未Apple公证。

artifact ZIP SHA-256 `D76D5A5DA2FE7620C7F2B1544C1E0490D2206BACBFD784C70D4E6971AFA2B077` 与GitHub上传digest一致，ZIP CRC、唯一条目和DMG UDIF尾通过。旧DMG在项目外备份后替换；项目仍各保留一份同名成品，测试、截图、依赖、备份及旧包都在项目外。

| 唯一成品 | 大小 | SHA-256 |
| --- | --- | --- |
| `release/QQClaw.exe` | 634,368 bytes | `F94CF493BB29F8E2FDE7D46A7016BB439EADC5EF07392B777F1A696907DE7708` |
| `release/macos/QQClaw.dmg` | 712,569 bytes | `4C96EB665178E2B8C46EF210238DD546BEC9B91B4768F5169799B0D825003DD5` |

本阶段有实质主页功能改进并交付两端成品，整体目标仍未完成。官方ChatGPT扩展授权/自动调用未接通；网页批注、下载管理、网站权限/完整历史和全部菜单1:1，及Mac完整人工GUI/中文输入法/线上微信仍未完成。没有以手动网页、界面检查或其他远控充当官方扩展成功。后续继续补齐主页交互，并解决官方支持的独立宿主连接接口。


## 0.3.22 混合标签完整操作与地址输入竞争修复

上一阶段亮色、全文搜索与两端成品有实际交付证据，属于进展。本轮重新核对参考主页，保留白色为主、黑色为辅，继续补齐工作面板标签操作；不宣称主页所有行为1:1或官方自动浏览已完成。

0.3.22：文件/网页标签支持拖动排序、鼠标中键关闭和右键菜单（关闭、关闭其他、关闭右侧、复制路径/地址、文件夹显示或系统浏览器打开）。Shift+F10打开菜单，方向键/Home/End选项，Escape/Tab关闭并恢复焦点。关闭其他会包含当前文件管理器/审阅工具页；异步关闭始终绑定原会话和实际标签对象，不会误关另一会话。

排序同时适用于文件与网页，保留当前选择、文件阅读位置和原生页面；网页状态更新不会把顺序改回原生创建顺序。拖动超出标签栏或按Escape时取消，拖动期间支持靠近左右边缘滚动。菜单不会因右键后台标签而切换内容；关闭全部后保持空组。关闭其他包含活动工具页，禁用无效操作；异步操作捕获原会话/目录和实际标签对象，关闭等待期间可以切换并使用另一会话，新会话中同名文件不受影响。标签移除、会话切换、菜单归属变化时旧菜单失效。

修复新建原生网页标签时完整刷新清空地址输入的竞争：创建期间禁用地址输入，完成后恢复；每个网页标签单独保留未提交地址草稿，后台刷新和切回标签不丢失，提交后显示真实URL。地址草稿、标签顺序和菜单状态仅在进程内保存。

实测发现并修复两类实际问题，保留失败证据：首次新建网页后立即填写地址，原来的完整render会清空输入，现按标签保留并为新建过程设明确门禁。拖动后的全局250毫秒点击抑制会吞掉下一次正常点击，现由下一次pointerdown清除，仅阻止拖动产生的click；重新完整验证了排序后点击网页、中键关闭及后续操作。另补充文件管理器/审阅工具页也属于“关闭其他”的目标，避免剩下未关闭的可见工具标签。

源码索引：新 `ui/panel-tab-actions.mjs`、`ui/panel-tabs.mjs` 的move、`ui/app.mjs` 的closePanelTabs/地址草稿与新建门禁、`ui/desktop.css` 的中性拖动指示与菜单边界。Windows宿主及包版本更新0.3.22；后台微信/Codex/存储源码未修改，最终backend.cjs摘要与0.3.21相同。云验证补充在 `.github/workflows/macos.yml`。

材料在项目外 `C:\Users\admin\AppData\Local\Temp\qqclaw-v0322-20261031`：

| 证据 | 真实范围与结果 |
| --- | --- |
| `tab-actions-ui.json` / `.mjs` / `.log` | 最终候选44条通过：文件/原生网页混合排序、Escape取消、排序后正常点击、中键关闭、菜单键盘/禁用/焦点、关闭其他/右侧/工具页/最后标签、完整刷新与分标签地址草稿、新建门禁、延迟关闭跨会话隔离、原会话删除后菜单失效、四种窗口菜单边界、不改存留消息/模型/任务 |
| `search-ui.json` / `.mjs` / `.log` | 最终候选60条搜索与局部查找回归通过 |
| `conversation-ui.json` / `.mjs` / `.log` | 最终候选32条长消息/会话目录/阅读位置/草稿增高回归通过 |
| `layout-ui.json` / `.mjs` / `.log` | 最终候选13条禁用网页存储后的加密布局/重启/窗口边界通过 |
| `tab-order.test.mjs` / `tab-order.tap` | 4项通过：混合顺序与对象/阅读状态、前后移动、无效/跨组目标、原生更新保序 |
| `regression.tap` | 本版119项既有核心回归通过；最后前端工具页补丁后未重复后端回归，后台资源未变 |
| `first-tab-actions-ui.log` / 对应失败PNG | 定位新建网页的地址输入被刷新清空；保留真实失败 |
| `second-tab-actions-ui.log` / 对应失败PNG | 定位拖动后下一次正常点击被吞；保留真实失败 |
| `QQClaw-0.3.22-tab-menu.png` | 已查看最终候选真实白底/灰阶菜单截图；展示隔离样例，不是线上微信或官方自动浏览 |
| `candidate-source-match.json` / `runtime-audit.json` | 候选与相关源码一致；正式前后端/UI/CSS/HTML与EXE内嵌资源及样式源码一致 |

149条UI检查未捕获错误列表均为空，使用隔离DPAPI数据与本地HTTP网页，没有向原微信账户/会话发消息或运行模型。延迟关闭检查只暂缓该隔离UI发出的closeTab请求，随后释放给真实原生后台，核对原生标签确已删除；不是只删除前端DOM。0.3.20的26条图片矩阵和0.3.21的8项只读搜索语义属于既有证据，本版未冒充重新执行这些检查。

Windows最终替换前核对运行/排队/待回复均为0；保留初始加密状态及旧成品备份，正常退出并替换唯一EXE。当前保留1个连接账户、1条断开身份、3个会话/134条消息，账户身份/目录绑定、断开身份、原生threadId/逐条消息、Provider URL/Key比较均通过；没有恢复0.3.21中已经断开的账户，也没有将原来的账户变化说成已确定是用户操作。`replacement-v0322/after.json` 保存安全比较，不输出凭据。

最终Windows进程PID `155788`，资源目录 `C:\Users\admin\AppData\Local\QQClaw\app\9465646A206F9C17`，`.complete=0.3.22`；`runtime-audit.json`核对所有实际资源。当前后台SHA-256为 `25AE1A12BA8B268FA94E4A0190518E9E70EA345127C1EBD42D9C6200A4213A09`。

代码提交 `bcfbf447316f447a08f0eb0605d124b8c809be07`，[Mac云构建41216927758](https://github.com/mumuhaha487/wechatclaw/actions/runs/41216927758)成功。已读取实际18条PASS；新增真实WebKit组件菜单/焦点/禁用/归属验证，其他原生安装、双架构、保存及文件快照检查保留。组件使用DOM事件和记录回调，**不是Mac整套产品GUI或可信鼠标拖动/中键实机检查**。Swift5既有主线程隔离警告保留，未宣称Swift6严格模式通过。

artifact ZIP SHA-256 `C161863CFED32179896FC9320B4E434EE3B0DFE44D7253AED1ECF17196819E2C`与上传digest一致，ZIP CRC、唯一DMG条目和UDIF尾通过。旧包均备份在项目外，项目仍各保留唯一同名成品：

| 唯一成品 | 大小 | SHA-256 |
| --- | --- | --- |
| `release/QQClaw.exe` | 636,928 bytes | `2D64AAD6097364A1D24FDBC19E295A48C99A57C3A153BF4C421F95BC42E73035` |
| `release/macos/QQClaw.dmg` | 716,136 bytes | `3B27F67B654C0C995DBC09C62D29AF42336D363A169B1FA0DBE979A1067FD159` |

本轮有可核对的主页交互进展，整体目标仍未完成。官方ChatGPT扩展授权及自动调用尚未接通；网页批注、下载管理、网站权限/完整历史及全部参考主页1:1仍有差异。Mac仍未Apple公证、用户实机完整GUI/输入法/线上微信验收。没有将手动预览、组件夹具或其他远控当作官方扩展成功。


## 0.3.23 亮色核验与原生下载管理

保持最新要求的白色为主、黑色为辅：聊天/网页/弹窗白底，侧栏与选中项浅灰，文字/图标及进度条黑灰。最终真实EXE重新执行26条亮色与图片检查，覆盖旧dark/version3迁移、主动选色的重启保留、6000×240/240×6000/4000×3000图片、四窗口及20号字体。已查看真实候选截图；历史图片识别回复为既有检查数据，不冒充本轮新模型调用。

本轮完成上一阶段尚在开发的原生下载：Windows DownloadStarting/WebView2DownloadOperation、Mac WKNavigationPolicy.download/WKDownloadDelegate执行真实下载。网页工具栏及外侧导航均可打开下载面板，显示原生字节进度，未知总长不伪造百分比；支持取消、打开、文件夹显示、刷新及清除终态记录。打开/显示按不透明ID查原记录，不接受调用者路径；文件移走/删除时禁用打开。50条一批、滚动/焦点循环/Escape恢复入口，进度事件不刷新整段对话。

文件保存在系统Downloads/QQClaw的独立目录，建议名称去路径/非法字符并限长，同名不覆盖。元数据单独写到用户数据browser-downloads.json，Windows用独立entropy的DPAPI，Mac用Vault/Keychain/AES-GCM，原子写入且独立于state.json及会话。关闭标签/移除会话保留在途源视图，终态后释放；退出整个应用会中断，重启把遗留running标interrupted并提示原网页重试，没有暂停/自动续传。清记录不删文件。历史损坏/保存失败保留旧文件并提示，仍可取消内存中真实在途下载。

实际发现并修正：Windows短响应重试返回新.NET wrapper，旧实现留下永远running的记录；最终按源页面/导航ID/URL关联同次下载、解除旧wrapper事件且不Cancel同一原生下载。Mac转下载的WebKit policy102曾被误报Frame load interrupted，现只在已决定转下载时处理并等待didBecome。保存历史失败曾连取消也禁用，现两端/UI均保留取消。初次检查只等16秒不足，观察约60秒收到原生Completed；产品没有按字节收齐伪报完成，也没有禁用系统下载检查。仅凭这些事件不能断言具体延迟原因。

代码索引：ui/browser-downloads.mjs、ui/app.mjs、ui/icons.mjs、ui/desktop.css；native/BrowserHost.cs、native/Program.cs；native/macos/BrowserHost.swift、native/macos/QQClaw.swift；.github/workflows/macos.yml。侧栏/关于页版本从package.json构建导入，避免显示旧版本。微信/Codex后台及主对话存储源码未变。

证据目录：`C:\Users\admin\AppData\Local\Temp\qqclaw-v0323-20261101`。

| 证据 | 实际范围与结果 |
| --- | --- |
| downloads-ui.json/.mjs/.log | 最终EXE32条：真实文件摘要、已知/未知总长、同名独立保存、异常名称、面板/焦点、取消、最后标签关闭后完整下载、短响应重试真实中断、整个应用重启保留终态及中断状态、文件丢失/伪造ID拒绝、四窗口边界、清记录不删文件 |
| download-storage-ui.json/.mjs/.log | 最终EXE7条：真实历史写入冲突、错误提示、取消仍可用、实际取消、保留原加密文件 |
| download-edge-*.json / download-edge-ui-*.log | 最终EXE10条：损坏历史、历史位置为目录、下载根为文件，均不宣称成功、不留running记录，保留原数据和原因 |
| appearance-ui.json | 最终EXE26条亮色/图片/字号/重启检查 |
| tab-actions-ui.json / search-ui.json / conversation-ui.json / layout-ui.json | 最终EXE44+60+32+13条回归 |
| regression.tap | 本轮119项核心回归；之后仅改原生/UI，后台源码未变，不冒充每次候选都重跑后台 |
| candidate-source-match.json | 最终候选与61份代码/样式/资源/构建文件逐字节一致，之后仅更新文档 |
| cloud-source-match.json | 最终Mac云run的相关原生/UI/版本/构建源码与项目规范化换行后匹配 |
| failure-notes.md、earlier-candidate、download-diagnostic.mjs、download-data-qoYrzF/download-trace.txt、logs-41218678365.zip | 保留早期失败、wrapper诊断、Mac原生失败；部分早期完整堆栈仅在聊天工具输出，最终源码无临时诊断注入 |

最终Windows共224条UI/原生集成检查，未捕获前端错误均为空。均用隔离DPAPI数据和本地HTTP文件，没有向原微信账户/会话发测试消息，也没有运行模型。打开/文件夹按钮的系统应用启动未完整人工验收；接口ID校验/缺失文件拒绝已检查。单页HTML download属性的多次同时点击、blob及所有复杂站点下载未完整覆盖，不把本地HTTP夹具写成所有网站兼容。

Windows替换前确认无运行/排队/待回复任务，保留初始加密状态及旧EXE/DMG，正常退出、替换同名EXE并重启。保留1个连接账户、1条断开身份、3会话/134消息；身份/目录绑定、断开身份、原生threadId/逐条消息、Provider URL/Key比较均通过。没有恢复此前断开账户，也没有把0.3.21账户变化断言为用户操作，见replacement-v0323/after.json。

正式Windows PID `139792`，资源目录 `C:\Users\admin\AppData\Local\QQClaw\app\6142D3C61E8B92C5`，.complete=0.3.23。runtime-audit.json核对前后端及UI/CSS/HTML与内嵌资源/源码，当前busy/queued/pending均为0。

[Mac云构建41219830143](https://github.com/mumuhaha487/wechatclaw/actions/runs/41219830143)成功，代码`d6c620932aa8959242dced31e6a57a90bd96e2ee`，读取实际22条PASS。新增真实WKDownload字节、关闭最后标签后完整下载、取消、Keychain加密历史重建实例读取、清记录不删文件、真实保存失败后仍可取消；保留双架构/安装/菜单/主题/后台/主数据/附件/布局保存及快照审阅检查。Mac下载历史检查为重建管理器，整个产品重启的下载检查在Windows，不冒充Mac整套GUI验收。Swift5既有主线程隔离警告保留，未Apple公证。

artifact ZIP SHA-256 `8917656B09D7DA36BF8D220E82BE361419C424A77E1149E43F6CA947E398DD79`与上传digest一致，ZIP CRC、唯一DMG及UDIF尾通过。旧包/截图/依赖/脚本/日志/备份均在项目外，项目成品各一份：

| 唯一成品 | 大小 | SHA-256 |
| --- | --- | --- |
| release/QQClaw.exe | 653,824 bytes | 8929A301D88BFE4E6EF011A32690E7BB663AD7462B34F8919A567D1C103AC38A |
| release/macos/QQClaw.dmg | 776,223 bytes | A900EC41E8759A45C472B967B1A50B31A4FE0F0EA9DCF13E1ABDDF50657DED52 |

本轮有实际两端交付，整体目标仍未完成：官方ChatGPT扩展宿主授权/自动调用尚未接通，网页批注、网站权限/完整历史及全部参考主页操作1:1仍有差异。Windows某些首次下载可能较久等待原生完成；复杂网站和Mac完整产品GUI/输入法/线上微信未验收。不把手动网页下载、组件夹具或其他远控当作官方扩展成功。

## 0.3.24 网页框比例、顶部对齐与浏览记录

用户新截图显示：参考网页框从工作区顶部开始，旧 QQClaw 的面板却被整个会话标题和 Desktop 提示条下推，导致高度、宽度占比都不同。本版将 `content-area` 改成并列的 `conversation-pane` 和右侧工作面板，标题、环境/Desktop 提示只占左侧。默认面板取窗口宽度 28.7%，受 280～560px 及聊天剩余空间约束；主动拖动后的像素宽度跨重启保留。双击分隔线清除旧 panel-width，恢复随窗口变化的默认比例。继续支持键盘调整、收起、真正关闭和展开还原；窄窗口是可关闭覆盖面板。白底、浅灰、黑色文字及图标不变。

新增手动网页地址栏历史联想和浏览记录管理：Windows 成功顶层 NavigationCompleted、Mac didFinish 记录最终页面，不记空白页、错误加载或下载导航；仅接受无凭据 HTTP(S)，去 fragment，同 URL 保留最近一次，全局最多 500 个不同 URL。加载后的标题更新保留记录 ID/访问时间，不重建已经删除的记录。当前系统用户在 QQClaw 内跨会话共用，不按微信账户隔离，不导入 Chrome 历史，不自动发送给模型。

网页工具栏及运行环境设置提供历史入口；地址建议最多 6 条，按标题/URL 字面搜索，方向键/Enter/Escape 操作并保留输入焦点。管理弹窗每批 50 条，搜索覆盖全部记录；支持重开、单条删除和确认清除最近一小时/一天/全部。清除不删除网页登录状态、下载文件或聊天。记录单独保存至用户数据 browser-history.json：Windows 用 entropy QQClaw/browser-history/v1 的 DPAPI，Mac 用 Vault/Keychain/AES-GCM，均原子写入；失败保留原文件/旧内存并显示原因，普通浏览可继续使用。未承诺所有 SPA pushState/hash 导航、完整 Cookie/缓存/网站权限管理或模型申请访问历史。

代码索引：新 `ui/browser-history.mjs`；`ui/app.mjs` 的布局、defaultPanelWidth/applyPanelWidth/resetPanelWidth/syncPanelDimensions、历史事件与导航清地址草稿；`ui/desktop.css` 的比例/对话独立列/记录弹窗；Windows `native/BrowserHost.cs` / `native/Program.cs`；Mac `native/macos/BrowserHost.swift` / `native/macos/QQClaw.swift`；验证构建 `.github/workflows/macos.yml`。原生 browser.history 为桌面 UI 提供 state/remove/clear，browser-history 事件带全局单调 revision。没有向模型开放原生浏览自动化；微信/Codex 后台及主 Store/对话归档源码本轮未改，backend.cjs 与 0.3.23 相同。

全部材料在项目外 `C:\Users\admin\AppData\Local\Temp\qqclaw-v0324-20261101`：

| 证据 | 最终候选实际范围与结果 |
| --- | --- |
| panel-proportion-ui.json/.mjs/.log | 27 条：真实原生网页；1950/1800/1600/1366/1100/960 窗口顶部/高度/默认比例/覆盖边界、键盘、双击恢复、自适应、主动宽度跨重启、展开还原及关闭后主对话恢复 |
| history-ui.json/.mjs/.log | 47 条：真实导航/最终 URL/标题/重访/重定向、错误/下载排除、建议键盘与真实导航、管理搜索/HTML 安全/焦点、窗口/20 号字边界、DPAPI 加密/整应用重启、单条/范围删除确认/取消、延迟标题/删除不重建、真实写入冲突/损坏保留、500 URL/50 行分批及不改会话/触发任务 |
| download-storage-ui.json / downloads-ui.json / download-edge-*.json | 7+32+4+3+3 条原生下载与异常保存回归 |
| appearance-ui.json / tab-actions-ui.json / search-ui.json / conversation-ui.json / layout-ui.json | 26+44+60+32+13 条亮色/图片/标签/搜索/长消息/持久布局回归 |
| regression.tap | 本轮 119 项核心回归通过；之后仅修改 UI/原生，未冒充每次候选重跑后台 |
| candidate-source-match.json / cloud-source-match.json | 最终 Windows 候选与 62 份当前代码/样式/资源/构建文件逐字节一致；Mac 成功 head 的同 62 份文件按换行规范化后匹配，文档后续单独更新 |
| QQClaw-0.3.24-light-proportions.png / light-history.png / light-history-suggestions.png | 已查看真实隔离 EXE 截图：右侧从主体顶部开始且宽度按参考比例；实际原生本地网页、亮色记录弹窗和建议菜单 |
| failure-notes.md / earlier-candidate / 失败 PNG / logs-*.zip | 保存本轮失败原因和现存材料；部分早期完整堆栈仅在工具输出，不称全部有独立完整日志 |

最终 12 份 Windows 检查 JSON 的修改时间均晚于最终 build.json，合计 **298 条**，未捕获前端错误列表均为空。检查全部用隔离 DPAPI 数据和本地 HTTP 页面，没有向原微信账户/原会话发测试消息，没有运行模型。比例检查使用原生 state 的真实标题、产品 UI 操作及全窗口截图，没有执行独立 WebView 像素截图断言，也没有开放原来禁止的自动化命令。截图中的页面是隔离本地夹具，不是官方自动浏览或线上网站验收。

真实失败及修正保留：选择历史建议后原地址草稿遮住真实 URL，已在导航前清草稿；测试直接 RPC 建首标签跳过选中步骤、异步历史未加载即数行、隐藏页固定 300ms 读标题，均修正为实际 UI 导航及等待真实状态，没有放宽 ID/时间要求。覆盖面板内部框与含边框外框的 2px 差改为明确计算，不允许页面实际越界。比例检查曾请求被禁止的 snapshot/screenshot，返回不支持；最终没有新增自动化入口。一次编译因隔离测试占用候选而拒绝，等正常退出后重编，未停止正式程序。同步的换行噪声已按各文件基线修正，无关 license 修改未覆盖。

Windows 替换前再次确认 busy/queued/pending 均为 0；只执行一次初始备份，正常 CloseMainWindow 后替换同名 EXE 并正常重启。当前 1 个连接账户、1 条断开身份、3 会话/134 消息，账户身份/工作目录绑定、断开身份、原 threadId/逐条正文/时间以及 Provider URL/Key 比较均保留。0.3.21 已断开的身份未擅自恢复，仍不推断调用者/发生时间。安全比较见 replacement-v0324/before.json、after.json，凭据不打印；旧 EXE/DMG 与初始加密状态在同一项目外备份目录。此数据比较只验证替换保留，不能替代线上模型/微信端到端验收。

正式 Windows PID `135484`，运行资源目录 `C:\Users\admin\AppData\Local\QQClaw\app\FEFC96FA24933968`，`.complete=0.3.24`；runtime-audit.json 确认实际后台及全部 UI/CSS/HTML 与 EXE 内嵌资源一致，样式/HTML 与源码匹配，后台实际从该目录运行。后台 SHA-256 `25AE1A12BA8B268FA94E4A0190518E9E70EA345127C1EBD42D9C6200A4213A09`，检查时运行/排队/待回复为 0。

[Mac 云构建 41223051740](https://github.com/mumuhaha487/wechatclaw/actions/runs/41223051740) 成功，代码 `ea341c16895c120a19e782ed56dfae376edc8714`，artifact `13050024460`，读取实际 **24 条 PASS**。保留双架构、DMG 校验/只读挂载/安装复制、签名/系统库、Node、菜单/主题/后台、钥匙串/附件/布局/重启、快照/权限/冲突/回滚/审阅检查；新增真实 WebKit 导航历史、最终地址/标题、重访去重、加密重载/删除及时间范围/500 URL/损坏保留。Mac 标题 KVO 未单独完成整套产品 GUI 验收，Windows 延迟标题更新已实测。未 Apple 公证、未用户 Mac 完整 GUI/中文输入法/线上微信验收，既有 Swift5 主线程隔离警告未冒充 Swift6 严格模式通过。

失败云 run 41222514994：产品编译成功但新增 Swift 样例复杂字典 map 表达式超时，拆表达式并显式类型后修复。失败 run 41222756561：正文出现就读历史早于 didFinish，改等待真实完成记录并补加载后标题处理。两次失败日志 ZIP 均保留，未计为成功。成功 artifact ZIP SHA-256 `BEEA9C12172A3CF18A67F21E648FF88023EF8BAF25D1AE1CD00123E7900C4827` 与 GitHub 上传 digest 一致，CRC、唯一 DMG 条目及 UDIF koly 尾通过。Mac 旧包先在项目外备份，然后替换唯一 DMG。

| 唯一正式成品 | 大小 | SHA-256 |
| --- | --- | --- |
| release/QQClaw.exe | 663,040 bytes | 55A2616C8D2D3DD2BB2AF5C39D697D4188AA9A72CE8227BA841704B86F50593A |
| release/macos/QQClaw.dmg | 817,113 bytes | E04D6507F9683C8E698AD680C2A44D09C2543C2C61B9C521315FDDCE755B0869 |

本轮官方接口调查继续但没有接通：[MCP Events](https://developers.openai.com/plugins/build/mcp-events) 适用 Work web、Desktop Work+Cloud、dots，需要认证 MCP 与 HTTPS 回调，未给本地 Codex 外部消息触发入口；[desktop-only 插件](https://developers.openai.com/plugins/deploy/desktop-only) 允许本地 stdio 工具，但未提供第三方宿主官方浏览器授权接口。allowlist 限制是正式目录提交，不是所有本地插件一律禁止。此前独立 browser-service 无宿主报告 `The browser access host is unavailable` 的结论没有改变。保存本轮官方资料，但没有借用当前开发聊天的私有令牌/管道/宿主身份，也没有换其他远控或云端替代方案充当完成。

本阶段网页框比例和历史功能有两端交付，**整体目标仍未完成**：官方 ChatGPT 扩展授权/自动调用仍未接通；网页批注、完整站点权限/Cookie/SPA 历史和全部主页行为 1:1 仍有差异，复杂站点、Mac 完整产品实机/输入法/线上微信未验收。只报告上述实际检查通过，不把手动浏览、夹具、进程存在或其他远控当作官方扩展成功。持续 goal 保持 active。

## 0.3.25 真实新标签与 0x8000000E 修复

用户新增截图为 Windows 未处理异常“在意外的时间调用了方法”，HRESULT 0x8000000E。读取现场时已无 QQClaw 进程、旧后端日志没有原生堆栈，不能凭截图倒推出运行成品指纹。随后在本轮未交付的 0.3.25 开发候选中复现同码：第一次链接新窗口能打开，关闭后第二次原生点击被模态异常挡住。新增不干预异常流程的 COM FirstChanceException 日志，实际堆栈为 CoreWebView2Deferral.Dispose -> Complete -> ICoreWebView2Deferral.Complete。本轮候选同时使用 using 与显式 Complete，导致请求结束两次。现仅在 finally 内 Dispose 一次，捕获取消请求的完成异常，未通过关闭默认异常弹窗或忽略未处理异常来伪造通过。根因日志保存于项目外 reproduced-0x8000000E.log，完整失败说明见 failure-notes.md。

主页浏览交互继续补齐：网页 target=_blank / window.open 现在创建真实新原生标签，保留源页面，不再简单拿 URL 导航覆盖源页；支持 POST 表单请求体、opener、命名窗口复用、about:blank 后导航、页面 window.close。Windows 使用源页同一 CoreWebView2Environment，初始化后交回 e.NewWindow；Mac 接受 WebKit 原始 WKWebViewConfiguration 并返回新 WKWebView，由浏览器继续原始请求。关闭来源不误关已建立的新页；关闭最后一页不会重建幽灵标签。每会话仍最多 12 页，其他会话不继承资料；禁止不支持的 file/应用内部 URL，按引擎用户激活规则拦截无手势弹窗。网页不获得 QQClaw 应用消息桥。面板状态只在原浏览器选中时跟随新 activeTab，不抢文件/工具、其他会话或重开关闭的面板。

代码索引：native/BrowserHost.cs 的 NewTab/OpenWindow/CloseTab/EnsureReady/NewWindowRequested/WindowCloseRequested；native/macos/BrowserHost.swift 的 newTab(configuration:)/closeTab/createWebViewWith/webViewDidClose；ui/app.mjs 的 updateBrowserState；native/Program.cs 的 COM 日志观察器；.github/workflows/macos.yml 的真实 WebKit 组件检查。logs/native.log 写入独立用户数据目录，超过 1 MiB 轮换为 .1，不改变默认异常处理。微信/Codex 后台、主存储和原生对话归档源码本轮未改，backend.cjs 摘要仍为 25AE1A12BA8B268FA94E4A0190518E9E70EA345127C1EBD42D9C6200A4213A09。

所有测试、依赖、截图、失败及备份在项目外 `C:\Users\admin\AppData\Local\Temp\qqclaw-v0325-20261101`：

| 证据 | 本轮最终候选实际覆盖 |
| --- | --- |
| popup-ui.mjs/.log/.json、click-native.ps1 | 21 条：真实 Win32 点击链接/脚本新窗口、源页保留、opener/noopener、命名复用、POST 实际方法/请求体、about:blank、页面关闭、非法/无近期手势弹窗、跨会话 Cookie 隔离、后台关闭、关闭面板不重开、关闭来源/最后页、12 页上限、消息/草稿保留；进程正常退出 0 |
| post-popup-native-check.json | 正常退出后隔离数据无 native.log，即该完整流程未记录 COM 异常，不只看状态或进程存在 |
| panel-proportion-ui.json | 27 条：六档真实窗口的顶部/全高/28.7% 比例、拖动键盘宽度、双击恢复、跨重启保留、展开还原和关闭；截图 QQClaw-0.3.25-light-proportions.png 已查看 |
| history-ui.json | 47 条：真实历史、地址建议、导航/标题/持久保存、范围清除、故障保留与边界 |
| download-storage-ui.json / downloads-ui.json / download-edge-*.json | 7+32+4+3+3 条：真实下载、关闭源页仍完成、取消、完整文件字节、写入冲突/损坏/目的地异常 |
| appearance-ui / tab-actions-ui / search-ui / conversation-ui / layout-ui 的 JSON | 26+44+60+32+13 条亮色、图片边界、混合标签操作、搜索、长消息与布局保存回归 |
| regression.tap | 本轮实际 119 项核心回归通过，fail 0 |
| candidate-source-match.json / cloud-source-match.json | 当前 62 份代码/样式/资源/构建文件与 Windows 候选逐字节一致；与成功 Mac head 按换行规范化一致 |
| mac-build.json / verification-summary.json / runtime-audit.json / final-delivery.json | 云结果/指纹、最终检查汇总、正式运行内嵌资源与实际后台来源、交付数据比较 |

最终 13 份 Windows 检查 JSON 均晚于最终 build.json，合计 **319 条**，未捕获前端错误均为空。全部检查使用隔离 DPAPI 数据、本地 HTTP 夹具，未向原微信账户或会话发测试消息，没有运行模型；本轮新标签的真实鼠标检查不等于官方扩展已接通。此前已经通过的比例套件不因历史辅助文件遗漏而重复跑；修复外部 helper 后完整重跑失败及后续套件。脚本结尾的正常退出 CDP 断开已正确处理并重跑，未将非零退出算通过。6500ms 无手势 timer 的用例明确等待实际尝试，150ms 继承短期激活的早期结果不冒充产品缺陷。其他早期失败/输入焦点证据见 failure-notes.md。

Windows 替换前 busy/queued/pending 均为 0，初始加密状态/旧 EXE/旧 DMG 已在 replacement-v0325 保存。正式程序读取时已退出，替换同名 EXE 后正常启动。现有 1 个连接账户、1 条断开身份、3 会话/134 消息，账号及工作目录绑定、断开身份、原 threadId/逐条正文/时间、Provider URL/Key 比较均保留。没有擅自恢复既有断开身份。production-after 的比较证明替换保留，不等于线上微信/模型端到端验收。

正式 Windows PID `155296`，运行资源 `C:\Users\admin\AppData\Local\QQClaw\app\3704D9A7B2AC5F2A`，.complete=0.3.25。runtime-audit.json 核对后台及所有主 UI/CSS/HTML 与成品内嵌资源一致，实际后台从该目录运行，样式/HTML 与当前源码一致。只保留一个 EXE 和一个 DMG。

[最终 Mac 云构建 41227468490](https://github.com/mumuhaha487/wechatclaw/actions/runs/41227468490) 成功，代码 `e1166079cf58dfcedb8af0e599681166560c8184`，artifact `13051474677`，读取实际 **26 条 PASS**。包含双架构、签名/系统库检查、DMG 校验/只读挂载/安装复制、菜单/主题/后台、钥匙串/附件/布局/重启、审阅/冲突/回滚以及真实 WebKit 历史/新窗口/POST/命名窗口/页面关闭/下载。Mac 新窗口组件在隔离视图临时允许脚本弹窗驱动 delegate，不是可信鼠标或完整产品 GUI 验收；无手势策略另用页面 timer。失败 run 41226018929 的错误是用携带宿主手势的 evaluateJavaScript 充当无手势测试，产品编译已成功；改为页面 timer 后 run 41226768100 成功，最终 head 再构建的 41227468490 也成功。日志 ZIP 保留，不把失败计作通过。

最终上传 ZIP SHA-256 `1D59ACB2E56DCB5AF67110AC1B15C0BD777D40BA5102E1F3A8CC9ECDEE2DECD9` 与 GitHub digest 一致，CRC、唯一 DMG 条目、UDIF koly 尾检查通过。旧 DMG 项目外备份后替换同名成品。

| 唯一正式成品 | 大小 | SHA-256 |
| --- | --- | --- |
| release/QQClaw.exe | 667,648 bytes | 078D93B41D5F4BE885161A9AD30F2F2968350BC250E85496B36562A6EB0CBD22 |
| release/macos/QQClaw.dmg | 819,715 bytes | 3739974888AB530AF78FE1338C6150600146ED33931E4E7C6D514902AB55B9C1 |

本轮也重新查看官方 Browser/Chrome extension/app-server/remote Markdown（项目外 official-*.md）：仍未找到独立第三方宿主获取官方浏览器授权并由微信触发的公开接口，app-server requestAttestation 为客户端响应的 opaque token，不是自助签发接口。未借用当前开发聊天身份/令牌/管道，未换普通远控、其他扩展或自建 MCP 作为完成。**官方 ChatGPT 扩展自动浏览仍未接通；全部参考主页操作 1:1、网页批注、完整 SPA/Cookie/网站权限仍有差异，Mac 未 Apple 公证/用户整套 GUI/中文输入法/线上微信验收，Swift5 既有隔离警告不等于 Swift6 严格模式通过。整体目标保持 active，不能宣布整体完成。**

## 0.3.26 原生网页键盘与焦点

继续对照主页操作，发现 0.3.25 在网页输入框获得真实原生焦点后 Ctrl+T 没有反应。隔离基线实际发送 Win32 按键，原生页收到事件、应用仍在，标签数量却从 1 仍为 1；因此“进程没退出”不等于快捷键可用。根因是应用快捷键仅在主 HTML 文档处理，独立原生网页的键盘没有传给它。基线证据 shortcut-baseline.json，测试及资料都在项目外 C:\Users\admin\AppData\Local\Temp\qqclaw-v0326-20261101。

Windows 现从原生 WebView2.KeyDown 识别有限 Ctrl 组合，排除 Alt/AltGr，标记处理后用 BeginInvoke 异步返回主 UI；UI 再核对会话、真实标签、可见面板和模态状态。支持网页焦点下 Ctrl+T/W/L、Ctrl+Tab/Shift+Tab、Ctrl+B/Shift+B、Ctrl+N/K/逗号。原有 HTML 快捷键和菜单使用同一 action；Windows 不接管网页自身 Ctrl+A/C/V/Z/F。Mac 为 ⌘T/W/L、Control+Tab/Shift+Tab 增加 AppKit 菜单，并在自定义命令分发前切回主 WKWebView；原生编辑菜单保持 responder chain。菜单按工作台/面板/网页/多标签和环境状态启用，同步后台标签状态，避免留下无效入口。Mac 原有 ⌘F 仍用于会话查找，不能说网页查找已全部复刻。

焦点处理不是只看按钮变化：创建新页聚焦地址栏；切换/关闭后等待视口同步，核对 owner/panelIntent/标签对象，将输入交给实际页面。关闭历史联想、blur 地址栏，状态刷新仅在主文档有焦点时恢复表单，避免刷新把输入拉回来。window.focusBrowser 只接受当前可见会话及标签；页面合成 KeyboardEvent 不触发宿主快捷键，未开放应用消息桥或模型自动化接口。最后工作标签关闭后可保留空工具选择器，原生标签必须为零；面板全局叉负责关闭整个面板。空组键盘操作后回到聊天输入框。0.3.25 项目外 failure-notes 中“最后标签一定关闭空面板”的早期推断已在本轮说明中纠正，不据此改变产品正确语义。

索引：native/BrowserHost.cs 的 BrowserTab.KeyDown、Shortcut、Focus；native/Program.cs 的 browser-shortcut 与 window.focusBrowser；native/macos/QQClaw.swift 的 makeMenu/menuCommand/validateMenuItem，native/macos/BrowserHost.swift 的 focus；ui/app.mjs 的 focusPanelSelection、workspaceKeyboardAvailable、syncNativeMenuState、原生事件与键盘动作；ui/application-menu.mjs 新入口；ui/browser-history.mjs 的焦点/建议处理。后台与主 Store/微信/Codex 源码本轮未改，backend.cjs 仍为 25AE1A12BA8B268FA94E4A0190518E9E70EA345127C1EBD42D9C6200A4213A09。README 末尾过时的“自建 MCP 服务”索引同步改正，不能与早已停用该工具的实际实现混淆。

| 最终证据 | 实际范围 |
| --- | --- |
| shortcut-ui.json/.mjs/.log、input-native.ps1 | 22 项：真实点击网页输入框后的新建/关闭/地址/连续前后切换、普通输入与撤销、单页循环、侧栏/面板、后台完整刷新、搜索/设置/新聊天、错误聚焦请求拒绝、原消息/草稿不变及最后一页不重建；进程正常退出 0 |
| post-native-checks.json | shortcut 和 popup 两套在正常退出后均无原生 COM 日志，非仅检查状态或进程存在 |
| popup-ui.json | 本版重新执行 21 项真实原生新窗口/POST/opener/命名窗口/关闭/隔离回归，保持 0x8000000E 修复 |
| panel-proportion-ui.json / history-ui.json | 27+47 项：六档真实窗口比例/关闭/保存、历史联想与持久化/故障/边界 |
| download-storage-ui / downloads-ui / download-edge-* JSON | 7+32+4+3+3 项真实下载和保存异常回归 |
| appearance-ui / tab-actions-ui / search-ui / conversation-ui / layout-ui JSON | 26+44+60+32+13 项亮色/图片/菜单/标签/搜索/长消息/重启布局回归 |
| regression.tap | 本轮实际 119 项核心回归，fail 0 |
| candidate-source-match.json / cloud-source-match.json | 当前 62 文件与候选逐字节一致，与成功 Mac head 按换行规范化一致 |
| mac-build.json / verification-summary.json / runtime-audit.json / final-delivery.json | 云实测、摘要和最终检查汇总、正式运行内嵌资源核对、交付及数据保留 |

最终 14 份 Windows JSON 均晚于最终 build.json，合计 **341 项**，前端 errors 为空。测试用隔离 DPAPI 数据和本地网页；原账户/原会话没有收到测试消息，没有运行模型。这些检查验证用户操作和键盘，不等于官方扩展自动浏览。22 项按键采用真实 Win32 输入；普通输入的断言检查新增原生 input 事件、原有文本与聊天草稿，未强制机器切换输入法，也没有将其算作中文输入法全套验收。实际已查看 QQClaw-0.3.26-light-proportions.png，保留亮色、顶部对齐、28.7% 默认比例和可调宽/可关面板。

失败和修正记录在 failure-notes.md：初始新标签正常但旧地址联想挡住原生视口，增加正确焦点交还；测试曾等待“可见”的收起侧栏、选择了重复返回按钮、在收起侧栏直接点击会话，均修正测试定位；输入法提交 xy%27z 使精确 ASCII 断言超时，但原生页已经收到输入，最终针对实际焦点要求核查输入事件和草稿；最后一页测试额外要求面板消失也已纠正，同时补上真实空组焦点遗漏。没有把这些非零退出计为通过。Git 新行 CRLF 曾被默认 whitespace 检查视为行尾空白，使用一次性的 core.whitespace=cr-at-eol 核查通过，不修改全局配置或忽略真正空格。

Windows 替换前再次核对 busy/queued/pending 为 0，初始状态与旧两端成品保存于 replacement-v0326。正常 CloseMainWindow 后替换同名 EXE 并启动，1 个连接账户、1 条断开身份、3 会话/134 消息、账户/目录绑定、原 threadId/逐条消息/时间、Provider URL/Key 比较均保留。未恢复已有断开身份。正式 Windows PID `115392`，资源 `C:\Users\admin\AppData\Local\QQClaw\app\D6D04A747374777E`，.complete=0.3.26；runtime-audit 核对实际后台路径、内嵌主 UI/CSS/HTML 与运行资源一致。

[最终 Mac 云构建 41230961068](https://github.com/mumuhaha487/wechatclaw/actions/runs/41230961068) 成功，head `bef58590793366ff43a8c634b897e4cd06b3a882`，artifact `13054020822`，实际 **28 条 PASS**。包含原有双架构/签名/系统库/DMG只读挂载和安装复制、后台/钥匙串/附件/重启/审阅/下载/历史/新窗口，以及新增菜单 keyEquivalent/修饰键、状态启用和组件命令派发、真实 WKWebView firstResponder 与错误 owner/tab/隐藏页拒绝。菜单是组件直接派发，不能称为 Mac 整应用可信键盘验收。前一源版本 run 41230765473 成功后才对最后空组焦点修正的 head 再构建，未重启尚在运行的 job。

ZIP SHA-256 `B1DB5086172B2BD091F7887CAC405CA5D57C3E332CB9750B3138353145B1D81A` 与 GitHub upload digest 一致，CRC、唯一 DMG 与 UDIF koly 尾检查通过。项目内仍只有一个 EXE、一个 DMG，旧包和测试都在项目外。

| 唯一正式成品 | 大小 | SHA-256 |
| --- | --- | --- |
| release/QQClaw.exe | 671,744 bytes | C251A31F3D7216934FAFC919A39786D8138A7CB4838572E1E0968DC876BAA085 |
| release/macos/QQClaw.dmg | 824,734 bytes | 794FE7DD4456E076BABF24D6BAB0D0EA0091E77F995F3B20FF187B56F61BFA67 |

**整体目标仍未完成。** 官方 ChatGPT 扩展授权宿主接入没有变化，本轮未以其他扩展、远控、自建 MCP 或开发聊天身份替代。全部主页行为 1:1、网页批注、完整 SPA/Cookie/站点权限、关闭标签恢复等仍有差异；Mac 网页查找/完整产品键盘与中文输入法、Apple 公证和线上微信端到端未验收。既有 Swift5 警告不等于 Swift6 严格模式通过。发布仅确认上述实际修复和检查，持续 goal 保持 active。

## 2026-11-01 官方扩展独立接入专项调查

本次没有产品代码修改、构建、替换或重启。正式版本仍为 0.3.26；只读核对当前 Windows PID 115392 的路径为 release/QQClaw.exe，正式日志目录未发现 native.log。没有新执行 UI、模型或线上微信检查，不能将既有 341/119/28 项计作本次新检查，亦不能仅凭无日志证明所有原生行为正常。

新增 [docs/OFFICIAL-BROWSER-INTEGRATION.md](docs/OFFICIAL-BROWSER-INTEGRATION.md)，README 及开发交接已加入索引。调查区分扩展安装、签名 native host、JSON-RPC transport、可信 nodeRepl runtime、任务授权及站点许可，避免把“扩展已安装”或 transport connected 写成“模型可用”。

实际读取 OpenAI Docs 的 Browser extension、app-server initialization/remote Code Mode host、Computer use SDK drivers。确认 requestAttestation 是宿主响应 opaque token，不提供浏览器授权自助签发；--code-mode-host 是实验性的出站宿主连接配置，不是官方扩展授权入口；SDK 要求开发者实现 driver，不能当作本项目官方扩展接入的替代交付。未找到公开可用的独立接入契约，不据此推断所有技术路径绝对不可能。

本机静态检查：Chrome 官方扩展 1.26.1020.11845，Edge 安装目录版本 1.26.901.11451_0；host 为 com.openai.codexextension，allowed_origins 含两者官方 ID，extension-host.exe 的 Authenticode 为 Valid / OpenAI OpCo, LLC。扩展通过 connectNative 使用 JSON-RPC，并在获得 port 后标记 transport connected；后续任务权限仍单独检查。只读分析官方 browser-client/service 和扩展 service worker，并做语法格式化，没有导入或执行 vendor 代码。

修正早期容易过度推断的技术描述：browser/access 验证公钥由宿主环境注入，并非代码固定的 OpenAI 公钥；executor 缺失时有跳过该检查的分支。因此不能写成“只有 OpenAI 固定私钥，技术上绝对无解”。但删环境变量、伪造 trusted runtime 或始终返回允许，也不证明已接通官方授权。尚缺 QQClaw 自身身份下可信宿主、扩展会话、真实任务和站点许可的完整实现及验收。

项目外证据目录 C:\Users\admin\AppData\Local\Temp\qqclaw-official-protocol-20261101，evidence.json 保存来源文件摘要、静态定位和签名状态；格式化副本仅供本地阅读，未放入项目发布。未读取真实管道、令牌、Cookie、Chrome Local State 或 Local Extension Settings，未修改官方 native-host 注册表，未借用开发聊天权限。没有向原微信账户/会话发测试消息。

**自动浏览仍未完成，整体目标保持 active。** 既有 0x8000000E 的一次性 deferral 释放修复及 0.3.26 成品不变；全部主页 1:1、Mac 实机及其他未完成项继续保留。下一阶段必须补齐实际独立接入链路后再做端到端验收，不能用本次调查替代功能完成。

## 0.3.27 关闭标签恢复与异步状态修正

Mac 唯一安装包已更新为 0.3.27；Windows 候选已编译，正式 EXE 仍为 0.3.26，等待用户正常退出后替换。

新增文件/网页“重新打开关闭的标签页”：文件菜单、标签右键菜单、标签栏加号、Windows Ctrl+Shift+T 与 Mac ⌘⇧T 共用逻辑。每个会话和目录分别保留最近 20 次成功关闭；恢复原混合位置，已有文件选择现存对象，文件重新读取磁盘并保留源码/预览模式及阅读位置。文件丢失提示并保留重试记录。网页按地址新建后台页，再由仍有效的原操作显式选择；不重放 POST、缓存文件正文或未提交网页表单。

本阶段发现并修正的真实问题：

| 触发条件 | 证据及修正 |
| --- | --- |
| 恢复文件等待期间切换其他文件 | 内部已添加但标签栏没刷新；再次点击才出现。恢复结束重绘当前 owner，保留新选择和关闭状态 |
| 浏览器关闭请求失败 | 原网页仍在，前端重建对象追加末尾并可能丢地址草稿。按原位置和对象回滚，不写假关闭历史 |
| 主 HTML 重载后查询已存在原生网页 | 临时开始页移除后无选中工作标签。仅当开始页仍拥有选择时采用实际 activeTab |
| 延迟恢复期间选择另一网页 | 标签栏选 second、原生 active 却为 first，未提交地址草稿还能掩盖错配。改为原生后台创建，当前操作仍有效才显式选择 |
| 恢复期间打开应用菜单 | 菜单仍在但焦点丢失、当前文件被切换。恢复尊重现有菜单，菜单可用状态动态更新 |
| Windows 网页初始化期间立即停止 | 原生基线失败并留下新网页。停止标志改为等待前清零、等待后检查；新页清理，基线失败留存，旧候选未替换正式程序 |

源码索引：ui/closed-panel-tabs.mjs 管理有限恢复描述、owner 锁、失败重试和会话清理；ui/panel-tabs.mjs 的 place 恢复位置；ui/app.mjs 的 closePanelTabs/reopenPanelTab/updateBrowserState/focusPanelSelection 处理实际关闭结果及异步归属；ui/application-menu.mjs 和 ui/panel-tab-actions.mjs 连接入口及实时状态；backend/app.mjs、backend/browser.mjs 增加手动 restoreTab 白名单及 URL 验证；两端 BrowserHost 创建后台恢复页，Windows 检查初始化期间的停止；Mac QQClaw.swift 增加菜单及 canReopen。没有开放模型浏览器工具或修改微信消息预算、Provider、主 Store 与原生 Codex 归档实现。

证据全部在项目外 C:\Users\admin\AppData\Local\Temp\qqclaw-v0327-20261101：

| 材料 | 本轮实际范围 |
| --- | --- |
| cua-checks.json、component-events-cua-25.jsonl | 25 条 CUA 承载的当前产品前端 + 实际 App RPC/Windows BrowserHost 组件检查；本地 HTTP 实际网页、文件读取、关闭/恢复、原生选择与标签计数、菜单/草稿、会话隔离和删除清理；检查跨候选迭代，修复后重跑受影响场景 |
| final-native-ui-smoke.json | 最终停止修复后的当前前端与重编原生组件实际导航/关闭/键盘恢复；不是独立 EXE GUI 或原生焦点按键检查 |
| native-protocol.json / native-protocol-stop-baseline.json | 最终 11 项直接 Windows BrowserHost API 检查通过，真实初始化取消、后台加载与显式选择、非法地址、12 页上限、空白页、最后关闭和 dispose；保留停止失败基线，最终进程正常退出 0 |
| closed-tabs.tap / closed-tabs.test.mjs | 7 项：owner 隔离、异步去重、后续关闭不被误消费、失败重试、移除/重建 owner、有限无正文描述和混合位置 |
| regression.tap | 当前后台 119 项核心回归，fail 0；之后只修改 Windows 原生停止处理，没有重复宣称后台重跑 |
| failure-notes.md、component-events-*-fixture.jsonl、BrowserHost-before-stop-fix.cs | 保留真实失败及准备工具错误：CJS 顶层 await/file URL 打包、archive.prepare 缺失、模型返回结构、地址栏角色选择器；这些失败不计为通过 |
| QQClaw-0.3.27-restore-menu-cua.jpg | 已查看白底黑灰的实际前端菜单截图，展示隔离数据；不是正式 EXE 截图或官方自动浏览 |
| candidate-source-match.json / cloud-source-match.json / candidate-payload.json | 57 份代码/样式/页面/版本/工作流与候选构建副本逐字节相同，与云 head 按换行规范化匹配；成品内嵌主资源另行检查 |
| mac-build.json | 成功 run、原始执行 PASS、摘要、ZIP CRC、唯一 DMG 及 UDIF 校验 |

本轮没有向原微信账户/原会话发送测试消息，没有运行模型或借用开发聊天浏览器身份。CUA 页面只作产品前端验证，环境/模型门禁为隔离夹具；真实原生网页由当前 Windows BrowserHost 执行。没有将其写成完整独立 EXE GUI、原生网页焦点下的新快捷键实测、官方扩展或线上微信验收。此前 0.3.26 的 341 项不是本轮新检查。

[Mac 云构建 41237546213](https://github.com/mumuhaha487/wechatclaw/actions/runs/41237546213) 成功，代码 ba4c21c9e6cbe0c22d96427b1ffd71b4720e20d5，artifact 13055677654。读取实际 **31 条 PASS**，排除脚本源码回显。新增恢复状态竞争、AppKit ⌘⇧T 及门禁/派发、真实 WKWebView 空白/URL 后台恢复、显式选择、非法地址拒绝和最后关闭；保留双架构/签名/系统库、DMG 挂载/安装、下载/历史/弹窗、后台/加密/附件/重启等既有云检查。组件菜单派发不是实机可信按键。既有 Swift5 隔离警告保留，未 Apple 公证。

ZIP SHA-256 E768C087A811ED766C978BFF6AAD7D76D9FBA6C34DAB56CBF9D0A852699A0609 与上传 digest 一致；CRC、唯一 DMG 条目及 UDIF koly 尾通过。旧包和加密数据备份在 replacement-v0327，项目仍只有一个 EXE 和一个 DMG。Windows 运行中的正式程序尚待正常退出；已发送手动退出请求，因为当前浏览器工具说明原生桌面控制禁用，不能代替用户点击退出。既有更新授权保留，不是重新请求更新许可。

| 成品 | 当前状态 | 大小 | SHA-256 |
| --- | --- | --- | --- |
| release/QQClaw.exe | 仍为 0.3.26，待正常退出后替换 | 671,744 | C251A31F3D7216934FAFC919A39786D8138A7CB4838572E1E0968DC876BAA085 |
| 项目外 build-root/release/QQClaw.exe | 0.3.27 Windows 候选 | 675,328 | 9CEBB5B6F1F2894EE8BE2A7B18469E21BC6F5417F337326F19B967D119041757 |
| release/macos/QQClaw.dmg | 0.3.27 已更新 | 831,162 | 1FEA8CBCA1927764B93F37AB90AF43655BE5CC59F06CEDCA75797649EF9AB845 |

替换前备份的保存状态为 1 个连接账户、1 条断开身份、3 会话/134 消息，保存的 busy/queued/pending 均为 0；数据只在内存中解密比较，不输出密钥。Windows 替换后的运行资源及数据比较尚未完成，不能把旧版比较结果写成本版结果。

**整体目标仍未完成。** 官方 ChatGPT 扩展独立授权及微信触发自动浏览没有接通；关闭恢复只涵盖用户显式关闭的文件/网页，不跨重启，不保存整段网页历史/表单/POST，审阅/文件管理器工具页和网页自行关闭暂不进入该历史。全部主页 1:1、网页批注、完整 SPA/Cookie/站点权限、Mac 网页查找/完整产品键盘和中文输入法、Apple 公证及线上微信等仍有差异或未验收。本版只报告上述可核对的阶段进展，持续 goal 保持 active。

<!-- end-qqclaw-0327 -->


## 0.3.28 当前内容查找与原生请求取消

Mac 唯一安装包已更新为 0.3.28；Windows 0.3.28 候选已编译，正式 EXE 仍为 0.3.26（PID 115392），等待用户正常退出后替换。

Ctrl/⌘+F 根据最后实际操作的聊天或工作面板分派；文件/网页采用真实选中标签，不受后台标签右键菜单影响。显式“查找会话内容”仍定位聊天。一次仅打开一种查找；F3、Ctrl/⌘+G、Shift 反向、Enter/Shift+Enter、Escape 及编辑菜单均有对应操作。切换会话、文件、网页地址或关闭面板会清理旧查找，迟到结果不能恢复旧条或抢回选择。

文件复用 MessageFind 的文档模式，支持中文、字面正则符号、跨行内格式、高亮、计数及水平阅读位置。网页 UI 使用新增 ui/browser-find.mjs，真实搜索走 App.browser.find → BrowserViewer → 两端原生 Find；不下载页面重建搜索结果，不向模型发送页面内容。查找条位于原生视口上方并缩小视口，避免外部网页遮挡。网页历史、外部打开移入“更多”菜单，下载保留独立入口。

Windows 使用 CoreWebView2.Find，返回实测的匹配数与从 1 开始的位置；不支持接口时明确提示更新 WebView2。Mac 使用 WKWebView.find、WKFindConfiguration 和 matchFound；公开 API 没有总数和序号，显示“找到匹配/未找到”，不伪造数字。Windows 原生网页增加 Ctrl+F/G、F3 和仅查找打开时的 Escape 分派；Mac AppKit 菜单先读取真实 firstResponder，再发送带 owner/tabId 的 browser-shortcut，随后交还主 UI。原生焦点下的新快捷键本轮未做 Windows 可信按键或完整 Mac GUI 实测。

### 查到的遗漏与严格修正

旧组件检查第 13 条只断言标签为空，并将 pending find 的拒绝吞掉；不能证明请求已结束。收紧为关闭后必须 3 秒内完成且不能 Native API timeout，严格基线真实失败：12 项通过，查找请求在 **30,014ms** 后超时，passed=false。Windows 增加关闭/新查询的中断信号，提前结束等待并观察迟到原生异常；Mac 显式完成待处理 continuation，迟到回调只结束一次。最终 Windows 同一路径 **24ms 返回 stale**，严格 13 项通过；Mac 新增关闭期间查找检查也实际通过。没有仅更改超时时间或跳过该断言。

另修复 MessageFind 新区域谓词与原匹配序号同名、网页“更多”菜单被同一次 click 立即移除、菜单关闭聊天查找后焦点丢失。Windows system.status 原来写死 0.3.26，改为 scripts/build-windows.mjs 从 package.json 生成临时 BuildInfo.cs，status 与 .complete 统一引用；成品反射读取常量为 0.3.28，未在源码增加第二份手填版本号。

### 本轮实际证据与范围

材料均在项目外 C:\Users\admin\AppData\Local\Temp\qqclaw-v0328-20261101。

| 材料 | 结果与实际范围 |
| --- | --- |
| cua-find-checks.json | 22 条 CUA 操作的当前前端 + 真实 App/Windows BrowserHost 组件检查；文档/聊天/网页查找、方向、中文/字面词、错误显示、延迟结果、菜单及草稿隔离。跨候选迭代，不当作全部来自最终独立 EXE |
| cua-final-find-checks.json | 最终前端和取消修复后的原生组件 11 条补充；菜单关闭恢复聊天焦点、文件 F3、4 档视口、真实网页计数/Ctrl+G、查找条与原生视口不重叠、会话隔离及草稿保留 |
| native-find-strict-baseline.json / .mjs | 严格失败基线保留；旧吞错检查未计入最终及时完成证据 |
| native-find.json / .mjs | 最终真实 WebView2 Find 13 项，关闭期间 24ms 返回 stale，退出 0；中文/字面词/行内样式、前后/循环、真实计数、非法 owner/tab/query、连续查询、没有重新抓取网页 |
| regression.tap | 本轮后台 119 项核心回归，fail 0；之后仅改原生取消、菜单关闭的焦点及构建文档，没有重复声称后台重跑 |
| QQClaw-0.3.28-file-find.jpg | 已查看实际前端白底黑灰截图，版本 0.3.28；为隔离数据，非正式 EXE 或自动浏览截图 |
| mac-build.json / mac-executed-passes.json | 成功云构建实际 34 条 PASS。只读取 0_build.txt 的执行输出，排除 shell 源码回显，也排除逐步骤日志的重复副本 |
| candidate-source-match.json / cloud-source-match.json / candidate-payload.json | 58 份源码/样式/页面/版本/工作流与 Windows 编译副本逐字节一致，与 Mac head 按换行规范化一致；EXE 内嵌主要资源另核对摘要 |
| failure-notes.md | 保留编译准备漏复制许可证、无 PyYAML、补丁校验、旧 CUA handle/地址角色变化、窄屏断言及替换 API 失败与修正，不把准备失败算作产品通过 |

四档视口中，1100/1500/1800px 保持约 28.7% 默认面板占比；1000px 时工作区不足 719px，按既有规则采用可关闭的覆盖面板，并非并排 28.7%。均检查查找条在面板内、页面不横向溢出；首次错误地要求所有尺寸都为相同比例的断言已纠正并记录。截图不是原生网页内容或官方浏览器工具成功证明。

没有向原微信账户/原会话发送测试消息，没有运行模型或借用开发聊天的官方授权身份。CUA 承载的前端、透明原生组件和模拟环境/模型门禁的边界保持明确；本轮不宣称完整独立 Windows EXE GUI、原生页焦点下可信按键、中文输入法全流程、Mac 用户实机或线上微信端到端验收。

### 构建、唯一成品及数据

最终代码提交 f911c69a54e4c22353d77c6d5402a985b66d5124。前一轮 4b5fee5 云构建也成功，但交付采用包含取消修复的新 head。

[Mac 云构建 41242626394](https://github.com/mumuhaha487/wechatclaw/actions/runs/41242626394) 成功；artifact 13057658439，实际 34 条 PASS。包含双架构/签名/系统库/DMG 只读挂载与安装复制、后台/钥匙串/消息/附件/重启、审阅/历史/下载/新窗口/恢复，并新增文件查找 WebKit 组件、AppKit 查找门禁、原生 WKWebView 真/假匹配/方向/清理、focused-page 命令和关闭时结束请求。组件菜单直接派发不等于用户可信按键。Mac 仍未 Apple 公证。

ZIP SHA-256 8BB50FC6CCE72C2747BD8C768F1516AE58B88265CCBBAD0838FDAA731CC30417 与 GitHub 上传 digest 一致；CRC、唯一 DMG 和 UDIF 尾均通过。

| 文件 | 当前状态 | 大小（bytes） | SHA-256 |
| --- | --- | --- | --- |
| release/QQClaw.exe | 正式仍为 0.3.26；未替换、未重启 | 671744 | C251A31F3D7216934FAFC919A39786D8138A7CB4838572E1E0968DC876BAA085 |
| 项目外 build-root/release/QQClaw.exe | 0.3.28 待替换候选 | 685568 | 71E88DCC300220587AED26D527EF24747C3B007D9AF40488D49B3EEA5A941758 |
| release/macos/QQClaw.dmg | 0.3.28 已更新 | 851960 | 8CA33AF36621141076241AF8E6DC1D802D9D9F45D2D213F27CED402AD54C79C2 |

替换前再次只读确认正式 Windows PID 115392 仍在运行，没有用当前工具不支持的桌面控制或强杀代替正常退出；此前用户正常退出请求仍待回应，不重复请求更新授权。已准备项目外 replace-when-exited.ps1，仅正常退出后才备份、核对并替换/启动；不能把候选编译或反射版本当成正式启动成功。

Mac 更新前将原加密 state 和旧两端成品备份至 replacement-v0328。更新后仍为 1 个连接账户、1 条断开身份、3 个会话/134 条消息，busy/queued/pending 均为 0。账户绑定、保留身份、threadId/逐条消息/时间及 Provider URL/Key 比较均为 true，未恢复原断开身份；仅比较与备份，没有改写用户内容。此比较发生在仅更新 Mac 安装包之后，不是 Windows 替换证明。项目 release 中仍仅一个 EXE、一个 DMG。

**整体目标仍未完成。** 官方 ChatGPT 扩展独立授权及微信自动浏览没有接通，本次查找仅用户手动操作；不能用这些组件检查替代官方扩展端到端证明。完整主页 1:1、网页批注、完整 SPA/Cookie/站点权限、Mac 实机/公证及可信按键等既有差异继续保留，goal 保持 active。


## 0.3.29 慢网页期间的标签响应与待加载地址

Mac 唯一安装包已更新为 0.3.29；Windows 0.3.29 候选已编译，正式 EXE 仍为 0.3.26（PID 115392），等待用户正常退出后替换。

### 实际复现与修复

本次再次核查原始“点击无反应”的目标，发现 App 和两端原生均按整个会话串行等待导航。保留一个真实本地 HTTP 响应时，另一个已加载标签的切换在700ms内没有返回，直到释放响应才完成。不是用进程存在推断正常。基线保留于 slow-selection-baseline.json；随后按实际标签隔离工作，最终同一路径切换2ms、另一页导航25ms（单机组件测量，不作普遍性能保证）。

- App.browserCommand 跟踪每个会话的未完成请求集合，原生在发起时固定目标页；切换/新建/关闭/状态/后台恢复不等待其他页的网络加载。移除会话先dispose全部网页，再等请求集合清理，避免等待队列死锁。
- Windows 每页单独串行，关闭/停止/新网址触发中断；同一页旧请求被取消，不重放到后来选中的页。初始化、页面读取和截图等待也能在关闭时结束。新导航按真实 NavigationId 匹配完成事件。Mac 按页排队，并核对 WKNavigation 对象、隔离已取消回调，保证迟到失败不能结束新导航；页面读取/截图 continuation 只完成一次。
- UI 为打开/刷新/前进后退/停止携带发起时选中页的tabId；新导航更新panelIntent，旧请求取消不会抢回选择或弹出迟到错误。UI停止只针对选中页；未指定tabId的内部全组stop保持原行为，初始化期间的恢复取消回归仍通过。
- CUA补查又发现待加载地址会退回旧网址。新增显示地址，与实际文档URL分离，导航完成/失败/停止/下载后清理；浏览历史仍依据实际成功访问写入。pending-url-baseline.json 保存旧地址且loading=true的界面失败证据；最终实际组件及CUA均核对待加载地址正确，未访问网址不会进历史。

涉及 backend/app.mjs、ui/app.mjs、native/BrowserHost.cs、native/macos/BrowserHost.swift；没有注册模型浏览器工具，也没有改变微信进度预算、最终文件发送、Provider和原生Codex归档规则。

### 本轮证据与边界

全部测试、依赖、截图和旧包在项目外 C:\Users\admin\AppData\Local\Temp\qqclaw-v0329-20261101。

| 材料 | 结果与实际范围 |
| --- | --- |
| slow-selection-baseline.json / pending-url-baseline.json | 真实App/Windows原生的队列阻塞，以及CUA的加载时地址回退基线；不以修复后的结果覆盖失败证据 |
| navigation-concurrency.json / .mjs | 最终13项实际App RPC+WebView2：保留HTTP响应时切换/其他页导航/新建/后台恢复、待加载地址不进真实历史、关闭后台加载页、停止仅影响目标、新URL替代、初始化替代/关闭、非法目标不落到当前页、12次快速导航最终URL、移除会话取消全部请求 |
| native-protocol.json / .mjs | 最终11项原生恢复/初始化停止/后台加载/显式选择/非法URL/12页上限/全关/空组/dispose回归 |
| native-find.json / .mjs | 最终13项真实WebView2 Find回归，包含关闭期间及时结束；退出0 |
| cua-navigation-final.json | 最终13条CUA操作当前前端+真实App/Windows原生：双网页、待加载地址、慢页期间切换/另一页导航/文件预览/关闭、草稿、文件查找、整面板关闭/重开、最后浏览器页关闭、快捷键真实URL恢复、恢复后真实原生Find |
| regression.tap | 后台119项，fail0；随后只改原生地址显示和云端检查，没有重复宣称后台重跑 |
| QQClaw-0.3.29-responsive-panels.jpg | 已查看最终前端亮色截图，隔离数据；不是独立EXE GUI或官方浏览器自动操作截图 |
| mac-build.json | 最终成功云构建实际40条PASS；仅统计0_build.txt内带时间戳的执行输出，排除源码回显和逐步骤日志副本 |
| candidate-source-match.json / cloud-source-match.json / candidate-payload.json | 58份代码/样式/页面/版本/工作流与Windows编译副本逐字节一致，与Mac head按换行规范化一致；主要内嵌资源另核摘要 |
| failure-notes.md | 保留测试清理误用公开dispose、补丁上下文校验、构建目录尚不存在、新建菜单操作假设、人工慢页达到25秒超时及后续有界重发检查等准备失败；不计为通过 |

没有向原微信账户/原会话发测试消息，没有运行模型。CUA只承载产品前端；实际网页在透明隔离的Windows BrowserHost中运行，环境/模型门禁为夹具。不能将这些结果扩大为完整独立EXE GUI、原生页焦点下可信快捷键/中文输入法、Mac用户实机或线上微信端到端。窗口错误/未处理拒绝采集为0；取消和网络超时等预期RPC错误另有记录，不能说全部RPC均成功。CSS和默认约28.7%面板规则本轮未改；窄工作区仍按既有覆盖规则，详见0.3.28。

### 官方扩展：独立实例复查仍未完成连接

继续按OpenAI Docs读取官方扩展、app-server的CLI连接及远程Code Mode host说明；页面实际内容与文档工具结果保存于项目外 C:/Users/admin/AppData/Local/Temp/qqclaw-official-probe-20261101。当前安装的codex-cli为0.157.1。使用空的独立CODEX_HOME、移除父worker/浏览器环境及CODEX_API_KEY/OPENAI_API_KEY，仅启动自己的app-server并以qqclaw_browser_probe真实客户端身份initialize，再读取功能与requirements元数据；没有读取其他聊天、复制其凭据、执行vendor浏览器运行时或发起模型回合。子进程正常退出0。

实际结果：browser_use、browser_use_external、in_app_browser、code_mode_host等功能标为stable/enabled；因此不能把问题简单说成CLI没有编译浏览器功能。生成的完整实验ClientRequest协议有167个方法，未找到browser命名的独立连接/授权方法；BrowserUseConfig公开字段为网站策略和历史许可。独立实例没有建立官方浏览器授权链，也没有发起浏览器操作，功能开关启用和初始化成功都不是连接成功证明。

证据：C:/Users/admin/AppData/Local/Temp/qqclaw-official-probe-20261101/app-server-preflight.json、evidence.json、schema/、官方页面快照和两份Code Mode文档。该结论仅限定本次所查文档/协议/实例，不能扩成所有私有技术路径都不可能。下一步仍要解决QQClaw自身身份下的可信Code Mode/浏览器服务与官方扩展、任务/网站授权；不能用假nodeRepl、删除校验、自签始终允许或开发聊天的现有管道凑通过。

### 成品、数据与剩余差异

最终代码head 3b2149fc620df44a7eeb383f5dc4bf9577aa7163；前一head a8d6ff8 的39项云构建也成功，但交付采用包含待加载地址修复的新head。

[Mac云构建41246304291](https://github.com/mumuhaha487/wechatclaw/actions/runs/41246304291)，artifact 13059398865，实际40条PASS。新增真实WKWebView保留HTTP响应时的选择/独立导航/新建/后台恢复/目标停止与关闭/替换导航/丢弃旧回调/dispose，以及待加载地址不进历史；原有查找、恢复、POST/opener、下载字节、钥匙串和重启检查继续通过。仍为组件直接派发，未做用户可信按键GUI或Apple公证。

ZIP SHA-256 F0F6B2CA284478E73815D9A5E37E9CC5ED6FA8BC76335CEB02CEE3F0A63E84E8 与GitHub上传digest一致；CRC、唯一DMG和UDIF尾通过。

| 文件 | 状态 | 大小（bytes） | SHA-256 |
| --- | --- | --- | --- |
| release/QQClaw.exe | 正式仍0.3.26，未替换/未重启 | 671744 | C251A31F3D7216934FAFC919A39786D8138A7CB4838572E1E0968DC876BAA085 |
| 项目外build-root/release/QQClaw.exe | 0.3.29候选 | 688128 | FA78794ACF29FC1F954A5254BF3FABF9C83625E87AEED860FD4AE7265132EB58 |
| release/macos/QQClaw.dmg | 0.3.29已更新 | 854310 | 3EBF2A67ED4CD6D0199E51D2ECB3E89809831AC809EBCA9FB09CB14342D13CCB |

Windows正式PID115392仍在运行，先前正常退出请求仍待回应，没有重复询问、强杀或覆盖占用文件。项目外PowerShell7替换脚本已指向0.3.29，候选预期运行资源0E3DAACDE97238E8；仅静态资源/构建版本核对，不作实际新版启动证明。

Mac更新前将旧两端成品和加密状态备份至replacement-v0329。更新后原1个连接账户、1条断开身份、3个会话/134条消息保留，busy/queued/pending为0，账户绑定/保留身份/threadId/逐条消息及时间/Provider URL和Key比较全为true，前后加密状态指纹相同。没有恢复原断开身份；这是仅更新Mac安装包后的比较，不是Windows替换证明。项目release仍只有一个EXE和一个DMG。

**整体目标仍active且未完成。** 官方扩展自动浏览尚无通过证据；参考原图1/3中的“目标/设为目标”在当前ui/app.mjs和后台主逻辑也没有对应入口，不能宣称主页全部1:1。网页批注、完整SPA/Cookie/站点权限、Mac实机/公证及可信按键等既有差异继续保留。用户完整原始要求不因本轮成功的导航修复而缩小。

## 2026-11-01 截图复核与官方宿主源码调查

本次没有产品代码修改、构建、替换、重启、模型执行或微信测试；版本/成品保持0.3.29章节状态。

无文字截图a705b10b显示Windows未处理异常0x8000000E，本地文件时间01:54:06。重新读取0.3.25保存的原生复现日志，堆栈为CoreWebView2Deferral.Dispose -> Complete -> ICoreWebView2Deferral.Complete。代码已在0.3.25改为finally仅Dispose一次，0.3.26已有21项新窗口回归和正常退出后无COM日志检查；本次没有重跑，不新增通过数字。截图没有提供新的堆栈，不能单凭相同错误码断定所有同码异常均为此原因。本次只读确认正式PID115392仍在、EXE摘要仍C251A31F3D7216934FAFC919A39786D8138A7CB4838572E1E0968DC876BAA085、正式日志无native.log；这些不等于全部GUI健康。

继续阅读官方Codex固定提交67f0994b532b8740f14b5b738af7b7b2a915b1d6的7份Code Mode宿主/runtime/目标实现，具体路径与固定源码链接见docs/OFFICIAL-BROWSER-INTEGRATION.md新增章节。公开宿主提供代码执行与已有工具回调；V8全局不提供官方浏览器所需privileged nodeRepl/nativePipe，模块加载器拒绝import。仅编译该宿主或加--code-mode-host参数不能完成扩展接入；此限定结论不表示全部私有路径已被证明不可能。

官方目标API会在空闲时启动及继续回合，当前单回合CodexClient.answer/App.run生命周期尚不支持；不把添加按钮当作完成。本机0.157.1生成schema的goal/set无origin字段，resume无deferGoalContinuation，与最新main或fork参数须区分。后续需要处理跨回合监听、工作区锁、快照、用户停止、审批、微信消息归属/六条进度/最终结果和原生持久化后再接UI，没有擅自更改原会话目标。

新增证据：项目外qqclaw-official-probe-20261101/public-source-review.json，包含7份源码摘要、安装版字段及只读现场。文档补丁第一次因result.md上下文不匹配被整体拒绝，核对无改动后修正，不计作产品失败或测试通过。本次没有新增UI或原生输入验收。

**整体目标继续active，官方扩展微信自动浏览及主页全部1:1仍未完成。** Windows新版替换仍等待此前正常退出请求的回复，没有重复请求或强杀。

## 0.3.30 原生持续目标、阶段附件和正式替换（历史交付）

此节记录 0.3.30 交付时的现场，最新状态以文末 0.3.31 为准。用户当时已明确回复“已退出，替换程序”。只读确认正式 QQClaw 已退出后，完成回归、重新构建、备份数据，替换同名 EXE 并启动；没有强杀原正式任务。当时 Windows 和 Mac 唯一成品均为 0.3.30。

### 功能与代码索引

| 入口 / 文件 | 行为与边界 |
| --- | --- |
| 输入区“目标”；用户消息下“设为目标” | 对接 Codex 原生持续目标，目标 1～4000 个字符，可选正整数 Token 预算；没有偷偷加入默认预算或任务超时 |
| 目标卡片 / 详情 | 显示原生状态、累计 Token/时间及可选预算，支持用户暂停、继续、编辑和手动移除；暂停保留目标和用量，不自动删除 |
| `shared/goal.mjs` | 快照字段过滤、请求校验和状态名称 |
| `backend/codex-answer.mjs` | 监督整个目标的多个原生回合，等目标终态及最后回复均到达后结束；汇总全部阶段附件并按路径去重 |
| `backend/codex.mjs` | 原生 `thread/goal/get/set/clear`；线程恢复前就绪观察者；当前模型/思考等级/权限；暂停目标后中断实际 turn；提供用户授权附件路径上下文 |
| `backend/app.mjs` | 目标全程共用工作区锁、文件快照、任务归属和微信进度预算；`goal.fromMessage/set/get/resume/clear` RPC；源消息关联 `goalMessageIndex` |
| `backend/conversations.mjs` | 备份目标、源消息索引、阶段消息及每次运行的目标统计；保留真实原生 threadId，不伪造 Codex rollout |
| `ui/app.mjs` / `ui/icons.mjs` / `ui/desktop.css` | 亮色目标入口、卡片、状态与详情；已有消息设目标和继续操作不新增重复用户气泡 |
| `.github/workflows/macos.yml` | 增加目标多回合、控制操作不重发 turn、阶段附件及源消息备份检查 |

原生 `thread/resume` 可能直接调度 active 目标，并且响应先于 `turn/started`。现在在恢复前建立监听和快照，等待真实启动；普通新用户输入用 `turn/steer` 进入该实际回合，避免竞速启动第二个 turn。“已有消息设目标”“继续”“详情编辑”则直接调用原生目标 API，**不再重复发送原用户指令，也不人为增加“继续”用户 turn**。原消息附件在原生上下文中提供路径；暂停、冷连接及便携备份恢复保留关联，目标被移除或外部更换时清除过期关联。

明确更换目标时，旧版 Codex 可能沿用旧目标用量。现在先清除旧原生目标再设置新目标，新预算从零计量；继续同一目标保留用量，历史统计继续存在于原历史消息中。旧 CLI 不支持目标元数据时，普通任务仍可用；显式目标请求会报告不支持，未造一个假的兼容目标。实际原生验证版本为 codex-cli 0.157.1，不能从中推导所有旧版均支持。

已实际复现“附件只在中间阶段声明、最终总结没重复时丢失”的问题，并保留修复前失败。现在过程附件既显示在阶段卡片，也合并进任务最终结果，不要求模型重新声明；微信过程最多 6 条，再发省略提示，最终总结和文件仍统一走最终发件箱。桌面发起的后续任务不推微信。

### 实际验证与证据

证据根目录：`C:/Users/admin/AppData/Local/Temp/qqclaw-v0330-20261101`。依赖、测试脚本、日志、截图、旧包及回滚数据均在项目外，`release` 只有一个 EXE 和一个 DMG。

| 实际检查 | 结果 / 证据 | 范围 |
| --- | --- | --- |
| 后台既有回归 | 119 项通过，`regression.tap` | 模型/存储/微信/附件/长任务等既有检查 |
| 目标生命周期 | 23 项通过，`goal-lifecycle.tap` | 事件次序、快速完成、旧事件、显式停止、目标状态、阶段文件、纯目标控制等协议单测 |
| 真实原生目标与自定义模型 | `goal-native-probe.json`、`goal-answer-native.json`、`goal-stop-native.json`、`goal-replacement-accounting.json`、`goal-custom-model-native.json` | 独立 Codex 0.157.1；实际目标工具与任意自定义模型名；本地 Responses 夹具 |
| App 全程监督 / 冷恢复 | `goal-app-native.json`、`goal-app-resume-native.json` | 实际 App/Store/Archive/Checkpoints；锁及快照覆盖全程，最终回复前不结束，排队和归属保留 |
| 最新控制 RPC | `goal-control-native.json` | 真实 `goal.fromMessage/resume/set/clear`；零 `turn/start/steer`，用户记录始终 1 条；原附件路径进入实际模型请求；暂停计量、备份恢复及冷连接继续通过；3 次完整快照 |
| 微信阶段文件 | `goal-wechat-stage-files.json`；失败基线 `goal-wechat-stage-files-baseline.json` | 12 个原生阶段，6 条过程＋1 条省略提示＋1 条总结＋2 个文件＝10 条；最终总结不重复阶段文件仍发送成功；微信接口为夹具 |
| CUA 目标界面 | `goal-ui-control-checks.json`、`goal-ui-events.json`、`QQClaw-0.3.30-final-ui.png` | 实际前端/后台与独立 Codex；设目标、暂停/继续、编辑预算、阶段预览、面板关闭及最终汇总；用户消息始终 1 条，最后预算 10000/真实已用 90，窗口错误和 RPC/服务器错误为 0 |
| 布局与语法 | `goal-layout-checks.json`；50 个 JS/MJS 语法检查通过 | 既有四尺寸目标区域边界检查；不扩大为所有网页/内容或真实 EXE GUI 通过 |
| 源码一致性 | `candidate-source-match.json` / `cloud-source-match.json`，60 文件一致 | 主目录和 Windows 构建副本逐字节一致；Mac 源码按 LF 规范化一致 |

真实 Codex 检查均使用自己的独立 CODEX_HOME 和 localhost 模型响应，隔离 vault 是明文夹具；没有联系原微信账号、没有向原会话发测试消息，也没有使用真实模型收费请求。CLI 自身可能尝试插件元数据预热并得到 401，不能声称完全没有外部网络。CUA 检查是项目外本地前端服务，不等于独立正式 EXE 全套 GUI；最后关闭了自己的检查标签、服务与独立子进程。

### 两端成品与正式数据

代码 head：`c1c092b3a6a41e8ce6a0ef3d0f398b0215066af1`。[Mac 云构建 41254665344](https://github.com/mumuhaha487/wechatclaw/actions/runs/41254665344) 成功，artifact `13062767532`。只统计主执行日志带时间戳且从 `PASS:` 开始的输出，共 **42 条**，不计源码回显和重复步骤日志。覆盖 DMG 校验/只读挂载与复制安装、Universal 原生程序及签名检查、无 Homebrew 运行依赖、目标生命周期、既有 WebKit/下载/查找/标签/恢复、管道、钥匙串和后端重启数据。它不是用户 Mac GUI、中文输入法或可信按键验收，也未 Apple 公证。

ZIP SHA-256 `D8560901386B653407084079B5E79CB3780394D8ACEE6A2F6D63F7371BE37DD1` 与 GitHub artifact digest 一致；CRC、唯一 DMG 及 UDIF 尾部均通过。下载和云构建核对见 `mac-build.json`。

| 正式文件 | 当前状态 | 大小 bytes | SHA-256 |
| --- | --- | --- | --- |
| `release/QQClaw.exe` | 0.3.30 已替换并启动 | 693760 | `77CB4E4288C5B61C92BE94392B2388F61E54E2A21BFBEC413824FCA205E0F203` |
| `release/macos/QQClaw.dmg` | 0.3.30 最新同名安装包已更新 | 861445 | `800CA5D76928E27D73F9EC46FAFE1E0A2417E4D24C972C52642CE6719DF4975E` |

Windows 启动现场：正式进程 PID 150564，新后台确实来自 `%LOCALAPPDATA%/QQClaw/app/68346EDB92FCD943`，内嵌 BuildInfo、`.complete` 和源码版本均为 0.3.30；日志有本轮“后端已启动”，审计时新增 ERROR 为 0，无 native.log。Windows 文件资源的 Win32 ProductVersion 仍是 0.0.0.0，未把它冒称为正确版本；该元数据问题尚未修正。上述为资源、后台路径、日志和持久数据检查，**不是以进程存在替代全套 GUI 验收**。

替换前备份在 `replacement-v0330`：`state-protected-before.json`、`QQClaw-previous.exe` 等均保存在项目外；更新最新 Mac 前另存 `QQClaw-b657-before-final.dmg`。最终数据审计仍是 1 个账户、1 条保留身份、3 个会话/134 条消息，busy/queued/pending 为 0；原账户目录/模型绑定、保留身份、threadId、逐条消息正文和时间、Provider URL/Key 的比较全部为 true。运行后的加密状态摘要发生变化，程序会保存状态；因此只声称原数据字段核对保留，不声称状态文件逐字节未变。

### 失败记录与未完成项

完整失败记录在项目外 `failure-notes.md`：包含真实的恢复竞态、旧目标预算沿用、阶段文件遗漏，以及夹具 key/依赖缺失、SSE 参数错误、旧 AX 索引、共享测试 archive、路径转义断言、CRLF diff、文档补丁和 `$PSScriptRoot` 在命令行为空等准备失败。后者在 Mac 文件替换前即报错，改用已核对的绝对目录后完成；没有把准备失败计作产品通过。原数据、旧包和失败基线均保留。

**原始整体 goal 继续 active，未宣称完成。** 当前新增“目标/设为目标”入口补齐了先前一项主页差异，但官方 ChatGPT 扩展自动浏览仍无真实授权/操作成功证据，QQClaw 自身可信宿主与网站/任务授权仍待解决。没有启用自建 MCP、普通远控、Playwright/CDP/HTTP 替代，也没有借用开发聊天身份、令牌或管道。主页全部 1:1、网页批注、完整 SPA/Cookie/网站权限、Mac 实机/公证和原生可信按键等既有差异仍保留，不能由本轮目标功能或云构建通过推导它们已完成。

## 0.3.31 输入栏精简与第三方模型配置（最新阶段）

本轮继续对照原始参考截图，处理主页输入栏的重复与占宽。原输入栏同时提供“工作模式”和“执行权限”，只读时出现两个“只读”；Provider、模型和思考等级也分别占据底部空间。现在保留一个“访问权限”菜单和一个“模型与思考等级”入口，菜单中仍可分别选择服务、模型和思考等级。页面维持白色为主、黑色为辅，没有增加绿色主题。

权限选项提供只读、需要批准、允许编辑及自动编辑，并显示各自的真实范围。后台仍按既有工作区限制执行；参考图中的“完全访问”不等于本项目已有的工作区权限，未用这个文案伪装全盘访问。模型按钮显示当前模型与思考等级，长名称省略显示，完整服务/模型在提示及菜单中可查看。

### 新代码与行为

| 文件 | 实现 |
| --- | --- |
| `ui/composer-model.mjs` | 统一模型菜单、位置与关闭、保存/刷新焦点、运行状态门禁、源会话绑定、服务临时配置及原子保存 |
| `ui/app.mjs` | 合并重复权限入口，提供 Provider/模型/思考元数据；`updateComposer(change, origin)` 显式使用原会话 ID，首页保存默认值 |
| `ui/controls.mjs` | 支持按区域关闭 picker，状态刷新保留模型搜索；刷新模型列表及 Tab 关闭恢复焦点；权限选项说明 |
| `ui/desktop.css` | 亮色菜单、底部单一模型按钮、名称省略和可用空间边界 |

动态模型目录没有改成固定名称。打开模型选择或刷新时按实际服务读取，旧模型列表被新结果替换；失败时明确提示并保留上次结果，仍可输入列表之外的模型 ID。思考等级使用模型元数据；没有元数据时继续提供原有可选等级，不固定为截图型号。

选择新第三方服务时，先在菜单中暂存服务选择，选择或手填模型 ID 后，一次提交 `providerId/model/effort`。这样不支持模型发现接口的服务也能使用，不会提前提交空模型或自动沿用旧服务的模型。关闭未完成的菜单会丢弃这次临时配置，原会话设置不变。选择本机 Codex 可使用其合法默认模型。配置保存绑定发起时的会话，即使保存响应前切换会话，也不会把结果写到新会话或重新打开旧菜单。原有 API URL/Key 设置和微信账户模型绑定仍在原设置入口中。

### 实际检查与范围

本轮证据在项目外 `C:/Users/admin/AppData/Local/Temp/qqclaw-v0331-20261101`。最终源码 head `cad385e948cb8f75d4200d9aba5312290441d974`；前一中间 head `3d7e5bc` 的构建也成功，但不含最后的无列表服务修正，不采用其成品。

| 检查 | 证据及结论 |
| --- | --- |
| 既有后台回归 | 最终修改后 119 项通过，`regression.tap` |
| 语法和构建 | 51 个 JS/MJS 检查；Windows EXE 已重新编译，资源与内嵌版本核对为 0.3.31 |
| 单一权限与模型入口 | `composer-first-checks.json`、`composer-final-checks.json`：一个权限控制，旧工作模式控制为 0，模型/服务/思考集中在菜单 |
| 手填、自定义思考及模型元数据 | `vendor-future-2026-11` 实际通过 UI 保存，未知模型可选原有等级；已知第三方模型按元数据仅列出默认/low/ultra，最终选择 ultra |
| 列表变化与失败 | 动态列表从 1 更新到 2，旧发现结果移除，显式选择的自定义模型保留；故意失败后父菜单和列表都显示失败，保留上次列表及刷新焦点；见 `model-list-failure-snapshot.txt` |
| 状态刷新及键盘 | 第一轮状态刷新保留搜索词和搜索焦点；Escape 先关闭模型列表，再关闭配置菜单并返回原按钮；最终父菜单刷新保持按钮焦点 |
| 待完成保存与源会话 | `composer-origin-check.json`、`provider-origin-check.json`：实际挂起 App RPC 后切换到另一会话；单独 effort 以及 provider/model 原子保存均只更改源会话，另一会话配置不变，菜单不重开 |
| 默认配置 | `composer-default-check.json`：首页默认模型/思考等级保存成功，已有两条隔离会话配置不变 |
| 无模型发现接口 | `empty-provider-before.json`、`empty-provider-check.json`、`composer-final-checks.json`：空模型时没有 session.update；取消保留原服务；手填 `vendor-manual-only-2026` 后只发一次原子更新 |
| 权限及运行门禁 | 第一轮在同一入口由只读切到自动编辑再切回；注入 busy 状态后菜单关闭且模型/权限控制禁用，未发送草稿保留；不是实际模型任务验收 |
| 布局 | 第一轮样式冻结后，用长模型 ID 核对 1000×680、1100×760、1500×1000、1800×1100，没有根页面、按钮或菜单溢出；随后服务临时配置修订的最终界面另见 `QQClaw-0.3.31-final-ui.png` |

CUA 访问项目外隔离前端，后台使用真实 App/Store，模型发现和保存延迟为受控接口；没有执行模型任务或向原微信账号/会话发消息。第一轮负向列表测试记录预期错误，最终无列表服务阶段记录 **5 条预期 models.list 错误**；最终 client/server 未处理错误均为 0，chat.send=0、待完成保存=0，不能写成“全部 RPC 成功”。证据见 `first-pass-audit.json`、`final-ui-audit.json` 和 `goal-ui-events.json`。自己的检查标签与服务器已关闭，不动用户标签。

本轮 Windows 内嵌 `backend.cjs` SHA-256 为 `3F0CDA0B5F2E7ADFF974E05F96E4929CB36A571AA3612CD01B5609326D0BFA45`，与正式 0.3.30 的后台完全一致。不能由此推导所有前端、真实微信或第三方收费模型均通过；它证明没有在本轮 UI 修改中替换后端执行与微信传输程序。

### 成品、现场与未完成项

Windows 候选位于项目外 `build-root/release/QQClaw.exe`：695808 bytes，SHA-256 `B43FD474015437ED105544DA78F17F981A93593499EA14D1092BA27C7541841B`，预期资源目录 `%LOCALAPPDATA%/QQClaw/app/AF81BDB8CCFC3E60`。正式 `release/QQClaw.exe` 仍是已启动的 0.3.30（PID 150564），未把候选编译成功写成正式替换成功。当前工具禁用原生桌面控制，不能代替用户点击退出；已有更新授权不需要再批准代码更新，待正常退出后即可备份、核对并替换同名 EXE。

Mac 使用同一代码 head 的云运行 [41257413192](https://github.com/mumuhaha487/wechatclaw/actions/runs/41257413192)，最终下载、安装包与源码一致性信息追加于本节末。没有新增用户 Mac 实机、中文输入法或可信按键 GUI 验收；未 Apple 公证。

失败与检查准备记录在项目外 `failure-notes.md`：包括首次保存后焦点问题、状态刷新关闭搜索、无模型列表服务的代码复核发现、最初 low/low 竞争样本证据较弱而改用 high/low 重测、首页入口选择与夹具配置准备、预期错误及中间构建未采用等。没有将这些问题隐藏为“全通过”，测试/依赖/旧包继续留在项目外，发布目录只有一个 EXE 和一个 DMG。Windows 既有 Win32 ProductVersion=0.0.0.0 元数据问题仍未修改，内嵌 BuildInfo 和资源版本另行核对。

**整体 goal 保持 active。** 本轮补齐输入栏交互及第三方无列表配置分支，官方 ChatGPT 扩展自动浏览仍未接通，全面主页 1:1、网页批注、完整 SPA/Cookie/网站权限、Mac 实机/公证、原生可信按键等既有缺口继续保留。没有改用普通远控、自建 MCP、Playwright/CDP/HTTP，或借用开发聊天身份和授权来冒充官方扩展完成。

### 0.3.31 最终云产物与数据核对

Mac 云运行 `41257413192` 已成功，artifact `13063379195`，只统计带时间戳的实际执行输出，共 **42 条 PASS**，不计源码回显或重复步骤日志。范围沿用原生目标/标签/文件快照、Universal 程序、DMG 校验/挂载/复制、WebKit、下载、查找、管道、钥匙串及重启持久化检查；没有把这些算作新模型菜单在用户 Mac 上的 GUI 实测。ZIP SHA-256 `5886AFF3C19BE285069FD42E80BC6B1668B9898E44545D8C23689A103B1690CE` 与上传 digest 一致；CRC、唯一 DMG、UDIF 尾核对通过。

| 文件 | 状态 | 大小 bytes | SHA-256 |
| --- | --- | --- | --- |
| `release/QQClaw.exe` | 正式仍为运行中的 0.3.30 | 693760 | `77CB4E4288C5B61C92BE94392B2388F61E54E2A21BFBEC413824FCA205E0F203` |
| 项目外 `build-root/release/QQClaw.exe` | 0.3.31 最终候选，尚未替换 | 695808 | `B43FD474015437ED105544DA78F17F981A93593499EA14D1092BA27C7541841B` |
| `release/macos/QQClaw.dmg` | 0.3.31 已更新为唯一同名包 | 863699 | `04E4FF67370E0A5FBEDD91AE7B8B91873F6FC46A9FD5737D44747D85A6E08D94` |

`candidate-source-match.json` / `cloud-source-match.json` 核对 **61 文件**：主目录与 Windows 构建副本逐字节相同，Mac 提交按 LF 规范化相同。`candidate-version.json` 反射内嵌 BuildInfo 为 0.3.31；尚无正式新版进程或 GUI 启动证明，不把预期 runtime 当成已启动。项目外 `replace-when-exited.ps1` 无参数已检查为等待 PID 150564 正常退出；`-Install` 会在确认无正式进程后重新备份、核对及替换，不会强杀。

Mac 更新前将当前两端成品和加密数据备份至项目外 `replacement-v0331`。更新后仍为 1 个账户、1 条保留身份、3 个会话/134 条消息，保存的 busy/queued/pending 为 0；原账户绑定、保留身份、threadId、逐条消息与时间、Provider URL/Key 比较全为 true。运行中的旧程序继续保存状态，加密状态指纹发生变化，不声称字节完全不变。这是 Mac 包更新后的检查，**不是 Windows 0.3.31 替换或启动证明**。

## 0.3.32 网站卡片及打开方式

### 实现与代码索引

对照原参考 image-1.png 的网站卡片，助手已完成消息中的独立 HTTP(S) 链接显示为亮色卡片，主按钮打开原有手动网页预览；“打开方式”菜单提供网页预览、系统浏览器、复制链接。标题来自原消息，域名来自 URL，使用本地黑白线条图标，不抓取远程标题、图标或网页内容。行内引用、列表、引用块、凭据 URL、本地文件链接和文件 Markdown 预览不转换。流式未完成消息继续使用原有渲染，消息正文、微信传输和 Codex 执行逻辑未改。

| 文件 | 责任 |
| --- | --- |
| ui/website-cards.mjs | 消毒后独立链接转换、DOM textContent 构造、HTTP(S)/凭据/内部域名/长度边界 |
| ui/app.mjs | 助手消息专用渲染缓存键；打开/复制路由；菜单按源会话及目录核对；通用菜单首尾/方向键、Escape/Tab 与焦点 |
| ui/message-search.mjs | 排除卡片装饰和菜单文字，保留原始标题匹配及段落边界 |
| ui/icons.mjs / ui/desktop.css | 本地地球线条图标、白色卡片及长标题省略 |

只有用户明确点击后才调用手动预览或系统浏览器；未新增模型工具或任何自动浏览替代方案。菜单在工作目录变化后仍可能短暂可见，但过期源 owner 的动作被拒绝；正常会话切换会关闭菜单。通用菜单键盘处理只作用于 showContext 创建的菜单，应用菜单和会话目录保持各自逻辑。

### 已执行检查与边界

证据目录：C:/Users/admin/AppData/Local/Temp/qqclaw-v0332-20261101。119 项后台回归通过；19 项 URL 边界及 52 个 JS/MJS 语法检查通过。Windows 候选已编译，内嵌资源核对通过；后台 bundle 与 0.3.30/0.3.31 完全相同。

CUA 访问项目外隔离前端与真实 App/Store。浏览器原生层 browser.control 和系统外部打开 shell.open 使用明确的路由夹具，未加载真实目标网站；这些检查不能算正式 EXE、真实原生网页或官方扩展自动化验收。

- 卡片仅转换两条独立链接，行内/列表/引用/凭据/本地链接保持原样；文件预览同一 Markdown 保留全部 7 个原链接、0 个卡片。
- 实际菜单显示三种动作；主按钮的 browser.open 和系统浏览器 shell.open 收到完整规范化 URL；复制到浏览器剪贴板的内容逐字一致，检查前剪贴板随后恢复。
- 查找“打开方式”为 0/0，查找原始标题 QQClaw 为 1/1。菜单装饰不制造消息搜索结果。
- 最终菜单首尾键、方向键循环、Escape 回源按钮、Tab 关闭后到下一控件通过；复制/外部打开后的源按钮焦点已修正。
- 1000×680、1500×1000 的长标题卡片无根页面/卡片溢出；菜单边界在窗口内。证据见 website-final-checks.json、website-menu-final.png。
- 实际挂出菜单后通过后台夹具更改工作目录，点击旧菜单未增加 browser.open/shell.open 次数（仍为 2）；见 old-menu-owner-check.json。之后正常切换会话，菜单关闭且新会话无旧卡片。

最终 website-final-audit.json 中 chat.send=0、pending=0、waitingSaves=0、client/server 未处理错误=0；有 3 条预期 models.list 错误，来自既有“无模型发现接口”夹具。不能写成全部 RPC 都成功。所有测试、截图、依赖和候选在项目外。

检查准备及修复过程见 failure-notes.md：最初卡片影响文件预览/查找的代码复核发现、复制后焦点实际失败与修正、外部 Node 检查脚本的 Windows ESM 路径错误等均已记录。没有将最初失败隐去。

### 替换现场与未完成项

用户已回复“已退出，替换程序”，更新授权有效。但重新读取系统进程与执行既有替换脚本后，正式 PID 150564 仍在，脚本返回 awaiting-normal-exit，未覆盖也未强杀。已询问实际窗口退出状态；不是再次索取代码更新批准。当前原生桌面控制被工具禁用，不能通过 Win32/UIA/SendKeys 绕过限制代点退出。

Windows 最新候选与 Mac 云构建/数据核对状态随后追加到本节。此前 0.3.31 候选保存在项目外，尚未正式安装；不把用户回复或编译成功当作已经替换。发布目录继续只保留一个 EXE 和一个 DMG。

官方扩展自动浏览仍未完成。docs/OFFICIAL-BROWSER-INTEGRATION.md 已补充公开源码和独立初始化的 attestation 检查：该能力传递宿主提供的 opaque token，不是生成官方浏览器授权的接口；元数据初始化成功不证明浏览器连接。未读取/借用开发聊天的身份、令牌、Cookie、现有管道或站点许可。完整主页 1:1、网站批注/权限/Cookie、用户 Mac GUI/输入法、可信按键及公证等已有缺口继续保留，**整体目标保持 active**。

### 0.3.32 最终成品和替换核对

代码 head：`eb5cbfc2aaff7779041888632680d47161dc17f4`。Mac [云运行 41260465009](https://github.com/mumuhaha487/wechatclaw/actions/runs/41260465009) 已成功，artifact `13065191477`。统计带时间戳的实际执行输出 **42 条 PASS**，不含源码回显和重复步骤。ZIP SHA-256 `02DFB4A7730140EFD4320D99C3557EB5717467855D2AA117D1ED2674BAF31D0C` 与 artifact digest 一致；CRC、唯一 DMG 和 UDIF 尾部通过。云检查为既有原生目标/标签/WebKit/下载/查找/管道/钥匙串/持久化与安装组件，不等于本轮卡片在用户 Mac 的 GUI 或可信按键实测；未 Apple 公证。

| 文件 | 当前状态 | 大小 bytes | SHA-256 |
| --- | --- | --- | --- |
| release/QQClaw.exe | Windows 正式仍运行 0.3.30（PID 150564），0.3.32 候选未替换 | 693760 | `77CB4E4288C5B61C92BE94392B2388F61E54E2A21BFBEC413824FCA205E0F203` |
| 项目外 build-root/release/QQClaw.exe | 0.3.32 最新已验证候选 | 696832 | `AEBFAC2BCBEF57EF5225B6E36D16BE88C3CCE9A723AFB3209B84459D1ACEE875` |
| release/macos/QQClaw.dmg | 0.3.32 唯一同名安装包已更新 | 865729 | `F693941A3CC0A57AD271075F0565D010EB28BF6534C7D89331FBA7B6EC4CBB75` |

candidate-source-match.json / cloud-source-match.json 核对 **62 文件**，主目录/Windows 构建副本逐字节一致，Mac head 按 LF 规范化一致。内嵌 BuildInfo 为 0.3.32，预期 runtime 为 6C87004412749884；既有 Win32 ProductVersion 仍为 0.0.0.0，不能仅靠资源管理器版本判断。内嵌 backend.cjs 指纹仍为 3F0CDA0B5F2E7ADFF974E05F96E4929CB36A571AA3612CD01B5609326D0BFA45。

Mac 更新前已在项目外 replacement-v0332 备份加密数据与两端旧包。更新后 1 个账户、1 条保留身份、3 个会话/134 条消息；原绑定、保留身份、threadId、逐条正文/时间、Provider URL/Key 比较全 true，保存的 busy/queued/pending 均为 0。旧程序继续定时保存，加密状态摘要变化，不声称字节不变；这仍是 Mac 包更新后的数据比较，不是 Windows 新版替换或启动证据。

本轮最终执行版本专用 replace-when-exited.ps1 -Install 的结果为 `awaiting-normal-exit`，见 windows-install-status.json。PID 150564 仍占用正式文件，未覆盖、终止或重启。之前用户“已退出”回复已经收到，但不能代替实际进程检查；已发起窗口状态澄清，尚无新答案。

复查发现旧交付脚本以 WindowStyle Hidden 启动交互式主程序，本轮改为 Normal，避免继续使用隐藏窗口参数；不据此推导当前窗口是否可见。新脚本会核对五个实际解压资源、新后台进程路径及保存数据；PowerShell 语法已检查，尚未走到复制/启动分支，不能声称该分支已实机验收。所有本轮检查标签、服务器和独立子进程已关闭，用户 taste-skill 标签保留；Git 副本无关许可证指纹保持不变且未提交。

最新综合摘要见项目外 delivery.json。官方 ChatGPT 扩展自动调用和完整主页复刻仍未完成，原始 goal 保持 active。

### 0.3.32 Windows 正式替换完成（2026-11-01 09:41）

用户再次确认已经关闭主窗口后，替换脚本实际核对旧进程已退出，再备份并原子替换唯一同名 EXE。正式 release/QQClaw.exe 现为 **0.3.32**，696832 bytes，SHA-256 `AEBFAC2BCBEF57EF5225B6E36D16BE88C3CCE9A723AFB3209B84459D1ACEE875`；已使用 Normal 参数启动，PID **95560**，资源目录 `C:\Users\admin\AppData\Local\QQClaw\app\6C87004412749884`。

五个解压资源均与候选摘要一致，新 node 后台确实来自该资源目录；backend.log 的 2026-11-01T01:41:50.643Z 行记录“后端已启动”。启动后加密保存的数据仍为 1 个账户、1 条保留身份、3 个会话/134 条消息，原绑定、threadId、每条正文/时间及 Provider URL/Key 比较全 true。证据在项目外 windows-install-status.json、replacement-v0332/replacement.json、before.json、after.json；旧包和加密备份均在项目外。前面“仍待退出”的记录仅是此前现场。

这证明正式替换、新资源/后台启动及保存数据保留；本轮原生桌面控制仍被禁用，未把它扩大为完整独立 EXE GUI、真实微信或官方扩展自动浏览验收。Mac 唯一 DMG 已是同代码 head 的 0.3.32。官方扩展接入和完整主页目标继续 active。
## 2026-11-01 官方扩展接入开发检查点（源码未发布）

正式 Windows/Mac 成品继续为已交付的 0.3.32。源码新增 `browser-access.mjs`、`official-browser.mjs`、`codex-approvals.mjs`、`approval-forms.mjs`、`OfficialBrowser.cs` 并接入 Codex/App/微信/原生浏览器；这些不在 .32 成品里。没有重新要求退出，没有停止正式 QQClaw PID 95560 或原 Chrome native host。

产品浏览器组件链路已通过一项实际页面检查：真实独立 Codex 0.157.1、官方签名 Node REPL 和未修改 browser runtime，连接经过发布者和应用归属校验的官方 native host，在 QQClaw WebView2 加载原版 ChatGPT 扩展。CUA 在检查页点击网站确认后，扩展打开独立本机测试页，实际 DOM 含 `Official extension integration fixture` 及说明，官方返回截图与正文一致。**Responses 为本机协议夹具，不是真实 AI 决策、线上微信、完整正式 EXE GUI 或 Google 热点搜索验收。** 所有实现和失败索引见专项文档最新章节。

证据目录：`C:/Users/admin/AppData/Local/Temp/qqclaw-host-contract-20261101/product-component-fbe0e40549c64c9994c7e280a525e112/`。`official-extension-page.jpg` 是官方工具实际返回截图；`consent-result-ui.png` 是 CUA 检查页证据，不是产品主页图。`result.json` 与 `requests-and-events.json` 保存真实工具状态、回合、确认与页面结果。另有 9 项新增确认/生命周期/微信额度检查通过，开发中的既有 119 项回归通过。未把首次脚本策略失败、原生输出错误、过长目录 LevelDB 故障、首次 UI 夹具路由崩溃或历史测试失败隐藏成成功，具体路径见专项文档。

当前剩余工作包括真实模型、Google、完整 UI 与微信闭环、安装依赖入口和 Mac 扩展适配。网站确认不能变成自动同意全部，不能借用开发聊天/IAB/其他应用的授权，不能用自建远控替代。原始 goal 仍为 active，不作整体完成交付。
