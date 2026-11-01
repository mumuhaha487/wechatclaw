using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// The packager must provide these hashes from its verified build inputs. A
// manifest beside a downloaded executable is not itself a trust anchor.
internal sealed class CefEngineFiles {
    internal string Directory, BootstrapSha256, ClientSha256, LibrarySha256;
    internal void Verify() {
        Check(Path.Combine(Directory, "QQClawBrowser.exe"), BootstrapSha256);
        Check(Path.Combine(Directory, "QQClawBrowser.dll"), ClientSha256);
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
// This class is not selected by BrowserHost until its product integration and
// dependency installer have been completed and checked.
internal sealed class CefBrowserEngine {
    readonly Form parent;
    readonly string owner;
    readonly CefEngineFiles files;
    readonly Action<Dictionary<string, object>> changed;
    readonly Action<string> log;
    readonly Process process = new Process();
    readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 2 * 1024 * 1024, RecursionLimit = 40 };
    readonly Dictionary<int, TaskCompletionSource<Dictionary<string, object>>> pending = new Dictionary<int, TaskCompletionSource<Dictionary<string, object>>>();
    readonly TaskCompletionSource<bool> ready = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
    readonly TaskCompletionSource<int> exited = new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
    readonly TaskCompletionSource<bool> workerClosed = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
    readonly object gate = new object();
    StreamWriter input;
    int next;
    bool started, closing;
    volatile bool outputEnded;
    Dictionary<string, object> queuedView;
    bool sendingView;
    internal Dictionary<string, object> State { get; private set; }
    internal int ProcessId { get { return started ? process.Id : 0; } }

    internal CefBrowserEngine(Form parent, string owner, CefEngineFiles files, Action<Dictionary<string, object>> changed, Action<string> log) {
        Guid id;
        if (!Guid.TryParseExact(owner, "D", out id)) throw new Exception("浏览器会话无效。");
        this.parent = parent; this.owner = owner; this.files = files;
        this.changed = changed ?? delegate { }; this.log = log ?? delegate { };
    }
    static string Quote(string value) { return "\"" + value.Replace("\"", "\\\"") + "\""; }
    internal async Task Start(string profilePath, string extensionPath, string configurationPath, string logPath, string[] allowedOrigins = null) {
        if (started) { await ready.Task; return; }
        files.Verify();
        Directory.CreateDirectory(profilePath);
        Directory.CreateDirectory(Path.GetDirectoryName(configurationPath));
        Directory.CreateDirectory(Path.GetDirectoryName(logPath));
        var configuration = new Dictionary<string, object> {
            {"owner", owner}, {"profilePath", Path.GetFullPath(profilePath)}, {"extensionPath", Path.GetFullPath(extensionPath)},
            {"logPath", Path.GetFullPath(logPath)}, {"parentWindow", parent.Handle.ToInt64()}, {"parentProcessId", Process.GetCurrentProcess().Id}
        };
        if (allowedOrigins != null) configuration["allowedOrigins"] = allowedOrigins;
        File.WriteAllText(configurationPath, json.Serialize(configuration), new UTF8Encoding(false));
        var start = new ProcessStartInfo(Path.Combine(files.Directory, "QQClawBrowser.exe"), Quote(Path.GetFullPath(configurationPath))) {
            UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true,
            RedirectStandardOutput = true, RedirectStandardError = true, WorkingDirectory = files.Directory
        };
        start.EnvironmentVariables.Clear();
        foreach (var key in new [] {"SystemRoot", "WINDIR", "COMSPEC", "PATH", "PATHEXT", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "ProgramFiles", "ProgramFiles(x86)"}) {
            var value = Environment.GetEnvironmentVariable(key); if (value != null) start.EnvironmentVariables[key] = value;
        }
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
            exited.TrySetResult(process.ExitCode); CompleteExit();
        };
        process.Start(); started = true;
        input = new StreamWriter(process.StandardInput.BaseStream, new UTF8Encoding(false)) { AutoFlush = true };
        process.BeginOutputReadLine(); process.BeginErrorReadLine();
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
            try { if (result != null && result.ContainsKey("owner")) ApplyState(result); }
            catch (Exception error) { request.TrySetException(error); throw; }
            request.TrySetResult(result);
        }
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
            try { lock (json) input.WriteLine(json.Serialize(request)); }
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
        queuedView = new Dictionary<string, object> {{"visible",visible},{"x",x},{"y",y},{"width",width},{"height",height}};
        if (!sendingView && !closing) SendViews();
    }
    async void SendViews() {
        sendingView = true;
        try { while (queuedView != null && !closing) { var view = queuedView; queuedView = null; await Call("view", view); } }
        catch (Exception error) { Log(error.ToString()); }
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
        if (!closing || exited.Task.Result != 0) Fail(new Exception("浏览器组件已退出（" + exited.Task.Result + "）。"));
        else if (workerClosed.Task.Status != TaskStatus.RanToCompletion) Fail(new Exception("浏览器组件未返回完整的退出确认。"));
        else FailPending(new Exception("浏览器会话已关闭。"));
    }
    void CloseInput() { lock (gate) { try { if (input != null) input.Close(); } catch { } } }
    internal async Task Close() {
        if (!started) return;
        if (!closing) {
            closing = true; queuedView = null;
            try {
                var result = await Call("shutdown");
                if (result == null || !Object.Equals(result["closed"], true) || Convert.ToInt32(result["remainingTabs"]) != 0)
                    throw new Exception("浏览器未确认全部标签已经关闭。");
            } finally { CloseInput(); }
        }
        var completed = Task.WhenAll(exited.Task, workerClosed.Task);
        if (await Task.WhenAny(completed, Task.Delay(15000)) != completed)
            throw new Exception("浏览器组件仍未确认退出，请查看日志；当前不会强制停止或伪报清理成功。");
        await completed;
        if (await exited.Task != 0) throw new Exception("浏览器组件未正常退出。");
    }
}
