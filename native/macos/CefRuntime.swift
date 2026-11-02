import AppKit
import WebKit
import Darwin

// A private native UI bridge, loaded before NSApplication is constructed.
// Models continue to use the original extension/Node REPL, never this API.
@MainActor final class MacCefRuntime {
    typealias Event = @convention(c) (UnsafePointer<CChar>?) -> Void
    typealias Start = @convention(c) (Int32, UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>?, UnsafePointer<CChar>?, Event?) -> Int32
    typealias Run = @convention(c) () -> Void
    typealias Window = @convention(c) () -> UnsafeMutableRawPointer?
    typealias Shell = @convention(c) (UnsafeMutableRawPointer?) -> UnsafeMutableRawPointer?
    typealias Bounds = @convention(c) (Int32, Int32, Int32, Int32, Int32) -> Void
    typealias Control = @convention(c) (UnsafePointer<CChar>?) -> UnsafePointer<CChar>?
    typealias State = @convention(c) () -> UnsafePointer<CChar>?
    static var active: MacCefRuntime?
    private let library: UnsafeMutableRawPointer
    private let startFunction: Start, runFunction: Run, shutdownFunction: Run, closeFunction: Run
    private let windowFunction: Window, shellFunction: Shell, boundsFunction: Bounds, controlFunction: Control
    private let stateFunction: State
    var onEvent: (([String: Any]) -> Void)?
    private var started = false

    init(frameworks: URL) throws {
        let file = frameworks.appendingPathComponent("libQQClawCefBridge.dylib")
        guard let handle = dlopen(file.path, RTLD_NOW | RTLD_GLOBAL) else {
            throw failure("无法加载内置 Chromium：\(dlerror().map { String(cString: $0) } ?? "unknown")")
        }
        func symbol<T>(_ name: String, _ type: T.Type) throws -> T {
            guard let pointer = dlsym(handle, name) else { throw failure("内置 Chromium 缺少接口：\(name)") }
            return unsafeBitCast(pointer, to: type)
        }
        do {
            startFunction = try symbol("QQClawCefStart", Start.self)
            runFunction = try symbol("QQClawCefRun", Run.self)
            shutdownFunction = try symbol("QQClawCefShutdown", Run.self)
            closeFunction = try symbol("QQClawCefClose", Run.self)
            windowFunction = try symbol("QQClawCefWindow", Window.self)
            shellFunction = try symbol("QQClawCefCreateShell", Shell.self)
            boundsFunction = try symbol("QQClawCefBrowserBounds", Bounds.self)
            controlFunction = try symbol("QQClawCefControl", Control.self)
            stateFunction = try symbol("QQClawCefState", State.self)
        } catch { dlclose(handle); throw error }
        library = handle
    }
    func start(options: [String: Any]) throws {
        Vault.isolateFromChromium()
        Self.active = self
        let json = try jsonText(options)
        let code = json.withCString { startFunction(Int32(CommandLine.argc), CommandLine.unsafeArgv, $0, { pointer in
            guard let pointer, let bytes = String(cString: pointer).data(using: .utf8),
                  let value = (try? JSONSerialization.jsonObject(with: bytes)) as? [String: Any] else { return }
            DispatchQueue.main.async { MacCefRuntime.active?.onEvent?(value) }
        }) }
        guard code == 0 else { Self.active = nil; throw failure("内置 Chromium 初始化失败（\(code)）。") }
        started = true
    }
    func run() {
        guard started else { return }
        runFunction(); shutdownFunction(); started = false; Self.active = nil
    }
    func close() { if started { closeFunction() } }
    var window: NSWindow? { windowFunction().map { Unmanaged<NSWindow>.fromOpaque($0).takeUnretainedValue() } }
    var state: [String: Any] {
        guard let pointer = stateFunction(), let bytes = String(cString: pointer).data(using: .utf8),
              let value = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any] else { return [:] }; return value
    }
    func shell(configuration: WKWebViewConfiguration) throws -> WKWebView {
        guard let pointer = shellFunction(Unmanaged.passUnretained(configuration).toOpaque()) else { throw failure("内置浏览器窗口未准备好。") }
        return Unmanaged<WKWebView>.fromOpaque(pointer).takeRetainedValue()
    }
    func bounds(_ rect: NSRect, visible: Bool) {
        boundsFunction(Int32(rect.origin.x.rounded()), Int32(rect.origin.y.rounded()), Int32(rect.width.rounded()), Int32(rect.height.rounded()), visible ? 1 : 0)
    }
    func control(_ value: [String: Any]) throws -> [String: Any] {
        let json = try jsonText(value)
        let result: [String: Any] = try json.withCString { request in
            guard let pointer = controlFunction(request), let bytes = String(cString: pointer).data(using: .utf8),
                  let result = try JSONSerialization.jsonObject(with: bytes) as? [String: Any] else { throw failure("内置浏览器响应无效。") }
            return result
        }
        if let error = result["error"] as? String { throw failure(error) }
        return result
    }
}
