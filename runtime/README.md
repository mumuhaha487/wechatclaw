# 项目内运行库

Apple Silicon 官方浏览运行库已缓存至 `macos/official-browser/`，含原始tar、SHA256清单、签名来源、完整原版CodexCLI.app及独立REPL记录。完整CLI包、Node REPL执行与browser-client导入通过，正式Mac包尚未集成。`scripts/macos-official-runtime.mjs --download --collect --output <项目外目录>` 可在Mac收集官方原件，`scripts/macos-browser-runtime.mjs` 统一解包和校验；应保留原版CLI应用包，单独抽取受限签名的可执行文件无法正常运行。模型CLI设置与浏览器内部运行库的路径分开处理。后续连接情况见 [result.md](../result.md)。

`windows/` 随当前项目目录一起复制，用于生成包含运行环境的单个 Windows EXE；这些较大的原始组件随成品发布，不提交进 Git。

- `official-browser/`：原版 Node REPL、Node.js、npm、Chrome 插件和官方 ChatGPT 扩展。
- `cef/`：浏览器内核完整运行文件。
- `engine/`：与当前 `native/cef/BrowserEngine.cpp` 对应的已编译客户端及清单。

本项目已备齐上述文件。源码构建执行 `npm ci`、`npm run build`。开发者需要重新收集本机已安装的官方组件时，可执行 `node scripts/vendor-official-runtime.mjs`。修改浏览器 C++ 客户端后，按 `build:browser` 的参数重新编译并更新 `engine/`。

OpenAI 原始运行组件、浏览器扩展及其依赖保留各自许可，项目 MIT 许可证不替代第三方许可。用户的登录、微信账户、浏览资料和 Codex 认证不包含在运行库里。

Mac 构建自动把官方 Node.js 24.22.1 的 Apple Silicon / Intel 发行包缓存到 `macos/`，按固定官方 SHA256 校验后解压到 App 资源。首次构建需要联网；复制包含缓存的项目后可复用。最低 macOS 13.5（与原版 Node 二进制的部署目标一致）。Mac 已内置 Node/npm，官方扩展浏览内核尚未接通。
