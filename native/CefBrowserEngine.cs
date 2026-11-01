using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Collections.Concurrent;
using System.Threading;

// Pipe writes run off the UI and receive threads. A blocked browser must not
// make the UI writer and stdout receiver wait on one another's locks.
internal sealed class CefInputWriter {
    readonly BlockingCollection<string> queue = new BlockingCollection<string>(128);
    readonly object gate = new object();
    int characters;
    bool completed;
    internal CefInputWriter(Stream stream, Action failed) {
        Task.Factory.StartNew(delegate {
            try {
                using (var writer = new StreamWriter(stream, new UTF8Encoding(false)) { AutoFlush = true })
                    foreach (var line in queue.GetConsumingEnumerable()) {
                        lock (gate) characters -= line.Length;
                        writer.WriteLine(line);
                    }
            } catch { Complete(); failed(); }
        }, TaskCreationOptions.LongRunning);
    }
    internal bool Write(string line) {
        lock (gate) {
            if (completed || characters + line.Length > 1024 * 1024) return false;
            characters += line.Length;
            if (queue.TryAdd(line)) return true;
            characters -= line.Length; return false;
        }
    }
    internal void Complete() { lock (gate) { if (completed) return; completed = true; queue.CompleteAdding(); } }
}

// The packager must provide these hashes from its verified build inputs. A
// manifest beside a downloaded executable is not itself a trust anchor.
internal sealed class CefEngineFiles {
    internal bool Bundled;
    internal string Directory, LeaseFile, BootstrapSha256, ClientSha256, ElfSha256, LibrarySha256;
    internal FileStream AcquireLease(bool exclusive) {
        if (String.IsNullOrEmpty(LeaseFile)) return null;
        System.IO.Directory.CreateDirectory(Path.GetDirectoryName(LeaseFile));
        try { return new FileStream(LeaseFile, FileMode.OpenOrCreate, FileAccess.ReadWrite, exclusive ? FileShare.None : FileShare.ReadWrite); }
        catch (IOException) { throw new Exception("浏览器组件正在使用或安装中。请结束相关浏览器任务并重启 QQClaw 后重试。"); }
    }
    internal void Verify() {
        Check(Path.Combine(Directory, "QQClawBrowser.exe"), BootstrapSha256);
        Check(Path.Combine(Directory, "QQClawBrowser.dll"), ClientSha256);
        Check(Path.Combine(Directory, "chrome_elf.dll"), ElfSha256);
        Check(Path.Combine(Directory, "libcef.dll"), LibrarySha256);
    }
    private static void Check(string file, string expected) {
        if (String.IsNullOrEmpty(expected) || expected.Length != 64) throw new Exception("浏览器组件缺少可信摘要。");
        using (var sha = SHA256.Create()) using (var input = File.OpenRead(file))
            if (!String.Equals(BitConverter.ToString(sha.ComputeHash(input)).Replace("-", ""), expected, StringComparison.OrdinalIgnoreCase))
                throw new Exception("浏览器组件校验失败，请重新安装组件。");
    }
}

// One process/profile per session. Anonymous inherited pipes are private to
// this parent/child pair; no HTTP, CDP, remote control or model-facing tool.
internal sealed class CefBrowserEngine {
    readonly Form parent;
    readonly string owner;
    readonly CefEngineFiles files;
    readonly Action<Dictionary<string, object>> changed;
    readonly Action<string> log;
    readonly Action<Process> attach;
    readonly Action<string, Dictionary<string, object>> nativeNotify;
    readonly Process process = new Process();
    readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 2 * 1024 * 1024, RecursionLimit = 40 };
    readonly Dictionary<int, TaskCompletionSource<Dictionary<string, object>>> pending = new Dictionary<int, TaskCompletionSource<Dictionary<string, object>>>();
    readonly TaskCompletionSource<bool> ready = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
    readonly TaskCompletionSource<int> exited = new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
    readonly TaskCompletionSource<bool> workerClosed = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
    readonly TaskCompletionSource<bool> exitDelivered = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
    readonly object gate = new object();
    CefInputWriter input;
    Task startup;
    FileStream lease;
    int next, exitNotified;
    bool started, closing;
    volatile bool outputEnded;
    Dictionary<string, object> queuedView;
    bool sendingView;
    string viewSignature = "";
    internal Dictionary<string, object> State { get; private set; }
    internal int ProcessId { get { return started ? process.Id : 0; } }
    internal bool Running { get { try { return started && !process.HasExited; } catch { return false; } } }

    internal CefBrowserEngine(Form parent, string owner, CefEngineFiles files, Action<Dictionary<string, object>> changed, Action<string> log, Action<Process> attach = null, Action<string, Dictionary<string, object>> nativeNotify = null) {
        Guid id;
        if (!Guid.TryParseExact(owner, "D", out id)) throw new Exception("浏览器会话无效。");
        this.parent = parent; this.owner = owner; this.files = files;
        this.changed = changed ?? delegate { }; this.log = log ?? delegate { };
        this.attach = attach ?? delegate { };
        this.nativeNotify = nativeNotify ?? delegate { };
    }
    static string Quote(string value) { return "\"" + value.Replace("\"", "\\\"") + "\""; }
    internal Task Start(string profilePath, string extensionPath, string configurationPath, string logPath, string[] allowedOrigins = null, string downloadRoot = null, string nativeHostManifest = null, string nativeLocalAppData = null, string nativeCodexHome = null) {
        return startup ?? (startup = StartGuarded(profilePath, extensionPath, configurationPath, logPath, allowedOrigins, downloadRoot, nativeHostManifest, nativeLocalAppData, nativeCodexHome));
    }
    private async Task StartGuarded(string profilePath, string extensionPath, string configurationPath, string logPath, string[] allowedOrigins, string downloadRoot, string nativeHostManifest, string nativeLocalAppData, string nativeCodexHome) {
        try { await StartCore(profilePath, extensionPath, configurationPath, logPath, allowedOrigins, downloadRoot, nativeHostManifest, nativeLocalAppData, nativeCodexHome); }
        catch (Exception error) { CloseInput(); if (!started) ReleaseLease(); Fail(error); throw; }
    }
    private async Task StartCore(string profilePath, string extensionPath, string configurationPath, string logPath, string[] allowedOrigins, string downloadRoot, string nativeHostManifest, string nativeLocalAppData, string nativeCodexHome) {
        await Task.Run(delegate { lease = files.AcquireLease(false); files.Verify(); });
        Directory.CreateDirectory(profilePath);
        Directory.CreateDirectory(Path.GetDirectoryName(configurationPath));
        Directory.CreateDirectory(Path.GetDirectoryName(logPath));
        var configuration = new Dictionary<string, object> {
            {"owner", owner}, {"profilePath", Path.GetFullPath(profilePath)}, {"extensionPath", Path.GetFullPath(extensionPath)},
            {"logPath", Path.GetFullPath(logPath)}, {"parentWindow", parent.Handle.ToInt64()}, {"parentProcessId", Process.GetCurrentProcess().Id}
        };
        if (allowedOrigins != null) configuration["allowedOrigins"] = allowedOrigins;
        if (!String.IsNullOrEmpty(downloadRoot)) configuration["downloadRoot"] = Path.GetFullPath(downloadRoot);
        if (!String.IsNullOrEmpty(nativeHostManifest)) {
            string registry;
            using (var sha = SHA256.Create()) registry = BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(Path.GetFullPath(nativeHostManifest)))).Replace("-", "").Substring(0, 24);
            registry = @"Software\QQClaw\BrowserRuntime\" + registry;
            foreach (string browser in new [] { @"Google\Chrome", "Chromium", @"Microsoft\Edge" })
                using (var key = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(registry + @"\Software\" + browser + @"\NativeMessagingHosts\com.openai.codexextension")) key.SetValue("", Path.GetFullPath(nativeHostManifest));
            configuration["nativeHostRegistryKey"] = registry;
        }
        File.WriteAllText(configurationPath, json.Serialize(configuration), new UTF8Encoding(false));
        var start = new ProcessStartInfo(Path.Combine(files.Directory, "QQClawBrowser.exe"), Quote(Path.GetFullPath(configurationPath))) {
            UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true,
            RedirectStandardOutput = true, RedirectStandardError = true, WorkingDirectory = files.Directory,
            StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8
        };
        start.EnvironmentVariables.Clear();
        foreach (var key in new [] {"SystemRoot", "WINDIR", "COMSPEC", "PATH", "PATHEXT", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "ProgramFiles", "ProgramFiles(x86)"}) {
            var value = Environment.GetEnvironmentVariable(key); if (value != null) start.EnvironmentVariables[key] = value;
        }
        if (!String.IsNullOrEmpty(nativeLocalAppData)) start.EnvironmentVariables["LOCALAPPDATA"] = Path.GetFullPath(nativeLocalAppData);
        if (!String.IsNullOrEmpty(nativeCodexHome)) start.EnvironmentVariables["CODEX_HOME"] = Path.GetFullPath(nativeCodexHome);
        process.StartInfo = start;
        process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs line) {
            if (line.Data == null) { outputEnded = true; CompleteExit(); return; }
            try {
                if (line.Data.Length > 2 * 1024 * 1024) throw new Exception("浏览器返回的数据超过限制。");
                Dictionary<string, object> message;
                lock (json) message = json.Deserialize<Dictionary<string, object>>(line.Data);
                Receive(message);
            } catch (Exception error) { Fail(error); }
        };
        process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs line) { if (line.Data != null) Log(line.Data); };
        process.EnableRaisingEvents = true;
        process.Exited += delegate {
            ReleaseLease(); exited.TrySetResult(process.ExitCode); CompleteExit();
        };
        process.Start(); started = true;
        input = new CefInputWriter(process.StandardInput.BaseStream, () => Fail(new Exception("浏览器输入通道已关闭。")));
        process.BeginOutputReadLine(); process.BeginErrorReadLine();
        try { attach(process); } catch { CloseInput(); throw; }
        if (await Task.WhenAny(ready.Task, Task.Delay(15000)) != ready.Task) {
            CloseInput(); throw new Exception("浏览器组件未在 15 秒内确认启动；尚未确认它已经退出。");
        }
        await ready.Task;
    }
    void Receive(Dictionary<string, object> message) {
        object value;
        if (message.TryGetValue("event", out value)) {
            string type = Convert.ToString(value);
            if (type == "ready") {
                if (Convert.ToString(message["owner"]) != owner || Convert.ToInt32(message["pid"]) != process.Id || !Object.Equals(message["sandboxProvided"], true) || Convert.ToInt32(message["apiVersion"]) != 15400)
                    throw new Exception("浏览器组件返回的会话或沙箱状态无效。");
                ready.TrySetResult(true);
            } else if (type == "state") {
                var state = (Dictionary<string, object>)message["data"];
                if (Convert.ToString(state["owner"]) != owner) throw new Exception("浏览器状态不属于当前会话。");
                ApplyState(state);
            } else if (type == "shortcut" || type == "history" || type == "download-start" || type == "download-progress") {
                var data = (Dictionary<string, object>)message["data"];
                if (Convert.ToString(data["owner"]) != owner) throw new Exception("浏览器事件不属于当前会话。");
                PostNative(type, data);
            } else if (type == "closed") {
                if (Convert.ToInt32(message["remainingTabs"]) != 0) throw new Exception("浏览器组件退出时仍有未关闭标签。");
                workerClosed.TrySetResult(true);
            } else if (type == "startup-error" || type == "protocol-error" || type == "error") Fail(new Exception(Convert.ToString(message["error"])));
            return;
        }
        if (!message.TryGetValue("id", out value)) throw new Exception("浏览器响应缺少请求编号。");
        int id = Convert.ToInt32(value); TaskCompletionSource<Dictionary<string, object>> request;
        lock (gate) { if (!pending.TryGetValue(id, out request)) return; pending.Remove(id); }
        if (message.TryGetValue("error", out value) && value != null) request.TrySetException(new Exception(Convert.ToString(value)));
        else {
            var result = message["result"] as Dictionary<string, object>;
            try {
                if (result != null && result.ContainsKey("owner")) ApplyState(result);
                else if (result != null && result.ContainsKey("state")) ApplyState((Dictionary<string, object>)result["state"]);
            }
            catch (Exception error) { request.TrySetException(error); throw; }
            request.TrySetResult(result);
        }
    }
    void PostNative(string type, Dictionary<string, object> data, TaskCompletionSource<bool> delivered = null) {
        try {
            if (parent.IsDisposed || !parent.IsHandleCreated) throw new InvalidOperationException("浏览器通知窗口已关闭。");
            parent.BeginInvoke(new Action(delegate {
                try {
                    if (parent.IsDisposed) throw new InvalidOperationException("浏览器通知窗口已关闭。");
                    if (!closing || type == "worker-exit" || type == "download-progress") nativeNotify(type, data);
                    if (delivered != null) delivered.TrySetResult(true);
                } catch (Exception error) {
                    if (delivered != null) delivered.TrySetException(error); else Fail(error);
                }
            }));
        } catch (InvalidOperationException error) { if (delivered != null) delivered.TrySetException(error); }
    }
    void ApplyState(Dictionary<string, object> state) {
        if (Convert.ToString(state["owner"]) != owner) throw new Exception("浏览器状态不属于当前会话。");
        lock (gate) {
            if (State != null && Convert.ToInt64(state["revision"]) <= Convert.ToInt64(State["revision"])) return;
            State = state;
        }
        if (!parent.IsDisposed && parent.IsHandleCreated) parent.BeginInvoke(new Action(delegate {
            if (!parent.IsDisposed && !closing && Object.ReferenceEquals(State, state)) changed(state);
        }));
    }
    internal async Task<Dictionary<string, object>> Call(string action, Dictionary<string, object> parameters = null) {
        await ready.Task;
        var result = new TaskCompletionSource<Dictionary<string, object>>(TaskCreationOptions.RunContinuationsAsynchronously);
        int id;
        lock (gate) {
            if (closing && action != "shutdown") throw new Exception("浏览器会话正在关闭。");
            id = ++next;
            var request = parameters == null ? new Dictionary<string, object>() : new Dictionary<string, object>(parameters);
            request["id"] = id; request["owner"] = owner; request["action"] = action;
            pending.Add(id, result);
            try { lock (json) { if (!input.Write(json.Serialize(request))) throw new Exception("浏览器操作队列已满或已关闭。"); } }
            catch { pending.Remove(id); throw; }
        }
        if (await Task.WhenAny(result.Task, Task.Delay(15000)) != result.Task) {
            lock (gate) pending.Remove(id);
            throw new Exception("浏览器操作尚未在 15 秒内确认完成；不会因此重启浏览器或重发操作。");
        }
        return await result.Task;
    }
    // Dragging a splitter replaces obsolete geometry instead of accumulating
    // one pending native request per mouse movement.
    internal void SetView(bool visible, int x, int y, int width, int height) {
        string signature = visible + ":" + x + ":" + y + ":" + width + ":" + height;
        if (signature == viewSignature) return;
        viewSignature = signature;
        queuedView = new Dictionary<string, object> {{"visible",visible},{"x",x},{"y",y},{"width",width},{"height",height}};
        if (!sendingView && !closing) SendViews();
    }
    async void SendViews() {
        sendingView = true;
        try { while (queuedView != null && !closing) { var view = queuedView; queuedView = null; await Call("view", view); } }
        catch (Exception error) { viewSignature = ""; Log(error.ToString()); }
        finally { sendingView = false; }
    }
    void FailPending(Exception error) {
        lock (gate) { foreach (var request in pending.Values) request.TrySetException(error); pending.Clear(); }
    }
    void Log(string message) { try { log(message); } catch { /* Logging cannot break the private process transport. */ } }
    void Fail(Exception error) { Log(error.ToString()); ready.TrySetException(error); workerClosed.TrySetException(error); FailPending(error); }
    void CompleteExit() {
        // Exited can arrive before redirected stdout has delivered its final
        // response. Drain the pipe before rejecting any remaining requests.
        if (!exited.Task.IsCompleted || !outputEnded) return;
        if (Interlocked.Exchange(ref exitNotified, 1) != 0) return;
        // The final download update must be queued before worker-exit, just
        // like the final pipe response. Otherwise a completed file can be
        // recorded as interrupted when the process exits first.
        PostNative("worker-exit", new Dictionary<string, object> {{"owner",owner}}, exitDelivered);
        if (!closing || exited.Task.Result != 0) Fail(new Exception("浏览器组件已退出（" + exited.Task.Result + "）。"));
        else if (workerClosed.Task.Status != TaskStatus.RanToCompletion) Fail(new Exception("浏览器组件未返回完整的退出确认。"));
        else FailPending(new Exception("浏览器会话已关闭。"));
    }
    void CloseInput() { lock (gate) { if (input != null) input.Complete(); } }
    void ReleaseLease() { var value = Interlocked.Exchange(ref lease, null); if (value != null) value.Dispose(); }
    internal async Task Close() {
        if (!started) return;
        Exception shutdownFailure = null;
        if (!closing) {
            closing = true; queuedView = null;
            try {
                if (ready.Task.Status == TaskStatus.RanToCompletion) {
                    var result = await Call("shutdown");
                    if (result == null || !Object.Equals(result["closed"], true) || Convert.ToInt32(result["remainingTabs"]) != 0)
                        throw new Exception("浏览器未确认全部标签已经关闭。");
                }
            } catch (Exception failure) { shutdownFailure = failure;
            } finally { CloseInput(); }
        }
        // Native exit alone is insufficient: stdout may still contain the last
        // download result, and its UI callback may still be queued. Keep the
        // parent alive until the drained exit notification has been handled.
        var completed = Task.WhenAll(exited.Task, workerClosed.Task, exitDelivered.Task);
        if (await Task.WhenAny(completed, Task.Delay(15000)) != completed)
            throw new Exception("浏览器组件仍未确认退出，请查看日志；当前不会强制停止或伪报清理成功。");
        await completed;
        if (shutdownFailure != null) throw shutdownFailure;
        if (await exited.Task != 0) throw new Exception("浏览器组件未正常退出。");
    }
}
