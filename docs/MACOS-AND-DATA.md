# macOS 适配与对话保存

2026-10-31，源码 0.3.6。当前机器为 Windows，用户确认没有 Mac，先完成适配和构建配置。**尚未生成 Mac 成品，尚未通过 Swift 原生编译或 Mac 实机验证。**

## Mac 构建

需要 macOS 13.3 或更新版本、Xcode 15+ Command Line Tools（`xcode-select --install`）以及 Node.js 22.13+。

```sh
npm ci
npm run build:mac
```

唯一 Mac 分发包为 `release/macos/QQClaw.zip`，解压得到 `QQClaw.app`，可移入「应用程序」。包含 Apple Silicon 和 Intel 两种架构；使用系统 AppKit、WebKit、Security 和 CryptoKit，不内置 Node.js、Codex CLI 或浏览器运行时。前端最低目标为 Safari 16.4，对应 macOS 13.3。

`npm run build` 自动选择 Windows 或 Mac；`npm run dev` 构建后启动本机应用。Windows 不支持交叉生成原生 Mac 包，脚本会明确报错，不输出假成品。

也提供 `.github/workflows/macos.yml`：仓库托管到 GitHub 后，可手动运行 **Build macOS app**，下载其构建产物。当前没有上传源码、创建远程仓库或触发工作流。

默认使用本地 ad hoc 签名，未公证，首次运行可能受到 Gatekeeper 限制；不能当作已正式签名的发行版。公开分发可设置 `MACOS_SIGN_IDENTITY` 为已安装的 Developer ID Application 身份。若还设置 `MACOS_NOTARY_PROFILE`，构建会通过该钥匙串配置执行公证，检查 Accepted、装订票据并重新打包；公证失败不产出正式包。证书和 Apple 凭证不放进源码。

## 兼容性实现与待验边界

| 位置 | 实现 |
| --- | --- |
| `native/macos/QQClaw.swift` | AppKit 窗口、WKWebView、本地资源协议、IPC、目录/文件选择、Finder、剪贴板、安装登录、关闭与后台进程组清理 |
| `native/macos/Info.plist` | Bundle 身份、版本、图标与最低系统 |
| `scripts/build-macos.mjs` | Safari 打包、双架构 Swift 编译、lipo 验证、签名、可选公证、唯一 ZIP |
| `scripts/macos-icon.mjs` | 构建时生成原创代码图标，无图像依赖 |
| `scripts/build-windows.mjs` | 原有 Windows 构建实现，固定 SDK 校验和单 EXE 路径继续保留 |
| `ui/app.mjs` | 统一桥接、Cmd+N/K、原生剪贴板、平台设置说明与安全的界面偏好缓存 |
| `shared/workspace.mjs` | Windows 路径继续忽略大小写，POSIX 保留大小写与合法反斜杠；`/` 根目录有效 |

Finder 启动时不会直接获得交互式 shell 的 PATH。Mac 宿主补查 Homebrew、官方安装目录、NVM、Volta、fnm、mise、asdf 等常见位置，也允许手动指定 Node。npm 一键安装使用用户目录 `~/.npm-global`，避免要求 sudo；执行的包命令仍为 `npm install -g @openai/codex`。安装成功重启，再检测 Codex。登录用私有 `.command` 文件打开系统 Terminal，正确引用程序路径，脚本不写 API Key。

WKWebView 只加载 `qqclaw://app/` 的本地资源，桥接只接受该来源主框架。钥匙串加解密只接受 Node 私有管道调用。管道写入使用独立串行队列，读取输出与 UI 不同步写入管道，避免重现双向管道死锁。关闭等待后台保存确认；保存错误或超时时，用户可取消退出。

尚需在 Mac 验证：两种架构的编译与实际启动、WKWebView 自定义协议/CSP/输入法、文件对话框与 Cmd 快捷键、钥匙串首次授权和更新签名后的读取、Node 各安装方式、npm 安装/登录、系统退出与重启、真实微信消息/附件以及签名和公证。Windows 下的源码与浏览器检查不能替代这些检查。

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
- Mac 实机、Swift 编译、钥匙串和实际微信 Mac 链路均未验证。

浏览器模拟 Mac 桥接已检查复制、设置中的 Mac 路径与保留说明、恢复对话提示与侧栏、动态模型菜单，无控制台错误；Safari 目标的前后端资源打包通过。Windows 0.3.6 候选在项目外编译成功。正式 Windows 实例仍在运行，未替换现有 0.3.5 EXE。
