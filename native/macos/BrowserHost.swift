import AppKit
import WebKit

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
    var sessions: [String: BrowserSession] = [:]
    var stores: [String: WKWebsiteDataStore] = [:]
    var operations: [String: Task<Any, Error>] = [:]
    var visibleOwner = "", visible = false, rectangle = NSRect.zero
    init(resources: URL, parent: NSView, notify: @escaping ([String: Any]) -> Void) {
        self.resources = resources; self.parent = parent; self.notify = notify
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
        let tab = BrowserWindow(resources: resources, store: store) { [weak self, weak session] in
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
                session.tabs.forEach { $0.observations.removeAll(); $0.web.removeFromSuperview() }
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
                    tab.stop(); tab.web.removeFromSuperview()
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
    var errorText = ""
    var url: String { web.url?.absoluteString == "about:blank" ? "" : web.url?.absoluteString ?? "" }
    var observations: [NSKeyValueObservation] = []
    var navigation: CheckedContinuation<Void, Error>?, navigationToken: UUID?
    init(resources: URL, store: WKWebsiteDataStore, changed: @escaping () -> Void) {
        self.resources = resources; self.changed = changed
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
    func finishNavigation(_ result: Result<Void, Error>) {
        let continuation = navigation; navigation = nil; navigationToken = nil; continuation?.resume(with: result)
    }
    func navigate(_ action: () -> WKNavigation?) async throws {
        guard navigation == nil else { throw failure("浏览器正在加载网页，请稍后重试。") }
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            let token = UUID(); navigation = continuation; navigationToken = token
            guard action() != nil else { finishNavigation(.failure(failure("无法打开网页。"))); return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 25) { [weak self] in
                guard let self, self.navigationToken == token else { return }; self.web.stopLoading(); self.finishNavigation(.failure(failure("网页加载超时，请检查网络后重试。")))
            }
        }
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { errorText = ""; finishNavigation(.success(())); changed() }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { errorText = error.localizedDescription; finishNavigation(.failure(error)); changed() }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { errorText = error.localizedDescription; finishNavigation(.failure(error)); changed() }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let value = action.request.url?.absoluteString ?? ""
        decisionHandler(value == "about:blank" || BrowserHost.allowed(value) ? .allow : .cancel)
    }
    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if !response.canShowMIMEType { errorText = "下载请在系统浏览器中完成。"; changed() }
        decisionHandler(response.canShowMIMEType ? .allow : .cancel)
    }
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
            try await navigate { web.load(URLRequest(url: url)) }; result = try await page(["action": "snapshot"])
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
