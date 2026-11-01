# 官方 ChatGPT 扩展接入调查

## 最新源码检查点：原生 worker、C# 桥接与独立构建入口

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
