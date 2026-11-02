import AppKit
import WebKit
import Security
import CryptoKit
import Darwin

// The same executable launches Node in a private process group. No shell is
// involved, and cleanup can target this application's descendants only.
func launchBackendIfRequested() {
    guard CommandLine.arguments.count == 4 && CommandLine.arguments[1] == "--backend" else { return }
    if setsid() < 0 && getpgrp() != getpid() { exit(70) }
    let args = [CommandLine.arguments[2], CommandLine.arguments[3]]
    let pointers = args.map { strdup($0) } + [nil]
    pointers.withUnsafeBufferPointer { _ = execv(args[0], $0.baseAddress!) }
    exit(71)
}

func failure(_ text: String) -> NSError { NSError(domain: "QQClaw", code: 1, userInfo: [NSLocalizedDescriptionKey: text]) }
func jsonData(_ value: Any) throws -> Data { try JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed, .sortedKeys]) }
func jsonText(_ value: Any) throws -> String { String(decoding: try jsonData(value), as: UTF8.self) }
func quoteShell(_ value: String) -> String { "'" + value.replacingOccurrences(of: "'", with: "'\"'\"'") + "'" }

@MainActor enum DesktopIntegration {
    static func application() -> URL? {
        if let app = NSWorkspace.shared.urlForApplication(toOpen: URL(string: "codex://threads/new")!), FileManager.default.fileExists(atPath: app.path) { return app }
        for root in ["/Applications", NSHomeDirectory() + "/Applications"] {
            for name in ["Codex.app", "ChatGPT.app"] {
                let app = URL(fileURLWithPath: root).appendingPathComponent(name)
                let types = Bundle(url: app)?.object(forInfoDictionaryKey: "CFBundleURLTypes") as? [[String: Any]] ?? []
                if types.contains(where: { ($0["CFBundleURLSchemes"] as? [String])?.contains("codex") == true }) { return app }
            }
        }
        return nil
    }
    static func status() -> [String: Any] {
        // Launch Services does not forward this process's CODEX_HOME to Desktop.
        let home = NSHomeDirectory() + "/.codex"
        return ["installed": application() != nil, "codexHome": URL(fileURLWithPath: home).standardizedFileURL.path]
    }
    static func url(_ p: [String: Any]) throws -> URL {
        var parts = URLComponents(); parts.scheme = "codex"; parts.host = "threads"
        let id = p["threadId"] as? String ?? ""
        if !id.isEmpty {
            guard let uuid = UUID(uuidString: id), uuid.uuidString.count == id.count else { throw failure("Codex 会话 ID 无效。") }
            parts.path = "/" + uuid.uuidString.lowercased()
        } else {
            parts.path = "/new"
            if let workspace = p["workspace"] as? String, !workspace.isEmpty {
                var directory: ObjCBool = false
                guard workspace.hasPrefix("/"), FileManager.default.fileExists(atPath: workspace, isDirectory: &directory), directory.boolValue else { throw failure("工作目录不存在。") }
                let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
                parts.percentEncodedQuery = "path=" + (workspace.addingPercentEncoding(withAllowedCharacters: allowed) ?? "")
            }
        }
        guard let url = parts.url else { throw failure("无法生成 Desktop 链接。") }
        return url
    }
    static func open(_ p: [String: Any]) async throws -> Bool {
        let link = try url(p)
        guard let app = application() else { throw failure("未检测到 Codex Desktop，请先完成安装。") }
        return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Bool, Error>) in
            NSWorkspace.shared.open([link], withApplicationAt: app, configuration: NSWorkspace.OpenConfiguration()) { application, error in
                if let error { continuation.resume(throwing: error) }
                else if application != nil { continuation.resume(returning: true) }
                else { continuation.resume(throwing: failure("无法打开 Codex Desktop。")) }
            }
        }
    }
}

// Foundation's fixed-length reads can wait for the requested byte count on a
// pipe. A JSON line must be delivered as soon as read(2) returns any bytes.
func readPipe(_ handle: FileHandle, limit: Int = 65536) throws -> Data {
    var bytes = [UInt8](repeating: 0, count: limit)
    while true {
        let count = bytes.withUnsafeMutableBytes { Darwin.read(handle.fileDescriptor, $0.baseAddress!, $0.count) }
        if count >= 0 { return Data(bytes.prefix(count)) }
        if errno != EINTR { throw failure("无法读取后台管道（\(errno)）。") }
    }
}

func command(_ executable: String, _ args: [String], env: [String: String]? = nil, timeout: Double = 10) async throws -> String {
    try await withCheckedThrowingContinuation { continuation in
        DispatchQueue.global(qos: .utility).async {
            let process = Process(), pipe = Pipe()
            process.executableURL = URL(fileURLWithPath: executable); process.arguments = args
            process.environment = env; process.standardInput = FileHandle.nullDevice
            process.standardOutput = pipe; process.standardError = pipe
            do {
                try process.run()
                let deadline = DispatchWorkItem { if process.isRunning { process.terminate(); DispatchQueue.global().asyncAfter(deadline: .now() + 1) { if process.isRunning { kill(process.processIdentifier, SIGKILL) } } } }
                DispatchQueue.global().asyncAfter(deadline: .now() + timeout, execute: deadline)
                var output = Data()
                while true {
                    let chunk = try readPipe(pipe.fileHandleForReading, limit: 8192)
                    if chunk.isEmpty { break }
                    output.append(chunk); if output.count > 32768 { output.removeFirst(output.count - 32768) }
                }
                process.waitUntilExit(); deadline.cancel()
                let text = String(decoding: output, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
                guard process.terminationStatus == 0 else { throw failure(text.isEmpty ? "命令执行失败或超时。" : text) }
                continuation.resume(returning: text)
            } catch { continuation.resume(throwing: error) }
            try? pipe.fileHandleForReading.close()
        }
    }
}

enum Runtime {
    static let home = FileManager.default.homeDirectoryForCurrentUser
    static func directories() -> [String] {
        var result = (ProcessInfo.processInfo.environment["PATH"] ?? "").split(separator: ":").map(String.init)
        result += ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin", home.appendingPathComponent(".npm-global/bin").path, home.appendingPathComponent(".volta/bin").path, home.appendingPathComponent(".local/bin").path, home.appendingPathComponent(".local/share/mise/shims").path, home.appendingPathComponent(".asdf/shims").path]
        for base in [".nvm/versions/node", ".volta/tools/image/node", ".local/share/fnm/node-versions", "Library/Application Support/fnm/node-versions"] {
            let root = home.appendingPathComponent(base)
            let versions = ((try? FileManager.default.contentsOfDirectory(atPath: root.path)) ?? []).sorted { $0.compare($1, options: .numeric) == .orderedDescending }
            for version in versions.prefix(30) { result.append(root.appendingPathComponent(version + (base.contains("fnm") ? "/installation/bin" : "/bin")).path) }
        }
        var seen = Set<String>(); return result.filter { seen.insert($0).inserted }
    }
    static func environment(node: String) -> [String: String] {
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = ([URL(fileURLWithPath: node).deletingLastPathComponent().path] + directories()).joined(separator: ":")
        return env
    }
    static func node(_ data: URL) -> String? {
        let configured = (try? String(contentsOf: data.appendingPathComponent("node-path.txt"), encoding: .utf8))?.trimmingCharacters(in: .whitespacesAndNewlines)
        #if arch(arm64)
        let arch = "arm64"
        #else
        let arch = "x64"
        #endif
        let bundled = Bundle.main.resourceURL?.appendingPathComponent("node/\(arch)/bin/node").path
        return ([configured, bundled].compactMap { $0 } + directories().map { $0 + "/node" }).first { FileManager.default.isExecutableFile(atPath: $0) }
    }
    static func version(_ node: String) async throws -> String {
        let output = try await command(node, ["--version"], env: environment(node: node))
        let parts = output.trimmingCharacters(in: CharacterSet(charactersIn: "v")).split(separator: ".").compactMap { Int($0) }
        guard parts.count == 3, parts[0] > 22 || (parts[0] == 22 && parts[1] >= 13) else { throw failure("需要 Node.js 22.13 或更新版本。") }
        return output
    }
    static func npm(_ node: String) -> String? {
        let real = URL(fileURLWithPath: node).resolvingSymlinksInPath().deletingLastPathComponent()
        let candidates = [real.appendingPathComponent("../lib/node_modules/npm/bin/npm-cli.js").standardizedFileURL.path, real.appendingPathComponent("node_modules/npm/bin/npm-cli.js").path] + directories().map { URL(fileURLWithPath: $0 + "/npm").resolvingSymlinksInPath().path }
        return candidates.first { $0.hasSuffix("npm-cli.js") && FileManager.default.fileExists(atPath: $0) }
    }
}

final class Vault: Sendable {
    let account: String
    init(directory: URL) { account = SHA256.hash(data: Data(directory.path.utf8)).map { String(format: "%02x", $0) }.joined() }
    func key(create: Bool) throws -> SymmetricKey {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "com.qqclaw.desktop.vault", kSecAttrAccount as String: account]
        var lookup = query; lookup[kSecReturnData as String] = true; lookup[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(lookup as CFDictionary, &result)
        if status == errSecSuccess, let bytes = result as? Data, bytes.count == 32 { return SymmetricKey(data: bytes) }
        guard status == errSecItemNotFound && create else { throw failure("无法读取 macOS 钥匙串中的数据密钥（\(status)）。请解锁原系统账户的钥匙串。原数据已保留。") }
        let key = SymmetricKey(size: .bits256), bytes = key.withUnsafeBytes { Data($0) }
        var insert = query; insert[kSecValueData as String] = bytes
        insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let added = SecItemAdd(insert as CFDictionary, nil)
        if added == errSecDuplicateItem { return try self.key(create: false) }
        guard added == errSecSuccess else { throw failure("无法保存 macOS 钥匙串密钥（\(added)）。") }
        return key
    }
    func handle(_ method: String, _ value: String) throws -> String {
        if method == "vault.encrypt" {
            let box = try AES.GCM.seal(Data(value.utf8), using: key(create: true))
            return "mac1:" + box.combined!.base64EncodedString()
        }
        guard method == "vault.decrypt", value.hasPrefix("mac1:"), let bytes = Data(base64Encoded: String(value.dropFirst(5))) else { throw failure("数据格式不适用于此系统，请通过对话备份恢复。原文件已保留。") }
        let plaintext = try AES.GCM.open(AES.GCM.SealedBox(combined: bytes), using: key(create: false))
        return String(decoding: plaintext, as: UTF8.self)
    }
}

final class Resources: NSObject, WKURLSchemeHandler {
    let root: URL
    init(root: URL) { self.root = root.resolvingSymlinksInPath() }
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url, url.scheme == "qqclaw", url.host == "app", task.request.httpMethod == "GET" else { task.didFailWithError(failure("不允许的资源请求。")); return }
        let file = root.appendingPathComponent(url.path == "/" ? "index.html" : String(url.path.dropFirst())).resolvingSymlinksInPath().standardizedFileURL
        guard file.path.hasPrefix(root.path + "/"), let bytes = try? Data(contentsOf: file), bytes.count < 20 * 1024 * 1024 else { task.didFailWithError(failure("找不到应用资源。")); return }
        let mime = ["html": "text/html", "js": "application/javascript", "css": "text/css", "png": "image/png", "svg": "image/svg+xml", "webp": "image/webp", "jpg": "image/jpeg", "gif": "image/gif", "woff2": "font/woff2"][file.pathExtension] ?? "application/octet-stream"
        task.didReceive(URLResponse(url: url, mimeType: mime, expectedContentLength: bytes.count, textEncodingName: mime.hasPrefix("text/") || file.pathExtension == "js" ? "utf-8" : nil))
        task.didReceive(bytes); task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

// Requests/forwarded are main-actor owned; pipe writes use writer, and the
// cross-queue lifecycle flags and byte counter are protected by lock.
final class Backend: @unchecked Sendable {
    let process = Process(), input = Pipe(), output = Pipe(), errors = Pipe()
    let writer = DispatchQueue(label: "com.qqclaw.backend.write"), lock = NSLock()
    var queuedBytes = 0
    var requests: [String: (Result<Any, Error>) -> Void] = [:]
    var forwarded = Set<String>()
    var stopped = false
    var killed = false
    var onWriteFailure: (() -> Void)?
    func send(_ value: Any) throws {
        var data = try jsonData(value); data.append(10)
        lock.lock()
        guard !stopped, queuedBytes + data.count <= 32 * 1024 * 1024 else { lock.unlock(); throw failure("后台写入队列不可用，请重新检测运行环境。") }
        queuedBytes += data.count; lock.unlock()
        writer.async { [self] in
            defer { lock.lock(); queuedBytes -= data.count; lock.unlock() }
            do { try input.fileHandleForWriting.write(contentsOf: data) }
            catch { DispatchQueue.main.async { self.onWriteFailure?() } }
        }
    }
    func killGroup() {
        lock.lock(); if killed { lock.unlock(); return }; killed = true; stopped = true; lock.unlock()
        let pid = process.processIdentifier
        if pid > 0 { kill(-pid, SIGTERM); if process.isRunning { process.terminate() }
            DispatchQueue.global().asyncAfter(deadline: .now() + 2) { kill(-pid, SIGKILL) }
        }
    }
}

@MainActor final class Host: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate, NSWindowDelegate, NSMenuItemValidation {
    var window: NSWindow!, web: WKWebView!, backend: Backend?, starting: Task<Backend, Error>?
    var data: URL!, resources: URL!, vault: Vault!, lockFD: Int32 = -1
    var quitting = false, allowQuit = false, restarting = false, installing = false
    var requestSequence = 0
    var browserHost: BrowserHost?
    var cefBrowser: CefBrowserController?
    var cef: MacCefRuntime?
    var menuAvailable = false, menuReady = false, menuSidebar = true, menuPanel = false, menuHasSession = false
    var menuFont = 14
    var menuBrowser = false, menuTabNavigation = false, menuWorkspaceAvailable = false, menuCanReopen = false
    var menuCanFind = false, menuFindOpen = false, menuCanStepFind = false
    func prepareEnvironment() throws {
        let env = ProcessInfo.processInfo.environment
        data = URL(fileURLWithPath: env["QQCLAW_DATA_DIR"] ?? Runtime.home.appendingPathComponent("Library/Application Support/QQClaw").path).standardizedFileURL
        try FileManager.default.createDirectory(at: data, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        data = data.resolvingSymlinksInPath()
        lockFD = open(data.appendingPathComponent("instance.lock").path, O_CREAT | O_RDWR, 0o600)
        guard lockFD >= 0, flock(lockFD, LOCK_EX | LOCK_NB) == 0 else { throw failure("此数据目录的 QQClaw 已运行，请打开现有窗口。") }
        resources = Bundle.main.resourceURL!; vault = Vault(directory: data)
    }
    func cefOptions() throws -> [String: Any] {
        let browserRoot = data.appendingPathComponent("browser-profiles")
        var options: [String: Any] = ["profile": browserRoot.path,
          "helperPath": Bundle.main.privateFrameworksURL!.appendingPathComponent("QQClawBrowser Helper.app/Contents/MacOS/QQClawBrowser Helper").path]
        #if arch(arm64)
        let arch = "arm64"
        #else
        let arch = "x64"
        #endif
        let original = resources.appendingPathComponent("official-browser/\(arch)")
        let file = original.appendingPathComponent("runtime.json")
        if FileManager.default.fileExists(atPath: file.path) {
            guard let manifest = try JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any],
                  let paths = manifest["paths"] as? [String: Any], let version = manifest["vendorVersion"] as? String,
                  version.range(of: "^[0-9.]+$", options: .regularExpression) != nil else { throw failure("内置浏览运行库清单无效。") }
            func component(_ key: String) throws -> String {
                guard let path = paths[key] as? String else { throw failure("内置浏览运行库组件缺失。") }
                let value = original.appendingPathComponent(path).standardizedFileURL
                guard value.path.hasPrefix(original.path + "/") else { throw failure("内置浏览组件路径无效。") }; return value.path
            }
            let home = data.appendingPathComponent("browser-runtime"), hostDirectory = home.appendingPathComponent("native-host/\(version)")
            try FileManager.default.createDirectory(at: hostDirectory, withIntermediateDirectories: true)
            try FileManager.default.createDirectory(at: home.appendingPathComponent("codex"), withIntermediateDirectories: true)
            let host = hostDirectory.appendingPathComponent("ChatGPT for Chrome")
            if !FileManager.default.fileExists(atPath: host.path) { try FileManager.default.copyItem(atPath: component("host"), toPath: host.path) }
            try jsonData(["schemaVersion": 1, "channel": "prod", "codexCliPath": component("codexCliPath"), "codexHome": home.appendingPathComponent("codex").path,
              "nodePath": component("nodePath"), "nodeReplPath": component("nodeReplPath"), "browserClientPath": component("browserClientPath"), "proxyHost": "127.0.0.1", "proxyPort": 0]).write(to: hostDirectory.appendingPathComponent("extension-host-config.json"), options: .atomic)
            let registration: [String: Any] = ["name": "com.openai.codexextension", "type": "stdio", "description": "QQClaw bundled official ChatGPT host", "path": host.path,
              "allowed_origins": ["chrome-extension://hehggadaopoacecdllhhajmbjkdcmajg/"]]
            let target = browserRoot.appendingPathComponent("NativeMessagingHosts/com.openai.codexextension.json")
            try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
            try jsonData(registration).write(to: target, options: .atomic)
            options["extensionPath"] = original.appendingPathComponent("extension").path
        }
        return options
    }
    func cefEvent(_ value: [String: Any]) {
        cefBrowser?.event(value)
        switch value["event"] as? String {
        case "root-created":
            if web == nil { applicationDidFinishLaunching(Notification(name: NSApplication.didFinishLaunchingNotification)) }
        case "root-selected": window = cef?.window
        case "close-requested": requestCefQuit()
        default: break
        }
    }
    func requestCefQuit() {
        guard !quitting else { return }; quitting = true
        Task { @MainActor in
            do { try await shutdown() }
            catch {
                let alert = NSAlert(); alert.messageText = "未能确认对话已保存"; alert.informativeText = error.localizedDescription
                alert.addButton(withTitle: "取消退出"); alert.addButton(withTitle: "仍然退出")
                if alert.runModal() == .alertFirstButtonReturn { quitting = false; restarting = false; return }
                backend?.killGroup()
            }
            allowQuit = true; cef?.close()
        }
    }
    func applicationDidFinishLaunching(_ notification: Notification) {
        guard web == nil, cef == nil || cef?.window != nil else { return }
        do {
            if data == nil { try prepareEnvironment() }
            makeMenu()
            let config = WKWebViewConfiguration()
            config.websiteDataStore = WKWebsiteDataStore.nonPersistent()
            config.setURLSchemeHandler(Resources(root: resources.appendingPathComponent("ui")), forURLScheme: "qqclaw")
            config.userContentController.add(self, name: "qqclaw")
            let bridge = """
            (() => { const listeners = []; window.qqclaw = { platform: 'darwin', bridge: {
              postMessage: value => window.webkit.messageHandlers.qqclaw.postMessage(value),
              addEventListener: (name, callback) => { if (name === 'message') listeners.push(callback); }
            }}; window.__qqclawReceive = data => listeners.forEach(callback => callback({data})); })();
            """
            config.userContentController.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
            web = try cef?.shell(configuration: config) ?? WKWebView(frame: .zero, configuration: config); web.navigationDelegate = self
            web.appearance = NSAppearance(named: .aqua)
            web.underPageBackgroundColor = .white
            window = cef?.window ?? NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1320, height: 850), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
            window.title = "QQClaw"; window.minSize = NSSize(width: 1000, height: 680)
            window.appearance = NSAppearance(named: .aqua)
            window.backgroundColor = .white
            window.setFrameAutosaveName("QQClawMain"); if cef == nil { window.contentView = web; window.delegate = self }
            window.center(); window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
            web.load(URLRequest(url: URL(string: "qqclaw://app/index.html")!))
        } catch { alert(error.localizedDescription); if let cef { cef.close() } else { NSApp.terminate(nil) } }
    }
    func makeMenu() {
        let menu = NSMenu(), app = NSMenu(), file = NSMenu(), edit = NSMenu(), view = NSMenu(), windows = NSMenu(), help = NSMenu()
        func command(_ parent: NSMenu, _ title: String, _ name: String, _ key: String = "", modifiers: NSEvent.ModifierFlags = [.command]) {
            let item = NSMenuItem(title: title, action: #selector(menuCommand(_:)), keyEquivalent: key)
            item.keyEquivalentModifierMask = modifiers
            item.target = self; item.representedObject = name; parent.addItem(item)
        }
        func section(_ title: String, _ submenu: NSMenu) {
            let root = NSMenuItem(title: title, action: nil, keyEquivalent: ""); root.submenu = submenu; menu.addItem(root)
        }
        let appRoot = NSMenuItem(); appRoot.submenu = app; menu.addItem(appRoot)
        command(app, "关于 QQClaw", "about")
        command(app, "设置…", "settings", ",")
        app.addItem(.separator()); app.addItem(withTitle: "隐藏 QQClaw", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        app.addItem(withTitle: "退出 QQClaw", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        section("文件", file)
        command(file, "新聊天", "new-session", "n"); command(file, "打开项目…", "add-project", "o")
        command(file, "新网页标签", "browser-new-tab", "t"); command(file, "关闭工作标签", "panel-close-active", "w")
        command(file, "重新打开关闭的标签页", "panel-reopen-tab", "t", modifiers: [.command, .shift])
        command(file, "打开工作目录", "open-folder"); file.addItem(.separator()); command(file, "配置运行环境…", "runtime")
        section("编辑", edit)
        for (name, action, key) in [("撤销", "undo:", "z"), ("重做", "redo:", "Z"), ("剪切", "cut:", "x"), ("复制", "copy:", "c"), ("粘贴", "paste:", "v"), ("全选", "selectAll:", "a")] { edit.addItem(withTitle: name, action: Selector(action), keyEquivalent: key) }
        edit.addItem(.separator()); command(edit, "搜索会话…", "search", "k"); command(edit, "查找当前内容…", "find-current", "f")
        command(edit, "下一个匹配", "find-next", "g"); command(edit, "上一个匹配", "find-previous", "g", modifiers: [.command, .shift])
        command(edit, "关闭查找", "find-close", "\u{1b}", modifiers: [])
        section("视图", view)
        command(view, "侧栏", "toggle-sidebar", "b"); command(view, "工作面板", "toggle-panel", "B")
        command(view, "展开工作面板", "maximize-panel"); command(view, "网页预览", "open-browser-window"); view.addItem(.separator())
        command(view, "网页地址栏", "browser-focus-address", "l")
        command(view, "下一个工作标签", "panel-next-tab", "\t", modifiers: [.control])
        command(view, "上一个工作标签", "panel-previous-tab", "\t", modifiers: [.control, .shift])
        view.addItem(.separator())
        command(view, "增大字号", "font-increase", "="); command(view, "减小字号", "font-decrease", "-"); command(view, "默认字号", "font-reset", "0")
        section("窗口", windows)
        windows.addItem(withTitle: "最小化", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        section("帮助", help)
        command(help, "项目与使用说明", "source-project"); command(help, "Codex 文档", "codex-docs"); command(help, "官方浏览器扩展说明", "official-browser-docs")
        NSApp.mainMenu = menu; NSApp.windowsMenu = windows; NSApp.helpMenu = help
    }
    @objc func menuCommand(_ sender: NSMenuItem) {
        guard validateMenuItem(sender), let name = sender.representedObject as? String else { return }
        let page = browserHost?.focusedPage()
        window?.makeFirstResponder(web)
        if let page, let command = ["find-current": "find-browser", "find-next": "find-browser-next", "find-previous": "find-browser-previous", "find-close": "find-browser-close"][name] {
            event("browser-shortcut", ["owner": page.owner, "tabId": page.id, "command": command]); return
        }
        event("menu-action", ["action": name])
    }
    func validateMenuItem(_ item: NSMenuItem) -> Bool {
        guard let name = item.representedObject as? String else { return true }
        if name == "toggle-sidebar" { item.state = menuSidebar ? .on : .off }
        if name == "toggle-panel" { item.state = menuPanel ? .on : .off }
        if ["runtime", "source-project", "codex-docs", "official-browser-docs"].contains(name) { return menuAvailable }
        if name == "font-increase" { return menuReady && menuFont < 20 }
        if name == "font-decrease" { return menuReady && menuFont > 12 }
        if name == "font-reset" { return menuReady && menuFont != 14 }
        if name == "find-current" { return menuReady && menuWorkspaceAvailable && ((browserHost?.focusedPage()).map { !$0.url.isEmpty } ?? menuCanFind) }
        if ["find-next", "find-previous"].contains(name) { return menuReady && menuWorkspaceAvailable && (browserHost?.focusedPage()?.findCanStep ?? menuCanStepFind) }
        if name == "find-close" { return menuReady && menuWorkspaceAvailable && (browserHost?.focusedPage()?.findOpen ?? menuFindOpen) }
        if name == "browser-new-tab" { return menuReady && menuWorkspaceAvailable }
        if name == "panel-reopen-tab" { return menuReady && menuWorkspaceAvailable && menuCanReopen }
        if name == "browser-focus-address" { return menuReady && menuWorkspaceAvailable && menuPanel && menuBrowser }
        if ["panel-next-tab", "panel-previous-tab"].contains(name) { return menuReady && menuWorkspaceAvailable && menuPanel && menuTabNavigation }
        if name == "panel-close-active" { return menuReady && menuWorkspaceAvailable && menuPanel }
        return menuReady
    }
    func alert(_ text: String) { let alert = NSAlert(); alert.messageText = "QQClaw"; alert.informativeText = text; alert.runModal() }
    func post(_ value: Any) { guard let text = try? jsonText(value) else { return }; web?.evaluateJavaScript("window.__qqclawReceive(\(text))", completionHandler: nil) }
    func event(_ name: String, _ value: Any) { post(["kind": "event", "event": name, "data": value]) }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, message.frameInfo.securityOrigin.protocol == "qqclaw", message.frameInfo.securityOrigin.host == "app", let request = message.body as? [String: Any], let id = request["id"] as? String, id.hasPrefix("ui-"), let method = request["method"] as? String else { return }
        // Vault methods are only accepted from the backend's private pipe.
        guard !method.hasPrefix("vault.") else { post(["id": id, "error": "不允许的调用。"]); return }
        Task { @MainActor in
            do {
                if let result = try await handle(method, request["params"] as? [String: Any] ?? [:]) { post(["id": id, "result": result]); return }
                let child = try await startBackend(); child.forwarded.insert(id)
                do { try child.send(request) } catch { child.forwarded.remove(id); throw error }
            } catch { post(["id": id, "error": error.localizedDescription]) }
        }
    }
    func handle(_ method: String, _ p: [String: Any]) async throws -> Any? {
        let path = p["path"] as? String ?? ""
        switch method {
        case "window.menuState":
            menuAvailable = true; menuReady = p["ready"] as? Bool == true
            menuSidebar = p["sidebar"] as? Bool == true; menuPanel = p["panel"] as? Bool == true
            menuFont = p["fontSize"] as? Int ?? 14
            menuHasSession = p["hasSession"] as? Bool == true
            menuBrowser = p["browser"] as? Bool == true; menuTabNavigation = p["tabNavigation"] as? Bool == true
            menuWorkspaceAvailable = p["workspaceAvailable"] as? Bool == true
            menuCanReopen = p["canReopen"] as? Bool == true
            menuCanFind = p["canFind"] as? Bool == true; menuFindOpen = p["findOpen"] as? Bool == true; menuCanStepFind = p["canStepFind"] as? Bool == true
            return true
        case "window.theme":
            let dark = p["theme"] as? String == "dark"
            let appearance = NSAppearance(named: dark ? .darkAqua : .aqua)
            window?.appearance = appearance; web?.appearance = appearance
            let background = dark ? NSColor(white: 17.0 / 255.0, alpha: 1) : .white
            window?.backgroundColor = background; web?.underPageBackgroundColor = background
            return true
        case "window.minimize": window.miniaturize(nil); return true
        case "window.focusBrowser":
            if let cefBrowser { return cefBrowser.focus(owner: p["owner"] as? String ?? "", tabId: p["tabId"] as? String ?? "") }
            return browserHost?.focus(owner: p["owner"] as? String ?? "", tabId: p["tabId"] as? String ?? "") ?? false
        case "window.maximize": window.zoom(nil); return true
        case "window.close": NSApp.terminate(nil); return true
        case "window.drag", "window.resize": return true // Native titlebar and resize handles.
        case "browser.view", "browser.control", "browser.downloads", "browser.history":
            if browserHost == nil { browserHost = BrowserHost(resources: resources, parent: web, data: data, downloadNotify: { [weak self] value in self?.event("browser-downloads", value) }, historyNotify: { [weak self] value in self?.event("browser-history", value) }) { [weak self] value in self?.event("browser-state", value) } }
            if let cef {
                if cefBrowser == nil { cefBrowser = CefBrowserController(runtime: cef, directory: data, parent: web, history: browserHost!.history, downloads: browserHost!.downloads) { [weak self] value in self?.event("browser-state", value) } }
                if method == "browser.view" { cefBrowser!.setView(p); return true }
                if method == "browser.control" { return try await cefBrowser!.handle(p) }
            }
            if method == "browser.view" { browserHost!.setView(p); return true }
            if method == "browser.downloads" { return try browserHost!.downloads.handle(p) }
            if method == "browser.history" { return try browserHost!.history.handle(p) }
            return try await browserHost!.handle(p)
        case "desktop.status": return DesktopIntegration.status()
        case "desktop.open": return try await DesktopIntegration.open(p)
        case "dialog.folder", "dialog.file", "dialog.files", "dialog.executable":
            let panel = NSOpenPanel(); panel.canChooseDirectories = method == "dialog.folder"; panel.canChooseFiles = !panel.canChooseDirectories
            panel.allowsMultipleSelection = method == "dialog.files"; panel.canCreateDirectories = panel.canChooseDirectories
            panel.title = p["title"] as? String ?? (panel.canChooseDirectories ? "选择 Codex 的工作目录" : "选择文件")
            if !path.isEmpty { panel.directoryURL = URL(fileURLWithPath: path) }
            let selected: Any = await withCheckedContinuation { (continuation: CheckedContinuation<Any, Never>) in
                panel.beginSheetModal(for: window) { response in
                    if method == "dialog.files" { continuation.resume(returning: response == .OK ? panel.urls.map(\.path) : []); return }
                    continuation.resume(returning: response == .OK ? (panel.url?.path as Any? ?? NSNull()) : NSNull())
                }
            }
            return selected
        case "shell.open":
            guard let text = p["url"] as? String, let url = URL(string: text), ["https", "http"].contains(url.scheme ?? "") else { throw failure("只能打开 HTTP 或 HTTPS 链接。") }
            NSWorkspace.shared.open(url); return true
        case "shell.folder", "shell.reveal":
            guard path.hasPrefix("/"), FileManager.default.fileExists(atPath: path) else { throw failure("文件或目录不存在。") }
            if method == "shell.reveal" { NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)]) }
            else { NSWorkspace.shared.open(URL(fileURLWithPath: path)) }; return true
        case "clipboard.write":
            NSPasteboard.general.clearContents(); NSPasteboard.general.setString(p["text"] as? String ?? "", forType: .string); return true
        case "system.status":
            let node = Runtime.node(data) ?? ""; var version = "", error = ""
            if !node.isEmpty { do { version = try await Runtime.version(node) } catch let e { error = e.localizedDescription } }
            else { error = "未检测到 Node.js，请安装 22.13 或更新版本。" }
            return ["nodeReady": !version.isEmpty, "nodePath": node, "nodeVersion": version, "nodeError": error, "dataDir": data.path, "platform": "darwin", "desktop": DesktopIntegration.status(), "webview": "系统 WebKit"] as [String: Any]
        case "system.nodePath":
            _ = try await Runtime.version(path); try path.write(to: data.appendingPathComponent("node-path.txt"), atomically: true, encoding: .utf8); return true
        case "system.reload":
            try await shutdown(); _ = try await startBackend(); return true
        case "system.restart":
            restarting = true; DispatchQueue.main.async { NSApp.terminate(nil) }; return true
        case "system.installCodex":
            guard !installing else { throw failure("Codex 正在安装。") }; installing = true; defer { installing = false }
            guard let node = Runtime.node(data), let npm = Runtime.npm(node) else { throw failure("未找到 Node.js 或 npm，请先使用 Node.js 官网安装器完成安装。") }
            _ = try await Runtime.version(node)
            // A user-owned prefix avoids sudo and root-owned Homebrew directories.
            var env = Runtime.environment(node: node); env["npm_config_prefix"] = Runtime.home.appendingPathComponent(".npm-global").path
            do { _ = try await command(node, [npm, "install", "-g", "@openai/codex"], env: env, timeout: 240) }
            catch { throw failure("Codex 安装失败，请检查网络与 ~/.npm-global 的权限，再重试。也可在终端执行 npm install -g @openai/codex。") }
            return ["installed": true, "message": "Codex 已安装，正在重启识别。"] as [String: Any]
        case "system.loginCodex":
            let response = try await call(try await startBackend(), "environment") as? [String: Any]
            guard let codex = response?["codexPath"] as? String, !codex.isEmpty, let node = Runtime.node(data) else { throw failure("请先安装 Codex CLI。") }
            let directory = data.appendingPathComponent("login"); try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            let script = directory.appendingPathComponent("codex-login.command")
            let exe = codex.hasSuffix(".js") || codex.hasSuffix(".mjs") || codex.hasSuffix(".cjs") ? quoteShell(node) + " " + quoteShell(codex) : quoteShell(codex)
            var body = "#!/bin/sh\nexport PATH=\(quoteShell(Runtime.environment(node: node)["PATH"]!))\n"
            if let home = ProcessInfo.processInfo.environment["CODEX_HOME"] { body += "export CODEX_HOME=\(quoteShell(home))\n" }
            body += "\(exe) login --device-auth\nstatus=$?\nrm -f -- \"$0\"\nexit $status\n"
            try body.write(to: script, atomically: true, encoding: .utf8); try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: script.path)
            _ = try await command("/usr/bin/open", ["-a", "Terminal", script.path]); return true
        default: return nil
        }
    }
    func startBackend() async throws -> Backend {
        if let child = backend, child.process.isRunning { return child }
        if let task = starting { return try await task.value }
        let task = Task { @MainActor () async throws -> Backend in
            guard let node = Runtime.node(data) else { throw failure("未检测到 Node.js，请在设置中安装。") }
            _ = try await Runtime.version(node)
            let child = Backend(); var env = Runtime.environment(node: node); env["QQCLAW_DATA_DIR"] = data.path
            env["QQCLAW_RUNTIME_DIR"] = resources.path
            if cef != nil { env["QQCLAW_MAC_BROWSER_READY"] = "1" }
            child.process.executableURL = Bundle.main.executableURL
            child.process.arguments = ["--backend", node, resources.appendingPathComponent("backend.cjs").path]
            child.process.environment = env; child.process.currentDirectoryURL = data
            child.process.standardInput = child.input; child.process.standardOutput = child.output; child.process.standardError = child.errors
            child.onWriteFailure = { [weak self, weak child] in guard let child else { return }; child.killGroup(); self?.exited(child) }
            try child.process.run(); backend = child
            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                var buffer = Data()
                do {
                    while true {
                        let chunk = try readPipe(child.output.fileHandleForReading)
                        if chunk.isEmpty { break }
                        buffer.append(chunk)
                        while let end = buffer.firstIndex(of: 10) {
                            let line = Data(buffer[..<end]); buffer.removeSubrange(...end)
                            if let message = (try? JSONSerialization.jsonObject(with: line)) as? [String: Any] { DispatchQueue.main.async { self?.receive(message, child) } }
                        }
                        if buffer.count > 32 * 1024 * 1024 { throw failure("后台响应超过大小限制。") }
                    }
                } catch { DispatchQueue.main.async { self?.event("backend-error", "后台输出管道中断。"); child.killGroup() } }
                // Drain every response (especially shutdown's save acknowledgement)
                // before resolving the process exit on the same main queue.
                child.process.waitUntilExit()
                DispatchQueue.main.async { self?.exited(child) }
            }
            DispatchQueue.global(qos: .utility).async { while let chunk = try? readPipe(child.errors.fileHandleForReading), !chunk.isEmpty {} }
            return child
        }
        starting = task
        defer { starting = nil }; return try await task.value
    }
    func receive(_ message: [String: Any], _ child: Backend) {
        guard backend === child else { return }
        let kind = message["kind"] as? String ?? "", id = message["id"] as? String ?? ""
        if kind == "native" {
            guard let method = message["method"] as? String, ["vault.encrypt", "vault.decrypt", "shell.reveal", "shell.folder", "desktop.status", "desktop.open", "browser.control"].contains(method) else { try? child.send(["kind": "nativeResponse", "id": id, "error": "不支持的内部请求。"]); return }
            let p = message["params"] as? [String: Any] ?? [:]
            if method.hasPrefix("vault.") {
                let vault = self.vault!
                DispatchQueue.global(qos: .userInitiated).async {
                    do { let result = try vault.handle(method, p["value"] as? String ?? ""); try child.send(["kind": "nativeResponse", "id": id, "result": result]) }
                    catch { try? child.send(["kind": "nativeResponse", "id": id, "error": error.localizedDescription]) }
                }
            } else { Task { @MainActor in
                do { let result = try await handle(method, p); try child.send(["kind": "nativeResponse", "id": id, "result": result ?? NSNull()]) }
                catch { try? child.send(["kind": "nativeResponse", "id": id, "error": error.localizedDescription]) }
            } }
        } else if let completion = child.requests.removeValue(forKey: id) {
            if let error = message["error"] as? String { completion(.failure(failure(error))) } else { completion(.success(message["result"] ?? NSNull())) }
        } else if child.forwarded.remove(id) != nil || kind == "event" { post(message) }
    }
    func exited(_ child: Backend) {
        child.lock.lock(); child.stopped = true; child.lock.unlock()
        for (_, completion) in child.requests { completion(.failure(failure("后台进程已退出，请重试。"))) }; child.requests.removeAll()
        for id in child.forwarded { post(["id": id, "error": "后台进程已退出，请重试。"] ) }; child.forwarded.removeAll()
        // The group belongs exclusively to the helper, including Codex/tools.
        child.killGroup()
        if backend === child { backend = nil; if !quitting { event("backend-exit", "后台已退出，请在设置中重新检测运行环境。") } }
    }
    func call(_ child: Backend, _ method: String, params: [String: Any] = [:], timeout: Double = 20) async throws -> Any {
        requestSequence += 1; let id = "host-\(requestSequence)"
        return try await withCheckedThrowingContinuation { continuation in
            child.requests[id] = { continuation.resume(with: $0) }
            do { try child.send(["id": id, "method": method, "params": params]) }
            catch { child.requests.removeValue(forKey: id)?(.failure(error)) }
            DispatchQueue.main.asyncAfter(deadline: .now() + timeout) { child.requests.removeValue(forKey: id)?(.failure(failure("后台保存或关闭超时。请稍后重试。"))) }
        }
    }
    func shutdown() async throws {
        if let starting { _ = try await starting.value }
        guard let child = backend else { return }
        _ = try await call(child, "shutdown")
        if backend === child { backend = nil }; child.killGroup()
    }
    func windowShouldClose(_ sender: NSWindow) -> Bool { NSApp.terminate(nil); return false }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if cef != nil { requestCefQuit(); return .terminateCancel }
        if allowQuit || window == nil { return .terminateNow }
        if quitting { return .terminateCancel }; quitting = true
        Task { @MainActor in
            do { try await shutdown() }
            catch {
                let alert = NSAlert(); alert.messageText = "未能确认对话已保存"; alert.informativeText = error.localizedDescription
                alert.addButton(withTitle: "取消退出"); alert.addButton(withTitle: "仍然退出")
                if alert.runModal() == .alertFirstButtonReturn { quitting = false; restarting = false; NSApp.reply(toApplicationShouldTerminate: false); return }
                backend?.killGroup()
            }
            allowQuit = true; NSApp.reply(toApplicationShouldTerminate: true)
        }
        return .terminateLater
    }
    func applicationWillTerminate(_ notification: Notification) {
        if lockFD >= 0 { flock(lockFD, LOCK_UN); close(lockFD) }
        if restarting { let open = Process(); open.executableURL = URL(fileURLWithPath: "/usr/bin/open"); open.arguments = ["-n", Bundle.main.bundlePath]; try? open.run() }
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { window?.makeKeyAndOrderFront(nil); return true }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = navigationAction.request.url
        decisionHandler(url?.scheme == "qqclaw" && url?.host == "app" && navigationAction.targetFrame?.isMainFrame == true ? .allow : .cancel)
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }
}

@main struct QQClawMain {
    @MainActor static func main() {
        launchBackendIfRequested()
        signal(SIGPIPE, SIG_IGN)
        let host = Host()
        // Browser packages include their native framework. The existing
        // universal package has no framework and keeps its original startup.
        #if arch(arm64)
        let browserArch = "arm64"
        #else
        let browserArch = "x64"
        #endif
        let hasRuntime = Bundle.main.resourceURL.map { FileManager.default.fileExists(atPath: $0.appendingPathComponent("official-browser/\(browserArch)/runtime.json").path) } ?? false
        let hasCef = hasRuntime && (Bundle.main.privateFrameworksURL.map { FileManager.default.fileExists(atPath: $0.appendingPathComponent("libQQClawCefBridge.dylib").path) } ?? false)
        if hasCef || ProcessInfo.processInfo.environment["QQCLAW_MAC_CEF_PREVIEW"] == "1" {
            do {
                try host.prepareEnvironment()
                let runtime = try MacCefRuntime(frameworks: Bundle.main.privateFrameworksURL!)
                host.cef = runtime; runtime.onEvent = { [weak host] value in host?.cefEvent(value) }
                try runtime.start(options: host.cefOptions())
                withExtendedLifetime(host) { runtime.run() }
                host.applicationWillTerminate(Notification(name: NSApplication.willTerminateNotification))
                return
            } catch { fputs("QQClaw Chromium: \(error.localizedDescription)\n", stderr); exit(1) }
        }
        let application = NSApplication.shared
        application.setActivationPolicy(.regular); application.delegate = host
        withExtendedLifetime(host) { application.run() }
    }
}
