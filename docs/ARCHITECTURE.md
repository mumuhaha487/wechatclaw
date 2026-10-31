0.3.13 补充：默认深色黑白，appearanceVersion=3 仅迁移一次；window.theme 同步两端原生窗口外观，图片预览以弹窗实际剩余空间约束，详情见 result.md。

0.3.12 补充：桌面附件由 backend/desktop-attachments.mjs 保存到用户数据目录；UI 附件预览与应用导航拆分为 ui/attachments.mjs、ui/navigation.mjs。草稿仅在当前进程内保留，已发送消息继续走加密状态和原生 Codex 历史。官方扩展限制未解除，详情见 result.md。

# 两条核心链路与二次开发接口

## 从原项目提取了什么

原项目是 `codex-wechat`，通过浏览器管理一个微信账户，并把该账户的消息发给只读 Codex。需要保留的连接实际上是腾讯 iLink / ClawBot 协议，并非另行登录桌面微信、注入微信进程或使用 QQ 机器人。

旧项目完整源码和 Git 历史已在清空工作目录前移到目录外的备份。新目录只保留项目代码、构建脚本、文档和唯一 Windows 交付物，测试、依赖、截图及旧版均放在目录外。

| 原实现 | 新实现 | 变化 |
| --- | --- | --- |
| `src/wechat.mjs` | `backend/wechat.mjs` | 保留扫码、长轮询、消息上下文、稳定 client ID、语音转写与文本分块协议 |
| `src/bridge.mjs` | `backend/bridge.mjs` | 从单账户改成每个账户独立收件箱、游标、去重记录、目录与会话 |
| `src/codex.mjs` | `backend/codex.mjs` | 保留标准输入输出 JSON-RPC 方式，增加模型、思考等级、Provider、取消、编程权限与事件转发 |
| `src/state.mjs` | `backend/store.mjs` | 从明文 JSON 改为 DPAPI 加密的原子快照 |
| `src/service.mjs` / `dashboard.html` | `native/Program.cs` / `ui/` | 本机网页服务替换为 Windows 原生窗口、WebView2 和管道通信 |

未移植旧项目的插件市场、MCP 安装入口和网页服务。也没有使用 PI-Desktop 的 AI 引擎、扩展系统或其他业务功能。

## 微信协议

`WeChatApi` 是可单独复制的传输模块，依赖 Node.js 22+ 自带的 `fetch` 和加密模块。

| 方法 | 腾讯接口 | 关键参数 |
| --- | --- | --- |
| `qr(tokens)` | `ilink/bot/get_bot_qrcode?bot_type=3` | 已保存的本地 bot token 列表 |
| `qrStatus(qrcode, base, verifyCode)` | `ilink/bot/get_qrcode_status` | 二维码 ID、可选数字验证码 |
| `updates(account, cursor)` | `ilink/bot/getupdates` | 账户 token、该账户的游标 |
| `send(account, to, context, text, clientId)` | `ilink/bot/sendmessage` | 接收用户、入站消息的 context token、可重复使用的 client ID |

扫码需要处理 `wait`、`scaned`、`scaned_but_redirect`、`need_verifycode`、`confirmed`、`expired` 等状态。确认成功后保存腾讯返回的 `bot_token`、`ilink_user_id`、`ilink_bot_id` 和 API 地址。重定向仅允许腾讯 `*.weixin.qq.com` HTTPS 域。

只有消息的 `from_user_id` 等于该扫码账户的 `user`，并且不是群聊、不是机器人消息、有上下文 token，才进入队列。默认每个账户只会回复扫码用户；账户配置允许额外授权用户。未授权用户不触发 Codex。各授权用户拥有自己的会话与上下文。

多账户由 `WeChatBridge` 管理：每个账户有自己的 polling loop、投递循环、cursor、pending、seen、sessionId 和模型设置。轮询与投递分离，Codex 运行期间仍能接收停止和进度开关命令。收件箱和新游标在同一个快照中保存后才执行任务。回复内容保存后才发送，重试沿用 `client_id`，不会因为发送失败再次调用模型。程序崩溃时标记为运行中的编程任务不会自动重跑，避免重复修改文件。

微信过程消息按实际分段最多 6 条，随后发一次省略提示；桌面保留完整过程。`sendReply` 是统一投递入口，按账户、发送者和 context 持久记录至多 10 个 client_id，重试复用额度；输入状态接口不计数。`wechat-results` 在最终 outbox 超额时保留一条摘要，将完整总结和附件分为至多 100 MiB 的标准 ZIP 包。额度不足的 outbox 停等新的 context，重新收到微信消息后继续投递，不重新执行模型。详细边界见 [WECHAT-PARITY.md](WECHAT-PARITY.md)。

`new WeChatBridge({ store, run, newSession, emit, api })` 可接入另一个宿主；`run(sessionId, text, taskKey, ready)` 返回最终文本，执行前需等待 `ready` 完成收件箱落盘。`App.enqueue` 已负责等待和会话内排队，`emit` 用于更新界面。

微信输入状态通过 `getconfig` 获取 `typing_ticket`，处理消息期间使用 `sendtyping` 的 `status: 1` 并定时续期，回复结束、失败和退出时用 `status: 2` 取消。状态接口失败不影响编程任务或回复。

动作解析保留上游严格导出 `parseActionBlocks`；业务统一用不抛错的 `parseActionBlocksSafe`，按块和条目隔离失败，保留正文及有效附件并返回 discarded 数量。仅微信最终/过程正文在丢弃时附加中文提示，桌面保存不追加。control 动作目前无消费者。`chunkText`、`parsePrompt`、`stripBridgeInstructions` 是保留的上游移植函数，运行时当前无调用点，仅对照测试使用。

桌面 `chat.send` 和微信消息共用 `App.enqueue`，同一会话按顺序执行并保留同一 Codex thread。只有微信收件箱任务把其对应结果交给 `sendmessage`；桌面任务通过状态事件显示，不向微信转发。在桌面修改正在绑定的微信会话模型或权限时，同步保存账户配置。

## Codex 对接

启动本机可执行文件：

```text
codex app-server --listen stdio://
```

每行一个 JSON 消息，不使用 shell 拼接命令。连接后先发送 `initialize`，收到响应后发送 `initialized`，之后才可以调用其他方法。

```text
thread/start 或 thread/resume
        ↓
turn/start { threadId, cwd, model?, effort?, input, sandboxPolicy }
        ↓
item/started、item/agentMessage/delta、item/completed
        ↓
turn/completed
```

会话客户端缓存闲置 15 分钟后回收，但 busy/queued、待审批或活动 turn 会阻止回收；定时器 unref 并在关闭时清除。下次自动重建并 thread/resume；只对实测的 `no rollout found for thread id <当前线程ID>` 新建线程，并保存明确的系统提示说明旧上下文不会带入。initialize 失败或超时先清理自己启动的进程和适配器。任务在首个 await 前同步占用 busy，保护排队交接窗口。

取消使用 `turn/interrupt`。模型列表来自 `model/list`，包含模型 ID 与支持的思考等级。新程序没有固定模型 ID 白名单。Codex `item/completed` 中 `agentMessage.phase=commentary` 是过程消息，须独立存入历史并在微信来源任务中实时转发；`final_answer` 才进入最终回复。具体媒体链路和重试策略见 [WECHAT-PARITY.md](WECHAT-PARITY.md)。

从 0.3.4 起，单轮编程任务不设置运行总时长上限；渲染、导出等长任务不会因为经过 30 分钟而由宿主自动中断。完成、手动停止或连接关闭等实际终止事件负责结束等待；模型目录、启动控制请求和单次网络调用仍有各自的通信超时。

最小复用示例：

```js
import { CodexClient, findCodex } from './backend/codex.mjs';

const client = new CodexClient({
  executable: await findCodex(),
  profile: { id: 'local', type: 'local' },
});
const session = {
  workspace: 'D:\\work\\my-project',
  permission: 'workspace-write',
  model: '', // 留空沿用本机配置，也可以填写模型 ID
  effort: '',
};
try {
  session.threadId = await client.thread(session);
  const reply = await client.answer(session, '阅读 README 并修复启动问题。', event => {
    // 把事件转发到自己的界面。
  });
  console.log(reply);
} finally {
  client.close();
}
```

自定义服务的 profile：

```js
{
  id: 'my-provider',
  type: 'custom',
  name: '我的 API',
  baseUrl: 'https://api.example.com/v1',
  apiKey: '从自己的凭证存储读取',
  protocol: 'responses', // 或 chat-completions
  models: ['my-model-id'],
  reasoningParameter: 'effort', // 或 omit
}
```

Provider 配置用该进程的 `-c` 覆盖传入，Key 通过子进程环境变量传入，不进入命令行参数或用户的全局配置文件。若由其他 Codex 窗口启动本程序，子进程也会过滤父聊天的内部工具管道、权限配置和会话身份，避免串用父进程状态。

`thread/start` 与 `turn/start` 都指定会话目录，默认写权限仅授权该工作目录。`ask` 使用只读沙箱与 `on-request`，`accept-edits` 使用工作区写沙箱与 `on-request`，`auto` 使用工作区写沙箱与 `never`，`read-only` 使用只读沙箱与 `never`。审批请求通过 `approval` 事件显示在桌面，`approval.respond` 回传本次允许或拒绝。停止、断开与退出会拒绝尚未处理的请求。微信会话的审批也在桌面完成。

`findCodex` 优先采用显式路径、当前桌面运行程序和最新安装的桌面运行目录，再检查 PATH 和旧版/npm 位置。后端对同一 Provider 合并进行中的模型读取 Promise，完成后不缓存结果。`ui/model-catalog.mjs` 按 Provider 管理目录与刷新状态；更新替换上次目录，保留当前模型值。焦点刷新遵守 60 秒 TTL；每五分钟仅刷新当前会话服务与默认服务（去重）且不强制，手动刷新/切换/保存服务仍强制。`ui/controls.mjs` 为输入栏、设置和账户表单提供同一种自定义菜单，支持模型搜索、手动 ID、键盘操作和刷新；不再显示系统 select/datalist 弹窗。

## 第三方协议适配

Codex 原生使用 Responses。对于 Chat Completions 服务，`createChatAdapter` 只在 `127.0.0.1` 上开启临时端口，把工具定义、assistant 工具调用、工具结果和思考参数转换为 Chat Completions，再把结果转换为 Responses SSE 事件。freeform 工具转为带字符串 `input` 的 function，并在返回时还原为 custom tool call。

兼容层保存工具调用对应的 `reasoning_content`，供需要该字段的服务继续工具调用。历史仍由 Codex 维护；适配层要求完整 input，不支持 `previous_response_id`。上游请求使用非流式 Chat Completions，每个模型轮次完成后输出事件。

Responses 服务通常直接连接；只有选择省略思考参数时，使用 `createResponsesAdapter` 在转发中移除 `reasoning`，保留原有流式响应。仅这个 Responses 转发层使用 240 秒上游空闲超时（等待响应头阶段也计时，响应头和每个数据块重置），不设流的总时长；阈值可通过 idleTimeoutMs 注入。Chat Completions 仍为非流式单次 240 秒上限，不使用自定义 dispatcher 或新增依赖。

两种本地兼容层都使用随机令牌、拒绝带浏览器 Origin 的调用，并在 Codex 进程关闭时清理。

任务完成、停止与退出使用容错的审批清理，即使 Codex 的 stdin 已关闭也会清空待审批项并继续释放资源。已结束任务的迟到 `turn/start` 响应不会再播放缓存事件或影响下一次任务。环境检测与实际启动共用脚本扩展名规则和隔离后的环境变量，支持 `.js`、`.mjs`、`.cjs`。

`shared/workspace.mjs` 提供 Windows 路径身份比较，后端目录锁、项目占用与前端会话归属使用相同规则。账户管理检查号主、额外发送者及待回复队列引用的会话；账户配置变化时重建当前映射并保留历史。界面按会话比较忙碌状态以生成完成通知；文件与审阅请求按序号和当前会话、目录、面板校验，丢弃切换后的旧响应。

## 桌面宿主

`native/Program.cs` 使用 Windows 自带 .NET Framework 和 WebView2 控件，管理窗口、系统文件夹选择、外链、安装入口、Node 后台与 Windows DPAPI。

EXE 内含压缩的 UI、已打包的 Node 后台、WebView2 SDK 控制库及许可证。启动后按内容哈希解压到用户数据目录，通过虚拟域 `https://qqclaw.local/` 加载本地界面，不访问外部网页。WebView2 Runtime、Node.js 和 Codex 使用系统环境。

界面发送 `{id, method, params}`；宿主处理 `window.*`、`dialog.*`、`shell.*`、`system.*`，其余转给 Node。Node 返回 `{id, result}` 或 `{id, error}`，以及 `{kind:'event', event, data}` 事件。DPAPI 只接受来自 Node 的内部管道请求，不暴露给网页。

宿主到 Node 的写入由 `BackendPipeWriter` 的单独线程串行处理。UI 线程与 `OutputDataReceived` 回调只把 JSON 放入 FIFO 队列，不能直接调用管道的同步 `WriteLine`：Windows 上 Node 的 stdout 管道写入也会阻塞；一旦两个方向的管道同时填满，读回调中的同步写入会造成循环等待，让窗口和微信轮询一起停住。队列最多保留 32 Mi 字符，关闭只通知写线程结束，不在 UI 上关闭可能正堵住的 StreamWriter。宿主请求的 continuation 异步运行，避免回调在读线程上同步执行。

Windows Job Object 在窗口退出时结束该应用启动的子进程。应用数据使用独立互斥锁，防止同一数据目录被多个实例同时写入。

## 0.3.5 的持久性与故障处理

`Store.save` 在一次进行中写入之外最多保留一个尾随批次，每批开始才序列化；调用不能由更早开始序列化的写入兑现。同批调用共用成功或同一个错误，仍通过 DPAPI、临时文件和原子重命名落盘；收件箱/游标先保存再执行的顺序不变。界面 MarkdownIt 和 DOMPurify 配置固定，按文本缓存最终净化 HTML，最多 500 条 LRU。

`settings.save` 的 theme/fontSize/fontFamily/showStatus/showCounts/showActivity/showTime 可随时保存，且只含外观字段时不重算 default* 或修改 codexPath；只有请求含连接字段才保留任务期间拒绝。只读切回智能体恢复之前的权限。dialog.* 不使用 UI 100 秒控制请求超时。

日志位于 `QQCLAW_DATA_DIR\logs\backend.log`（默认数据目录同 README），1 MiB 轮换，当前和 .1/.2 共 3 份。日志仅含时间、级别、以全部 Provider apiKey 脱敏的 safeError 消息及前 5 个堆栈帧；不记录提示词、消息、token/context、请求/响应体或 Codex stderr 原文，写入失败静默。unhandledRejection 记录后继续；uncaughtException 最多等 3 秒尝试同一个 app.close 后非零退出。记录启动、正常关闭及意外 Codex 断连。

宿主登记转发请求所属后台进程；正常响应与退出/写线程失败只可兑现一次，未完成请求立即收到“后台进程已退出，请重试。”。非 JSON 对象的 stdout 被忽略，每 60 秒至多一个 backend-warning toast。backend-error 也只 toast；只有 backend-exit/fatal 重置环境。Node 路径保存前实际执行并校验 22.13+，解压后仅尽力删除 app 下其他 16 位十六进制资源目录。FIFO 写线程与丢弃 stderr 的策略保持。

## 0.3.6 平台与历史补充

原 Windows 构建迁到 `scripts/build-windows.mjs`，`scripts/build.mjs` 选择当前平台。Mac 使用 `native/macos/QQClaw.swift` 与系统 AppKit/WebKit，界面通过统一桥继续使用同一 Node App；无需另写微信业务。Mac 宿主在私有进程组中启动后台，写入用串行队列，先排空 stdout 最后响应，再处理退出事件。

Codex 新线程显式非临时保存，保留服务返回的真实 thread.path。Store 除加密快照外，同步 `ConversationArchive` 的 JSON/Markdown 文件；原生 JSONL 仍由 Codex 管理。恢复不重发微信队列、不给原来的自动权限、不覆盖已有会话，缺少 Provider 时提示重新配置。Windows 快照使用 DPAPI，Mac 使用钥匙串密钥和 AES-GCM；对话备份供可读导出和跨系统恢复，不复制 API/微信配置及附件本体。

数据目录、构建步骤和验证边界见 [MACOS-AND-DATA.md](MACOS-AND-DATA.md)。

Mac 分发改为单一 `release/macos/QQClaw.dmg`：只读压缩磁盘映像包含通用应用、指向 `/Applications` 的安装入口和中文说明。构建使用系统 `hdiutil` 创建并校验；开发启动和 CI 从磁盘映像复制应用后执行。可选 Developer ID 签名及公证针对完整 DMG，未配置证书时应用仍使用 ad hoc 签名。


## 网页预览与官方扩展边界（0.3.11）

`backend/browser.mjs` 不再启动 HTTP MCP；`BrowserViewer` 仅供用户手动触发 `browser.open` / `browser.command`。`browser.officialStatus` 只检查 Chrome/Edge 官方扩展 ID 的安装文件，明确返回尚未连接，不能用安装状态推断授权成功。

`CodexClient` 隔离不适用于独立子进程的官方 Desktop 插件及旧 `qqclaw_browser` 配置；每轮 application context 都说明官方连接尚未完成，不得使用其他远控替代。未修改用户全局设置或复用别的会话身份。官方通道的实际阻碍及文档证据见根目录 result.md。

原生 `BrowserHost` 仍管理手动网页预览：空会话不隐式创建标签，关闭最后标签保持空组；新标签/导航才创建网页。UI 通过 `browser.view` 同步 DOM 视口与 DPI 坐标，在弹窗/菜单时隐藏外部网页层。Windows 按账户/会话存储网站登录态；Mac 当前使用账户隔离内存存储。

侧面板默认 340 CSS 像素，拖动/键盘/双击调整并保存；分屏保留至少 400 CSS 像素聊天宽度，空间不足改为可关闭的覆盖面板。收起/关闭面板不销毁标签；标签上的叉销毁网页。手动关闭后，后台网页事件不得强行展开面板。

`shared/context-usage.mjs` 使用 Codex `last` 样本的当前输入+输出占比，禁止使用整段历史的 `total` 累计统计；缓存输入不重复相加，缺窗口/样本显示待统计。真实消耗证据见 result.md。


## Desktop 接续（可选）

`codex-runtime.mjs` 负责验证并选择实际执行的 Desktop / CLI 程序。`app.mjs` 的 `desktop.continue` 保存源会话，使用独立本机客户端调用原生 `thread/fork`，保存 `desktopCopy`，再交由宿主生成并打开 `codex://threads/<id>`。空会话用 `codex://threads/new?path=...`。复制持有工作目录锁，运行/排队任务完成前拒绝接续；同一历史重复点击复用副本。

副本模型/Provider 使用本机 Codex 配置，未指定模型时动态查询默认项；不使用 QQClaw 临时 Provider 或转发层。Desktop 与 QQClaw/微信后续对话独立，不自动回传。此入口使用真实 Desktop 的工具，不声称直接从 QQClaw 控制其内置浏览器。

原生 `desktop.status` / `desktop.open` 只检测处理器和打开验证过的本地会话/目录链接。Windows 支持 Store AppUserModelID；Mac 使用 Launch Services。Codex 用户目录不一致时拒绝历史接续。
