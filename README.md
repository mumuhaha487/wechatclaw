# QQClaw

当前源码为 **0.3.6**：新增 macOS 原生宿主和通用构建配置，并补充独立对话备份/恢复。Mac 使用 `release/macos/QQClaw.dmg` 安装包，兼容 Apple Silicon 和 Intel；完整 GUI 和微信实机验证仍待完成。Windows 正式 EXE 仍为 0.3.5，未强制退出或覆盖。

轻量 Windows / macOS Codex 工作台。在桌面上编程，也可以通过腾讯 iLink / ClawBot 从微信操作各自的项目目录。

界面保留 PI-Desktop 的项目侧栏、会话区、输入栏、自定义弹出菜单、整页设置与右侧工作面板。本轮根据 Taste Skill 的应用界面规则尝试新的视觉样式：浅色框架、白色工作区、克制的选中状态与圆角；首页直接展示工作目录和任务起点。默认亮色，左下角第二个入口为「连接到微信」，使用线条图标。后台使用独立的 Codex 与微信连接实现。

## 直接使用

Windows：双击 **`release/QQClaw.exe`** 即可打开。只保留这一个 Windows 程序，后续更新直接替换同名文件。Windows x64 便携版，无需安装本应用。EXE 小于 1 MB，不携带 Node.js、Codex CLI 或浏览器运行时。更新时先退出程序，账户和设置会继续沿用。

Mac：把 **`release/macos/QQClaw.dmg`** 传到 Mac，双击打开，将 QQClaw 拖到旁边的 Applications（应用程序）。以后直接在「应用程序」中双击 QQClaw 即可启动，不需要自行编译或运行终端命令。支持 macOS 13.3+。首次若被系统拦截，先尝试打开一次，再到「系统设置 → 隐私与安全性 → 仍要打开」确认；当前版本尚未 Apple 公证。首次使用仍需按软件内引导安装 Node.js 和 Codex。

1. 在「设置 → 运行环境」检测环境。需要 Node.js **22.13+**、Codex CLI，以及系统 WebView2 Runtime。界面提供 Node.js/WebView2 官方安装入口和 Codex CLI 安装按钮，也能手动选择程序路径。
2. 使用本机配置时，可沿用现有 Codex 登录与 Provider；尚未登录可点击「登录 Codex」。使用自定义 API 时不需要另行登录 ChatGPT。
3. 添加项目目录，输入任务，选择模型与思考等级，即可在桌面编程。权限菜单提供「每次询问 / 允许编辑 / 全自动」，工作模式中可切换只读。需要确认的命令在电脑上显示审批卡片，允许后执行；全自动在工作目录的沙箱内运行。
4. 点击左下角第二个微信线条图标，为账户选择目录、服务、模型、思考等级与权限，然后生成二维码。使用自己的微信扫码确认；如有数字验证码，在面板内填写。
5. 后续点击同一个图标可查看所有账户，分别配置目录、查看会话、暂停接收、重新扫码或断开连接。

首次启动若未配置 Codex，会显示「当前环境未配置 Codex 环境，请在设置中进行配置」，只能通过「前往配置」进入安装引导。先从官网安装 NodeJS，程序会自动重新检测；随后点击「一键安装 Codex」执行 `npm install -g @openai/codex`，成功后自动重启并识别环境。

微信会话也能在桌面直接输入。两端共用同一会话和工作目录，同时到达的消息按顺序执行；桌面发起的任务只在桌面回复。处理微信消息时显示微信原生「正在输入」状态，回复完成或任务结束后取消。

长任务不设置总运行时长上限，不会因达到 30 分钟而自动停止；渲染、导出等任务会继续等待 Codex 返回结果。可在桌面点击停止或在微信发送 `/stop` 手动停止。

空闲会话的 Codex 连接在 15 分钟无任务、排队和审批时自动回收，下次输入会恢复会话；不会中断运行中的长任务。主题、字体、字号与状态显示偏好可在任务运行期间保存，默认模型/权限及 Codex 路径仍需等待任务结束。

微信需要本机和应用保持运行；关闭窗口会停止接收，下一次启动会恢复已保存的账户。支持文字、语音转写、图片、视频、文件，以及未转写语音的原始音频附件。附件下载并解密后交给 Codex 读取；生成的图片、视频和文件通过腾讯 CDN 加密上传，以微信原生卡片发送。单附件上限 100 MiB。不处理群聊。

## 自定义 API 与模型

「设置 → 模型与 API → 添加 API 服务」支持填写名称、基础地址、Key。模型 ID 可留空自动发现，也可每行填写任意自定义 ID。

| 接口协议 | 工作方式 |
| --- | --- |
| Responses | Codex 直接调用配置的 `/responses`；选择「不发送思考参数」时通过本地转发层移除该参数 |
| Chat Completions | 本地兼容层将 Codex Responses 请求转换为 `/chat/completions`，包括工具调用及工具结果 |

模型需要支持工具调用，才能修改代码和运行命令。Chat Completions 适配层兼容普通 function 工具和 freeform 工具；它等待上游单次回复完成后再输出 Codex 事件，因此没有上游逐字流式效果。模型能力和第三方服务的协议实现仍决定最终兼容性。

API 基础地址示例：`https://api.example.com/v1`。本机服务也支持 `http://127.0.0.1:端口/v1`。不要把 `/responses`、`/chat/completions` 或 Key 拼进基础地址。

「读取模型并测试连接」使用模型列表接口；服务未提供 `/models` 时，可直接填写模型 ID 保存。列表读取成功只表示该接口可用，不代表模型已经完成编程请求。

本机模型列表通过当前 Codex `model/list` 获取，自动发现当前桌面版运行程序，避免读到旧安装目录的过时列表。第三方同时支持 `{ data: [{ id }] }` 与 Codex `{ models: [{ slug }] }` 目录。启动、打开模型菜单、切换服务、窗口重新获得焦点及每五分钟都会读取更新（遵守 60 秒缓存；定时仅刷新当前与默认服务）；菜单也提供刷新按钮。更新替换旧目录，保留当前选择；失败时保留上次结果并显示状态。模型 ID 和接口返回的思考等级都不设固定白名单。

Responses 本地转发层使用 240 秒空闲超时：等待响应头或连续 240 秒没有新数据才中断，每收到数据重置计时，总时长不限。Chat Completions 非流式单次调用仍使用 240 秒上限。

服务不接受思考参数时可选择「不发送」；接受时按输入框或账户选择传入。新会话默认值、现有桌面会话与每个微信账户分别保存。

## 工作目录与数据

- 项目右侧「…」→「绑定微信账号」，选择账号即可将该工作区分配给它；没有账号时可直接扫码连接。
- 每个微信账户绑定独立的配置与 Codex 会话。更换目录、模型服务或思考配置会创建新的微信会话，旧会话保留在历史中。
- Codex 的 `cwd` 和 `workspaceWrite.writableRoots` 设置为会话的真实目录，排除系统临时目录的额外写入授权。全自动不会自行申请更高权限；只读拒绝写入。每次询问与允许编辑模式可把 Codex 的操作请求交给桌面审批，微信账户使用这两种模式时也需要回到电脑确认。
- 同一工作目录的多个任务会顺序执行，避免桌面与微信同时编辑；不同目录可以并行处理。
- 微信命令：`/help`、`/status`（`/where`）、`/bind`、`/new`、`/resume R编号`、`/model`、`/effort`、`/stream`、`/prompt start`、`/prompt done`、`/stop`。模型列表动态读取，也允许直接填写第三方模型 ID。`/bind` 限制在桌面已添加的项目或已授权目录中。
- 过程进度默认开启，每个微信任务最多发送 6 条「【进度】」（长消息按实际分段计数）；第 6 条后发送一次“后续推送将进行省略。任务完成之后，会将结果汇报。请耐心等待。”，然后等待任务结束再发总结和附件。完整过程仍保存在桌面历史中。`/stream off` 关闭过程消息；任务运行时仍可接收 `/stop`。桌面发起的过程消息和结果不会发送到微信。
- 微信每个回复上下文最多使用 10 个消息额度，预留至少 3 个给最终结果。总结过长或附件过多时自动合并为 ZIP 结果包，保留完整总结、全部有效附件和原文件名（重名加编号），每包不超过 100 MiB；少量附件继续直接发原生卡片。极大量附件仍超额度时，保留未发送内容，微信再发一条消息后继续投递，不重新执行任务。重试与重启保留计数，输入状态不占消息额度。
- 窗口与后台之间的消息通过独立线程按顺序写入，UI 和读取后台输出的回调不进行同步管道写入，避免历史记录或加密快照变大后产生双向管道死锁，导致微信和桌面同时无响应。
- `/prompt start` 后可连续发送文字、图片、视频和文件，`/prompt done` 合并执行；最多 50 项，闲置十分钟过期，`/prompt cancel` 可取消。未转写音频交给 Codex 及其可用工具处理，不假定模型自带语音识别。
- 「配置账户 → 其他授权用户」可填写额外用户 ID，各用户的会话、消息上下文、模型覆盖和历史切换相互隔离。
- 账户忙碌检查覆盖号主与所有授权用户；正在绑定或等待投递的会话不能删除。修改账户的目录或模型配置后，各授权用户下次发消息会使用新配置创建会话，原有历史保留。
- 登录过期时可重新扫码。断开连接会清除该账户凭证和待回复队列，保留历史会话；同一微信账户再次扫码后可通过 `/resume` 继续。运行中的任务需要先停止或完成。
- Windows 应用数据默认位于 `%LOCALAPPDATA%\QQClaw`，`state.json` 整体使用 Windows DPAPI 当前用户加密。Key 不返回界面，不写入项目，也不修改 `~/.codex/config.toml`。Codex 自己的会话记录仍由本机 Codex 管理。0.3.6 明确使用持久化会话，并将 JSON/Markdown 对话备份保存到 Codex 用户目录下的 `qqclaw/conversations`；设置中提供恢复入口，删除程序不主动清理数据。
- 后台日志位于数据目录的 `logs\backend.log`，1 MiB 轮换，总共保留 3 份（当前、.1、.2）；只记录脱敏错误、有限堆栈和启停信息，写入失败不影响运行。未处理 rejection 记日志后继续，未捕获异常尽力清理后非零退出。
- 程序通过标准输入输出调用后台，不开放管理网页端口。Chat Completions 兼容层和可选的 Responses 转发层仅监听随机本机端口，并使用临时令牌。

## 二次开发

```powershell
npm ci
npm run build
```

构建使用 Windows 自带 .NET Framework 编译器和下载的 WebView2 SDK；不需要 Visual Studio、C++、Rust 或 .NET SDK。SDK 固定版本、下载后必须通过固定 SHA-512 校验，并缓存到系统临时目录。WebView2 SDK 的控制库会嵌入 EXE，WebView2 Runtime 使用系统安装版本。

Windows 构建始终只输出 `release/QQClaw.exe`。构建前请关闭程序；不会另存带版本号的程序。第三方许可证已经嵌入 EXE，临时构建文件写入系统临时目录。

`npm run dev` 编译并打开桌面应用。源码和成品目录不包含测试文件、测试截图或旧版程序。

| 路径 | 责任 |
| --- | --- |
| `backend/wechat.mjs` | 从旧项目提取的腾讯 iLink 协议传输 |
| `backend/bridge.mjs` | 多账户扫码、持续轮询、持久收件箱与投递、过程进度、重连和去重 |
| `backend/wechat-results.mjs` | 最终结果整合、完整总结与多附件 ZIP 打包、100 MiB 分包 |
| `backend/wechat-*.mjs` | codex-weixin 的媒体加解密、消息解析、发送动作、提示词、合并缓冲与微信命令 |
| `backend/codex.mjs` | Codex App Server JSON-RPC、模型列表、流式事件与权限 |
| `backend/adapter.mjs` | 第三方 Chat Completions 与 Responses 兼容层 |
| `backend/app.mjs` | 项目、会话、模型服务、目录任务队列和操作路由 |
| `backend/store.mjs` | 合并尾随保存、快照时序保证、原子替换、凭证过滤与 DPAPI 桥接 |
| `backend/log.mjs` | 数据目录内的脱敏滚动日志，失败静默 |
| `native/Program.cs` | Windows 窗口、WebView2、文件夹选择、依赖安装与进程生命周期 |
| `ui/` | 独立实现的桌面界面 |
| `shared/workspace.mjs` | Windows 与 POSIX 路径身份比较，保留大小写敏感卷中的不同目录 |
| `scripts/build.mjs` | 按本机平台选择构建流程 |
| `scripts/build-windows.mjs` | Windows 前后端打包、SDK 获取、单 EXE 编译与许可证收集 |
| `native/macos/` / `scripts/build-macos.mjs` | Mac 原生宿主、两种架构编译/合并、签名和唯一 DMG 安装包 |
| `backend/conversations.mjs` | 独立对话备份、Codex 历史关联和恢复格式校验 |

两条链路的提取过程、接口与复用示例见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## macOS 与对话数据

Mac 适配面向 macOS 13.3+，使用 AppKit + 系统 WebKit，支持 Intel / Apple Silicon 通用构建。界面使用原生标题栏、Cmd 快捷键和系统剪贴板，安装页识别 Mac 的 Node/Codex 路径。

在 Mac 安装 Xcode 15+ 的 Command Line Tools 和 Node.js 22.13+，执行 `npm ci`、`npm run build:mac`。产物为 `release/macos/QQClaw.dmg`，内含一个 `QQClaw.app`、Applications 快捷入口和中文安装说明。源码已保存到 [mumuhaha487/wechatclaw](https://github.com/mumuhaha487/wechatclaw)。Windows 可在该仓库的 [Mac 构建工作流](https://github.com/mumuhaha487/wechatclaw/actions/workflows/macos.yml) 点击 Run workflow，由 macOS 云端机器完成编译并下载产物。

Mac 应用数据位于 `~/Library/Application Support/QQClaw`，加密密钥存放在系统钥匙串。删除 EXE 或 .app 不会主动删除账户数据、Codex 原生历史或独立对话备份。**独立备份是可读的 JSON/Markdown，附件只保存原路径；个人备份时还需保留 Codex 用户目录、项目和附件本体。**

真实 Codex 已验证关闭后由新进程读取原生历史并继续原会话。其他 Codex 客户端是否在侧栏显示该会话由它的列表过滤规则决定；可以用 `codex resume <threadId>` 继续。Mac 成品使用本地签名，尚未做 Apple Developer ID 签名或公证。完整的数据位置、恢复步骤、构建和未验证边界见 [docs/MACOS-AND-DATA.md](docs/MACOS-AND-DATA.md)。

## 来源

微信传输提取自 [mumuhaha487/codex-wechat](https://github.com/mumuhaha487/codex-wechat)，保留 MIT 许可证。附件、发送动作、消息标准化与提示词缓冲基于 [XavierJiezou/codex-weixin](https://github.com/XavierJiezou/codex-weixin) 的实际源码和测试集集成；MIT 许可证保存在 `docs/CODEX-WEIXIN-LICENSE.txt` 并嵌入 EXE。协议对应腾讯公开的 [iLink 文档](https://github.com/Tencent/openclaw-weixin/blob/main/docs/protocol_zh_CN.md)。UI 参考 [vastsa/pi-desktop](https://github.com/vastsa/pi-desktop)，首页吉祥物图片沿用上游资源，其 LGPL-3.0 许可证保存在 `docs/PI-DESKTOP-LICENSE.txt`，随 EXE 分发的第三方声明也包含该许可证。图片原文件随本项目源码保留在 `ui/assets/`。

Codex 对接依据 [App Server](https://developers.openai.com/codex/app-server)、[自定义 Provider](https://developers.openai.com/codex/config-advanced/) 与 [Windows 沙箱](https://developers.openai.com/codex/windows/) 文档。QQClaw 是独立项目，非腾讯或 OpenAI 官方客户端。

微信功能的源码核对表、消息路由及验证边界见 [docs/WECHAT-PARITY.md](docs/WECHAT-PARITY.md)。
