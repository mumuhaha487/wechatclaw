# QQClaw 本轮需求、实现与验收记录

更新时间：2026-10-31。此文件供后续开发与独立审核使用。**当前为开发中记录，不代表验收通过。**

## 用户目标与不可替换的要求

以本轮目标及参考图 `7fab8be9-9a25-4007-9b2b-eb59f759feea/image-2.png` 为准：默认亮色，白色背景、黑色文字和主要控件，灰色辅助层级，去除绿色主题，不采用全黑默认。较早的“多数黑色”要求已由该目标更新。

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
| `backend/store.mjs` | 设置、会话、账户持久化与迁移，密钥加密与归档 |
| `backend/codex.mjs` | Codex app-server 生命周期、工具/权限/流式事件 |
| `backend/browser.mjs` | 当前自建浏览器工具，不能称官方扩展 |
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
| 侧栏展开收起、拖宽、项目展开、新建、项目与会话菜单、搜索、历史 | 待核对 |
| 消息过程展开、耗时、复制、附件打开、滚动到底部 | 待核对 |
| 输入、换行、发送、停止、任务排队、文件与工作目录入口 | 待核对 |
| Provider/模型/思考等级/权限选择 | 待核对 |
| 上下文读数及说明 | 待修复并验证 |
| 工具面板切换、拖宽、收起、关闭、展开还原 | 待实现并验证 |
| 浏览器标签新建/选择/关闭/最后标签关闭、地址与搜索、前进后退、刷新停止 | 待修复并验证 |
| 窄屏、长文本、代码/表格/附件、弹窗、原生网页层遮挡 | 待验证 |
| 默认亮色与设置持久化 | 待实现并验证 |
| 官方 ChatGPT 扩展安装、授权、真实调用 | 调查中，当前不符合 |

## 验证边界

历史 0.3.10 测试只能证明当时自建浏览器的部分行为，不能证明本轮官方扩展要求。任何本轮验证都要说明是真实 UI、真实 Codex、模拟微信接口还是真实微信实发，不得混称。

测试、截图、依赖、临时编译和备份保存在项目外。正式目录只保留一份 Windows 程序及一份 macOS 安装包。替换运行程序前核对忙任务、排队及待回复，保存数据并正常退出。

## 本轮实现、实测证据与未完成项

目前已实现默认亮色及一次性迁移、面板拖宽/键盘调整/双击还原、收起/关闭/展开、最后标签真正关闭、空标签组、避免首次新建双标签、关闭后不被后台事件重新打开、当前上下文统计、更改卡片和补丁展开、消息时间/菜单、项目超过 20 条的展开入口。尚在验证，不能据此宣称全部完成。

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

### 验证进行中

- 119 项既有核心回归已通过，覆盖会话、队列、微信处理、Provider、存储、长任务等；不覆盖官方扩展成功调用。
- 真实 Windows EXE 已检查拖动、键盘调整、双击、展开还原、关闭唯一标签、重新导航、关闭后台标签、关闭面板后后台事件不重开；初轮四种实际窗口尺寸的长内容边界检查通过。
- 第一次 UI 脚本在展开侧栏时选中了收起侧栏中保留的隐藏按钮，已修正测试选择可见按钮，并增加 collapsed 侧栏的 inert/隐藏处理，防止键盘进入隐藏区域。此轮完整 UI 检查待重跑。
- 固定 token 样本仅用于验证计算/UI，不能当作真实模型消耗证据。真实 Codex 请求与上下文事件核验待执行。
