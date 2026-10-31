# 官方 ChatGPT 扩展接入调查

更新：2026-11-01。初始静态调查快照对应 **0.3.26**；最新独立实例复查见0.3.29补充。产品构建和导航修复见result.md，本文件不代表官方自动浏览验收通过。

0.3.27 补充：本版新增的是用户手动关闭标签后的恢复，没有新增官方扩展授权或模型自动浏览；本调查快照继续保留。

0.3.28 补充：当前内容查找调用 WebView2/WKWebView 的用户查找 API，关闭/新查询可取消旧等待；它没有注册模型浏览器工具、没有完成官方扩展独立授权。Mac 云端原生查找或手动界面检查均不能填作微信自动浏览成功；原调查快照与未完成结论保留。

## 0.3.29 独立实例与最新协议复查

2026-11-01实际重新读取官方扩展页面和app-server的CLI/远程Code Mode host章节；页面工具返回及快照保存于项目外qqclaw-official-probe-20261101。官方页面仍描述从桌面应用设置安装、连接及管理网站许可；远程Code Mode host说明不能当作浏览器授权契约。

当前codex-cli0.157.1，在空的独立CODEX_HOME下移除父worker/浏览器环境和两类API key，以真实qqclaw_browser_probe客户端initialize并仅查询metadata。子进程正常退出0，没有模型回合、其他聊天读写、vendor浏览器运行时执行或官方扩展连接。browser_use、browser_use_external、in_app_browser、code_mode_host等feature flags为stable/enabled；因此不应声称CLI根本没有编译浏览器功能。

生成的完整实验ClientRequest含167个方法，未找到browser命名的独立连接/授权方法；BrowserUseConfig公开字段是网站策略和历史许可。该发现不排除其他未查明契约，初始化和功能开关也不证明已有可信宿主/授权或真实调用。evidence.json、app-server-preflight.json和schema/保留实际结果，不保存凭据或父聊天管道。

下一步仍是自身身份下的可信Code Mode/浏览器服务和任务/网站授权。不能通过删校验、假nodeRepl、自签始终允许、既有开发聊天管道或自建远控凑完成。本版导航修复是手动预览，**官方扩展自动浏览仍未完成**；其余静态协议快照继续保留。

## 当前结论

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
