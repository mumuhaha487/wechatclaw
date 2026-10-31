import AppKit
import WebKit

@MainActor final class BrowserHost {
    let resources: URL
    var windows: [String: BrowserWindow] = [:]
    var stores: [String: WKWebsiteDataStore] = [:]
    var operations: [String: Task<Any, Error>] = [:]
    init(resources: URL) { self.resources = resources }
    func handle(_ p: [String: Any]) async throws -> Any {
        let owner = p["owner"] as? String ?? "", action = p["action"] as? String ?? ""
        guard UUID(uuidString: owner) != nil else { throw failure("浏览器会话无效。") }
        if action == "stop" { windows[owner]?.stop(); return ["stopped": true] }
        if windows[owner] == nil {
            let profile = p["profile"] as? String ?? ""
            guard profile.range(of: "^[0-9a-f]{32}$", options: .regularExpression) != nil else { throw failure("浏览器用户目录无效。") }
            // macOS 13 has no per-identifier persistent WKWebsiteDataStore API.
            // Keep isolated account stores in memory; never share system logins.
            let store = stores[profile] ?? WKWebsiteDataStore.nonPersistent(); stores[profile] = store
            windows[owner] = BrowserWindow(resources: resources, store: store)
        }
        let previous = operations[owner], window = windows[owner]!
        let operation = Task { @MainActor () throws -> Any in
            _ = await previous?.result
            return try await window.run(p)
        }
        operations[owner] = operation
        return try await operation.value
    }
    static func allowed(_ value: String) -> Bool {
        guard let url = URL(string: value), ["http", "https"].contains(url.scheme?.lowercased() ?? ""), url.user == nil, url.password == nil, let host = url.host, !host.isEmpty, host.lowercased() != "qqclaw.local" else { return false }
        return true
    }
}

@MainActor final class BrowserWindow: NSObject, WKNavigationDelegate, WKUIDelegate, NSWindowDelegate {
    let resources: URL, window: NSWindow, web: WKWebView
    let address = NSTextField(string: ""), status = NSTextField(labelWithString: "QQClaw 内置浏览器")
    var navigation: CheckedContinuation<Void, Error>?, navigationToken: UUID?
    init(resources: URL, store: WKWebsiteDataStore) {
        self.resources = resources
        let config = WKWebViewConfiguration(); config.websiteDataStore = store
        // This view has no script-message handler or application URL scheme.
        web = WKWebView(frame: .zero, configuration: config)
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1180, height: 820), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        super.init()
        window.title = "QQClaw · 内置浏览器"; window.minSize = NSSize(width: 720, height: 480); window.isReleasedWhenClosed = false; window.delegate = self
        web.navigationDelegate = self; web.uiDelegate = self
        address.placeholderString = "https://…"; address.target = self; address.action = #selector(openAddress)
        let back = NSButton(title: "←", target: self, action: #selector(goBack))
        let reload = NSButton(title: "↻", target: self, action: #selector(reloadPage))
        let go = NSButton(title: "打开", target: self, action: #selector(openAddress))
        let bar = NSStackView(views: [back, reload, address, go]); bar.orientation = .horizontal; bar.spacing = 8
        let content = NSView(); window.contentView = content
        for view in [bar, web, status] { view.translatesAutoresizingMaskIntoConstraints = false; content.addSubview(view) }
        NSLayoutConstraint.activate([
            bar.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 8), bar.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -8), bar.topAnchor.constraint(equalTo: content.topAnchor, constant: 7), bar.heightAnchor.constraint(equalToConstant: 30),
            web.leadingAnchor.constraint(equalTo: content.leadingAnchor), web.trailingAnchor.constraint(equalTo: content.trailingAnchor), web.topAnchor.constraint(equalTo: bar.bottomAnchor, constant: 7), web.bottomAnchor.constraint(equalTo: status.topAnchor, constant: -4),
            status.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 8), status.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -8), status.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -4), status.heightAnchor.constraint(equalToConstant: 20),
        ])
        address.setContentHuggingPriority(.defaultLow, for: .horizontal)
        window.center()
    }
    func windowShouldClose(_ sender: NSWindow) -> Bool { sender.orderOut(nil); return false }
    @objc func openAddress() { Task { @MainActor in do { _ = try await run(["action": "open", "url": address.stringValue]) } catch { status.stringValue = error.localizedDescription } } }
    @objc func goBack() { if web.canGoBack { web.goBack() } }
    @objc func reloadPage() { web.reload() }
    func stop() { web.stopLoading(); finishNavigation(.failure(failure("浏览器操作已停止。"))) }
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
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { address.stringValue = web.url?.absoluteString ?? ""; window.title = "QQClaw · " + (web.title ?? "内置浏览器"); finishNavigation(.success(())) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { finishNavigation(.failure(error)) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { finishNavigation(.failure(error)) }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let value = action.request.url?.absoluteString ?? ""
        decisionHandler(value == "about:blank" || BrowserHost.allowed(value) ? .allow : .cancel)
    }
    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if !response.canShowMIMEType { status.stringValue = "此版内置浏览器支持网页操作，下载请使用系统浏览器。" }
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
        window.makeKeyAndOrderFront(nil)
        let action = p["action"] as? String ?? ""; status.stringValue = "正在执行：" + action
        let result: Any
        switch action {
        case "open":
            let value = p["url"] as? String ?? ""
            guard BrowserHost.allowed(value), let url = URL(string: value) else { throw failure("浏览器仅支持 HTTP/HTTPS 网页。") }
            try await navigate { web.load(URLRequest(url: url)) }; result = try await page(["action": "snapshot"])
        case "back":
            if web.canGoBack { try await navigate { web.goBack() } }; result = try await page(["action": "snapshot"])
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
        status.stringValue = "QQClaw 内置浏览器 · " + (web.url?.absoluteString ?? ""); return result
    }
}
