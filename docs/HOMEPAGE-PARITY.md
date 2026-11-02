# 主页操作对照与验收边界

对应当前0.3.40源码。原始目标保留在根目录result.md；本表用于逐项复查，不能据此宣布整个目标已完成。

## 参照对象

原附件7adf2833-39a5-4665-83ca-8c1f6902b047中，image-1和image-3画面标题为Codex，是参照界面；image-2和image-4为旧QQClaw。按实际画面辨认，不能把旧QQClaw当成参照。界面以白色为主、黑色为辅；应用自己的微信、模型服务及环境设置保留。

## 操作索引

| 参照图中的操作 | 当前入口与代码 | 当前证据及尚需核验范围 |
| --- | --- | --- |
| 亮色窗口、菜单、最小化/最大化/关闭 | ui/app.mjs中的windowButtons、navigationButtons；ui/application-menu.mjs；native/Program.cs、native/macos/QQClaw.swift | 两端已编译，当前前端截图为亮色；完整物理窗口/DPI操作仍需实机核验 |
| 前进/后退、收起/展开侧栏 | ui/navigation.mjs；ui/app.mjs的navigate-back、navigate-forward、toggle-sidebar | 本轮实际切换会话并后退，草稿回到原会话；早期拖动/状态更新检查记录见result.md |
| 新聊天、项目、会话展开收起、搜索、通知和菜单 | ui/app.mjs的sidebar、selectSession、newSession；ui/message-search.mjs | 已有实现；0.3.37真实前端检查覆盖列表/滚动/右键及键盘菜单。不能扩大为全部独立EXE物理输入检查 |
| 用户长消息“显示更多”、设为目标、会话目录 | ui/conversation-view.mjs；ui/app.mjs的message-goal；shared/goal.mjs | 已实现展开收起、提问定位和持续目标；目标功能不以进程存活代替任务完成 |
| 过程折叠、最终Markdown、网站卡片、本地文件、文件更改 | ui/app.mjs的runSummary、changeCard；ui/website-cards.mjs；shared/review-view.mjs；backend/checkpoints.mjs | 有真实文件及前端检查记录；本轮未重跑每一种文件撤销情形 |
| 多行输入、附件、切换会话保留草稿、运行中继续输入 | ui/render-frame.mjs、composer-drafts.mjs、attachments.mjs；ui/app.mjs的composer | 本轮真实App和Codex进程运行中可编辑18行草稿，切到另一会话后后退能恢复；任务完成仍保留焦点、光标和原生撤销记录 |
| 权限、模型与思考等级、动态刷新、自定义模型 | ui/composer-model.mjs、controls.mjs、model-catalog.mjs；backend/app.mjs、codex.mjs | 保留服务/模型/思考等级及手填模型ID；模型列表来自发现接口，不能按固定名单冒充动态列表 |
| 上下文圆环和统计详情 | shared/context-usage.mjs；ui/app.mjs的contextUsage、context-info；backend/codex.mjs | 本轮两轮真实Codex app-server事件使界面从待统计变为3.9%、10.1%。最后一轮26100/258400，累计36200，界面使用last而非total；未知窗口仍显示待统计 |
| 面板宽度、展开/还原、收起、关闭、隐藏标签数量 | ui/app.mjs的panelSplitter、workspace、close-panel；ui/desktop.css | 0.3.37/39真实前端拖动、关闭及后台更新检查通过；本轮补查延迟扩展检测返回后面板仍关闭 |
| 浏览/文件标签、新建、选择、关闭、排序、恢复关闭标签 | ui/panel-tabs.mjs、panel-tab-actions.mjs、closed-panel-tabs.mjs | 用户界面操作已实现，Mac实际原生主程序检查覆盖页面打开/选择/关闭；不代表官方tabs.new新窗口内嵌已通过 |
| 地址、前进/后退、刷新/停止、查找、下载、更多 | ui/browser-find.mjs、browser-history.mjs、browser-downloads.mjs；native/BrowserHost.cs、native/macos/BrowserHost.swift | 两端组件和Mac真实主程序有相应检查。0.3.39工具栏48px，连接说明不再常驻占一行 |
| 官方扩展状态与配置入口 | ui/app.mjs的refreshBrowserConnection、officialBrowserSettings、browser-more | 0.3.40按会话保存检测结果；合并并发查询，保留查询期间的新连接事件。实际前端延迟响应检查通过，另一会话未继承已连接状态 |
| 微信入口、账户与工作区绑定 | ui/app.mjs的连接面板及项目菜单；backend/wechat.mjs、wechat-actions.mjs | 功能索引见WECHAT-PARITY.md；没有启动原账户或对其发送本轮测试消息，不能宣称线上微信整条链路已验收 |

## 本轮统计证据的范围

证据根：C:/Users/admin/AppData/Local/Temp/qqclaw-homepage-326e0f8f。

- context-ui.json/png与context-backend-audit.json：实际前端、App、Store及安装的官方Codex进程；Responses接口在本机提供受控结果及usage字段，没有调用外部模型。两次last分别为10100、26100 tokens，窗口258400，第二次total为36200。它证明统计事件传递和显示逻辑，不证明某个线上服务的计费准确性。
- connection-ui.json/png与connection-backend-audit.json：实际产品前端/App/Store；官方组件安装状态、连接事件与延迟RPC是明确夹具。检查初始已准备提示、旧响应/新事件竞争、不同会话状态隔离，以及关闭期间回包。
- 原版官方扩展的真实浏览证据来自独立的原生组件和Mac主程序云检查，不能用上述前端夹具替代。

## 自动浏览的硬性边界

模型自动浏览使用官方ChatGPT扩展ID hehggadaopoacecdllhhajmbjkdcmajg、原版浏览运行库及原签名宿主。应用自己的原生browser.control只服务于界面，不作为模型的备用远控工具。连接状态提示本身不证明浏览任务完成。

Mac目前通过官方claimTab接管本会话预备页；官方tabs.new产生的新普通窗口还未全部内嵌。Intel的官方运行资源、官方Blob下载、线上微信完整浏览，以及全部主页操作与物理GUI/输入法/DPI仍有缺口。不能把这些项目从目标中删掉，也不能以其他浏览驱动替代后宣称通过。
