# 微信实现与源码核对

参考仓库：XavierJiezou/codex-weixin，版本 0.3.8，提交 `769f4a1ae5370f46f8962ee7fe45d6764b67bdd8`。核对依据是源码、协议字段与测试，包含 `src/weixin/`、`src/bridge/`、`src/codex/`、`src/state/`，以及 `src/server/account-manager.ts` 中的会话、授权和附件处理；并检查了登录管理、HTTP 接口与相关测试。网页管理端的实现没有引入桌面程序。

| 微信能力 | 参考实现 | QQClaw 实现 |
| --- | --- | --- |
| 扫码、区域重定向、账户复用、重新登录 | weixin/login、accounts；server/login-manager | wechat、bridge 的登录流程，保留原有验证码支持；同一用户重连复用身份 |
| 长轮询、游标、去重、错误退避 | weixin/monitor；state/runtime-state | bridge.ingest、pollLoop、deliveryLoop；收件箱与游标先落盘再执行 |
| 用户授权、账户与用户隔离 | bridge/access；account-manager | 默认仅扫码者；账户配置可增删额外授权用户；会话按 accountId/senderId 隔离 |
| 文字和语音转写 | weixin/messages | wechat-messages；转写优先，没有转写则保存原始音频 |
| 收图片、视频、文件、音频 | weixin/media、messages | wechat-media；解密、文件名清理、格式识别、100 MiB 上限，再交给 Codex 检查 |
| 发微信原生图片、视频、文件 | weixin/api、media；bridge/actions | wechat.upload、sendMedia；wechat-media.prepareLocalMedia；bridge 的持久媒体投递记录 |
| Codex 过程消息 | app-server-runner 的 commentary；service.onProgress | codex.answer 保留 phase；App 存储完整进度；微信来源任务最多发送 6 个实际文本分段，再发送一次省略提示 |
| 正在输入、结束后清理 | service.withTyping；api.sendTyping | getconfig 获取 ticket；每五秒续期；完成、失败、退出清理 |
| 最终文本分块 | bridge/format、service | splitText 按 Unicode 字符分块，保留尾部内容，最终结果不混入过程消息 |
| 工作区绑定 | service.bindWorkspace；config.isWorkspaceAllowed | `/bind` 检查真实目录，只允许桌面已添加或已授权工作区；切换目录新建上下文 |
| 新会话、历史切换 | `/new`、`/resume`；runtime-state | 同命令，R1/R2 编号列表按用户隔离并保存当次映射；不接受含混的裸数字 |
| 模型、推理等级 | `/model`、`/effort`；model/list | 同命令，读取当前服务目录，支持序号和模型 ID；未知第三方 ID 可手动使用；有模型元数据时按支持等级校验 |
| 进度开关 | `/stream on/off/default` | 同命令，默认开启，只控制微信进度；不会抑制最终结果 |
| 多条提示合并 | `/prompt start/done`；prompt-buffer | 同命令，支持文字与各类附件，最多 50 项、十分钟闲置过期；增加 `/prompt cancel` |
| 停止任务 | `/stop`；runner.stop | 同命令，通过 turn/interrupt；轮询不被长任务阻塞 |
| 帮助与状态 | `/help`、`/h`、`/status`、`/where` | 同命令，显示实际工作区、会话、模型、思考等级、权限和进度开关 |
| 桌面查看并继续微信会话 | account-manager.continueSession、readSessionMessages | 继续使用现有会话界面与 App.enqueue；用户消息、进度、最终结果和附件保存在同一历史中 |

## 附件为什么不能是 HTTP 本地盘符

`http://D:/...` 没有有效的网页主机。QQClaw 会纠正错误前缀，识别绝对本地文件路径；`file:` URL、Windows/UNC/POSIX 路径、Markdown 本地链接和 `codex-weixin-actions` 块使用同一个解析器。普通网页链接继续保留。0.3.5 保留严格 parseActionBlocks 供上游对照，业务使用 parseActionBlocksSafe 按块和条目丢弃错误，正文及有效附件继续发送；有丢弃时仅微信正文附加一行“（附件指令无法解析，相关文件未发送。）”，桌面历史不附加。control 当前无消费者。

微信来源任务先收到提示规则，要求用发送动作声明需要交付的文件。宿主读取文件，计算明文 MD5，生成随机 AES-128 密钥，向 `getuploadurl` 提交明文大小、MD5、PKCS#7 后的密文大小与媒体类型。文件以 AES-128-ECB 加密后上传腾讯 CDN；读取响应头中的加密查询参数，再发送腾讯原生文件、图片或视频消息。消息中的 AES Key 使用上游协议要求的“hex 字符串再 base64”编码。文件名和明文大小用于文件卡片，图片与视频使用密文大小。

上传回执在发卡片前落盘。发卡片失败只重试投递，复用回执与 client_id，不重新执行 Codex。文本和过程消息也保存已投递位置。腾讯返回旧 context 时保留待回复内容；新消息更新该用户 context 后继续投递。client_id 在网络重试时保持一致，但网络断开时服务端是否已接收仍取决于腾讯的去重行为。

桌面消息中的本地附件显示为文件入口，点击在资源管理器中选中文件，不把盘符转成网页，也不自动运行生成的程序。旧历史中的错误链接在读取数据时修复。

## 过程消息与消息来源

`item/started` 记录 phase，`item/completed` 的 commentary 立即进入过程消息队列，并在 Codex 仍运行时发送；重复通知按内容去重。`turn/completed` 仅汇总非 commentary 的最终回复。启动响应前提前到达的事件先缓冲，收到 turn ID 后再筛选，避免漏掉事件或混入上一轮。

每个任务最多推送 6 条过程消息，按实际发送的分段数计数。达到 6 条后立即发送一次“后续推送将进行省略。任务完成之后，会将结果汇报。请耐心等待。”，后续 commentary 只保存在桌面历史，不再入微信队列，完成后也不会补发。省略提示具有固定 client_id，成功状态持久保存，失败时复用同一 ID 重试。`/stream off/on` 不重置当前任务计数。

账户内按发送者和最新 context 维护 10 条回复额度；普通任务和紧急命令共享额度。消息调用前先持久预留 client_id，网络结果不明时保守占用，重试沿用原槽位。输入状态不计数。过程发送始终给省略提示及至少 3 条最终结果保留位置；若期间收到紧急命令，过程可能提前省略。

最终 outbox 超过可用额度时，wechat-results 将完整总结和有效附件打为标准 UTF-8 ZIP，微信只发一条摘要及结果包；中文名、重复文件名和原文件字节保留。每包不超过 100 MiB，单个有效文件恰好达到上限且 ZIP 头会超限时独立发送。无法读取或超过单文件上限的附件在包内说明。结果计划与上传回执在发送前落盘，重试不会重新跑 Codex。极大量附件仍超出 10 条额度时保留剩余 outbox，等待发送者的新 context 后继续；不会耗尽额度后不断请求发送，也不会静默丢弃文件。全部投递完成后清理生成的临时结果包，原始工作区文件与桌面历史不变。

只有微信收件箱任务携带回传函数，回传对象始终是这条任务的账户和发送者。桌面来源任务可继续同一 Codex thread，但没有微信回传函数。桌面与微信共享会话队列和工作目录锁；不同目录可并行。原项目网页管理接口用到的能力由本机消息管道和现有桌面界面承接，未额外开放管理网站。

## 验证边界

验证代码、参考仓库、依赖和截图均在项目目录之外。复用了上游媒体、消息、动作、格式和缓冲的 27 项原始用例，并添加本项目的路由、进度时序、错误链接、重试、恢复、命令、隔离、停止和实际 JSON-RPC 传输验证；还回归原有模型目录、工作区权限和第三方接口适配。通知限额另验证 6 条边界、长消息分段、去重、网络结果不明、重启续传、紧急命令共享额度、桌面隔离、10 条截停及新 context 继续、多附件同名中文 ZIP、100 MiB 分包与缺失附件说明；ZIP 内容由独立的 Python zipfile 校验。

腾讯请求和 CDN 收发的自动验证使用受控接口，检查实际密文及完整消息字段。真实 Windows EXE 的验证使用本机 Codex 和受控模型服务。手机微信最终显示与腾讯线上 CDN 成功接收，需要使用用户自己的扫码连接验证；自动检查不代替这一环，也不向真实微信账户发送测试消息。

上游移植代码的 MIT 署名与许可证保存在 CODEX-WEIXIN-LICENSE.txt，并随构建嵌入 EXE。

0.3.5 另区分运行时轮询错误来源：成功轮询清除轮询错误并广播恢复状态，不清除投递或处理产生的错误，不新增持久字段。上游移植的 chunkText、parsePrompt、stripBridgeInstructions 运行时当前无调用点，仅对照测试使用；inboundText、sendLocalMediaFile 等导出继续保留。
