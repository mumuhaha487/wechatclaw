import AppKit
import WebKit

private struct BrowserHistoryRecord: Codable {
    let id: String, url: String, title: String
    let at: Int64
    var value: [String: Any] { ["id": id, "url": url, "title": title, "at": at] }
}
@MainActor final class BrowserHistory {
    private let directory: URL, file: URL, vault: Vault, notify: ([String: Any]) -> Void
    private var items: [BrowserHistoryRecord] = [], storageError = ""
    private var revision: Int64 = 0
    init(directory: URL, notify: @escaping ([String: Any]) -> Void) {
        self.directory = directory; file = directory.appendingPathComponent("browser-history.json"); vault = Vault(directory: directory); self.notify = notify
        do {
            if FileManager.default.fileExists(atPath: file.path) {
                let text = try vault.handle("vault.decrypt", String(contentsOf: file, encoding: .utf8))
                let saved = try JSONDecoder().decode([BrowserHistoryRecord].self, from: Data(text.utf8))
                guard saved.count <= 500, saved.allSatisfy({ !$0.id.isEmpty && $0.at > 0 && $0.title.utf16.count <= 512 && Self.normalize($0.url) == $0.url }), Set(saved.map(\.id)).count == saved.count, Set(saved.map(\.url)).count == saved.count else { throw failure("历史记录格式无效。") }
                items = saved.sorted { $0.at > $1.at }
            }
        } catch { storageError = "无法读取加密浏览记录，原文件已保留。请解锁原系统账户的钥匙串、检查数据目录后重启。" }
    }
    private static func normalize(_ value: String) -> String? {
        guard !value.isEmpty, value.utf16.count <= 8192, BrowserHost.allowed(value), var components = URLComponents(string: value) else { return nil }
        components.fragment = nil
        guard let result = components.url?.absoluteString, result.utf16.count <= 8192 else { return nil }; return result
    }
    private static var now: Int64 { Int64(Date().timeIntervalSince1970 * 1000) }
    func visit(_ value: String, title: String) {
        guard let url = Self.normalize(value), storageError.isEmpty else { return }
        let original = items, previous = items.first { $0.url == url }
        let cleanTitle = title.unicodeScalars.filter { !CharacterSet.controlCharacters.contains($0) }.prefix(256).map(String.init).joined().trimmingCharacters(in: .whitespacesAndNewlines)
        let record = BrowserHistoryRecord(id: previous?.id ?? UUID().uuidString.lowercased(), url: url, title: cleanTitle.isEmpty ? (URL(string: url)?.host ?? url) : cleanTitle, at: Self.now)
        items = Array(([record] + items.filter { $0.url != url }).prefix(500))
        do { try save() } catch { items = original }
        notify(state())
    }
    private func save() throws {
        do {
            let text = String(decoding: try JSONEncoder().encode(items), as: UTF8.self)
            let encrypted = try vault.handle("vault.encrypt", text)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try Data(encrypted.utf8).write(to: file, options: .atomic)
        } catch { storageError = "浏览记录保存失败，原记录已保留。请检查磁盘空间和数据目录权限后重启。"; throw failure(storageError) }
    }
    func state() -> [String: Any] { revision += 1; return ["revision": revision, "items": items.map(\.value), "storageError": storageError] }
    func handle(_ p: [String: Any]) throws -> [String: Any] {
        let action = p["action"] as? String ?? ""
        if action == "state" { return state() }
        guard storageError.isEmpty else { throw failure(storageError) }
        let original = items
        switch action {
        case "remove":
            guard let id = p["id"] as? String, items.contains(where: { $0.id == id }) else { throw failure("该浏览记录已不存在。") }
            items.removeAll { $0.id == id }
        case "clear":
            let range = p["range"] as? String ?? ""
            guard ["hour", "day", "all"].contains(range) else { throw failure("清除时间范围无效。") }
            let since: Int64 = range == "all" ? 0 : Self.now - (range == "hour" ? 3_600_000 : 86_400_000)
            items.removeAll { $0.at >= since }
        default: throw failure("不支持的浏览记录操作。")
        }
        do { try save() } catch { items = original; notify(state()); throw error }
        let value = state(); notify(value); return value
    }
}

@MainActor final class BrowserSession {
    var revision: Int64 = 0
    var disposed = false
    let owner: String, profile: String
    var tabs: [BrowserWindow] = []
    var active: BrowserWindow!
    init(owner: String, profile: String) { self.owner = owner; self.profile = profile }
}

@MainActor final class BrowserHost {
    let resources: URL, parent: NSView
    let notify: ([String: Any]) -> Void
    let downloads: BrowserDownloads
    let history: BrowserHistory
    var sessions: [String: BrowserSession] = [:]
    var stores: [String: WKWebsiteDataStore] = [:]
    var operations: [String: Task<Any, Error>] = [:]
    var visibleOwner = "", visible = false, rectangle = NSRect.zero
    init(resources: URL, parent: NSView, data: URL? = nil, downloadNotify: (([String: Any]) -> Void)? = nil, historyNotify: (([String: Any]) -> Void)? = nil, notify: @escaping ([String: Any]) -> Void) {
        self.resources = resources; self.parent = parent; self.notify = notify
        let directory = data ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("QQClaw")
        downloads = BrowserDownloads(directory: directory, notify: downloadNotify ?? { _ in })
        history = BrowserHistory(directory: directory, notify: historyNotify ?? { _ in })
    }
    func setView(_ p: [String: Any]) {
        visibleOwner = p["owner"] as? String ?? ""
        let width = (p["viewportWidth"] as? NSNumber)?.doubleValue ?? 0
        let height = (p["viewportHeight"] as? NSNumber)?.doubleValue ?? 0
        visible = p["visible"] as? Bool == true && width > 0 && height > 0
        if visible {
            func number(_ key: String) -> Double { let n = (p[key] as? NSNumber)?.doubleValue ?? 0; return n.isFinite ? max(-10000, min(30000, n)) : 0 }
            let sx = parent.bounds.width / width, sy = parent.bounds.height / height
            let x = number("x") * sx, w = max(0, number("width") * sx), h = max(0, number("height") * sy)
            let y = parent.isFlipped ? number("y") * sy : parent.bounds.height - (number("y") + number("height")) * sy
            rectangle = NSRect(x: x, y: y, width: w, height: h).intersection(parent.bounds)
        }
        layout()
    }
    func layout() {
        for (owner, session) in sessions { for tab in session.tabs {
            let show = visible && owner == visibleOwner && session.active === tab && !rectangle.isEmpty
            tab.web.frame = show ? rectangle : NSRect(x: -2000, y: 0, width: 1000, height: 760)
            tab.web.isHidden = !show
            if show { parent.addSubview(tab.web, positioned: .above, relativeTo: nil) }
        } }
    }
    func state(_ session: BrowserSession, reveal: Bool = false) -> [String: Any] {
        let tab = session.active
        session.revision += 1
        return ["owner": session.owner, "revision": session.revision, "reveal": reveal, "activeTab": tab?.id ?? "",
                "tabs": session.tabs.map { ["id": $0.id, "title": $0.web.title ?? "新标签页", "url": $0.url, "loading": $0.web.isLoading] as [String: Any] },
                "url": tab?.url ?? "", "title": tab?.web.title ?? "", "loading": tab?.web.isLoading ?? false,
                "canGoBack": tab?.web.canGoBack ?? false, "canGoForward": tab?.web.canGoForward ?? false, "error": tab?.errorText ?? ""]
    }
    func publish(_ session: BrowserSession, reveal: Bool = false) { if !session.disposed { notify(state(session, reveal: reveal)) } }
    func newTab(_ session: BrowserSession) throws {
        guard session.tabs.count < 12 else { throw failure("最多打开 12 个标签页，请先关闭不用的页面。") }
        // macOS 13 lacks persistent stores by identifier. Share only the same
        // account's in-memory store; never borrow the app or system login store.
        let store = stores[session.profile] ?? WKWebsiteDataStore.nonPersistent(); stores[session.profile] = store
        let tab = BrowserWindow(resources: resources, store: store, downloads: downloads, history: history, owner: session.owner) { [weak self, weak session] in
            guard let self, let session else { return }; self.publish(session)
        }
        parent.addSubview(tab.web); tab.web.isHidden = true
        session.tabs.append(tab); session.active = tab
    }
    func handle(_ p: [String: Any]) async throws -> Any {
        let owner = p["owner"] as? String ?? "", action = p["action"] as? String ?? ""
        guard UUID(uuidString: owner) != nil else { throw failure("浏览器会话无效。") }
        if action == "stop" {
            let tabId = p["tabId"] as? String ?? ""
            sessions[owner]?.tabs.filter { tabId.isEmpty || $0.id == tabId }.forEach { $0.stop() }
            return ["stopped": true]
        }
        if action == "dispose" {
            if let session = sessions[owner] {
                session.disposed = true
                session.tabs.forEach { $0.stop() }
                _ = await operations[owner]?.result
                session.tabs.forEach { $0.close() }
                session.tabs.removeAll(); session.active = nil
                sessions.removeValue(forKey: owner); operations.removeValue(forKey: owner)
                if visibleOwner == owner { visibleOwner = ""; visible = false }
                layout()
            }
            return ["disposed": true]
        }
        if sessions[owner] == nil {
            let profile = p["profile"] as? String ?? ""
            guard profile.range(of: "^[0-9a-f]{32}$", options: .regularExpression) != nil else { throw failure("浏览器用户目录无效。") }
            let session = BrowserSession(owner: owner, profile: profile); sessions[owner] = session
        }
        let previous = operations[owner], session = sessions[owner]!
        let operation = Task { @MainActor () throws -> Any in
            _ = await previous?.result
            guard !session.disposed else { throw failure("浏览器会话已关闭。") }
            defer { self.publish(session) }
            switch action {
            case "newTab": try self.newTab(session)
            case "selectTab", "closeTab":
                guard let index = session.tabs.firstIndex(where: { $0.id == p["tabId"] as? String }) else { throw failure("浏览器标签页已关闭。") }
                let tab = session.tabs[index]
                if action == "selectTab" { session.active = tab }
                else {
                    session.tabs.remove(at: index)
                    if session.active === tab { session.active = session.tabs.isEmpty ? nil : session.tabs[min(index, session.tabs.count - 1)] }
                    tab.stop(); tab.close()
                }
            default: break
            }
            if session.active == nil && action == "open" { try self.newTab(session) }
            self.layout(); self.publish(session, reveal: action == "open" || action == "newTab")
            if ["state", "newTab", "selectTab", "closeTab"].contains(action) { return self.state(session) }
            guard let tab = session.active else { throw failure("没有打开的标签页，请先打开网页。") }
            do { return try await tab.run(p) }
            catch { tab.errorText = error.localizedDescription; throw error }
        }
        operations[owner] = operation
        return try await operation.value
    }
    static func allowed(_ value: String) -> Bool {
        guard let url = URL(string: value), ["http", "https"].contains(url.scheme?.lowercased() ?? ""), url.user == nil, url.password == nil, let host = url.host, !host.isEmpty, host.lowercased() != "qqclaw.local" else { return false }
        return true
    }
}

@MainActor final class BrowserWindow: NSObject, WKNavigationDelegate, WKUIDelegate {
    let resources: URL, web: WKWebView
    let id = UUID().uuidString.lowercased()
    let changed: () -> Void
    let downloads: BrowserDownloads, owner: String
    let history: BrowserHistory
    var closed = false, downloadNavigation = false
    var errorText = ""
    var url: String { web.url?.absoluteString == "about:blank" ? "" : web.url?.absoluteString ?? "" }
    var observations: [NSKeyValueObservation] = []
    var navigation: CheckedContinuation<Void, Error>?, navigationToken: UUID?
    init(resources: URL, store: WKWebsiteDataStore, downloads: BrowserDownloads, history: BrowserHistory, owner: String, changed: @escaping () -> Void) {
        self.resources = resources; self.changed = changed
        self.downloads = downloads; self.owner = owner
        self.history = history
        let config = WKWebViewConfiguration(); config.websiteDataStore = store
        // No application URL scheme or script-message handler on page views.
        web = WKWebView(frame: NSRect(x: -2000, y: 0, width: 1000, height: 760), configuration: config)
        super.init()
        web.navigationDelegate = self; web.uiDelegate = self
        observations = [web.observe(\.url, options: [.new]) { [weak self] _, _ in self?.changed() },
                        web.observe(\.title, options: [.new]) { [weak self] _, _ in self?.changed() },
                        web.observe(\.isLoading, options: [.new]) { [weak self] _, _ in self?.changed() },
                        web.observe(\.canGoBack, options: [.new]) { [weak self] _, _ in self?.changed() },
                        web.observe(\.canGoForward, options: [.new]) { [weak self] _, _ in self?.changed() }]
    }
    func stop() { web.stopLoading(); finishNavigation(.failure(failure("浏览器操作已停止。"))); changed() }
    func close() { closed = true; web.isHidden = true; releaseDownloadView() }
    func releaseDownloadView() {
        if closed && !downloads.active(id) { observations.removeAll(); web.navigationDelegate = nil; web.uiDelegate = nil; web.removeFromSuperview() }
    }
    func finishNavigation(_ result: Result<Void, Error>) {
        let continuation = navigation; navigation = nil; navigationToken = nil; continuation?.resume(with: result)
    }
    func navigate(_ action: () -> WKNavigation?) async throws {
        guard navigation == nil else { throw failure("浏览器正在加载网页，请稍后重试。") }
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            let token = UUID(); navigation = continuation; navigationToken = token; downloadNavigation = false
            guard action() != nil else { finishNavigation(.failure(failure("无法打开网页。"))); return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 25) { [weak self] in
                guard let self, self.navigationToken == token else { return }; self.web.stopLoading(); self.finishNavigation(.failure(failure("网页加载超时，请检查网络后重试。")))
            }
        }
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if !closed && !downloadNavigation { history.visit(url, title: web.title ?? "") }
        errorText = ""; finishNavigation(.success(())); changed()
    }
    private func downloadPolicyError(_ error: Error) -> Bool {
        let value = error as NSError
        return downloadNavigation && (value.code == NSURLErrorCancelled || (value.domain == "WebKitErrorDomain" && value.code == 102))
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        if downloadPolicyError(error) { return }
        errorText = error.localizedDescription; finishNavigation(.failure(error)); changed()
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if downloadPolicyError(error) { return }
        errorText = error.localizedDescription; finishNavigation(.failure(error)); changed()
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let value = action.request.url?.absoluteString ?? ""
        let blob = value.hasPrefix("blob:") && BrowserHost.allowed(String(value.dropFirst(5))) && web.url?.host == URL(string: String(value.dropFirst(5)))?.host
        guard value == "about:blank" || BrowserHost.allowed(value) || blob else { decisionHandler(.cancel); return }
        if action.shouldPerformDownload { downloadNavigation = true; decisionHandler(.download) }
        else { downloadNavigation = false; decisionHandler(.allow) }
    }
    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        let disposition = (response.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition") ?? ""
        downloadNavigation = !response.canShowMIMEType || disposition.lowercased().hasPrefix("attachment")
        decisionHandler(downloadNavigation ? .download : .allow)
    }
    func becameDownload(_ download: WKDownload) {
        downloadNavigation = true; errorText = ""; downloads.start(download, source: self, owner: owner)
        finishNavigation(.success(())); changed()
    }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { becameDownload(download) }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { becameDownload(download) }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url, BrowserHost.allowed(url.absoluteString) { web.load(action.request) }; return nil
    }
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) { decisionHandler(.deny) }
    func page(_ p: [String: Any]) async throws -> Any {
        let script = try String(contentsOf: resources.appendingPathComponent("browser-page.js"), encoding: .utf8)
        let code = "(() => { try { \(script)\nreturn { ok:true, value:qqclawBrowserPage(\(try jsonText(p))) }; } catch(e) { return {ok:false,error:String(e.message || e)}; } })()"
        return try await withCheckedThrowingContinuation { continuation in
            web.evaluateJavaScript(code) { value, error in
                if let error { continuation.resume(throwing: error); return }
                guard let result = value as? [String: Any], let ok = result["ok"] as? Bool else { continuation.resume(throwing: failure("无法读取网页，请重试快照。")); return }
                if ok { continuation.resume(returning: result["value"] ?? NSNull()) }
                else { continuation.resume(throwing: failure(result["error"] as? String ?? "网页操作失败。")) }
            }
        }
    }
    func run(_ p: [String: Any]) async throws -> Any {
        let action = p["action"] as? String ?? ""
        let result: Any
        switch action {
        case "open":
            let value = p["url"] as? String ?? ""
            guard BrowserHost.allowed(value), let url = URL(string: value) else { throw failure("浏览器仅支持 HTTP/HTTPS 网页。") }
            try await navigate { web.load(URLRequest(url: url)) }
            if downloadNavigation { result = ["downloadStarted": true] } else { result = try await page(["action": "snapshot"]) }
        case "back":
            if web.canGoBack { try await navigate { web.goBack() } }; result = try await page(["action": "snapshot"])
        case "forward":
            if web.canGoForward { try await navigate { web.goForward() } }; result = try await page(["action": "snapshot"])
        case "reload":
            try await navigate { web.reload() }; result = try await page(["action": "snapshot"])
        case "screenshot":
            result = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Any, Error>) in
                web.takeSnapshot(with: nil) { image, error in
                    if let error { continuation.resume(throwing: error); return }
                    guard let data = image?.tiffRepresentation, let bitmap = NSBitmapImageRep(data: data), let png = bitmap.representation(using: .png, properties: [:]) else { continuation.resume(throwing: failure("无法获取浏览器截图。")); return }
                    continuation.resume(returning: ["url": self.web.url?.absoluteString ?? "", "imageBase64": png.base64EncodedString()])
                }
            }
        default: result = try await page(p)
        }
        return result
    }
}

private struct BrowserDownloadRecord: Codable {
    var id: String, owner: String, name: String, path: String, url: String, at: String, status: String, error: String
    var received: Int64 = 0, total: Int64 = 0
    var value: [String: Any] { ["id": id, "owner": owner, "name": name, "path": path, "url": url, "at": at, "status": status, "error": error, "received": received, "total": total, "available": status == "completed" && FileManager.default.fileExists(atPath: path)] }
}

@MainActor final class BrowserDownloads: NSObject, WKDownloadDelegate {
    private let directory: URL, history: URL, vault: Vault, notify: ([String: Any]) -> Void
    private var items: [BrowserDownloadRecord] = []
    private var running: [ObjectIdentifier: (id: String, download: WKDownload, source: BrowserWindow)] = [:]
    private var storageError = "", timer: Timer?
    private var revision: Int64 = 0
    init(directory: URL, notify: @escaping ([String: Any]) -> Void) {
        self.directory = directory; history = directory.appendingPathComponent("browser-downloads.json"); vault = Vault(directory: directory); self.notify = notify
        super.init()
        do {
            if FileManager.default.fileExists(atPath: history.path) {
                let text = try vault.handle("vault.decrypt", String(contentsOf: history, encoding: .utf8))
                items = try JSONDecoder().decode([BrowserDownloadRecord].self, from: Data(text.utf8))
                for index in items.indices where items[index].status == "running" { items[index].status = "interrupted"; items[index].error = "应用退出时下载尚未完成，请在原网页重新下载。" }
            }
        } catch { storageError = "无法读取加密下载记录，原文件已保留。请解锁原系统账户的钥匙串后重试。" }
        timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            guard let self else { return }; var changed = false
            for entry in self.running.values { changed = self.update(entry.download) || changed }
            if changed { self.publish() }
        }
    }
    func active(_ tab: String) -> Bool { running.values.contains { $0.source.id == tab } }
    func state() -> [String: Any] { revision += 1; return ["revision": revision, "items": items.reversed().map(\.value), "storageError": storageError] }
    private func publish() { notify(state()) }
    private func save() throws {
        do {
            let text = String(decoding: try JSONEncoder().encode(items), as: UTF8.self)
            let encrypted = try vault.handle("vault.encrypt", text)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try Data(encrypted.utf8).write(to: history, options: .atomic)
        } catch { storageError = "下载记录保存失败，现有记录文件已保留，请检查磁盘空间和数据目录权限。"; throw failure(storageError) }
    }
    func start(_ download: WKDownload, source: BrowserWindow, owner: String) {
        // Keep the source web view alive even after its visible tab is closed.
        let url = download.originalRequest?.url?.absoluteString ?? ""
        var id = UUID().uuidString.lowercased()
        if let prior = running.values.first(where: { $0.source === source && $0.download.originalRequest?.url?.absoluteString == url }) {
            id = prior.id; running.removeValue(forKey: ObjectIdentifier(prior.download)); prior.download.delegate = nil; prior.download.cancel(nil)
            if let index = items.firstIndex(where: { $0.id == id }) { items[index].received = 0; items[index].total = 0; items[index].path = "" }
        } else {
            items.append(BrowserDownloadRecord(id: id, owner: owner, name: "准备下载…", path: "", url: url, at: ISO8601DateFormatter().string(from: Date()), status: "running", error: ""))
        }
        running[ObjectIdentifier(download)] = (id, download, source); download.delegate = self
    }
    private func index(_ download: WKDownload) -> Int? { guard let entry = running[ObjectIdentifier(download)] else { return nil }; return items.firstIndex { $0.id == entry.id } }
    private func update(_ download: WKDownload) -> Bool {
        guard let i = index(download) else { return false }; let p = download.progress
        let received = max(0, p.completedUnitCount), total = max(0, p.totalUnitCount)
        let changed = received != items[i].received || total != items[i].total
        items[i].received = received; items[i].total = total; return changed
    }
    private func finish(_ download: WKDownload, status: String, error: String = "") {
        guard let i = index(download) else { return }; _ = update(download)
        items[i].status = status; items[i].error = error
        let entry = running.removeValue(forKey: ObjectIdentifier(download)); download.delegate = nil
        if storageError.isEmpty { try? save() }; entry?.source.releaseDownloadView(); publish()
    }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        guard let i = index(download) else { completionHandler(nil); return }
        do {
            guard storageError.isEmpty else { throw failure(storageError) }
            let cleaned = suggestedFilename.replacingOccurrences(of: "\\", with: "/").components(separatedBy: "/").last ?? "download"
            let name = String(String.UnicodeScalarView(cleaned.unicodeScalars.map { CharacterSet.controlCharacters.contains($0) || $0 == ":" ? "_" : $0 })).trimmingCharacters(in: .whitespacesAndNewlines)
            var filename = name.isEmpty || name == "." || name == ".." ? "download" : name
            while filename.utf8.count > 200 { filename.removeLast() }
            let root: URL
            if let override = ProcessInfo.processInfo.environment["QQCLAW_DOWNLOADS_DIR"], !override.isEmpty { root = URL(fileURLWithPath: override, isDirectory: true) }
            else { root = try FileManager.default.url(for: .downloadsDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("QQClaw", isDirectory: true) }
            let folder = root.appendingPathComponent(UUID().uuidString.lowercased(), isDirectory: true); try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let destination = folder.appendingPathComponent(filename)
            items[i].name = filename; items[i].path = destination.path; items[i].total = max(0, response.expectedContentLength)
            try save(); completionHandler(destination); publish()
        } catch { completionHandler(nil); finish(download, status: "interrupted", error: error.localizedDescription) }
    }
    func downloadDidFinish(_ download: WKDownload) { finish(download, status: "completed") }
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) { finish(download, status: "interrupted", error: "下载中断：" + error.localizedDescription) }
    func handle(_ p: [String: Any]) throws -> Any {
        let action = p["action"] as? String ?? ""
        if action == "state" { return state() }
        if action == "cancel" {
            guard let item = items.first(where: { $0.id == p["id"] as? String }) else { throw failure("下载记录已不存在。") }
            if let entry = running.values.first(where: { $0.id == item.id }) { entry.download.cancel(nil); finish(entry.download, status: "cancelled") }
            return state()
        }
        guard storageError.isEmpty else { throw failure(storageError) }
        if action == "clear" {
            let original = items; items.removeAll { $0.status != "running" }
            do { try save() } catch { items = original; throw error }; publish(); return state()
        }
        guard let item = items.first(where: { $0.id == p["id"] as? String }) else { throw failure("下载记录已不存在。") }
        guard ["open", "reveal"].contains(action) else { throw failure("不支持的下载操作。") }
        guard item.status == "completed", FileManager.default.fileExists(atPath: item.path) else { throw failure("下载文件尚未完成，或已被移动或删除。") }
        let url = URL(fileURLWithPath: item.path)
        if action == "reveal" { NSWorkspace.shared.activateFileViewerSelecting([url]) }
        else if !NSWorkspace.shared.open(url) { throw failure("无法打开文件，请安装可打开此类文件的应用。") }
        return state()
    }
}
