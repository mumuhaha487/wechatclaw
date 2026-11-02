import AppKit
import WebKit
import CryptoKit

// Native UI controls only. Model browser operations stay on the original
// extension's MCP connection and cannot call this controller.
@MainActor final class CefBrowserController {
    let runtime: MacCefRuntime, directory: URL, parent: WKWebView
    let history: BrowserHistory
    let downloads: BrowserDownloads
    let notify: ([String: Any]) -> Void
    var profiles: [String: String] = [:], ready = Set<String>()
    var selected: [String: Int] = [:], revisions: [String: Int64] = [:]
    var visibleOwner = "", visible = false
    var navigation: [Int: Int64] = [:]
    var errors: [Int: String] = [:]
    var findRequests: [String: CheckedContinuation<[String: Any], Error>] = [:]
    init(runtime: MacCefRuntime, directory: URL, parent: WKWebView, history: BrowserHistory, downloads: BrowserDownloads, notify: @escaping ([String: Any]) -> Void) {
        self.runtime = runtime; self.directory = directory; self.parent = parent; self.history = history; self.downloads = downloads; self.notify = notify
    }
    func tabs(_ owner: String) throws -> [[String: Any]] { try runtime.control(["action": "tabs", "owner": owner])["tabs"] as? [[String: Any]] ?? [] }
    func state(_ owner: String, reveal: Bool = false) throws -> [String: Any] {
        let pages = try tabs(owner)
        if !pages.contains(where: { ($0["id"] as? Int) == selected[owner] }) { selected[owner] = pages.first?["id"] as? Int }
        let active = pages.first { ($0["id"] as? Int) == selected[owner] }
        revisions[owner, default: 0] += 1
        func display(_ url: Any?) -> String { let value = url as? String ?? ""; return value.hasPrefix("about:blank") ? "" : value }
        return ["owner": owner, "revision": revisions[owner]!, "reveal": reveal, "activeTab": selected[owner].map(String.init) ?? "",
          "tabs": pages.map { page -> [String: Any] in
            let id = page["id"] as? Int ?? 0
            return ["id": String(id), "url": display(page["url"]), "title": page["title"] as? String ?? "新标签页", "loading": page["loading"] as? Bool ?? false, "navigationRevision": String(navigation[id, default: 0])]
          }, "url": display(active?["url"]), "title": active?["title"] as? String ?? "", "loading": active?["loading"] as? Bool ?? false,
          "canGoBack": active?["canGoBack"] as? Bool ?? false, "canGoForward": active?["canGoForward"] as? Bool ?? false, "error": selected[owner].flatMap { errors[$0] } ?? ""]
    }
    func publish(_ owner: String, reveal: Bool = false) { if profiles[owner] != nil, let value = try? state(owner, reveal: reveal) { notify(value) } }
    func event(_ value: [String: Any]) {
        let event = value["event"] as? String ?? "", owner = value["owner"] as? String ?? ""
        if event == "find-result", let token = value["token"] as? String { findRequests.removeValue(forKey: token)?.resume(returning: value); return }
        if event == "download-start", let id = value["downloadId"] as? String {
            do {
                let path = try downloads.externalStart(id: id, owner: owner, name: value["name"] as? String ?? "download", url: value["url"] as? String ?? "", total: (value["total"] as? NSNumber)?.int64Value ?? 0) { [weak self] in
                    _ = try? self?.runtime.control(["action": "downloadCancel", "owner": owner, "downloadId": id])
                }
                _ = try runtime.control(["action": "downloadDestination", "owner": owner, "downloadId": id, "path": path])
            } catch {
                _ = try? runtime.control(["action": "downloadCancel", "owner": owner, "downloadId": id])
                downloads.externalUpdate(id: id, received: 0, total: 0, status: "interrupted", error: error.localizedDescription)
            }
            return
        }
        if event == "download-progress", let id = value["downloadId"] as? String {
            downloads.externalUpdate(id: id, received: (value["received"] as? NSNumber)?.int64Value ?? 0,
              total: (value["total"] as? NSNumber)?.int64Value ?? 0, status: value["status"] as? String ?? "interrupted", error: value["error"] as? String ?? "")
            return
        }
        if event == "profile-ready" { ready.insert(owner) }
        let id = value["tabId"] as? Int ?? 0
        if event == "navigation" { navigation[id, default: 0] += 1; errors.removeValue(forKey: id) }
        if event == "load-error" { errors[id] = value["error"] as? String ?? "网页加载失败。" }
        if event == "load-end", let url = value["url"] as? String, BrowserHost.allowed(url) {
            let page = try? tabs(owner).first { ($0["id"] as? Int) == id }
            history.visit(url, title: page?["title"] as? String ?? "")
        }
        if event == "title", let page = try? tabs(owner).first(where: { ($0["id"] as? Int) == id }) {
            history.updateTitle(page["url"] as? String ?? "", title: value["title"] as? String ?? "")
        }
        if event == "browser-closed" { errors.removeValue(forKey: id); navigation.removeValue(forKey: id) }
        publish(owner)
        if event == "browser-closed", visible && owner == visibleOwner { selectVisible() }
    }
    func setView(_ p: [String: Any]) {
        visibleOwner = p["owner"] as? String ?? ""
        let width = (p["viewportWidth"] as? NSNumber)?.doubleValue ?? 0, height = (p["viewportHeight"] as? NSNumber)?.doubleValue ?? 0
        visible = p["visible"] as? Bool == true && width > 0 && height > 0
        selectVisible()
        func number(_ key: String) -> Double { let value = (p[key] as? NSNumber)?.doubleValue ?? 0; return value.isFinite ? max(-10000, min(30000, value)) : 0 }
        let sx = width > 0 ? parent.bounds.width / width : 1, sy = height > 0 ? parent.bounds.height / height : 1
        runtime.bounds(NSRect(x: number("x") * sx, y: number("y") * sy, width: max(0, number("width") * sx), height: max(0, number("height") * sy)), visible: visible && selected[visibleOwner] != nil)
    }
    func selectVisible() {
        if visible, let id = selected[visibleOwner] { _ = try? runtime.control(["action": "selectTab", "owner": visibleOwner, "tabId": id]) }
    }
    func focus(owner: String, tabId: String) -> Bool {
        guard visible, owner == visibleOwner, let id = Int(tabId), selected[owner] == id else { return false }
        return (try? runtime.control(["action": "focus", "owner": owner, "tabId": id])) != nil
    }
    func ensure(_ owner: String, manifest: String? = nil) async throws {
        if profiles[owner] == nil {
            let key = SHA256.hash(data: Data("qqclaw-official:\(owner)".utf8)).map { String(format: "%02x", $0) }.joined().prefix(32)
            if let manifest {
                let source = URL(fileURLWithPath: manifest)
                let target = directory.appendingPathComponent("browser-profiles/NativeMessagingHosts/com.openai.codexextension.json")
                try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
                try Data(contentsOf: source).write(to: target, options: .atomic)
            }
            profiles[owner] = String(key)
            do { _ = try runtime.control(["action": "createProfile", "owner": owner, "profile": String(key), "activate": visible && visibleOwner == owner]) }
            catch { profiles.removeValue(forKey: owner); throw error }
        }
        for _ in 0..<300 {
            if ready.contains(owner) { return }
            guard profiles[owner] != nil else { throw failure("浏览器会话已关闭。") }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        throw failure("浏览配置初始化超时，请重试。")
    }
    func handle(_ p: [String: Any]) async throws -> Any {
        let owner = p["owner"] as? String ?? "", action = p["action"] as? String ?? ""
        guard UUID(uuidString: owner) != nil else { throw failure("浏览器会话无效。") }
        if action == "dispose" {
            _ = try runtime.control(["action": "dispose", "owner": owner]); profiles.removeValue(forKey: owner); ready.remove(owner); selected.removeValue(forKey: owner)
            if visibleOwner == owner { visible = false; runtime.bounds(.zero, visible: false) }; return ["disposed": true]
        }
        try await ensure(owner, manifest: p["nativeHostManifest"] as? String)
        if action == "prepareOfficial" {
            return ["engine": "cef", "browserFamily": "chrome", "tabCreation": false, "extensionId": "hehggadaopoacecdllhhajmbjkdcmajg",
              "browserProcessId": Int(getpid()), "applicationProcessId": Int(getpid()), "applicationPath": Bundle.main.executableURL!.path,
              "nativeProfileDirectory": directory.appendingPathComponent("browser-profiles/\(profiles[owner]!)").path, "identityUrl": "about:blank#qqclaw-profile-\(profiles[owner]!)"]
        }
        if action == "state" { return try state(owner) }
        var target = (p["tabId"] as? String).flatMap(Int.init) ?? selected[owner]
        if action == "newTab" || action == "restoreTab" || action == "open" && target == nil {
            guard try tabs(owner).count < 12 else { throw failure("最多打开 12 个标签页。") }
            let created = try runtime.control(["action": "newTab", "owner": owner, "activate": action != "restoreTab" && visible && visibleOwner == owner])
            guard let id = created["tabId"] as? Int, id > 0 else { throw failure("无法创建网页标签。") }
            target = id
            if action != "restoreTab" { selected[owner] = id }
        }
        guard let id = target, try tabs(owner).contains(where: { ($0["id"] as? Int) == id }) else { throw failure("浏览器标签页已关闭。") }
        if action == "find" {
            if let revision = p["navigationRevision"] as? String, revision != String(navigation[id, default: 0]) { return ["stale": true] }
            return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<[String: Any], Error>) in
                let token = UUID().uuidString; findRequests[token] = continuation
                do {
                    var request = p; request["tabId"] = id; request["token"] = token
                    let result = try runtime.control(request)
                    if result["pending"] as? Bool != true { findRequests.removeValue(forKey: token)?.resume(returning: result) }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
                        self?.findRequests.removeValue(forKey: token)?.resume(throwing: failure("网页查找超时，请重试。"))
                    }
                } catch { findRequests.removeValue(forKey: token)?.resume(throwing: error) }
            }
        }
        if action == "selectTab" { selected[owner] = id; selectVisible() }
        else if action == "open" || action == "restoreTab" {
            let url = p["url"] as? String ?? ""
            guard action == "restoreTab" && url.isEmpty || BrowserHost.allowed(url) else { throw failure("浏览器仅支持 HTTP/HTTPS 网页。") }
            if !url.isEmpty { _ = try runtime.control(["action": "open", "owner": owner, "tabId": id, "url": url]) }
        } else if action != "newTab" {
            var request = p; request["tabId"] = id
            _ = try runtime.control(request)
        }
        if action == "closeTab" { _ = try state(owner); selectVisible() }
        publish(owner, reveal: ["open", "newTab"].contains(action))
        if action == "restoreTab" { return ["tabId": String(id), "state": try state(owner)] }
        return try state(owner)
    }
}

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
    private static func cleanTitle(_ title: String, url: String) -> String {
        let clean = title.unicodeScalars.filter { !CharacterSet.controlCharacters.contains($0) }.prefix(256).map(String.init).joined().trimmingCharacters(in: .whitespacesAndNewlines)
        return clean.isEmpty ? (URL(string: url)?.host ?? url) : clean
    }
    func visit(_ value: String, title: String) {
        guard let url = Self.normalize(value), storageError.isEmpty else { return }
        let original = items, previous = items.first { $0.url == url }
        let record = BrowserHistoryRecord(id: previous?.id ?? UUID().uuidString.lowercased(), url: url, title: Self.cleanTitle(title, url: url), at: Self.now)
        items = Array(([record] + items.filter { $0.url != url }).prefix(500))
        do { try save() } catch { items = original }
        notify(state())
    }
    func updateTitle(_ value: String, title: String) {
        guard let url = Self.normalize(value), storageError.isEmpty, let index = items.firstIndex(where: { $0.url == url }) else { return }
        let original = items, previous = items[index], clean = Self.cleanTitle(title, url: url)
        guard previous.title != clean else { return }
        items[index] = BrowserHistoryRecord(id: previous.id, url: previous.url, title: clean, at: previous.at)
        do { try save() } catch { items = original }; notify(state())
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
    func focus(owner: String, tabId: String) -> Bool {
        guard visible, visibleOwner == owner, let session = sessions[owner], !session.disposed, let tab = session.active,
              tab.id == tabId, !tab.web.isHidden, let window = tab.web.window else { return false }
        return window.makeFirstResponder(tab.web)
    }
    func state(_ session: BrowserSession, reveal: Bool = false) -> [String: Any] {
        let tab = session.active
        session.revision += 1
        return ["owner": session.owner, "revision": session.revision, "reveal": reveal, "activeTab": tab?.id ?? "",
                "tabs": session.tabs.map { ["id": $0.id, "title": $0.web.title ?? "新标签页", "url": $0.displayURL, "loading": $0.loading, "navigationRevision": String($0.navigationRevision)] as [String: Any] },
                "url": tab?.displayURL ?? "", "title": tab?.web.title ?? "", "loading": tab?.loading ?? false,
                "canGoBack": tab?.web.canGoBack ?? false, "canGoForward": tab?.web.canGoForward ?? false, "error": tab?.errorText ?? ""]
    }
    func focusedPage() -> BrowserWindow? {
        guard visible, let session = sessions[visibleOwner], !session.disposed, let page = session.active,
              !page.closed, !page.web.isHidden, let responder = page.web.window?.firstResponder as? NSView,
              responder === page.web || responder.isDescendant(of: page.web) else { return nil }
        return page
    }
    func publish(_ session: BrowserSession, reveal: Bool = false) { if !session.disposed { notify(state(session, reveal: reveal)) } }
    @discardableResult func newTab(_ session: BrowserSession, configuration: WKWebViewConfiguration? = nil) throws -> BrowserWindow {
        guard session.tabs.count < 12 else { throw failure("最多打开 12 个标签页，请先关闭不用的页面。") }
        // macOS 13 lacks persistent stores by identifier. Share only the same
        // account's in-memory store; never borrow the app or system login store.
        let store = stores[session.profile] ?? WKWebsiteDataStore.nonPersistent(); stores[session.profile] = store
        let tab = BrowserWindow(resources: resources, store: store, downloads: downloads, history: history, owner: session.owner, configuration: configuration) { [weak self, weak session] in
            guard let self, let session else { return }; self.publish(session)
        }
        tab.createWindow = { [weak self, weak session] source, configuration in
            guard let self, let session, !session.disposed, !source.closed, session.tabs.contains(where: { $0 === source }) else { return nil }
            do {
                let child = try self.newTab(session, configuration: configuration)
                self.layout(); self.publish(session); return child.web
            } catch { source.errorText = "无法打开新标签页：\(error.localizedDescription)"; self.publish(session); return nil }
        }
        tab.closeWindow = { [weak self, weak session] page in
            guard let self, let session else { return }; self.closeTab(session, page)
        }
        parent.addSubview(tab.web); tab.web.isHidden = true
        session.tabs.append(tab); session.active = tab
        return tab
    }
    private func closeTab(_ session: BrowserSession, _ tab: BrowserWindow) {
        guard !session.disposed, let index = session.tabs.firstIndex(where: { $0 === tab }) else { return }
        session.tabs.remove(at: index)
        if session.active === tab { session.active = session.tabs.isEmpty ? nil : session.tabs[min(index, session.tabs.count - 1)] }
        tab.close(); operations.removeValue(forKey: tab.id); layout(); publish(session)
    }
    func handle(_ p: [String: Any]) async throws -> Any {
        let owner = p["owner"] as? String ?? "", action = p["action"] as? String ?? ""
        guard UUID(uuidString: owner) != nil else { throw failure("浏览器会话无效。") }
        if action == "stop" {
            let tabId = p["tabId"] as? String ?? ""
            sessions[owner]?.tabs.filter { tabId.isEmpty || $0.id == tabId }.forEach { $0.stop() }
            return ["stopped": true]
        }
        if action == "find" {
            guard let session = sessions[owner], !session.disposed,
                  let page = session.tabs.first(where: { $0.id == p["tabId"] as? String }) else { throw failure("浏览器标签页已关闭。") }
            return try await page.find(p)
        }
        if action == "dispose" {
            if let session = sessions[owner] {
                session.disposed = true
                session.tabs.forEach { $0.close(); operations.removeValue(forKey: $0.id) }
                session.tabs.removeAll(); session.active = nil
                sessions.removeValue(forKey: owner)
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
        let session = sessions[owner]!
        guard !session.disposed else { throw failure("浏览器会话已关闭。") }
        if action == "restoreTab" {
            let url = p["url"] as? String ?? ""
            guard url.isEmpty || Self.allowed(url) else { throw failure("浏览器仅支持 HTTP/HTTPS 网页。") }
            let previous = session.active
            let restored = try newTab(session)
            session.active = previous; layout()
            if !url.isEmpty { restored.web.load(URLRequest(url: URL(string: url)!)) }
            return ["tabId": restored.id, "state": state(session)] as [String: Any]
        }
        switch action {
        case "newTab": try newTab(session)
        case "selectTab", "closeTab":
            guard let tab = session.tabs.first(where: { $0.id == p["tabId"] as? String }) else { throw failure("浏览器标签页已关闭。") }
            if action == "selectTab" { session.active = tab } else { closeTab(session, tab) }
        default: break
        }
        if ["state", "newTab", "selectTab", "closeTab"].contains(action) {
            layout(); publish(session, reveal: action == "newTab"); return state(session)
        }
        let targetId = p["tabId"] as? String ?? ""
        var target = targetId.isEmpty ? session.active : session.tabs.first(where: { $0.id == targetId })
        if !targetId.isEmpty && target == nil { throw failure("浏览器标签页已关闭。") }
        if action == "open" && !Self.allowed(p["url"] as? String ?? "") { throw failure("浏览器仅支持 HTTP/HTTPS 网页。") }
        if target == nil && action == "open" { target = try newTab(session) }
        guard let tab = target else { throw failure("没有打开的标签页，请先打开网页。") }
        let revision = ["open", "back", "forward", "reload"].contains(action) ? tab.beginNavigation(action == "open" ? p["url"] as? String ?? "" : "") : tab.operationRevision
        let previous = operations[tab.id]
        tab.queueRevision += 1
        let queueRevision = tab.queueRevision
        layout(); publish(session, reveal: action == "open" && session.active === tab)
        let operation = Task { @MainActor () throws -> Any in
            _ = await previous?.result
            defer {
                self.publish(session)
                if tab.queueRevision == queueRevision { self.operations.removeValue(forKey: tab.id) }
            }
            guard !session.disposed, !tab.closed, session.tabs.contains(where: { $0 === tab }) else { throw failure("浏览器标签页已关闭。") }
            do { return try await tab.run(p, revision: revision) }
            catch { if !tab.closed && revision == tab.operationRevision { tab.errorText = error.localizedDescription }; throw error }
        }
        operations[tab.id] = operation
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
    var createWindow: ((BrowserWindow, WKWebViewConfiguration) -> WKWebView?)?
    var closeWindow: ((BrowserWindow) -> Void)?
    var closed = false, downloadNavigation = false
    var errorText = ""
    var url: String { web.url?.absoluteString == "about:blank" ? "" : web.url?.absoluteString ?? "" }
    private var requestedURL = ""
    var loading: Bool { !requestedURL.isEmpty || web.isLoading }
    var displayURL: String { !requestedURL.isEmpty ? requestedURL : url }
    var observations: [NSKeyValueObservation] = []
    var navigation: CheckedContinuation<Void, Error>?, navigationToken: UUID?
    var currentNavigation: WKNavigation?, awaitedNavigation: WKNavigation?
    private var retiredNavigations: [WKNavigation] = []
    private var operationCompletion: (() -> Void)?
    var operationRevision = 0, queueRevision = 0
    var findRevision = 0
    var navigationRevision: UInt64 = 0
    var findOpen = false, findCanStep = false
    var findOperation: Task<[String: Any], Never>?
    private var findCompletion: (() -> Void)?
    init(resources: URL, store: WKWebsiteDataStore, downloads: BrowserDownloads, history: BrowserHistory, owner: String, configuration: WKWebViewConfiguration? = nil, changed: @escaping () -> Void) {
        self.resources = resources; self.changed = changed
        self.downloads = downloads; self.owner = owner
        self.history = history
        // Preserve WebKit's supplied configuration, form bodies and opener.
        // The source has neither the application's scheme nor message bridge.
        let config = configuration ?? WKWebViewConfiguration()
        if configuration == nil { config.websiteDataStore = store }
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        // No application URL scheme or script-message handler on page views.
        web = WKWebView(frame: NSRect(x: -2000, y: 0, width: 1000, height: 760), configuration: config)
        super.init()
        web.navigationDelegate = self; web.uiDelegate = self
        observations = [web.observe(\.url, options: [.new]) { [weak self] _, _ in self?.changed() },
                        web.observe(\.title, options: [.new]) { [weak self] _, _ in
                            guard let self else { return }
                            if !self.web.isLoading && !self.closed && !self.downloadNavigation { self.history.updateTitle(self.url, title: self.web.title ?? "") }
                            self.changed()
                        },
                        web.observe(\.isLoading, options: [.new]) { [weak self] _, _ in self?.changed() },
                        web.observe(\.canGoBack, options: [.new]) { [weak self] _, _ in self?.changed() },
                        web.observe(\.canGoForward, options: [.new]) { [weak self] _, _ in self?.changed() }]
    }
    func stop() {
        operationRevision += 1
        for request in [currentNavigation, awaitedNavigation].compactMap({ $0 }) where !retiredNavigations.contains(where: { $0 === request }) { retiredNavigations.append(request) }
        if retiredNavigations.count > 64 { retiredNavigations.removeFirst(retiredNavigations.count - 64) }
        currentNavigation = nil; requestedURL = ""; finishNavigation(.failure(failure("浏览器操作已停止。")))
        operationCompletion?(); web.stopLoading(); changed()
    }
    func beginNavigation(_ url: String) -> Int { stop(); requestedURL = url; errorText = ""; return operationRevision }
    func close() { guard !closed else { return }; stop(); closed = true; retiredNavigations.removeAll(); findRevision += 1; findOpen = false; findCanStep = false; findCompletion?(); web.isHidden = true; releaseDownloadView() }
    func releaseDownloadView() {
        if closed && !downloads.active(id) { observations.removeAll(); web.navigationDelegate = nil; web.uiDelegate = nil; web.removeFromSuperview() }
    }
    func finishNavigation(_ result: Result<Void, Error>) {
        let continuation = navigation; navigation = nil; navigationToken = nil; awaitedNavigation = nil; continuation?.resume(with: result)
    }
    func navigate(_ action: () -> WKNavigation?) async throws {
        guard navigation == nil else { throw failure("浏览器正在加载网页，请稍后重试。") }
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            let token = UUID(); navigation = continuation; navigationToken = token; downloadNavigation = false
            guard let request = action() else { finishNavigation(.failure(failure("无法打开网页。"))); return }
            currentNavigation = request; awaitedNavigation = request
            DispatchQueue.main.asyncAfter(deadline: .now() + 25) { [weak self] in
                guard let self, self.navigationToken == token else { return }; self.web.stopLoading(); self.finishNavigation(.failure(failure("网页加载超时，请检查网络后重试。")))
            }
        }
    }
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        guard !closed, let navigation, !retiredNavigations.contains(where: { $0 === navigation }) else { return }
        if let awaitedNavigation, awaitedNavigation !== navigation { finishNavigation(.failure(failure("网页已被新的导航替代。"))) }
        currentNavigation = navigation
        navigationRevision += 1
        findRevision += 1; findOpen = false; findCanStep = false; findCompletion?()
        changed()
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard !closed, let navigation, currentNavigation === navigation else { return }
        requestedURL = ""
        if !closed && !downloadNavigation { history.visit(url, title: web.title ?? "") }
        errorText = ""; finishNavigation(.success(())); changed()
    }
    private func downloadPolicyError(_ error: Error) -> Bool {
        let value = error as NSError
        return downloadNavigation && (value.code == NSURLErrorCancelled || (value.domain == "WebKitErrorDomain" && value.code == 102))
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        guard !closed, let navigation, currentNavigation === navigation else { return }
        if downloadPolicyError(error) { return }
        requestedURL = ""
        errorText = error.localizedDescription; finishNavigation(.failure(error)); changed()
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard !closed, let navigation, currentNavigation === navigation else { return }
        if downloadPolicyError(error) { return }
        requestedURL = ""
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
        downloadNavigation = true; requestedURL = ""; errorText = ""; downloads.start(download, source: self, owner: owner)
        finishNavigation(.success(())); changed()
    }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { becameDownload(download) }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { becameDownload(download) }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        let value = action.request.url?.absoluteString ?? ""
        guard !closed, value == "about:blank" || BrowserHost.allowed(value) else {
            errorText = "已阻止不支持的链接。"; changed(); return nil
        }
        return createWindow?(self, configuration)
    }
    func webViewDidClose(_ webView: WKWebView) { closeWindow?(self) }
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) { decisionHandler(.deny) }
    func page(_ p: [String: Any]) async throws -> Any {
        let script = try String(contentsOf: resources.appendingPathComponent("browser-page.js"), encoding: .utf8)
        let code = "(() => { try { \(script)\nreturn { ok:true, value:qqclawBrowserPage(\(try jsonText(p))) }; } catch(e) { return {ok:false,error:String(e.message || e)}; } })()"
        return try await withCheckedThrowingContinuation { continuation in
            var completed = false
            let finish: (Result<Any, Error>) -> Void = { [weak self] result in
                guard !completed else { return }; completed = true; self?.operationCompletion = nil
                continuation.resume(with: result)
            }
            operationCompletion = { finish(.failure(failure("网页操作已停止或标签页已关闭。"))) }
            web.evaluateJavaScript(code) { value, error in
                if let error { finish(.failure(error)); return }
                guard let result = value as? [String: Any], let ok = result["ok"] as? Bool else { finish(.failure(failure("无法读取网页，请重试快照。"))); return }
                if ok { finish(.success(result["value"] ?? NSNull())) }
                else { finish(.failure(failure(result["error"] as? String ?? "网页操作失败。"))) }
            }
        }
    }
    func find(_ p: [String: Any]) async throws -> [String: Any] {
        let operation = p["operation"] as? String ?? "", query = p["query"] as? String ?? ""
        guard ["search", "next", "previous", "clear"].contains(operation), query.utf16.count <= 512 else { throw failure("网页查找参数无效。") }
        if p.keys.contains("navigationRevision"), p["navigationRevision"] as? String != String(navigationRevision) { return ["stale": true] }
        if operation == "search" || operation == "clear" { findRevision += 1; findOpen = operation != "clear"; findCanStep = false; findCompletion?() }
        let revision = findRevision, previous = findOperation
        let task = Task { @MainActor () -> [String: Any] in
            _ = await previous?.value
            guard !self.closed, revision == self.findRevision else { return ["stale": true] }
            let configuration = WKFindConfiguration()
            configuration.caseSensitive = false; configuration.wraps = true
            configuration.backwards = operation == "previous"
            let term = operation == "clear" ? "" : query
            let found = await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
                var completed = false
                let finish: (Bool) -> Void = { [weak self] value in
                    guard !completed else { return }; completed = true; self?.findCompletion = nil
                    continuation.resume(returning: value)
                }
                self.findCompletion = { finish(false) }
                self.web.find(term, configuration: configuration) { result in finish(result.matchFound) }
            }
            guard !self.closed, revision == self.findRevision else { return ["stale": true] }
            self.findCanStep = found && !term.isEmpty
            if term.isEmpty { return ["cleared": true, "found": false] }
            // Public WebKit returns matchFound, not a total or match index.
            return ["found": found, "total": NSNull(), "index": NSNull()]
        }
        findOperation = task
        return await task.value
    }
    func run(_ p: [String: Any], revision: Int) async throws -> Any {
        guard !closed, revision == operationRevision else { throw failure("浏览器操作已停止或标签页已关闭。") }
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
                var completed = false
                let finish: (Result<Any, Error>) -> Void = { [weak self] result in
                    guard !completed else { return }; completed = true; self?.operationCompletion = nil
                    continuation.resume(with: result)
                }
                operationCompletion = { finish(.failure(failure("网页操作已停止或标签页已关闭。"))) }
                web.takeSnapshot(with: nil) { image, error in
                    if let error { finish(.failure(error)); return }
                    guard let data = image?.tiffRepresentation, let bitmap = NSBitmapImageRep(data: data), let png = bitmap.representation(using: .png, properties: [:]) else { finish(.failure(failure("无法获取浏览器截图。"))); return }
                    finish(.success(["url": self.web.url?.absoluteString ?? "", "imageBase64": png.base64EncodedString()]))
                }
            }
        default: result = try await page(p)
        }
        guard !closed, revision == operationRevision else { throw failure("网页已变化或标签页已关闭。") }
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
    private var externalIds: [String: String] = [:], externalCancel: [String: () -> Void] = [:]
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
    private func destination(_ suggested: String) throws -> URL {
        let cleaned = suggested.replacingOccurrences(of: "\\", with: "/").components(separatedBy: "/").last ?? "download"
        let name = String(String.UnicodeScalarView(cleaned.unicodeScalars.map { CharacterSet.controlCharacters.contains($0) || $0 == ":" ? "_" : $0 })).trimmingCharacters(in: .whitespacesAndNewlines)
        var filename = name.isEmpty || name == "." || name == ".." ? "download" : name
        while filename.utf8.count > 200 { filename.removeLast() }
        let root: URL
        if let override = ProcessInfo.processInfo.environment["QQCLAW_DOWNLOADS_DIR"], !override.isEmpty { root = URL(fileURLWithPath: override, isDirectory: true) }
        else { root = try FileManager.default.url(for: .downloadsDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("QQClaw", isDirectory: true) }
        let folder = root.appendingPathComponent(UUID().uuidString.lowercased(), isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder.appendingPathComponent(filename)
    }
    func externalStart(id: String, owner: String, name: String, url: String, total: Int64, cancel: @escaping () -> Void) throws -> String {
        guard storageError.isEmpty, externalIds[id] == nil else { throw failure(storageError.isEmpty ? "下载标识重复。" : storageError) }
        let target = try destination(name), recordId = UUID().uuidString.lowercased()
        var record = BrowserDownloadRecord(id: recordId, owner: owner, name: target.lastPathComponent, path: target.path, url: url, at: ISO8601DateFormatter().string(from: Date()), status: "running", error: "")
        record.total = max(0, total); items.append(record)
        do { try save() } catch { items.removeAll { $0.id == recordId }; throw error }
        externalIds[id] = recordId; externalCancel[recordId] = cancel; publish(); return target.path
    }
    func externalUpdate(id: String, received: Int64, total: Int64, status: String, error: String) {
        guard let recordId = externalIds[id], let index = items.firstIndex(where: { $0.id == recordId }) else { return }
        if items[index].status == "running" || status != "running" {
            items[index].received = max(0, received); items[index].total = max(0, total)
            items[index].status = status; items[index].error = error
        }
        if status != "running" { externalIds.removeValue(forKey: id); externalCancel.removeValue(forKey: recordId); if storageError.isEmpty { try? save() } }
        publish()
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
            let target = try destination(suggestedFilename)
            items[i].name = target.lastPathComponent; items[i].path = target.path; items[i].total = max(0, response.expectedContentLength)
            try save(); completionHandler(target); publish()
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
            if let cancel = externalCancel[item.id] { cancel() }
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
