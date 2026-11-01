# 官方 ChatGPT 扩展接入调查

## Mac原生适配后续源码（未发布）

native/cef/macos新增CEF Chrome Views/WebKit同窗桥接。真实Mac arm64云运行[41346379388](https://github.com/mumuhaha487/wechatclaw/actions/runs/41346379388)通过8项组件检查；前两轮复制命令失败、FillLayout覆盖尺寸的失败及修复均保留在[result.md](../result.md)。该桥尚未接入生产Swift Host，没有加载原版Mac官方扩展，也没有打进正式0.3.37安装包；不能把同窗/布局检查当作官方自动浏览、完整GUI、Intel或微信通过。

源码入口：CefBridge.h/.mm提供主线程C接口、CEF根窗口、WebKit遮罩/命中和公开Views布局；Helper.cc启动sandbox/helper；CMakeLists.txt和Info.plist.in构建嵌套helper；scripts/build-macos-browser.mjs固定官方SDK并编译签名；.github/workflows/macos-browser.yml只验证该原生组件，检查入口在runner临时目录生成。

后续需在NSApplication首次创建之前初始化CEF，复用其根窗口；保留Host原有后端保存确认，并将close-requested转接到该退出流程。会话/多标签隔离、原版Mac运行库及专属传输、Intel、真实官方浏览均待接入。成品仍是0.3.37，完整goal保持active。

## 当前状态：0.3.37（2026-11-02）

本轮只改主页交互，没有修改原版官方扩展或引入其他驱动。ui/app.mjs保留侧栏滚动/焦点和菜单锚点，拖动时延后绘制以保留指针捕获，增加普通会话展开/收起与侧栏右键/键盘菜单；ui/desktop.css修正完整6px分隔线命中区和拖动动画。版本文件与Codex clientInfo同步0.3.37。

实际前端/App/Store的列表、菜单、设置往返、两侧拖动遇到后台更新、关闭和还原检查通过；原生浏览/环境/模型发现为夹具，0chat.send及0前端/服务端异常，不当作新官方模型或微信验收。Windows内置运行库包独立启动通过；Mac云[41343117836](https://github.com/mumuhaha487/wechatclaw/actions/runs/41343117836)成功、46条实际PASS。同名EXE/DMG与[GitHub草稿](https://github.com/mumuhaha487/wechatclaw/releases/tag/untagged-2a2c9cbf4e2a5718fa13)均已更新，构建源码2e392d71a2f9d1cc92c9f236e740b91442a06de1。

完整目标继续active。Mac官方自动浏览、Blob官方下载、微信完整闭环、完整原生GUI/输入法/DPI及参考主页全部操作核验等缺口保留。详细证据与摘要以[本轮记录](../result.md)和[交付说明](../交付说明.md)为准；以下是历史记录，不覆盖当前状态。

## 当前交付状态：0.3.36（2026-11-02）

两端安装文件已完成并更新到项目内唯一成品：release/QQClaw.exe 与 release/macos/QQClaw.dmg。Windows 内置 Node/npm、CEF、原版官方 ChatGPT 扩展与官方浏览运行库；Mac 内置双架构 Node/npm。原始完整目标仍为 active，不宣称全部验收通过。

- Windows：307438592 字节，SHA256 b482eb04d3e44715bc206c7e9495f4f21deac133fea15d87a65e1665a3b8ec0c。空数据目录、仅系统 PATH 下已实际启动包内 Node v24.22.1 和后台。
- Mac：129362354 字节，SHA256 3ad94470cdcf4f59a8234225bba52fdb31498f9987574da3241e683a96f90052；最低 macOS 13.5，Apple Silicon/Intel。云运行 [41339851338](https://github.com/mumuhaha487/wechatclaw/actions/runs/41339851338) 成功，下载档案摘要和 DMG 尾部已核对，46 条实际 PASS，包含钥匙串加密、原生后台重启的草稿/附件恢复。未 Apple 公证。
- [GitHub 0.3.36 草稿](https://github.com/mumuhaha487/wechatclaw/releases/tag/untagged-900d6977fcbca3aeeb9b)：远端与本地摘要一致，只有一个 EXE、一个 DMG；保持草稿，尚未公开发布。构建代码 d9ae586b59945f312267dd6032fd9ef42602f240。
- 已绕过文件占用对更新位置的影响：将运行中旧 EXE 移至项目外临时目录后放入新版，同名成品已核对摘要。没有停止旧 PID 95560，也没有同时启动新版访问原账户数据；现有窗口仍是旧版本，下一次启动项目内 EXE 才是新版。旧映像仅因进程占用暂存，后台清理脚本会在该进程退出后删除它。项目内没有第二个 EXE 或测试文件。
- 真实官方扩展组件已完成 Google“AI 热点”搜索、滚动及可见结果截图，HTTP 零字节下载取得官方保存路径。Blob 下载仍被原版官方运行库明确拒绝，不伪造成功、不使用替代驱动。
- 尚未完成：微信线上完整浏览交付、完整独立 EXE 的物理焦点/输入法/DPI、Mac 官方扩展自动浏览、Blob 自动下载、参考主页全部操作的一致性核验。真实 Google 组件结果不等同于这些项目全部通过。

本节是当前状态；下方保留各阶段原始记录，其中较旧的“未编译”“尚未替换”等描述只适用于当时。文件入口与数据位置见[交付说明.md](../交付说明.md)。本轮打包、下载、安装位置更新的证据集中在 C:/Users/admin/AppData/Local/Temp/qqclaw-browser-036-LIwfus。

## 0.3.36：官方插件核验、真实Google与下载边界

已从Google官方更新接口取得ChatGPT扩展1.26.1020.11845的CRX3，验证签名且公钥对应官方ID hehggadaopoacecdllhhajmbjkdcmajg。核对39个运行文件：功能代码一致；4个图标PNG与商店包存在差异，manifest增加了加载解包扩展所需的key，Chrome的_metadata/verified_contents.json未随运行资源复制。没有把整个目录称为与签名档案逐字节一致；本轮没有替换或修改扩展。完整比较和签名证据在 C:/Users/admin/AppData/Local/Temp/qqclaw-official-download-capability-ka6xPW/official-extension-proof.json。

真实模型通过当前产品BrowserHost/C#/CEF/helper、原版官方扩展和Node REPL完成Google“AI 热点”搜索，读取AIHOT标题及https://aihot.news，并在后续复测用官方ax.scroll滚到实际可见结果，原版工具返回的截图已人工查看。第一次搜索截图只显示页顶；没有把它当作结果已可见的证据。后续滚动首次遇到detached accessibility element，读取新状态后成功；原始错误保留。没有绕过验证码或安全拦截，没有换搜索引擎、驱动或借用开发聊天浏览器的身份。

两轮真实下载核对：HTTP零字节附件均走官方等待→实际点击→官方path返回，并核对磁盘大小0、completed/available为真。Blob中文CSV与空Blob由官方downloadMedia明确返回“Blob downloads are not supported by this browser.”，首轮分别88/55ms，后续将两项合并调用共111ms，没有进入120秒等待。当前官方服务仅在blobDownloadsSupported为true时启用Blob；其Blob事件还要求tabId与来源绑定，当前扩展路径不具备这些支持，CEF自身门禁也拒绝Blob。单改CEF门禁只能落盘，无法完成官方下载协议，解释了之前的实验失败；Blob自动下载功能仍未完成。

本轮代码只调整backend/official-browser.mjs的内部运行指引：对已观察到的Blob链接先由官方downloadMedia校验能力；明确不支持时报告该项未完成，保留普通HTTP先等待后点击的流程，并按完成状态核对合法零字节文件。没有加入替代下载器、伪造官方事件或修改原版插件。复测任务没有再逐项提示API用法，实际按修改后的产品指引完成上述行为。

证据根 C:/Users/admin/AppData/Local/Temp/qqclaw-official-download-capability-ka6xPW：capability-verification.json、source-findings.json、google-probe/google-verification.json、guidance-probe/guidance-verification.json及原始model-events.json。三个检查宿主随后正常退出0；原微信账户未启动，原状态只读取得已配置模型，使用low思考等级进行有限检查，没有修改用户模型设置。这里验证的是实际组件链路，尚不等于独立EXE完整GUI/IME/DPI或微信线上交付。辅助核验脚本曾因C#正斜线参数、Chrome元数据/图标差异及下载调用分批而误报，已按原始数据修订，以上限制没有隐去。

Windows 0.3.36 已编译并完成空数据目录/仅系统 PATH 独立启动；Mac 云构建 41339851338 成功，46 条实际 PASS。最终成品、摘要和仍未完成项见本文件首节。

## 当前进展：0.3.34 内置运行环境（2026-11-02）

用户已授权内置运行库，原先等待官方离线下载的阻塞已解除，目标保持 active。Windows 项目内 runtime/windows 已备齐原版官方 ChatGPT 扩展、Node REPL、Node/npm、CEF 和编译客户端；完整 EXE 会包含这些资源，不需要另装 Codex Desktop 或借用开发聊天的浏览器。Codex CLI 仍按需安装，登录及第三方 API 配置由用户在软件中完成。

真实模型已通过隔离的实际产品 BrowserHost/CEF/helper 和内置官方组件，完成 A/B 中文输入、官方下载 wait→click→download.path、45 字节内容核验、关闭 B 后实际移除、返回 A 读回。宿主签名/进程归属与唯一管道核验通过，检查进程正常退出 0。没有启动原微信账户、使用替代驱动或复制登录身份。证据位于项目外 C:/Users/admin/AppData/Local/Temp/qqclaw-bundled-034-2yx9Jh/official-verification.json 及 official-probe/。

Mac 最低系统为 13.5，与两个官方 Node 二进制的 LC_BUILD_VERSION 一致。此前 13.3 的声明已修正。Mac 新增内置官方 Node.js 24.22.1/npm 的 arm64 与 x64 发行包，按固定官方 SHA256 校验，按应用运行架构选用，安装 Codex 写入用户目录。Mac 官方扩展自动浏览尚未接通，不把普通 WKWebView 或 Windows 的结果算成 Mac 自动浏览通过。

独立 Windows EXE 已实际通过：全新空数据目录、仅含 Windows 系统目录的 PATH，后台确实由包内 Node.js v24.22.1 启动，已取得“后端已启动”日志；测试进程随后关闭。起初两次检查未通过：首次受旧长路径限制，第二次仅切换 .NET 选项仍不够，现以扩展路径修复；原始失败日志保留。首次解压进度窗口尚未做原生视觉截图验收。

Mac 云构建 [41333393550](https://github.com/mumuhaha487/wechatclaw/actions/runs/41333393550) 成功，45 条实际 PASS，包含包内 Node/npm 在仅含系统目录的 PATH 下运行、两种 Node 架构签名检查，以及既有安装/原生/持久化检查。已下载并核对 GitHub 档案摘要和 DMG 格式。Mac 编译代码为 f895ca054f98ed795b712d2277f7318e9c48f6c2；该构建包含最低系统 13.5 的修正；Windows 成品对应源码 4905d4b646c9f214330468128cbde964c8e56228。

本轮成品：Windows 307437568 字节，SHA256 25359812fb756e73e583c2acbf4f7d18b0f8883288c28efb33a47d6bc7f512d3；Mac 129551912 字节，SHA256 8af3d6c90e405f7ab4fe92cc964c92f3fc13bec790ec5b65d8e0c65871787041。成品暂存项目外 C:\Users\admin\AppData\Local\Temp\qqclaw-bundled-034-2yx9Jh，Mac 子目录 mac-compat/mac-verified，本地同名 release/macos/QQClaw.dmg 已更新。正式程序未停止，项目内未增加第二个 EXE。

[本轮 GitHub 草稿](https://github.com/mumuhaha487/wechatclaw/releases/tag/untagged-9ccec836087975db1b20)已更新为 0.3.34，仅一个 EXE 和一个 DMG，远端文件摘要与本地产物一致。本轮临时应用/浏览器检查进程已全部退出。

完整目标仍有待验证项：独立软件完整 GUI/焦点/中文输入法/DPI、微信线上浏览闭环、Google 搜索结果、Mac 官方扩展自动浏览及 Blob 官方下载。正式 0.3.32 程序未停止、账户与数据未清理。后面的记录属于历史阶段。

## 历史阻塞：官方原包下载要求交互认证

第三轮接续实际调用WinGet，从官方桌面页给出的Microsoft Store产品9PLM9XGG6VKS下载原始x64安装包，未安装程序。第一次因未接受包协议取消；第二次接受包协议并跳过离线许可证/依赖获取后，仍返回`0x8A150076 / APPINSTALLER_CLI_ERROR_AUTHENTICATION_INTERACTIVE_REQUIRED`。WinGet明确说明此下载通道要求Microsoft Entra身份及相应管理角色。本轮没有启动交互登录，没有取得安装包。

连续三轮已分别核对CLI市场、官方安装器/公开清单、官方Store取包，纯CLI新电脑的独立官方组件获取仍卡在外部来源/认证。需要可用官方离线包或具备下载权限的环境才能继续验证这条安装链。原生整套GUI、真实微信/Google、Mac官方自动浏览及特殊下载等原要求均保留，不能判为完成；现有0.3.33阶段候选保持。证据：项目外qqclaw-cli-browser-setup-C6DhbR/blocked-audit.json及official-store-package/的原始日志。目标按此外部阻塞处理，不以替代浏览器驱动或模拟测试缩减验收。

## 纯CLI新电脑安装入口核对（2026-11-02）

读取当前官方浏览器安装说明、插件说明及真实Codex 0.157.1的plugin帮助。官方浏览器页面描述桌面端Settings > Computer Use配置流程；通用插件页面说明CLI可用/plugins，但这不能推出Chrome运行库可独立安装。本机实际执行plugin list --available --json得到11个已安装、52个可用条目；chrome@openai-bundled来自Desktop生成的本地市场路径，当前可用列表未发现独立Chrome安装源。因此没有新增未经验证的安装命令；纯CLI新电脑自动准备官方运行库仍未完成，也不据此断言所有账户或未来版本都不支持。

证据在项目外qqclaw-cli-browser-setup-C6DhbR/catalog.json、findings.json和official-browser-setup.txt。参考：[官方浏览器设置](https://learn.chatgpt.com/docs/chrome-extension#set-up-your-browser)、[官方插件说明](https://learn.chatgpt.com/docs/plugins#overview)。本轮没有修改产品代码、安装插件或重建候选；正式程序和原微信账号未操作。下一步需要能独立获取官方运行库与插件的实际来源，不能用Desktop本地市场路径冒充新电脑下载入口。

补查官方安装器分发实现：按其实际URL拼接规则读取公开primary-runtime清单，HTTP 200，26.1030.10813的Windows档案为508,335,983字节。此清单属于办公依赖运行库，尚未证明包含浏览所需组件，未下载整个档案。当前官方安装包中实际找到cua_node/bin/node_repl.exe及plugins/openai-bundled/plugins/chrome/.codex-plugin/plugin.json；官方桌面下载页的Windows入口仍为Microsoft安装器。不能将办公依赖清单当作独立浏览安装入口。证据位于上述目录的vendor-distribution/distribution-findings.json及源片段。本轮仅补充分发来源证据，产品和候选未变。


## 交付补查：面板关闭优先于迟到访问事件

ui/app.mjs已修复browser-automation重新展开显式关闭/收起面板的问题，并实际复现与复测。两端0.3.33草稿已重建；原版官方扩展、内核与许可机制未改，界面事件夹具检查不代表真实微信或完整原生GUI通过。最新安装包和证据见[交付说明](../交付说明.md)及[result.md](../result.md)首节。

## 前一交付准备：Blob实验未通过，采用验证内核

官方Blob真实任务在原内核超时120秒；临时放宽本应用下载地址规则可落盘正确31字节中文CSV，但官方waitForEvent仍超时，没有download.path结果。这项未通过，试验代码已撤回，0.3.33候选沿用此前16db已验证内核。未修改官方扩展或运行时、未伪造blobDownloadsSupported、未引入备用驱动。实际能力字段返回尚未确认，不能仅凭源码有相关函数宣称已支持。HTTP/Blob空文件未继续执行。证据、候选和其他未完成要求见[result.md](../result.md)首节及[交付说明.md](../交付说明.md)。

## 最新检查点：组件安装整页刷新恢复（未发布）

本轮只修改原生安装任务快照、UI恢复/终态与按文档隔离的RPC编号；不修改官方扩展、浏览器驱动、授权或沙箱。CUA实际前端与实际C#安装器验证刷新后恢复同一任务、取消、来源校验失败刷新保留、正常修复刷新后成功；9项JS竞争/实际RPC源码检查通过。它们不是本轮真实模型浏览、完整EXE GUI或Mac官方扩展检查。候选与证据范围见[result.md](../result.md)最新节，正式.32不变，goal active。Mac自定义协议下的请求编号改用getRandomValues，并新增真实WK资源协议执行生产表达式的云检查；初始UUID版本的旧Mac包只作为中间证据，不能作为最终兼容验收。

最终Mac云41316394686（bd94b44）44条实际PASS，含真实qqclaw资源协议中的生产getRandomValues表达式。观察secure=true、两种crypto API均function，未复现UUID不可用，不能宣称修复了已证实的Mac API故障。80项源码/workflow与云提交规范化匹配、artifact摘要/CRC/UDIF通过；最终前端另有CUA启动/刷新检查，范围与此前安装流程区分。正式包不变，Mac官方扩展和整套GUI/IME仍缺。

## 前一检查点：官方焦点模拟与新UI恢复（未发布）

不能用document.visibilityState单独判断原版官方工具连接后哪个标签在物理前台。实际隐藏/可见Form两轮都观察到A/B报告visible。只读原版browser-service.mjs（SHA256 1AF22149F394099EBF6C3D8AED8814A9362DDA4C0BB2369EF0C37AAF239A7696）确认attachTab→enableFocusEmulation→Emulation.setFocusEmulationEnabled(true)；固定Chromium154.0.8037.98的content/browser/devtools/protocol/emulation_handler.cc使用IncrementCapturerCount(stay_hidden=false)，content/public/browser/web_contents.h:923明确这种模式始终告知renderer可见。未修改/禁用该原版行为，未独立发送CDP；证据及固定公开源码在项目外official-visibility-source-evidence.json。保留原误报，不将更正当成物理GUI成功。

新bundle16db43df8376654c0bec29a907bde739直接读取原生窗口ID、WS_VISIBLE和surface样式；6项不同窗口选择/后台恢复/隐藏/关闭检查通过。同HWND的标签windowShown均true只说明共享窗口显示。真实模型两轮15/16官方调用取得A/B读回、官方下载45字节及path、B实际关闭后移除和A保留，最终区域吻合；official-tabs-verification.json明确physicalTabVisibilityVerified=false和allGoalPassed=false。

当前UI另修复刷新后恢复现有原生标签且不覆盖新关闭意图，以及新聊天继承当前服务/模型/思考等级/权限。侧栏入口/拖宽/关闭/上下文为CUA实际前端+App/Store检查，原生层为明确夹具，不能冒充真实EXE、微信、Google、Mac或新电脑。最新代码、候选、失败和局限见[result.md](../result.md)首节。正式.32不变，goal active。

本轮代码9dd3132的Mac云run41311804049成功，43条实际执行检查及79输入规范化匹配、artifact摘要/CRC/UDIF核对通过；这只补充现有WK/AppKit/安装/持久化链路，没有为Mac增加CEF或原版官方扩展支持。用户Mac物理GUI/IME和公证仍未完成。两端新候选均在项目外，正式包未替换。

## 最新源码检查点：网页区域嵌入与标签同步（未发布）

Windows保持普通Chrome窗口及未修改的官方扩展/签名/沙箱，通过renderer实际边界把网页对齐应用裁切面板。真实故障中两个renderer均保留可见父链，旧最大面积选择选到越界后台矩形；现先以根客户区过滤，再测量并更新布局。CEF固定源码14c5a089e8452874cb1a556dc3fde26ed2d87723的ChromeBrowserHostImpl::OnSetFocus会SelectNumberedTab，现以公共SetFocus在创建栈退出后同步，核对选择/关闭/面板可见性。此非官方toolbar-hide API；权限气泡、焦点、IME、完整GUI与其他DPI仍未验收。

当前bundle b5acb7d549ffde5096fbc2621d29e707由真实产品安装器安装。official-download-a7992457a9104ffcbe01c17a7bdccdf4以真实gpt-6.1-sol/xhigh、12次原版官方Node REPL、一次自动prepare和两次正常确认完成输入并读回、官方下载45字节及path核对；最终501×601网页区域覆盖500×600面板、左上0/0，页面resize报告匹配，无独立搜索/shell/替代驱动。普通页面四组尺寸各12原生采样稳定、19查找/16下载历史及下载中退出加密保存复查通过。组件均不扩大为正式GUI/微信/Google/Mac或干净新电脑通过。补充跨原生窗口document.visibilityState检查超时，仅一项完成；内部布局show标记不代替真实桌面证据。两轮旧几何失败、新增任务重复release崩溃和安装锁失败保留，详见[result.md](../result.md)最新节与项目外chrome-ui-failure-notes.md。正式.32不变，当前候选未发布，goal继续active。

## 最新源码检查点：刷新查找隔离与当前内核复查（未发布）

源码10e3124在CEF/WebView2/WK状态中提供navigationRevision，前端同地址刷新保留查询词并自动重查，手动查找请求携带版本；后端验证/转发，原生拒绝过期search/next/clear，避免旧clear清除新结果。基线确实刷新后仍1/3，修复后实际CEF自动1/5，WebView2与Mac云端WK均核对真实同地址reload及请求隔离。本轮没有新增模型浏览器工具或修改官方扩展。组件检查、受控状态检查与完整GUI必须分开，详细证据见[result.md](../result.md)最新节。

新bundle69f220ac8d73af0bb077d43d7e1bd185已由产品安装器安装；official-download-89655943690941ce96d86cfb3ea7f592用真实配置模型、8次原版官方Node REPL、一次自动prepare及站点/下载两次正常确认取得45字节文件，路径/内容与原生完成记录一致，根正常exit0。首轮检查器错误地只接受双引号且不带options的waitForEvent形式，修正为接受当前实际合法语法后，仍严格检查登记→点击→等待→path顺序、实际返回路径、下载文件、构建与源快照；未仅凭工具completed算成功。Mac云run41294195243的WK检查不是Mac官方扩展自动浏览，后者仍缺；Chrome原生控件外观、完整GUI、微信/Google和全新仅CLI电脑等原目标未完成，正式.32未替换。

## 最新源码检查点：下载退出收尾与622e内核复查（未发布）

`native/cef/BrowserEngine.cpp` 在应用请求关闭时先取消下载，等待实际终态后再关闭来源browser；固定CEF源码明确browser销毁后停止转发回调。`native/CefBrowserEngine.cs` 等Exited和stdout EOF后只发一次worker-exit，Close还等exitDelivered确认最终UI通知已处理。`BrowserHost.cs`允许同一engine/owner的既有下载在会话关闭期间接收终态。没有修改官方扩展、网络错误或下载确认策略。

最终bundle **622e037a0ff991781fa918443c12172f** 由产品安装器安装。证据根项目外qqclaw-cef-contract-20261101：download-stage-3e2ea88024134b1ebb29798fb93a187c/probe-f73f2dbb7d99467cbb5ae4ff910fb761中16项实际下载/历史及CUA下载中退出通过；独立进程读取8条加密记录、最新cancelled、无running。8项受控退出顺序检查覆盖Close返回时机；19项实际原生查找与前端1/3→2/3复查通过。当前源码真实模型证据official-download-2e51e728f6c6423391812c590c233087：12次原版官方Node REPL、一次自动prepare、站点/下载分别确认，按官方等待→点击→path流程取得实际45字节文件，路径与原生完成记录一致；固定C++源码/构建清单/4个运行二进制与源快照已核对，正常退出0。不是完整EXE GUI、微信、Google、Mac或新电脑验收。

旧退出断言失败保留：检查后端先关同进程下载服务器，实际状态为NETWORK_FAILED(20)，不能要求其伪报cancelled。检查改为先等产品dispose再结束服务器；另用受控检查独立复现并修复Close早于EOF/UI完成的问题。详细归因、候选摘要、失败目录及仍未完成项以[result.md](../result.md)最新节为准。正式.32不变，未发布候选。

## 前一源码检查点：原生下载/历史和官方下载等待（中间构建）

以下“最终”只表示该阶段状态，最新构建以上节为准。

当前源码把CEF下载/主页面历史接入原有BrowserDownloads/BrowserHistory及加密存储，未新增替代驱动。原生DownloadHandler把实际下载ID/元数据传到C#，父应用分配原有下载目录中的每文件独立路径，再续传；取消等待实际终态，关闭来源页/退出有清理。KeyboardHandler已接现有应用命令且双重校验owner/当前页/可见及原生焦点，但只完成27项映射函数检查，**未做真实桌面焦点按键验收**。索引和完整限制见result.md最新节。

最终bundle `3091f164c0638da525f48a960fe5eec0` 由实际安装器生成。`download-stage-09fc43294ea64a529b02a0415c9beed5/probe-4ff058c6ada64068820f7551ada79556` 的16项真实下载/历史检查通过，CUA下载面板实际取消及历史搜索/导航通过；同阶段probe-d0d321...的19项原生查找回归通过。独立新进程重开两组隔离加密记录并核对文件可用，读前后状态摘要相同。119旧回归、59语法、当前候选资源/79源码核对通过，测试和候选均在项目外，正式.32未改。

官方扩展会主动拦截未登记intent的下载；首次真实模型只点击链接得到ERR_BLOCKED_BY_CLIENT，按失败保留。应用指引现明确先调用官方 `tab.playwright.waitForEvent("download")`，再点击、等待并用 `download.path()` 核对。该行为来自当前原版runtime文档与源实现，只读证据在official-download-policy-evidence.json；没有修改扩展、直接CDP或绕过站点/下载确认。

最终 `official-download-cce0f6511b67488a9dc2e76c9b6c8770`：真实gpt-6.1-sol/xhigh、11次官方Node REPL、一次prepare、一次站点与一次下载确认，0夹具Responses/独立搜索/shell/替代驱动。SDK返回路径与原生下载记录相同，实际45字节内容一致；正式helper链152492→17092→152776。仍为隐藏Form组件，不扩大为正式GUI、微信、Google或Mac通过。

本轮也实际定位并修复新增代码对空CEF userfree字符串释放的崩溃，先保存线程栈再清理确切检查进程；不归咎输入法、不以进程存活为成功。最终通过与前轮失败分开保留，详见result.md和download-failure-notes.md。原生Chrome控件仍可见，完整GUI/快捷键焦点、特殊下载类型、同URL刷新查找、微信、Google、Mac和新电脑引导等继续待完成。整体目标active，候选未发布。

## 前一源码检查点：查找、首次标签与冷启动证据（未发布）

`native/cef/BrowserEngine.cpp` 已增加真实 FindHandler、每页串行请求及 Chromium 回调编号匹配、最终计数/位置、导航/关闭/清空时 stale 结算、512 UTF-16与64项队列边界和手动查找10秒无响应错误。该错误不会暂停Codex长任务、重发请求或重启浏览器。实际发现原 ready 在首标签创建前发出并使 prepareOfficial 返回空tabId，现改为首标签创建/状态发布后报告ready。`native/CefBrowserEngine.cs` 显式UTF-8读取原生输出。

最终证据在 `qqclaw-cef-contract-20261101/find-stage-6cf690b891ab46e78091bf1221afa9dd/probe-b540fef4614c44b0a7d4f58d4d961b04`：产品安装器产出新bundle `36ffd1afc048e197f1f545f79bbbf905`，19项真实BrowserHost/CEF检查通过；CUA实际前端查找栏接同一内核验证英文/中文计数、前后/Enter/Shift+Enter、未找到禁用、Esc/叉号及重开。仍为隐藏Form组件，不能称正式全GUI或原生网页可信按键通过。119项旧回归、59语法检查、当前候选资源与79源码核对通过，见result.md最新节。候选6097920 bytes，SHA256 `7A16EA1611D1B27D5786BA7799A8DA732C7E316EB30B00A70F21665950B64F13`，未发布。

此前 `cold-google-fe536aeee375440fb540b6fde503d0f9` 证明当时安装所得旧bundle可在没有手动准备操作时，经一次prepare、9次官方Node REPL，自动创建标签并提交真实Google查询。Google的 `/sorry/index` unusual traffic 拦截使结果未取得，**Google验收失败**；未解验证码、未用其他驱动/搜索/HTTP/CDP替代。该运行早于本次查找/ready/UTF-8修订，根/worker/native host及直接子进程退出已核对。

最终代码又在 `cold-local-f52fd5db4f874920897b4b7748c48909` 完成一次无手动准备的真实模型自动冷启动：新bundle、gpt-6.1-sol/xhigh、11次官方Node REPL、一次prepare及一次本机站点确认。真实新建/读取/关闭标签并确认removed=true，0夹具Responses/独立搜索/shell，正式helper核对147088→145708→148336；当前源码快照一致，全部组件正常退出且无确切PID/直接子进程遗留。本机页成功不能扩大为Google/正式GUI/微信/Mac，见同目录verification.json与result.md。

仍缺CEF控件外观、原生快捷键、下载/历史、完整GUI/微信/Google结果/Mac、仅CLI新电脑官方组件引导、整页重载安装接续与全部参考主页操作。保留普通窗口以满足原版扩展，不能直接改为Views/popup隐藏工具栏后宣称完成。失败和验收范围详见result.md；正式.32成品未替换，整体目标active。

## 前一源码检查点：按需安装与使用中保护（未发布）

Windows源码已增加CefBrowserInstaller及设置入口，下载固定官方CEF档，校验后暂存、验证、提交；支持取消与修复，不覆盖持共享lease的运行worker。CefBrowserEngine仅在真实退出或未创建进程的启动失败后释放lease；Program接原生状态/安装/取消、进度、job及退出收尾。组件与官方扩展连接分别显示，已安装不会变成已连接。

项目外证据：qqclaw-cef-contract-20261101/installer-probe-b0c1403a9628436195146363b043eb16中19项原生检查通过，包括真实CDN下载、新bundle安装、实际worker启动、lease互斥、取消/目录保留及缺失资源修复。installer-ui-d1ab6935f85e42c7b864d86e467344c5为CUA真实前端+原生安装器检查：解压中取消、重试、页面切换和最终独立状态均通过。其他环境/模型/浏览器路由为夹具，不能称正式GUI、真实微信、Google、Mac或全新电脑官方组件通过。

独立候选installer-package-ffd835d2dc4642b982ba2c8cd1a202b1，6028800 bytes、SHA256 51AF0F153533FE2A8CD495473EB1E82936F0E24EE8835EE4F91EB2662C4C7D6C；资源/payload/四个安装二进制已核对。140项JS、59脚本语法和当前C#启动失败lease释放检查通过。正式包仍.32，未替换。前轮host-package被首次编译复用覆盖的证据问题已如实说明，后续候选使用唯一目录，见result.md首节。

官方[扩展安装文档](https://learn.chatgpt.com/docs/chrome-extension)仍从桌面设置完成插件/商店扩展安装，未证明本项目仅CLI的新电脑流程。CLI支持plugin add，但空CODEX_HOME且未复制认证的plugin list为0安装/0可用，不等于已实现官方组件引导。下一步优先验证不预先手动准备的自动冷启动及所属native host时序，再以当前安装所得组件跑实际模型/Google；随后补CEF控件样式、查找/下载/历史/按键、全GUI/微信/Mac。整页重载时接续安装尚未检查。整体目标保持active。

## 前一源码检查点：实际 BrowserHost、正式 helper 和真实模型（未发布）

正式 EXE/DMG 仍0.3.32。本次已经将 CEF 接入 native/BrowserHost.cs、Program.cs 和 OfficialBrowser.cs，并由 backend/official-browser.mjs 核对原生/helper 的 engine 和能力；CEF 真实支持新建标签时返回 chrome/tabCreation=true。新 CefBrowserRuntime.cs 只信任程序集 QQClaw.browser-engine 清单，固定安装路径与 bootstrap、客户端、chrome_elf、libcef 摘要。scripts/browser-engine-artifact.mjs 验证当前源码及固定官方输入，build-windows.mjs 可通过 --browser-engine 导入小客户端/可信资源，通过 --output 输出项目外候选。没有提供运行库安装器，未发布或替换正式软件。

实际产品 BrowserHost/CefBrowserEngine/OfficialBrowserMetadata 组件已由 QQClaw 配置的 gpt-6.1-sol/xhigh 验证：9次原版官方 Node REPL/ChatGPT 扩展调用，新建1662818320，读取 localhost 检查页原文，关闭后再列为空；0 Responses 夹具、0独立搜索/命令调用。CUA 允许本站一次。隐藏 Form 根157032、A/B worker147932/142604；真实 helper 的签名与归属条件没有修改来迁就实验。混合手动/CEF标签、当前标签关闭、后台恢复新ID、空组重开、会话隔离、200次尺寸请求、显示/隐藏保留、重复dispose与拒绝迟到请求均已操作。A/B各4个renderer令牌检查及实际正常退出0通过。**这不是完整产品GUI、拖条/DPI/可信按键、Google结果、真实微信、Mac或安装验收。** 本轮没有导出最终surface几何统计，不沿用前轮“2次/499×599”数字。

证据根仍为项目外 qqclaw-cef-contract-20261101，本轮主目录 host-integration-2552e209e5ff4dab96ea84b084d7514e，含 verification.json、model-events.json、actions.json、native-helper.json、官方截图和QA截图。真实模型之后的连接状态回合/工具收紧使用录制真实响应回放验证，启动失败并发拒绝使用C#失败探针验证；没有声称这两个后续修订又跑过真实模型。119既有回归、18许可/预算/隔离、3新增引擎/构建边界与58脚本语法检查通过。最终开发候选6010880 bytes，SHA256 5476B370F866D911E533DE2816D2DDC7489FD758F3BB3BE8062FD01187D18D91，可信资源和payload文件核对通过，仍不能直接交付。

首轮 signed runtime 启动失败：CEF bootstrap_win.cc 要求 bootstrap 与 chrome_elf/客户端签名身份一致（或同时未签名）。minimal未签名bootstrap与signed档的Spotify签名chrome_elf混用会FATAL退出；当前使用同版本官方minimal原版配套bootstrap/chrome_elf，libcef保留signed档有效Spotify签名及固定摘要。没有剥签、跳过检查、添加系统信任根或关闭沙箱；应用整体仍未签名。[官方签名说明](https://github.com/chromiumembedded/cef/blob/14c5a089e8452874cb1a556dc3fde26ed2d87723/docs/code_signing.md)与固定源码记录保存在项目外。Node --import 路径错误、证书失败、并发启动等待问题及源码索引详见[result.md](../result.md)首节。

后续先完成可信运行库安装/修复及仅CLI新电脑的官方组件准备，再补CEF查找、下载/历史/取消、快捷键/焦点、Chrome控件外观及完整GUI/微信/Google/Mac验收。当前chromeControlsVisible=true；不能拿旧WebView2/WKWebView的这些功能当作新CEF已经支持。原版官方组件仍从已安装位置加载，不将其私有身份/授权复制进软件。整体目标保持active。

## 历史源码检查点：原生 worker、C# 桥接与独立构建入口

项目现新增 native/cef/BrowserEngine.cpp、native/CefBrowserEngine.cs、scripts/build-browser-engine.mjs（package.json 的 build:browser）。这三个模块已编译和进行原生组件操作检查，但**BrowserHost/打包器尚未选择它们**，正式版本仍 .32；官方运行组件发现、主 helper 与 tabCreation=false 未改。前轮真实模型证据属于旧原型，不代表新 worker 已做真实模型/微信验收。

worker 使用官方 bootstrap 的真实 sandbox_info，按 API15400 和 sandbox compatibility hash 校验；一会话一进程/profile。匿名父子管道负责应用 UI 的标签/导航/尺寸/关闭，不向模型提供远控/MCP/CDP。C# 只接受调用方固定的三个二进制摘要，等待实际 ready；请求绑定 owner/编号，状态按 revision 合并，连续调宽收敛；退出同时验证剩余标签=0及真实进程退出，排空 stdout 后处理 Exited。15秒原生操作等待只报告未确认，不会自动重发/杀进程或暂停 Codex 长任务。

CUA 在隐藏原生 Form 的 QA 检查页操作最终两个独立 worker（148380/143000）：原生尺寸480×400及780×600；新建、选中、定向关闭、最后标签关闭后保持空组、重新打开；A/B状态隔离；隐藏保留标签。200次调宽仅2次进入原生层，最终499×599。令牌复核 A4/B5个 renderer 均受限、低于中完整性、在 job 内；Close收到关闭确认，根进程正常退出0，无已记录的实验进程遗留。这是协议/原生生命周期证据，**不是完整产品界面、拖条手感、DPI/输入法或可信按键验收**。

证据：项目外 qqclaw-cef-contract-20261101/surface-component-f3ed1f62791d433c8827e14c9def2228，含 verification.json、actions.json、events.jsonl、sources、两个截图、两个令牌审计及 exit/final。旧首轮为 surface-component-48a770c6f9174dcaa03d981c2408ae50；其源码随后改过。固定公开 SDK构建不再需要从源码生成C API，nlohmann/json头文件仅在项目外构建缓存；输出带CEF/JSON许可证。

当前 state.chromeControlsVisible=true，普通Chrome控件外观仍需处理；BrowserHost路由、共享窗口/标签定位、完整下载/查找/恢复、可信安装及Mac仍缺。第一轮扩展自动打开公开ChatGPT安装/登录页，未输入凭据；最终QA用allowedOrigins=[]阻止。初始拒绝状态与本机无效Chrome外部注册项日志都保留，不能写零错误。第一轮可选on-device-model服务触发AppContainer程序文件权限检查失败：只给项目外公开运行库目录加读/执行ACE，未改profile等私有目录或关闭沙箱；SDDL在surface-sandbox-acl.json。最终未重现，但没有再次触发该服务，不能判其功能通过。详细编译准备错误、源码/产物摘要及下一步见result.md最新节。

## 前一检查点：CEF 沙箱原型的新标签/读取/关闭已由真实模型验证

正式两端包继续为 0.3.32，主项目原生内核仍为 WebView2/WKWebView。本轮只更新报告，以下 CEF 实现和依赖都保存在项目外；不能将组件结果用于宣布产品已修复自动新建标签或已具备 Mac 官方扩展自动化。

在匹配源码提交 `14c5a089e8452874cb1a556dc3fde26ed2d87723` 的 CEF `154.0.34+g14c5a08+chromium-154.0.8037.98` 中，C API App 实现 GetDefaultClient，收到原版扩展创建普通窗口后的 OnAfterCreated。按 HWND 所属 PID 只管理自身窗口，按 browser ID 处理创建/关闭；官方 browser.tabs.new 不再报窗口无 ID。最初 CefSharp 调查只证明窗口 API 有返回，未管理这些新窗口；不能与后来的官方扩展结果混算。

[CEF 官方沙箱文档](https://chromiumembedded.github.io/cef/sandbox_setup.html)说明 M138 以后 Windows 使用预编译 bootstrap 加载客户端 DLL。实际采用匹配版本 minimal 包的原版 bootstrap.exe，客户端导出 RunWinMain、转交真实 sandbox_info，API hash=`726dc73763db22edb289e41af2421a232617f7f4`、sandbox compatibility hash=`265fca9293e6b6ef` 必须匹配，缺失则退出。USER32/SHELL32 延迟导入，不依赖动态 winpthread，也没有关闭沙箱的回退。没有为此安装 MSVC、改系统沙箱设置或跳过 API hash。

实际 OS 检查确认本轮两次 sandbox 组件各有 6 个 renderer：restricted=true、integrity RID=0、inJob=true，无 --no-sandbox。GPU 低完整性；network utility 默认不受相同令牌限制（service-sandbox-type=none）。这些是渲染进程隔离证据，不是全面安全审计；不要写成每个服务都已经沙箱化。导航白名单仅允许空白页、受控 localhost 和官方扩展自身页面，不构成完整网络隔离。

| 组件证据目录（均在 qqclaw-cef-contract-20261101 下） | 本轮实际证明 |
| --- | --- |
| official-probe-4fd70d1303604dafb5a462bb035d7f3d | 原版官方扩展新建标签 1215031647、打开 localhost、读 DOM/实际截图。无沙箱原型；旧 QA/result 沿用 WebView2 标签，verification.json 留有明确更正 |
| sandbox-official-probe-34e1f1669d654af29ccc88b421b74439 | 开启官方 bootstrap sandbox 后，Responses 协议夹具调用原版扩展，新建标签 522342409、读取正确页面；真实站点确认与正常退出 |
| real-model-sandbox-official-probe-1113015a71f4411c85c0e75c05d22875 | 精确使用 QQClaw 已配置 gpt-6.1-sol/xhigh，10 次官方 Node REPL 工具调用；新建 1279560557、读取原文、关闭后再查为空，removed=true。0 Responses 夹具请求、0 独立搜索、0 shell 调用，1 次站点确认；正式界面、真实微信与 Google 均未验收 |

三轮官方组件均由 CUA 确认本站访问、保存可见结果，并点击“结束检查”。backend exit=0、worker exited=true、cleanShutdown=true、remainingBrowsers=0，已按各自确切 PID/父子关系核实无遗留。未停止正式 QQClaw PID 95560。真实模型的 `verification.json`、`official-page.jpg`、`qa-result.png`、原始事件/结果和 `sandbox-token-audit.json` 可复核，检查页是组件 QA，不是产品主页。

实验原生 helper 保留同一应用/Node/worker/native-host 的父子链、官方 Node REPL/native host 签名校验；CEF 分支仅核对固定 EXE、客户端 DLL、libcef.dll 摘要。主项目 helper 没有放宽，产品 tabCreation 仍 false；测试通过组件注入配置标 true，不是发布代码支持 CEF。原版扩展 manifest/background 摘要与前轮一致，未复制或修改。当前 NuGet libcef.dll 和 minimal bootstrap.exe 为 NotSigned，官方来源/摘要不能被描述成有效数字签名；生产安装/签名仍需实现。另下载的 signed runtime 档不含 bootstrap，不能把它的命名用于声称当前 bootstrap 已签名。

复现索引均在项目外 `C:/Users/admin/AppData/Local/Temp/qqclaw-cef-contract-20261101/`：`owned-worker.cpp`、`sandbox-worker.cpp`、`build-sandbox-probe.mjs`、`prepare-official-probe.mjs`、`CefProductComponent.cs`、`audit-sandbox.ps1`、两个 verify 脚本；`provenance.json` 保存源码/运行库/文档摘要。失败说明 `failure-notes.md` 包括原始初始化崩溃、wrapper 指针造成退出挂起、C# 编译准备错误、objdump 输出缓冲和 UTF-8 检查错误，未隐藏为全部首次通过。无沙箱原型不是可发布候选。

另从前轮真实模型事件复核 10 份上下文数据，产品 contextSnapshot 得出 4.9%→9.8%，last 最后 25410、窗口 258400、累计 total 199577；保存为 real-context-evidence.json。没有发起额外模型请求，也不是本轮完整 UI 验收。

仍需把这个有沙箱的 CEF worker 接入产品实际标签/面板，保持每会话隔离、焦点、尺寸、关闭/取消、下载/查找及应用退出；完成可分发依赖和官方资源安装、真实模型/微信整链路、Google 成功结果、Mac 原版扩展内核。CEF 源码能力不能推导实际 Chrome 标签与产品标签映射、普通窗口样式/工具栏或正式 GUI 已符合参考图。原先 WebView2 新标签失败记录继续有效，以下章节为该阶段历史。整体 goal 继续 active。

## 最新进展：真实模型与隔离微信消息流程已通过，完整目标仍未完成

正式成品保持 0.3.32。以下实现仍属于未发布源码，不能把旧版 EXE/DMG 当成已包含本次接入。

真实配置模型 `gpt-6.1-sol/xhigh` 已经使用原版官方扩展读回本机网页标题与正文；进一步通过产品 App、WeChatBridge、CodexClient、原生 BrowserHost 和官方组件，完成隔离微信 API 的接收、网站确认、`/allow`、继续浏览、返回结果。此轮 5 次官方浏览器工具调用、1 次网站确认，微信接口记录 4 条消息，typing 开始/结束正常，待确认与待发送均为 0。模型请求不是 Responses 夹具，微信网络与保存接口是夹具；检查宿主只有浏览器/解密接口，文件快照显示不可用，不能把它称为线上微信、持久化或完整 EXE GUI 验收。

自动新建标签**未修复**。静态审查与组件实测均表明，原版扩展调用 `chrome.windows.getAll({windowTypes:["normal"]})`，WebView2 只有 `popup`；接管现有标签后，`browser.tabs.new()` 仍报 `Created browser window has no id`。原生宿主记录到了新窗口事件，但扩展未得到可用普通窗口 ID。源码现明确返回 `tabCreation:false`，模型指引与连接原因披露限制；操作已有专用标签不能算新建标签已实现。

Google 实测已用官方扩展在已有空白页打开主页、输入并提交“2026年11月1日 AI 热点”，随后进入 Google 的验证码页；未解验证码或绕过，未取得搜索结果。该次还受用户全局 AGENTS.md 影响，发生一次与任务无关的首相 `webSearch`，所以**不能判全程仅用官方扩展通过**。已按实际读取的[官方配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)加入 `web_search="disabled"`，实际安装版 `config/read` 确认生效；修复后的隔离微信真实模型检查独立搜索和命令抓取均为 0。全局 AGENTS.md 未改动。

当前 119 项既有回归及 10 项许可/消息预算/失败清理检查通过。新增失败清理覆盖浏览器许可服务启动异常时关闭本地 Provider 转接监听端口，再次连接可成功。CUA 已检查填写、密码掩码、刷新/切会话保留、空值/超范围拒绝、拒绝与同意恢复；1280×720 时确认卡高约 374px、内容内部滚动，0 未处理前端错误。未发布 Windows 编译成功，仍为 .32 manifest，未替换正式程序。

证据根 `C:/Users/admin/AppData/Local/Temp/qqclaw-host-contract-20261101/`：真实模型首次本机页为 `product-component-5779c1b6b4be4257a186aaa6c9b6d459`；新建窗口负例为 `window-component-41dad7ef6fea45b28922a81eaa28d5ec`；Google 失败为 `window-component-5c0c399e25304f059642852f3c7380db`；修复后真实模型与隔离微信为 `window-component-c1621324a04e43d69567af820c30575f`，含 `verification.json`、实际请求/事件、接口消息及 `official-page.jpg`。配置确认见 `search-config/verification.json`；表单见 `approval-ui`；编译见 `development-build/build.json`。

仍需解决新建标签内核兼容、Google 结果、真实微信及正式 GUI、全新电脑官方资源安装、过长数据目录和 macOS。运行组件仍从官方安装位置发现，未提供仅装 CLI 的全新电脑完整路径；WKWebView 尚未接通原版 Chrome 扩展。CEF/CefSharp 文档已作初步阅读，但未验证官方 nativeMessaging 和新窗口能力，未更换产品内核。

证据完整性说明：旧运行器覆盖了最早的 `regression-first-expanded.tap`，故不再将其称作完整原始失败输出；已修复运行器并记录于 `regression-evidence-note.md`。本轮两个测试准备错误（夹具引号、未创建独立 CODEX_HOME）均保留为失败，不计通过项。更多过程记录和正式成品状态见 [result.md](../result.md) 首节。

## 首次接入组件记录（历史开发步骤，未发布）

2026-11-01，源码新增接入实现。正式 Windows/Mac 成品仍为 0.3.32；下述功能未构建进正式包，不得用旧版成品的源码一致性检查覆盖这些新增文件。本文下方“尚未找到连接实现”等段落保留为历史调查，不再表示最新组件能力。

实际链路是：QQClaw `CodexClient` → 真实独立 Codex 0.157.1 回合 → 未修改且签名有效的官方 Node REPL → 原安装位置的官方 browser-client/browser-service → QQClaw 自己按真实活动 thread/turn 签署的本机任务许可 → 经过签名和所属进程验证的官方 native host → QQClaw WebView2 内加载的原版 ChatGPT 扩展。扩展 ID 为 `hehggadaopoacecdllhhajmbjkdcmajg`，版本 1.26.1020.11845。没有把 vendor 文件复制进项目，没有借用开发聊天、Desktop/IAB 的管道、令牌或站点许可，没有移除官方校验或改用自建网页驱动。

原生元数据检测要求 helper 与应用使用同一个 EXE，调用 helper 的 Node 必须是该应用的子进程；目标 WebView2 必须属于同一个应用，官方 native host 只能是这个 WebView2 的子进程。验证 OpenAI/Microsoft 发布者及数字签名后，仅查询该 native host 的管道句柄名称，拒绝不唯一或已变化的进程。这个检测不读取网页、浏览器登录数据或其他聊天。

已实际完成一次完整**组件**检查：在 CUA 检查页点击本次站点确认后，官方扩展打开独立本机测试页，返回匹配的 DOM 正文及真实截图。使用的是产品 `CodexClient`、`prepareOfficialBrowser`、`BrowserHost.cs`、`OfficialBrowser.cs`，模型 Responses 为 localhost 协议夹具；不是实际 AI 决策、正式 EXE GUI 或真实微信验收。关键证据在项目外 `C:/Users/admin/AppData/Local/Temp/qqclaw-host-contract-20261101/product-component-fbe0e40549c64c9994c7e280a525e112/`：`result.json`、`requests-and-events.json`、`native-helper.json`、`official-extension-page.jpg`、`consent-result-ui.png`。

| 新增/修改索引 | 职责 |
| --- | --- |
| `backend/browser-access.mjs` | 内存 Ed25519 密钥、本机长度帧协议、严格活动任务许可、重放拒绝与关闭；只代表 QQClaw 自己的任务授权，不能称为 OpenAI 签发的身份 |
| `backend/official-browser.mjs` | 读取官方安装路径和扩展 manifest，核对官方 ID；原生所属进程检测；独立 MCP 配置与运行指引 |
| `native/OfficialBrowser.cs` | WinVerifyTrust、发布者/父子进程校验、限定 PID 的只读管道元数据查询；以原程序 helper 模式运行，不依赖 PowerShell 脚本策略 |
| `native/BrowserHost.cs` | 每个会话独立官方扩展环境，引用安装目录的原版扩展，与应用 UI 的 WebView 隔离 |
| `backend/codex.mjs` | 原生回合的许可生命周期，官方 MCP 配置、表单确认、过期拒绝/清理；已结束任务与未知子代理不授权 |
| `backend/codex-approvals.mjs`、`ui/approval-forms.mjs` | 保留受支持表单的字段和校验，敏感输入只在当前 UI 内存；未知 schema 拒绝；表单与源请求绑定 |
| `backend/bridge.mjs`、`backend/wechat-commands.mjs` | 微信确认编号绑定账户/发送人/任务；`/allow`、`/deny` 可在任务运行中处理；桌面任务不转发微信 |

新增 9 项任务/确认/微信额度检查通过；既有 119 项回归在接入开发中通过，后续改变需继续按影响验证。站点确认也计入 10 条推送额度：晚到的确认最多占用剩余一条，保留两条用于最终摘要和结果包；额度不足时 `/status` 使用用户新消息上下文展示具体待确认动作。六条过程上限保持；多个/超大结果包可能仍需用户新消息才能续传，不能保证无限附件在固定十条内全部投递。

实际失败及修复记录：首次原生通道检测用 PowerShell 文件，被当前系统执行策略拒绝，已改为程序内 helper，未修改系统策略；C# JSON 数组类型和无控制台 UTF-8 输出有两次失败，均已修正。深层测试数据目录下官方扩展 LevelDB 报 `MANIFEST-000001 ... Unable to create writable file`，导致官方列表为空；改用较短、独立的测试数据路径后成功。对过长自定义数据目录仍需兼容性处理，不能掩盖成“未安装扩展”。禁用 DevTools 的对照复测没有解决空列表，产品没有因此开放 DevTools。普通 `approvalPolicy=never` 会在 app-server 内直接拒绝站点询问，现对已配置官方浏览器的自动模式使用 granular：仅允许 MCP 确认到达用户，沙箱/规则/权限升级不因此获得允许；ask 模式仍走原确认政策。首次检查页漏处理 favicon 导致夹具服务器退出，修复路由后重新检查才走通。首次新增测试缺 senderId，修正合法微信消息夹具后通过；一次旧回归被不兼容的 client stub 挂住，修正可选 client entry 后重新通过。扩大运行历史废弃测试曾有 5 项失败，原始输出保留为 `regression-first-expanded.tap`，不能隐去或算入当前基线通过数。

仍需完成：真实配置模型驱动的浏览、Google 搜索、完整正式界面表单/关闭/多会话/取消/重启回归、微信完整闭环、干净机器官方运行组件安装入口和 macOS 扩展内核接入。目前运行组件发现仍依赖已经安装的官方资源；这不满足仅装 CLI 的全新电脑条件。WKWebView 尚不具备此条实现，不把外部 Chrome 或旧手动预览当作 Mac 已实现。原始 goal 保持 active。

更新：2026-11-01。初始静态调查快照对应 **0.3.26**；最新独立实例复查见0.3.29补充。产品构建和导航修复见result.md，本文件不代表官方自动浏览验收通过。

0.3.27 补充：本版新增的是用户手动关闭标签后的恢复，没有新增官方扩展授权或模型自动浏览；本调查快照继续保留。

0.3.28 补充：当前内容查找调用 WebView2/WKWebView 的用户查找 API，关闭/新查询可取消旧等待；它没有注册模型浏览器工具、没有完成官方扩展独立授权。Mac 云端原生查找或手动界面检查均不能填作微信自动浏览成功；原调查快照与未完成结论保留。

## 0.3.30 更新边界

0.3.31 继续精简输入栏及模型配置，支持无模型列表服务的手填 ID 和原子保存；没有更改浏览器宿主或提供替代自动化。官方扩展自动浏览仍未接通，最新构建与证据见 `../result.md` 文末。下面的原生目标检查不能当作官方扩展授权证明。

0.3.30 已把原生持续目标接入 QQClaw：跨回合监督、工作区锁、文件快照、暂停/继续、真实统计、源附件、备份与阶段文件汇总均有独立检查。Windows 已正常替换和启动，Mac 云构建见 `../result.md`。这些是目标生命周期实现，**不提供官方浏览器的可信运行环境、扩展配对或网站/任务授权**。当前 `available/connected` 仍没有接入成功证据，不能从目标 API 可用推导微信可以自动操作官方浏览器。

公开源码审查和独立实例结果继续按下文限定范围有效；不重跑无进展的查询来增加通过数字，不改成其他浏览器工具。原始官方扩展目标及主页全部 1:1 仍未完成。

## 0.3.29 独立实例与最新协议复查

2026-11-01实际重新读取官方扩展页面和app-server的CLI/远程Code Mode host章节；页面工具返回及快照保存于项目外qqclaw-official-probe-20261101。官方页面仍描述从桌面应用设置安装、连接及管理网站许可；远程Code Mode host说明不能当作浏览器授权契约。

当前codex-cli0.157.1，在空的独立CODEX_HOME下移除父worker/浏览器环境和两类API key，以真实qqclaw_browser_probe客户端initialize并仅查询metadata。子进程正常退出0，没有模型回合、其他聊天读写、vendor浏览器运行时执行或官方扩展连接。browser_use、browser_use_external、in_app_browser、code_mode_host等feature flags为stable/enabled；因此不应声称CLI根本没有编译浏览器功能。

生成的完整实验ClientRequest含167个方法，未找到browser命名的独立连接/授权方法；BrowserUseConfig公开字段是网站策略和历史许可。该发现不排除其他未查明契约，初始化和功能开关也不证明已有可信宿主/授权或真实调用。evidence.json、app-server-preflight.json和schema/保留实际结果，不保存凭据或父聊天管道。

下一步仍是自身身份下的可信Code Mode/浏览器服务和任务/网站授权。不能通过删校验、假nodeRepl、自签始终允许、既有开发聊天管道或自建远控凑完成。本版导航修复是手动预览，**官方扩展自动浏览仍未完成**；其余静态协议快照继续保留。

## 2026-11-01 公开 Code Mode 宿主源码复查

已从官方仓库读取固定提交 [67f0994b532b8740f14b5b738af7b7b2a915b1d6](https://github.com/openai/codex/commit/67f0994b532b8740f14b5b738af7b7b2a915b1d6) 的相关源码。本次是下列文件的静态审查，没有编译该提交或把它当成本机 `codex-cli 0.157.1` 的同版本实现。

| 官方源码（固定提交） | 本次确认的行为 |
| --- | --- |
| [app-server/src/code_mode_host.rs](https://github.com/openai/codex/blob/67f0994b532b8740f14b5b738af7b7b2a915b1d6/codex-rs/app-server/src/code_mode_host.rs) | 默认本地宿主；传入URL则选择gRPC出站连接。这是传输选择，不是扩展配对或授权 |
| [code-mode-host/src/lib.rs](https://github.com/openai/codex/blob/67f0994b532b8740f14b5b738af7b7b2a915b1d6/codex-rs/code-mode-host/src/lib.rs) 及 [delegate.rs](https://github.com/openai/codex/blob/67f0994b532b8740f14b5b738af7b7b2a915b1d6/codex-rs/code-mode-host/src/delegate.rs) | 使用InProcessCodeModeSession；嵌套调用回交已有工具执行器，不自动注册浏览器服务 |
| [code-mode-runtime/src/runtime/globals.rs](https://github.com/openai/codex/blob/67f0994b532b8740f14b5b738af7b7b2a915b1d6/codex-rs/code-mode-runtime/src/runtime/globals.rs) 及 [module_loader.rs](https://github.com/openai/codex/blob/67f0994b532b8740f14b5b738af7b7b2a915b1d6/codex-rs/code-mode-runtime/src/runtime/module_loader.rs) | 安装tools、text、store等V8全局；模块导入返回Unsupported import in exec。不能把它等同于带privileged nodeRepl/nativePipe的浏览器运行环境，或假定能直接import browser-client |

因此，仅编译公开code-mode-host、追加启动参数或启用feature flag，不能构成当前缺失的官方扩展授权实现。此结论限定于已审查路径，不是对全部私有技术路径不可行的证明。真正缺少的仍是QQClaw自身身份下的服务注册、可信运行环境和真实任务/网站授权。

同时实际读取了官方 [Manage a thread goal](https://learn.chatgpt.com/docs/app-server#manage-a-thread-goal) 和该提交的thread_goal_processor.rs / thread_read_state.rs。原生目标可以在空闲时立即启动回合，active目标的回合结束也可能触发后续执行；它不是纯显示字段。QQClaw当前CodexClient.answer在首个turn/completed结束监听，App.run随后完成快照并释放工作区锁，不能直接加“目标”按钮就宣称支持。接入前须覆盖多回合事件、审批、任务归属、最终结果、微信六条过程预算、显式停止、保存与重启恢复。

本机0.157.1实际生成的ThreadGoalSetParams只有threadId/objective/status/tokenBudget，没有上述公开提交使用的origin字段；ThreadResumeParams也没有deferGoalContinuation（不能从fork参数直接移植到resume）。实现必须以运行版本的协议和实测生命周期为准。上述检查没有启动模型、改写任何原会话目标或发送微信消息。

证据及7份源码SHA-256：项目外 `C:/Users/admin/AppData/Local/Temp/qqclaw-official-probe-20261101/public-source-review.json`。这是新增静态调查，既有功能检查数字不计作本次新验收。产品源码、版本、成品和运行进程未改，整体目标继续active。

## 当前结论

2026-11-01 补查 `requestAttestation`：已实际读取 [初始化文档](https://learn.chatgpt.com/docs/app-server#initialization) 及固定提交的 `app-server/src/attestation.rs`、`core/src/attestation.rs`、`core/src/client.rs`、`model-provider/src/provider.rs` 等 8 份公开源码。该能力让已具备证明能力的宿主返回 opaque token，app-server 包装后放到上游 `x-oai-attestation` 请求头；它不会签发浏览器授权。公开 provider 默认不发送证明，所检查实现按 ChatGPT auth 决定是否发送；因此用本地假模型回合也不能证明具备真实宿主证明能力。浏览器 `request_headers` 则是 requirements 数据，不能补齐原生连接和当前任务授权。

独立安装版 0.157.1 以自身 `qqclaw_browser_attestation_probe` 身份、空 CODEX_HOME、`requestAttestation=true` 完成初始化并查询元数据，退出码 0；没有 browser requirements，元数据检查期间没有 server request。**没有发起模型请求或生成有效证明，不能把这个结果扩大为浏览器授权已被完整测试。** 没有使用开发聊天管道/令牌或第一方客户端名称，也没有签一个始终允许的响应。公开主分支没有在本轮编译，不能等同于安装版代码。

证据在项目外 `C:/Users/admin/AppData/Local/Temp/qqclaw-browser-attestation-20261101`：`review.json` 保存 8 份源码摘要、文档与探针范围；`official-initialization.json` 是实际页面摘录；`attestation-capability.json` 是运行结果。源仓库采用 sparse checkout，缺少的工作区文件改由 `git show` 读取、跨树检索使用 Git 对象，未把本地 `rg` 未命中当作源码不存在。首次探针退出 1，旧脚本未保留 stderr，原因不能精确追溯；补建独立目录并保存诊断后成功。这些不是产品浏览器验收通过项。

**QQClaw 尚不能通过官方 ChatGPT 扩展执行微信发起的浏览器任务。** 本机存在官方扩展安装文件和签名有效的官方 native host；这些证据不能证明 QQClaw 已获得独立连接、可信运行环境、任务授权或站点许可。

已读取的官方文档描述桌面应用连接扩展的流程；本次未找到可直接用于 QQClaw 的独立第三方宿主接入契约。静态协议分析揭示了更多组件，但没有形成可发布的独立连接实现。不能把这个结论扩大为“所有技术路径都已证明不可能”，也不能把私有接口名称或安装检测当作成功接入。

用户要求自动操作必须通过官方 ChatGPT 扩展。现有手动 WebView2/WKWebView 预览、SDK 自建浏览器驱动、其他远控或自建 MCP 均不能作为这项要求的替代交付。

## 证据分层

| 层级 | 本次核实内容 | QQClaw 当前状态 |
| --- | --- | --- |
| 扩展安装 | Chrome/Edge 的官方扩展 ID、manifest、版本及 Chrome service worker 静态代码 | 检测安装文件；不证明启用或通信成功 |
| Native messaging host | 官方 host 名称、注册 manifest、allowed_origins、可执行文件签名 | 本机宿主存在；未建立 QQClaw 独立会话 |
| 消息传输 | 扩展 connectNative、JSON-RPC 请求与响应、断线重连 | 只读分析；未运行协议实验 |
| 可信运行环境 | browser-client 使用 nodeRepl.rpc；service 要求 config 和 privileged nativePipe | 产品尚未实现官方可接受的独立运行环境 |
| 当前任务授权 | session/turn/nonce 绑定及签名响应检查 | 未获得可用于 QQClaw 的独立授权流程 |
| 站点及具体操作许可 | 官方文档的网站访问许可；service 的独立权限路径 | 未完成与 QQClaw 的连接和状态同步 |
| 模型真实调用 | 微信指令→Codex→官方扩展→网页操作→实际结果→微信 | **未通过，未执行本次端到端检查** |

尤其注意：Chrome service worker 在 connectNative 返回 port 后便将 transport 状态设为 connected；它随后仍可能断开、超时或拒绝操作。这是通信层状态，不能直接映射为产品的“自动浏览可用”。

## 官方文档：已读取的内容与边界

1. [Browser extension](https://learn.chatgpt.com/docs/chrome-extension)：从官方桌面应用 Settings > Computer Use 安装、管理扩展，在桌面聊天中以 @ 提及浏览器；网站访问许可由该应用管理。该页未给出第三方 app-server 独立接入或签发浏览器授权的方法。
2. [app-server initialization](https://learn.chatgpt.com/docs/app-server#initialization)：客户端应使用自身 clientInfo 标识。requestAttestation 让服务端发起 attestation/generate，由具备能力的宿主回复 opaque token；不是获取浏览器权限的自助签发接口。
3. [Remote Code Mode host](https://learn.chatgpt.com/docs/app-server#connect-a-remote-code-mode-host)：--code-mode-host 控制 app-server 向 Code Mode 宿主建立的出站连接，与 --listen 不同；同一进程的线程共享所选宿主。文档标为实验性、不支持生产负载，没有说明如何获得官方扩展授权。知道这个参数不能推出浏览器已可用。
4. [Computer use SDK drivers](https://developers.openai.com/api/docs/guides/tools-computer-use-sdk-drivers)：开发者实现自身 driver，应用负责会话、许可和清理，SDK 分发工具调用。该 SDK 不能自动提供官方 ChatGPT 扩展的宿主授权，采用自建 driver 也不满足本项目的扩展硬性要求。

上述页面内容已实际读取；不是只看搜索摘要。未将第三方登录、通用 API 认证或 SDK 工具可调用等同于浏览器访问授权。公开文档中未找到接口，并不构成对所有私有协议可行性的穷尽证明。

## 本机安装材料

| 材料 | 静态核实结果 |
| --- | --- |
| Chrome ChatGPT 扩展 | ID hehggadaopoacecdllhhajmbjkdcmajg，版本 1.26.1020.11845，service worker 为 background.js |
| Edge ChatGPT 扩展 | ID odlomjlbamekndcpllcnffbgeohgkmjh，安装目录版本 1.26.901.11451_0 |
| native host | com.openai.codexextension，manifest type=stdio，allowed_origins 包含上述两个扩展 origin |
| 注册位置 | HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.openai.codexextension |
| manifest | %LOCALAPPDATA%\\OpenAI\\extension\\com.openai.codexextension.json |
| 可执行文件 | 用户 Codex 插件目录 openai-bundled/chrome/latest/extension-host/windows/x64/extension-host.exe |
| Authenticode | 检查结果 Valid，签名主体 OpenAI OpCo, LLC；仅证明所检查二进制的签名状态 |

本次源文件 SHA-256 如下；完整路径、大小、格式化副本摘要与签名状态在项目外调查目录的 evidence.json。该证据文件仅供复查，不是应用运行依赖。检测到官方商店 ID 下的文件不能单独证明整个扩展目录的完整性；本项目没有把文件存在检测标成官方签名校验。

| 源文件 | SHA-256 |
| --- | --- |
| Chrome manifest.json | 8C412BB7174B220C8E24C35592642FEDE0645AF6D75DA43C95B3A25FF5868AD5 |
| Chrome background.js | 2564D018E01F71365DB8ADFB5CCD36DE981446328854D84328BDDCDA236B8E39 |
| Edge manifest.json | A26EF4C52165917162701D9A95F489A366ABD4F0439FF7D6DB52867D75D595E5 |
| native-host manifest | 871554DD8C47F8ECE6DB6847D2FE9C2C5FED56DC2E38F2467BF9D27F1E703EFC |
| extension-host.exe | E3E1F3BD7400F1F2E2BE8CB1C7DFCEA50C05EBDB20B38EFCF2813F5701C69286 |
| browser-client.mjs | 40C6C39D09AAC12FEB20FDAB28D219B02E42C76A59E3CC5D1A814A8CF3976DA5 |
| browser-service.mjs | 1AF22149F394099EBF6C3D8AED8814A9362DDA4C0BB2369EF0C37AAF239A7696 |

## 静态调用链与代码定位

调查目录：`C:\Users\admin\AppData\Local\Temp\qqclaw-official-protocol-20261101`。以下行号属于该目录内固定摘要对应的格式化副本，**不是稳定的公开 API，也不是项目源码行号**。仅用 esbuild 解析、格式化文本，没有导入或执行 vendor 代码。

| 格式化材料 | 定位 | 实际行为 |
| --- | --- | --- |
| formatted-chrome-background.mjs | 9947、9982、10001、10029、10050 附近 | 默认连接 com.openai.codexextension；JSON-RPC 2.0；扩展→宿主请求 ID 为 native-host:N；连接 port 后设置 connected，之后单独处理超时和断开 |
| formatted-browser-client.mjs | 3526–3545，setupBrowserRuntime 对应 nT | 要求 nodeRepl.rpc，通过 browser 的 setup/execute/executeWithRecovery 调用宿主服务；普通 Node 导入不会自动获得可信服务 |
| formatted-browser-service.mjs | 10692–10701，Oe | 从 requestMeta 的 x-codex-turn-metadata 读取当前任务元数据 |
| 同上 | 1261、29664–29694，V6/dce | 按 executor/session/turn 和随机 nonce 请求 browser/access，校验签名及响应 payload |
| 同上 | 28666–28685，iue/pb | nativePipe.createConnection 由可信 nodeRepl 提供；缺失时明确报 browser-client is not trusted |
| 同上 | 27027–27029，getExtensionRequestHeaders | 扩展请求头来自 requirements.browserUse.extension；只读了函数，没有读取本机真实 requirements 或凭据 |
| 同上 | 28364、28459 附近 | 独立调用 assertBrowserAccess；不是完成一次 transport 连接后永久获得权限 |
| 同上 | 33799–33808，bH | 要求 privileged Node REPL capabilities，组装 runtime 并绑定 assertBrowserAccess |
| 同上 | 33847–33853，setup | environment 仅接受 codex-app/training/cloud/orbit；填入其中一个字符串不证明拥有相应宿主身份或权限 |

签名检查的精确含义：

- 三个环境变量名称分别为 BROWSER_USE_ACCESS_EXECUTOR_ID、BROWSER_USE_ACCESS_PIPE_PATH、BROWSER_USE_ACCESS_VERIFYING_IDENTITY。本次只读静态名称，未读取当前进程的真实值。
- executor 存在时，必须有当前 session_id 和 turn_id；请求还包含新的随机 nonce。同一 session/turn 的结果在该 runtime 中缓存。
- 验证公钥从宿主注入的环境值按 SPKI/DER 解析，**不是代码中固定的一把 OpenAI 公钥**；因此不能宣称“数学上只有 OpenAI 私钥才能运行”。
- 响应签名通过后，payload 还必须精确匹配 domain=codex.browserAccess.v1、原请求和 allowed=true。
- executor 缺失时 V6 中有直接返回的分支；删掉该变量、返回伪造许可或自己签一个始终允许的响应，均没有证明已建立符合用户要求的官方授权链。

本次没有复制开发聊天令牌/管道，没有用它们发起产品请求；没有读取 Chrome Local State、Local Extension Settings、Cookie 或真实浏览器身份。service 内含此类发现代码，不等于本次运行了这些代码。

## 当前产品代码的责任

- backend/browser.mjs：officialBrowserStatus 只读安装文件，connected/available 均保持 false；BrowserViewer 是用户手动预览。browserIsolationArguments 隔离依赖其他桌面会话的插件及旧自建工具。
- backend/codex.mjs：Codex 任务上下文说明官方自动浏览未完成。只去掉隔离参数不能补齐可信运行环境或授权链。
- ui/app.mjs：设置显示安装检测；网页工具栏标为手动预览。不能将这些状态改名为“官方浏览器已连接”。
- native/BrowserHost.cs / native/macos/BrowserHost.swift：原生预览、标签、下载和历史；不是官方扩展的自动操作接口。

本次未修改这些实现，没有重新启用旧 MCP，没有向原微信账户/原会话发测试消息，也没有修改官方 host 注册表或重新分发 vendor bundle。

## 仍需解决与验收

下一步要解决的是：在 QQClaw 自身身份下创建可用的可信宿主、完成官方扩展连接及真实任务/站点授权。扩展文件是否存在、JSON-RPC 方法名是否已知和 Code Mode 参数能否识别，都不能替代这一步。若继续使用未公开协议研究，必须逐项验证实际授权和许可边界，不能将猜测当作已实现。

完成标准仍是独立端到端结果：在不依赖开发聊天或外置 codexhost 的干净环境中，经初始配置安装官方扩展；微信发出浏览器任务后由模型实际调用官方扩展、打开 Google 并搜索，返回真实结果；中途失败、站点拒绝或扩展断开须如实反馈。还须保持任务归属、桌面发起不回微信、进度预算及最终文件发送行为。

**目前没有这条完整链路的通过证据，整体目标未完成。** 0.3.26 已有的 UI/原生检查继续只证明各自列明的范围；Mac 整套实机 GUI、原生页焦点下的查找快捷键/中文输入法、Apple 公证、网页批注及完整 SPA/Cookie/站点权限等差异仍见 result.md。
