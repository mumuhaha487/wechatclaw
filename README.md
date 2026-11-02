# QQClaw

QQClaw 是独立的 Windows / macOS Codex 与微信工作台，默认白色为主、黑色为辅。当前源码 **0.3.40**；Windows 同名 EXE 与 Mac Universal 安装包均已更新。交付状态以 [交付说明](交付说明.md) 为准。

## 使用

- Windows：双击 release/QQClaw.exe。内置 Node/npm、CEF、原版官方 ChatGPT 扩展和官方浏览运行库。
- Mac：打开 release/macos/QQClaw.dmg，把 QQClaw 拖入 Applications。macOS 13.5+，主程序兼容 Apple Silicon / Intel，内置双架构 Node/npm。
- 首次进入设置安装或选择 Codex，并登录或填写第三方 API 服务。无需另外安装 CodexHost。
- 点击左下角「连接到微信」扫码，给每个账户绑定项目目录、模型服务、模型和思考等级。项目菜单也提供「绑定微信账号」。

## 功能

- 桌面聊天与微信任务通过底层 Codex 在各自工作目录执行；同目录任务排队，不同目录可并行。桌面发起的结果不会发送到微信。
- 模型目录来自当前 Codex 或服务接口，支持刷新、任意手填模型 ID、Responses / Chat Completions 服务、自定义 URL / Key，以及不发送思考参数。
- 微信支持正在输入、过程进度、最终总结和原生附件。过程最多 6 条，第 6 条后提示省略后续过程；保留最终结果额度，多附件按额度打包，待投递内容跨重启保存。
- 常用微信命令：/help、/status、/bind、/new、/resume、/model、/effort、/stream、/prompt、/stop。详细行为见 [微信功能核对](docs/WECHAT-PARITY.md)。
- 项目/聊天侧栏支持菜单、搜索和展开收起；右侧文件/浏览器共用工作面板，支持拖宽、展开还原、收起、关闭、标签排序和关闭标签恢复。
- 保留加密草稿与导入附件、真实上下文用量、持续目标、文件更改审阅和撤销/重新应用。

## 官方浏览器

自动浏览通过未修改的官方 ChatGPT 扩展、原版 Node REPL/browser runtime 和原签名宿主完成。应用自己的原生浏览接口只供用户界面使用，不向模型提供替代浏览工具。

Windows 原版官方组件已内置。Mac 新增 CEF 156 与原版官方运行库：Apple Silicon 已通过真实官方接口、双配置归属、主程序实际绑定、中文输入、网页/标签/查找、下载内容、加密历史/设置保存及退出检查。Intel 目前保留聊天与手动网页功能，官方自动浏览尚未接通。

Mac 官方 tabs.new 新窗口的实际内嵌仍有限制，当前使用官方 claimTab 接管本会话预备页面；应用不会宣称该 API 已通过。官方 Blob 自动下载、微信线上完整浏览、全部主页操作一致性及物理 GUI/输入法/DPI仍未整体通过。完整证据与边界见 [result.md](result.md)，不把组件检查称为整体验收。

可选的「在 Codex Desktop 中继续」会创建对话副本并打开 Desktop。它不用于上述自动浏览，也不会把 Desktop 后续消息自动同步回微信。

## 对话与数据

Codex 保存真实原生会话，QQClaw 保留 threadId 继续使用。默认另外保存 JSON/Markdown 对话副本到 ~/.codex/qqclaw/conversations；设置 CODEX_HOME 时跟随该目录，QQCLAW_CONVERSATIONS_DIR 可指定其他位置。

账户、设置、草稿和导入附件在 Windows 的 %LOCALAPPDATA%/QQClaw 或 Mac 的 ~/Library/Application Support/QQClaw；QQCLAW_DATA_DIR 可覆盖。Windows 用当前用户 DPAPI，Mac 用系统钥匙串密钥与 AES-GCM。删除应用不会主动删除这些目录、Codex 历史或项目文件。跨系统账户迁移前应导出对话并备份项目和附件本体，密文不能保证在另一账户解密。

未发送草稿不混入 Codex 已发送历史。独立对话副本中的附件保存原路径，迁移时需另行保留原文件。详细恢复说明见 [Mac 与数据](docs/MACOS-AND-DATA.md)。

## 二次开发

安装构建依赖后执行：

~~~powershell
npm ci
npm run build
~~~

Windows 构建使用系统 .NET Framework 编译器，默认内置 runtime/windows 中的运行资源，只输出 release/QQClaw.exe。修改 CEF 客户端后需先重新编译对应引擎。开发候选请使用 scripts/build-windows.mjs --output 指定项目外目录。

Mac 需要 macOS 与 Xcode Command Line Tools；默认 npm run build:mac 编译 Universal 主程序和双架构 Node/npm。内置官方浏览资源的打包入口是 buildMac(root,{browserBuild,runtimeCache,output})，由 [.github/workflows/macos-official-browser.yml](.github/workflows/macos-official-browser.yml) 使用已验证 CEF 组件和原版运行库打包。原版浏览接入检查见 [macos-official-browser.yml](.github/workflows/macos-official-browser.yml)。

复制本地项目时保留 runtime 文件夹。Git 不跟踪大型运行资源，从 Git 单独获取源码后需按 [运行资源索引](runtime/README.md) 备齐；不得用开发电脑现有 CodexHost、浏览器连接或登录身份冒充内置资源。

| 路径 | 责任 |
| --- | --- |
| backend/app.mjs | 项目、聊天、账户、模型配置、任务队列和操作路由 |
| backend/codex.mjs / codex-answer.mjs | Codex app-server、真实回合、目标与模型操作 |
| backend/wechat.mjs / wechat-actions.mjs | 腾讯 iLink、消息/附件和发送动作 |
| backend/official-browser.mjs / macos-*.mjs | 官方浏览运行库、会话归属、Mac MCP 与进程生命周期 |
| backend/store.mjs / conversations.mjs | 加密应用状态、独立对话备份与恢复 |
| native/Program.cs / native/cef | Windows 宿主与 CEF 客户端 |
| native/macos | Mac AppKit/WebKit 主界面、CEF 桥和系统功能 |
| ui / shared | 前端、布局、菜单、审阅与共享逻辑 |
| scripts / .github/workflows | 构建、资源校验与云端原生检查 |

详细功能与当前开发入口见 [开发交接.md](开发交接.md)，接口提取说明见 [架构](docs/ARCHITECTURE.md)。

## 来源

微信逻辑参考并集成 [codex-weixin](https://github.com/XavierJiezou/codex-weixin)，界面参考 [pi-desktop](https://github.com/vastsa/pi-desktop)。相关许可证保留在 docs 并随包分发，图片原件在 ui/assets。QQClaw 非腾讯或 OpenAI 官方客户端。
