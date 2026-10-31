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
                while let chunk = try pipe.fileHandleForReading.read(upToCount: 8192), !chunk.isEmpty {
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
        return ([configured].compactMap { $0 } + directories().map { $0 + "/node" }).first { FileManager.default.isExecutableFile(atPath: $0) }
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

final class Vault {
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

final class Backend {
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

@MainActor final class Host: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate, NSWindowDelegate {
    var window: NSWindow!, web: WKWebView!, backend: Backend?, starting: Task<Backend, Error>?
    var data: URL!, resources: URL!, vault: Vault!, lockFD: Int32 = -1
    var quitting = false, allowQuit = false, restarting = false, installing = false
    var requestSequence = 0
    func applicationDidFinishLaunching(_ notification: Notification) {
        do {
            let env = ProcessInfo.processInfo.environment
            data = URL(fileURLWithPath: env["QQCLAW_DATA_DIR"] ?? Runtime.home.appendingPathComponent("Library/Application Support/QQClaw").path).standardizedFileURL
            try FileManager.default.createDirectory(at: data, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            data = data.resolvingSymlinksInPath()
            lockFD = open(data.appendingPathComponent("instance.lock").path, O_CREAT | O_RDWR, 0o600)
            guard lockFD >= 0, flock(lockFD, LOCK_EX | LOCK_NB) == 0 else { throw failure("此数据目录的 QQClaw 已运行，请打开现有窗口。") }
            resources = Bundle.main.resourceURL!; vault = Vault(directory: data)
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
            web = WKWebView(frame: .zero, configuration: config); web.navigationDelegate = self
            window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1320, height: 850), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
            window.title = "QQClaw"; window.minSize = NSSize(width: 1000, height: 680)
            window.setFrameAutosaveName("QQClawMain"); window.contentView = web; window.delegate = self
            window.center(); window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
            web.load(URLRequest(url: URL(string: "qqclaw://app/index.html")!))
        } catch { alert(error.localizedDescription); NSApp.terminate(nil) }
    }
    func makeMenu() {
        let menu = NSMenu(), app = NSMenu(), edit = NSMenu(), windows = NSMenu()
        let appRoot = NSMenuItem(); appRoot.submenu = app; menu.addItem(appRoot)
        app.addItem(withTitle: "关于 QQClaw", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        app.addItem(.separator()); app.addItem(withTitle: "隐藏 QQClaw", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        app.addItem(withTitle: "退出 QQClaw", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let editRoot = NSMenuItem(title: "编辑", action: nil, keyEquivalent: ""); editRoot.submenu = edit; menu.addItem(editRoot)
        for (name, action, key) in [("撤销", "undo:", "z"), ("重做", "redo:", "Z"), ("剪切", "cut:", "x"), ("复制", "copy:", "c"), ("粘贴", "paste:", "v"), ("全选", "selectAll:", "a")] { edit.addItem(withTitle: name, action: Selector(action), keyEquivalent: key) }
        let windowRoot = NSMenuItem(title: "窗口", action: nil, keyEquivalent: ""); windowRoot.submenu = windows; menu.addItem(windowRoot)
        windows.addItem(withTitle: "最小化", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        NSApp.mainMenu = menu; NSApp.windowsMenu = windows
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
        case "window.minimize": window.miniaturize(nil); return true
        case "window.maximize": window.zoom(nil); return true
        case "window.close": NSApp.terminate(nil); return true
        case "window.drag", "window.resize": return true // Native titlebar and resize handles.
        case "dialog.folder", "dialog.file", "dialog.executable":
            let panel = NSOpenPanel(); panel.canChooseDirectories = method == "dialog.folder"; panel.canChooseFiles = !panel.canChooseDirectories
            panel.allowsMultipleSelection = false; panel.canCreateDirectories = panel.canChooseDirectories
            panel.title = p["title"] as? String ?? (panel.canChooseDirectories ? "选择 Codex 的工作目录" : "选择文件")
            if !path.isEmpty { panel.directoryURL = URL(fileURLWithPath: path) }
            return await withCheckedContinuation { continuation in panel.beginSheetModal(for: window) { response in continuation.resume(returning: response == .OK ? (panel.url?.path as Any? ?? NSNull()) : NSNull()) } }
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
            return ["nodeReady": !version.isEmpty, "nodePath": node, "nodeVersion": version, "nodeError": error, "dataDir": data.path, "platform": "darwin", "webview": "系统 WebKit"] as [String: Any]
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
            child.process.executableURL = Bundle.main.executableURL
            child.process.arguments = ["--backend", node, resources.appendingPathComponent("backend.cjs").path]
            child.process.environment = env; child.process.currentDirectoryURL = data
            child.process.standardInput = child.input; child.process.standardOutput = child.output; child.process.standardError = child.errors
            child.onWriteFailure = { [weak self, weak child] in guard let child else { return }; child.killGroup(); self?.exited(child) }
            try child.process.run(); backend = child
            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                var buffer = Data()
                do {
                    while let chunk = try child.output.fileHandleForReading.read(upToCount: 65536), !chunk.isEmpty {
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
            DispatchQueue.global(qos: .utility).async { while !(child.errors.fileHandleForReading.availableData).isEmpty {} }
            return child
        }
        starting = task
        defer { starting = nil }; return try await task.value
    }
    func receive(_ message: [String: Any], _ child: Backend) {
        guard backend === child else { return }
        let kind = message["kind"] as? String ?? "", id = message["id"] as? String ?? ""
        if kind == "native" {
            guard let method = message["method"] as? String, ["vault.encrypt", "vault.decrypt", "shell.reveal", "shell.folder"].contains(method) else { try? child.send(["kind": "nativeResponse", "id": id, "error": "不支持的内部请求。"]); return }
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
    func call(_ child: Backend, _ method: String, timeout: Double = 20) async throws -> Any {
        requestSequence += 1; let id = "host-\(requestSequence)"
        return try await withCheckedThrowingContinuation { continuation in
            child.requests[id] = { continuation.resume(with: $0) }
            do { try child.send(["id": id, "method": method, "params": [:]]) }
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
        let application = NSApplication.shared, host = Host()
        application.setActivationPolicy(.regular); application.delegate = host
        withExtendedLifetime(host) { application.run() }
    }
}
