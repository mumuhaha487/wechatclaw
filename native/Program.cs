using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal static class DesktopIntegration {
    [DllImport("Shlwapi.dll", CharSet = CharSet.Unicode)]
    private static extern uint AssocQueryString(uint flags, uint value, string association, string extra, StringBuilder output, ref uint length);
    private static string Association(uint value) {
        uint length = 0;
        AssocQueryString(0x1000, value, "codex", null, null, ref length);
        if (length == 0 || length > 32768) return "";
        var output = new StringBuilder((int)length);
        return AssocQueryString(0x1000, value, "codex", null, output, ref length) == 0 ? output.ToString() : "";
    }
    internal static Dictionary<string, object> Status() {
        // Store apps register an AppUserModelID instead of an executable command.
        string appId = Association(21);
        bool installed = File.Exists(Association(2)) || appId.StartsWith("OpenAI.Codex_", StringComparison.OrdinalIgnoreCase);
        string home = Environment.GetEnvironmentVariable("CODEX_HOME", EnvironmentVariableTarget.User);
        if (String.IsNullOrWhiteSpace(home)) home = Environment.GetEnvironmentVariable("CODEX_HOME", EnvironmentVariableTarget.Machine);
        if (String.IsNullOrWhiteSpace(home)) home = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".codex");
        return new Dictionary<string, object> { { "installed", installed }, { "codexHome", Path.GetFullPath(Environment.ExpandEnvironmentVariables(home)) } };
    }
    internal static string BuildUrl(Dictionary<string, object> p) {
        object value; string threadId = p.TryGetValue("threadId", out value) ? Convert.ToString(value) : "";
        if (!String.IsNullOrEmpty(threadId)) {
            Guid id;
            if (!Guid.TryParseExact(threadId, "D", out id)) throw new Exception("Codex 会话 ID 无效。");
            return "codex://threads/" + id.ToString("D");
        }
        string workspace = p.TryGetValue("workspace", out value) ? Convert.ToString(value) : "";
        if (String.IsNullOrWhiteSpace(workspace)) return "codex://threads/new";
        workspace = Path.GetFullPath(workspace);
        if (!Directory.Exists(workspace)) throw new Exception("工作目录不存在。");
        return "codex://threads/new?path=" + Uri.EscapeDataString(workspace);
    }
    internal static bool Open(Dictionary<string, object> p) {
        var url = BuildUrl(p);
        if (!(bool)Status()["installed"]) throw new Exception("未检测到 Codex Desktop，请先完成安装。");
        Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        return true;
    }
}

internal static class Program {
    internal static string RuntimeDirectory;
    internal static string DataDirectory;
    private static Mutex mutex;
    private static bool ownsMutex;
    internal static bool RestartRequested;
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool SetDllDirectory(string path);
    [STAThread]
    static void Main() {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        try {
            DataDirectory = Environment.GetEnvironmentVariable("QQCLAW_DATA_DIR");
            if (String.IsNullOrEmpty(DataDirectory)) DataDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "QQClaw");
            DataDirectory = Path.GetFullPath(DataDirectory);
            Directory.CreateDirectory(DataDirectory);
            bool created;
            string identity;
            using (var sha = SHA256.Create()) identity = BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(DataDirectory.ToLowerInvariant()))).Replace("-", "").Substring(0, 20);
            mutex = new Mutex(true, "Local\\QQClaw-" + identity, out created);
            ownsMutex = created;
            if (!created) { MessageBox.Show("QQClaw 已经运行，请在任务栏打开窗口。", "QQClaw"); return; }
            byte[] archive;
            using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"))
            using (var memory = new MemoryStream()) { stream.CopyTo(memory); archive = memory.ToArray(); }
            string hash;
            using (var sha = SHA256.Create()) hash = BitConverter.ToString(sha.ComputeHash(archive)).Replace("-", "").Substring(0, 16);
            RuntimeDirectory = Path.Combine(DataDirectory, "app", hash);
            if (!File.Exists(Path.Combine(RuntimeDirectory, ".complete"))) {
                Directory.CreateDirectory(RuntimeDirectory);
                using (var zip = new ZipArchive(new MemoryStream(archive), ZipArchiveMode.Read)) {
                    foreach (var entry in zip.Entries) {
                        var target = Path.GetFullPath(Path.Combine(RuntimeDirectory, entry.FullName));
                        if (!target.StartsWith(RuntimeDirectory + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new Exception("应用资源路径无效。");
                        if (String.IsNullOrEmpty(entry.Name)) { Directory.CreateDirectory(target); continue; }
                        Directory.CreateDirectory(Path.GetDirectoryName(target));
                        using (var source = entry.Open()) using (var destination = File.Create(target)) source.CopyTo(destination);
                    }
                }
                File.WriteAllText(Path.Combine(RuntimeDirectory, ".complete"), "0.3.20");
            }
            CleanupOldRuntimes(hash);
            SetDllDirectory(RuntimeDirectory);
            AppDomain.CurrentDomain.AssemblyResolve += delegate(object sender, ResolveEventArgs args) {
                var file = Path.Combine(RuntimeDirectory, new AssemblyName(args.Name).Name + ".dll");
                return File.Exists(file) ? Assembly.LoadFrom(file) : null;
            };
            Run();
        } catch (Exception error) { MessageBox.Show(error.Message, "QQClaw 启动失败", MessageBoxButtons.OK, MessageBoxIcon.Error); }
        finally { if (mutex != null) { if (ownsMutex) mutex.ReleaseMutex(); mutex.Dispose(); } }
        if (RestartRequested) Process.Start(new ProcessStartInfo(Application.ExecutablePath) { UseShellExecute = false, CreateNoWindow = true });
    }
    [MethodImpl(MethodImplOptions.NoInlining)] static void Run() { Application.Run(new DesktopWindow()); }
    internal static void CleanupOldRuntimes(string hash) {
        try {
            foreach (var directory in Directory.GetDirectories(Path.Combine(DataDirectory, "app"))) {
                var name = Path.GetFileName(directory);
                if (!System.Text.RegularExpressions.Regex.IsMatch(name, "\\A[0-9a-fA-F]{16}\\z") || String.Equals(name, hash, StringComparison.OrdinalIgnoreCase)) continue;
                try { if ((File.GetAttributes(directory) & FileAttributes.ReparsePoint) == 0) Directory.Delete(directory, true); } catch { }
            }
        } catch { }
    }
}

internal sealed class DesktopWindow : Form {
    private BrowserHost browserHost;
    private WebView2 view;
    private Process backend;
    private BackendPipeWriter backendInput;
    private Task backendStarting;
    private readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 32 * 1024 * 1024, RecursionLimit = 150 };
    private readonly Label fallback;
    private readonly Dictionary<string, TaskCompletionSource<Dictionary<string, object>>> internalRequests = new Dictionary<string, TaskCompletionSource<Dictionary<string, object>>>();
    private readonly Dictionary<string, Process> internalOwners = new Dictionary<string, Process>();
    private sealed class ForwardedRequest {
        internal object Id;
        internal Process Owner;
    }
    private readonly Dictionary<string, ForwardedRequest> forwardedRequests = new Dictionary<string, ForwardedRequest>();
    private volatile Process brokenBackend;
    private long lastBackendWarning;
    private int internalId;
    private bool exiting;
    private IntPtr job;
    [DllImport("user32.dll")] static extern bool ReleaseCapture();
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr hwnd, int message, IntPtr wparam, IntPtr lparam);
    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

    internal DesktopWindow() {
        var work = Screen.PrimaryScreen.WorkingArea;
        Text = "QQClaw"; Size = new Size(Math.Min(1800, work.Width - 60), Math.Min(1100, work.Height - 70)); MinimumSize = new Size(1000, 680);
        StartPosition = FormStartPosition.CenterScreen; BackColor = Color.White; ForeColor = Color.FromArgb(32, 32, 32); FormBorderStyle = FormBorderStyle.None;
        AutoScaleMode = AutoScaleMode.Dpi;
        try { Icon = new Icon(Path.Combine(Program.RuntimeDirectory, "app.ico")); } catch { }
        fallback = new Label { Dock = DockStyle.Fill, Text = "正在打开 QQClaw…", TextAlign = ContentAlignment.MiddleCenter, Font = new Font("Microsoft YaHei UI", 13) };
        Controls.Add(fallback);
        CreateJob();
        Shown += async delegate { await InitializeView(); };
        FormClosing += OnClosing;
    }
    protected override void OnHandleCreated(EventArgs e) {
        base.OnHandleCreated(e);
        try { int preference = 2; DwmSetWindowAttribute(Handle, 33, ref preference, sizeof(int)); } catch { }
    }
    private async Task InitializeView() {
        try {
            string debugPort = Environment.GetEnvironmentVariable("QQCLAW_DEBUG_PORT");
            int port;
            string flags = Int32.TryParse(debugPort, out port) && port > 1024 && port < 65536 ? "--remote-debugging-port=" + port : "";
            var environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(Program.DataDirectory, "webview"), new CoreWebView2EnvironmentOptions(flags));
            view = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.White };
            Controls.Add(view); view.BringToFront();
            await view.EnsureCoreWebView2Async(environment);
            view.CoreWebView2.Settings.AreDevToolsEnabled = !String.IsNullOrEmpty(flags);
            view.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            view.CoreWebView2.Settings.IsStatusBarEnabled = false;
            view.CoreWebView2.Settings.AreBrowserAcceleratorKeysEnabled = false;
            view.CoreWebView2.SetVirtualHostNameToFolderMapping("qqclaw.local", Path.Combine(Program.RuntimeDirectory, "ui"), CoreWebView2HostResourceAccessKind.DenyCors);
            view.CoreWebView2.NavigationStarting += delegate(object sender, CoreWebView2NavigationStartingEventArgs args) {
                if (!args.Uri.StartsWith("https://qqclaw.local/", StringComparison.Ordinal)) args.Cancel = true;
            };
            view.CoreWebView2.NewWindowRequested += delegate(object sender, CoreWebView2NewWindowRequestedEventArgs args) { args.Handled = true; };
            view.CoreWebView2.PermissionRequested += delegate(object sender, CoreWebView2PermissionRequestedEventArgs args) { args.State = CoreWebView2PermissionState.Deny; };
            view.CoreWebView2.DownloadStarting += delegate(object sender, CoreWebView2DownloadStartingEventArgs args) { args.Cancel = true; };
            view.CoreWebView2.WebMessageReceived += OnWebMessage;
            view.CoreWebView2.Navigate("https://qqclaw.local/index.html");
        } catch (Exception error) {
            if (view != null) view.Visible = false;
            fallback.Text = "需要 Microsoft Edge WebView2 Runtime\n\n" + error.Message + "\n\n点击这里打开微软官方下载页面，安装后重新启动。";
            fallback.Cursor = Cursors.Hand;
            fallback.Click += delegate { OpenUrl("https://developer.microsoft.com/microsoft-edge/webview2/"); };
            var close = new Button { Text = "关闭", Width = 80, Height = 32, Left = Width - 100, Top = 16, Anchor = AnchorStyles.Top | AnchorStyles.Right };
            close.Click += delegate { Close(); }; Controls.Add(close); close.BringToFront();
        }
    }
    private string Get(Dictionary<string, object> values, string key, string defaultValue = "") {
        object result; return values != null && values.TryGetValue(key, out result) && result != null ? Convert.ToString(result) : defaultValue;
    }
    private Dictionary<string, object> Params(Dictionary<string, object> values) {
        object result; return values.TryGetValue("params", out result) ? result as Dictionary<string, object> ?? new Dictionary<string, object>() : new Dictionary<string, object>();
    }
    private void Post(object value) {
        if (IsDisposed || !IsHandleCreated || exiting) return;
        if (InvokeRequired) { try { BeginInvoke(new Action<object>(Post), value); } catch { } return; }
        if (view == null || view.CoreWebView2 == null) return;
        view.CoreWebView2.PostWebMessageAsJson(new JavaScriptSerializer { MaxJsonLength = 32 * 1024 * 1024, RecursionLimit = 150 }.Serialize(value));
    }
    private async void OnWebMessage(object sender, CoreWebView2WebMessageReceivedEventArgs args) {
        if (!args.Source.StartsWith("https://qqclaw.local/", StringComparison.Ordinal)) return;
        object id = null;
        Process forwardedTo = null;
        try {
            var request = json.Deserialize<Dictionary<string, object>>(args.WebMessageAsJson);
            id = request["id"]; var method = Get(request, "method"); var p = Params(request);
            object result;
            if (method.StartsWith("window.")) {
                if (method == "window.theme") {
                    bool dark = Get(p, "theme") == "dark";
                    BackColor = dark ? Color.FromArgb(17, 17, 17) : Color.White;
                    ForeColor = dark ? Color.FromArgb(242, 242, 242) : Color.FromArgb(32, 32, 32);
                    view.DefaultBackgroundColor = BackColor;
                }
                else if (method == "window.minimize") WindowState = FormWindowState.Minimized;
                else if (method == "window.maximize") { MaximizedBounds = Screen.FromHandle(Handle).WorkingArea; WindowState = WindowState == FormWindowState.Maximized ? FormWindowState.Normal : FormWindowState.Maximized; }
                else if (method == "window.close") Close();
                else if (method == "window.drag") { if (WindowState != FormWindowState.Maximized) { ReleaseCapture(); SendMessage(Handle, 0xA1, new IntPtr(2), IntPtr.Zero); } }
                else if (method == "window.resize") { int direction; if (WindowState != FormWindowState.Maximized && Int32.TryParse(Get(p, "direction"), out direction) && direction >= 1 && direction <= 8) { ReleaseCapture(); SendMessage(Handle, 0x112, new IntPtr(0xF000 + direction), IntPtr.Zero); } }
                result = true;
            } else if (method == "browser.view") {
                GetBrowserHost().SetView(p); result = true;
            } else if (method == "dialog.folder") {
                using (var dialog = new FolderBrowserDialog { Description = "选择 Codex 的工作目录", ShowNewFolderButton = true, SelectedPath = Get(p, "path") })
                    result = dialog.ShowDialog(this) == DialogResult.OK ? dialog.SelectedPath : null;
            } else if (method == "dialog.file") {
                using (var dialog = new OpenFileDialog { Title = "选择要引用的文件", Filter = "所有文件|*.*" })
                    result = dialog.ShowDialog(this) == DialogResult.OK ? dialog.FileName : null;
            } else if (method == "dialog.files") {
                using (var dialog = new OpenFileDialog { Title = "添加文件或图片", Filter = "所有文件|*.*", Multiselect = true })
                    result = dialog.ShowDialog(this) == DialogResult.OK ? dialog.FileNames : new string[0];
            } else if (method == "dialog.executable") {
                using (var dialog = new OpenFileDialog { Title = Get(p, "title", "选择可执行文件"), Filter = "程序文件|*.exe;*.cmd;*.js|全部文件|*.*" })
                    result = dialog.ShowDialog(this) == DialogResult.OK ? dialog.FileName : null;
            } else if (method == "clipboard.read") {
                if (Clipboard.ContainsFileDropList()) {
                    var files = Clipboard.GetFileDropList();
                    if (files.Count > 8) throw new Exception("每条消息最多添加 8 个附件。");
                    var paths = new List<string>(); foreach (string file in files) paths.Add(file);
                    result = new { files = paths.ToArray() };
                } else if (Clipboard.ContainsText()) {
                    var text = Clipboard.GetText();
                    if (text.Length > 4000000) throw new Exception("剪贴板文本过大，请保存为文件后添加。");
                    result = new { text = text };
                } else if (Clipboard.ContainsImage()) {
                    using (var image = Clipboard.GetImage()) using (var memory = new MemoryStream()) {
                        image.Save(memory, System.Drawing.Imaging.ImageFormat.Png);
                        if (memory.Length > 20 * 1024 * 1024) throw new Exception("剪贴板图片超过 20 MiB。");
                        result = new { image = new { data = Convert.ToBase64String(memory.ToArray()) } };
                    }
                } else result = new { text = "" };
            } else if (method == "desktop.status") { result = DesktopIntegration.Status(); }
            else if (method == "desktop.open") { result = DesktopIntegration.Open(p); }
            else if (method == "shell.open") { OpenUrl(Get(p, "url")); result = true; }
            else if (method == "shell.folder") {
                var directory = Path.GetFullPath(Get(p, "path")); if (!Directory.Exists(directory)) throw new Exception("目录不存在。");
                Process.Start(new ProcessStartInfo("explorer.exe", Quote(directory)) { UseShellExecute = true }); result = true;
            } else if (method == "system.status") {
                result = await RuntimeStatus();
            } else if (method == "system.reload") { await ShutdownBackend(); StopBackend(); await StartBackend(); result = true; }
            else if (method == "system.restart") { Program.RestartRequested = true; result = true; BeginInvoke(new Action(Close)); }
            else if (method == "system.nodePath") {
                var nodePath = Get(p, "path"); if (!File.Exists(nodePath)) throw new Exception("Node.js 路径不存在。");
                await ReadNodeVersion(nodePath);
                File.WriteAllText(Path.Combine(Program.DataDirectory, "node-path.txt"), Path.GetFullPath(nodePath)); result = true;
            } else if (method == "system.installCodex") { result = await InstallCodex(); }
            else if (method == "system.loginCodex") {
                await StartBackend(); var response = await BackendRequest("environment", new { });
                var environment = response["result"] as Dictionary<string, object>; var executable = Get(environment, "codexPath");
                if (!executable.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) {
                    if (String.IsNullOrEmpty(executable)) throw new Exception("请先安装 Codex CLI。");
                    Process.Start(new ProcessStartInfo(FindNode(), Quote(executable) + " login --device-auth") { UseShellExecute = true });
                } else Process.Start(new ProcessStartInfo(executable, "login --device-auth") { UseShellExecute = true });
                result = true;
            } else {
                await StartBackend();
                forwardedTo = backend;
                lock (forwardedRequests) forwardedRequests[Convert.ToString(id)] = new ForwardedRequest { Id = id, Owner = forwardedTo };
                WriteBackend(request); return;
            }
            Post(new { id = id, result = result });
        } catch (Exception error) {
            if (forwardedTo == null || TakeForwarded(Convert.ToString(id), forwardedTo))
                Post(new { id = id, error = error.Message });
        }
    }
    private static string Quote(string text) { return "\"" + text.Replace("\"", "") + "\""; }
    private BrowserHost GetBrowserHost() {
        return browserHost ?? (browserHost = new BrowserHost(this, value => Post(new { kind = "event", @event = "browser-state", data = value })));
    }
    private void OpenUrl(string url) {
        Uri uri; if (!Uri.TryCreate(url, UriKind.Absolute, out uri) || (uri.Scheme != "https" && uri.Scheme != "http")) throw new Exception("只能打开 HTTP 或 HTTPS 链接。");
        Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true });
    }
    private string FullPathEnvironment() {
        return Environment.GetEnvironmentVariable("PATH") + ";" + Environment.GetEnvironmentVariable("PATH", EnvironmentVariableTarget.User) + ";" + Environment.GetEnvironmentVariable("PATH", EnvironmentVariableTarget.Machine);
    }
    private string FindNode() {
        var candidates = new List<string>();
        var configured = Path.Combine(Program.DataDirectory, "node-path.txt"); if (File.Exists(configured)) candidates.Add(File.ReadAllText(configured).Trim());
        foreach (var directory in FullPathEnvironment().Split(';')) { try { if (!String.IsNullOrWhiteSpace(directory)) candidates.Add(Path.Combine(directory.Trim('"'), "node.exe")); } catch { } }
        candidates.Add(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe"));
        foreach (var candidate in candidates) if (File.Exists(candidate)) return candidate;
        return "";
    }
    private async Task<object> RuntimeStatus() {
        string node = FindNode(), version = "", error = ""; bool ready = false;
        if (!String.IsNullOrEmpty(node)) {
            try {
                using (var process = new Process { StartInfo = new ProcessStartInfo(node, "-p process.versions.node") { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true } }) {
                    process.Start();
                    var output = process.StandardOutput.ReadToEndAsync(); var errors = process.StandardError.ReadToEndAsync();
                    var exited = Task.Run(() => process.WaitForExit());
                    if (await Task.WhenAny(exited, Task.Delay(5000)) != exited) { try { process.Kill(); } catch { } throw new Exception("Node.js 检测超时，请重新选择程序路径。"); }
                    version = (await output).Trim(); await errors;
                    Version parsed; ready = process.ExitCode == 0 && Version.TryParse(version, out parsed) && parsed >= new Version(22, 13, 0);
                    if (!ready) error = "需要 Node.js 22.13 或更新版本，请安装后重新检测。";
                }
            } catch (Exception failure) { error = failure.Message; }
        }
        return new { nodePath = node, nodeVersion = version, nodeReady = ready, nodeError = error, dataDir = Program.DataDirectory, version = "0.3.20", desktop = DesktopIntegration.Status(), webview = view.CoreWebView2.Environment.BrowserVersionString };
    }
    private Task<string> ReadNodeVersion(string node) { return ReadNodeVersion(node, 5); }
    private async Task<string> ReadNodeVersion(string node, int timeoutSeconds) {
        try {
            using (var process = new Process { StartInfo = new ProcessStartInfo(node, "-p process.versions.node") { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true } }) {
                process.Start();
                var output = process.StandardOutput.ReadToEndAsync(); var errors = process.StandardError.ReadToEndAsync();
                var exited = Task.Run(() => process.WaitForExit());
                if (await Task.WhenAny(exited, Task.Delay(timeoutSeconds * 1000)) != exited) { try { process.Kill(); } catch { } throw new Exception(); }
                string version = (await output).Trim(); await errors;
                Version parsed;
                if (process.ExitCode != 0 || !Version.TryParse(version, out parsed) || parsed < new Version(22, 13, 0)) throw new Exception();
                return version;
            }
        } catch { throw new Exception("所选文件不是可用的 Node.js 22.13 或更新版本，请重新选择 node.exe。"); }
    }
    private Task StartBackend() {
        if (backend != null && backend != brokenBackend && !backend.HasExited) return Task.FromResult(true);
        if (backendStarting == null || backendStarting.IsCompleted) backendStarting = StartBackendCore();
        return backendStarting;
    }
    private async Task StartBackendCore() {
        var node = FindNode(); if (String.IsNullOrEmpty(node)) throw new Exception("未检测到 Node.js 22.13+。请在「设置 → 运行环境」安装，然后点击重新检测。");
        try { await ReadNodeVersion(node, timeoutSeconds: 20); }
        catch { throw new Exception("Node.js 启动超时或版本过低（需要 22.13+），请在设置中重新选择。"); }
        var info = new ProcessStartInfo(node, Quote(Path.Combine(Program.RuntimeDirectory, "backend.cjs"))) {
            UseShellExecute = false, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true,
            CreateNoWindow = true, WorkingDirectory = Program.DataDirectory, StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8
        };
        info.EnvironmentVariables["PATH"] = FullPathEnvironment(); info.EnvironmentVariables["QQCLAW_DATA_DIR"] = Program.DataDirectory;
        var child = new Process { StartInfo = info, EnableRaisingEvents = true }; backend = child;
        child.OutputDataReceived += delegate(object sender, DataReceivedEventArgs args) { if (args.Data != null) OnBackendLine(child, args.Data); };
        // Never forward backend stderr: it may include model prompts or credentials from a failed dependency.
        child.ErrorDataReceived += delegate { };
        child.Exited += delegate {
            FailBackendRequests(child);
            if (!exiting && backend == child) Post(new { kind = "event", @event = "backend-exit", data = "后台进程已退出，请在运行环境中重新检测。" });
        };
        child.Start(); if (job != IntPtr.Zero) AssignProcessToJobObject(job, child.Handle);
        backendInput = new BackendPipeWriter(child.StandardInput.BaseStream, delegate {
            FailBackendRequests(child);
            if (backend != child || exiting) return;
            brokenBackend = child;
            Post(new { kind = "event", @event = "backend-error", data = "后台通信中断，请保存当前任务后检查运行环境。" });
            try { if (!child.HasExited) child.Kill(); } catch { }
        });
        child.BeginOutputReadLine(); child.BeginErrorReadLine();
    }
    private void WriteBackend(object value) {
        var writer = backendInput;
        if (backend == null || backend.HasExited || writer == null) throw new Exception("后台尚未启动。");
        writer.Enqueue(new JavaScriptSerializer { MaxJsonLength = 32 * 1024 * 1024, RecursionLimit = 150 }.Serialize(value));
    }
    private Task<Dictionary<string, object>> BackendRequest(string method, object parameters) {
        var id = "host-" + Interlocked.Increment(ref internalId); var completion = new TaskCompletionSource<Dictionary<string, object>>(TaskCreationOptions.RunContinuationsAsynchronously);
        lock (internalRequests) { internalRequests[id] = completion; internalOwners[id] = backend; }
        try { WriteBackend(new { id = id, method = method, @params = parameters }); }
        catch (Exception error) { lock (internalRequests) { internalRequests.Remove(id); internalOwners.Remove(id); } completion.TrySetException(error); }
        return completion.Task;
    }
    private bool TakeForwarded(string id, Process owner) {
        lock (forwardedRequests) {
            ForwardedRequest current;
            if (!forwardedRequests.TryGetValue(id, out current) || current.Owner != owner) return false;
            forwardedRequests.Remove(id); return true;
        }
    }
    private void FailBackendRequests(Process owner) {
        var ids = new List<string>();
        var forwarded = new List<ForwardedRequest>();
        lock (forwardedRequests) {
            foreach (var pair in forwardedRequests) if (pair.Value.Owner == owner) { ids.Add(pair.Key); forwarded.Add(pair.Value); }
            foreach (var id in ids) forwardedRequests.Remove(id);
        }
        foreach (var request in forwarded) Post(new { id = request.Id, error = "后台进程已退出，请重试。" });
        lock (internalRequests) {
            ids.Clear();
            foreach (var pair in internalOwners) if (pair.Value == owner) ids.Add(pair.Key);
            foreach (var id in ids) {
                internalRequests[id].TrySetException(new IOException("后台进程已退出，请重试。"));
                internalRequests.Remove(id); internalOwners.Remove(id);
            }
        }
    }
    private void WarnBackendLine() {
        long now = DateTime.UtcNow.Ticks, previous = Interlocked.Read(ref lastBackendWarning);
        if (now - previous < TimeSpan.TicksPerMinute || Interlocked.CompareExchange(ref lastBackendWarning, now, previous) != previous) return;
        Post(new { kind = "event", @event = "backend-warning", data = "后台输出包含无法识别的内容，已忽略。" });
    }
    private void OnBackendLine(Process owner, string line) {
        Dictionary<string, object> message;
        try {
            var serializer = new JavaScriptSerializer { MaxJsonLength = 32 * 1024 * 1024, RecursionLimit = 150 };
            message = serializer.DeserializeObject(line) as Dictionary<string, object>;
            if (message == null) { WarnBackendLine(); return; }
        } catch { WarnBackendLine(); return; }
        if (backend != owner) return;
        try {
            if (Get(message, "kind") == "native") {
                if (Get(message, "method") == "browser.control") {
                    BeginInvoke(new Action(async delegate {
                        object browserResult = null; string browserError = null;
                        try { browserResult = await GetBrowserHost().Handle(Params(message)); }
                        catch (Exception failure) { browserError = failure.Message; }
                        if (backend == owner) WriteBackend(new { kind = "nativeResponse", id = message["id"], result = browserResult, error = browserError });
                    }));
                    return;
                }
                object result = null; string error = null;
                try {
                    var p = Params(message); var value = Get(p, "value"); var method = Get(message, "method");
                    if (method == "vault.encrypt") result = Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(value), Encoding.UTF8.GetBytes("QQClaw/v1"), DataProtectionScope.CurrentUser));
                    else if (method == "vault.decrypt") result = Encoding.UTF8.GetString(ProtectedData.Unprotect(Convert.FromBase64String(value), Encoding.UTF8.GetBytes("QQClaw/v1"), DataProtectionScope.CurrentUser));
                    else if (method == "desktop.status") result = DesktopIntegration.Status();
                    else if (method == "desktop.open") result = DesktopIntegration.Open(p);
                    else if (method == "shell.folder") {
                        var directory = Path.GetFullPath(Get(p, "path"));
                        if (!Directory.Exists(directory)) throw new Exception("目录不存在。");
                        Process.Start(new ProcessStartInfo("explorer.exe", Quote(directory)) { UseShellExecute = true }); result = true;
                    }
                    else if (method == "shell.reveal") {
                        var file = Path.GetFullPath(Get(p, "path"));
                        if (!File.Exists(file)) throw new Exception("附件文件已不存在。");
                        Process.Start(new ProcessStartInfo("explorer.exe", "/select," + Quote(file)) { UseShellExecute = true }); result = true;
                    }
                    else throw new Exception("未知原生操作。");
                } catch (Exception exception) { error = exception.Message; }
                WriteBackend(new { kind = "nativeResponse", id = message["id"], result = result, error = error }); return;
            }
            var id = Get(message, "id");
            lock (internalRequests) {
                TaskCompletionSource<Dictionary<string, object>> request;
                if (internalRequests.TryGetValue(id, out request) && internalOwners[id] == owner) {
                    internalRequests.Remove(id);
                    internalOwners.Remove(id);
                    if (message.ContainsKey("error")) request.TrySetException(new Exception(Get(message, "error"))); else request.TrySetResult(message);
                    return;
                }
            }
            if (String.IsNullOrEmpty(id) || TakeForwarded(id, owner)) Post(message);
        } catch { Post(new { kind = "event", @event = "backend-error", data = "后台响应格式错误，请重新启动应用。" }); }
    }
    private async Task<object> InstallCodex() {
        string node = FindNode(); if (String.IsNullOrEmpty(node)) throw new Exception("请先安装 Node.js。");
        string npm = Path.Combine(Path.GetDirectoryName(node), "node_modules", "npm", "bin", "npm-cli.js");
        if (!File.Exists(npm)) throw new Exception("未找到 npm，请使用 Node.js 官方安装器修复安装。");
        Post(new { kind = "event", @event = "install", data = "正在安装 Codex CLI…" });
        var process = new Process { StartInfo = new ProcessStartInfo(node, Quote(npm) + " install -g @openai/codex") {
            UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true } };
        process.StartInfo.EnvironmentVariables["PATH"] = FullPathEnvironment();
        process.StartInfo.WorkingDirectory = Program.DataDirectory;
        process.Start(); if (job != IntPtr.Zero) AssignProcessToJobObject(job, process.Handle);
        var output = process.StandardOutput.ReadToEndAsync(); var errors = process.StandardError.ReadToEndAsync();
        await Task.WhenAll(output, errors); await Task.Run(() => process.WaitForExit());
        if (process.ExitCode != 0) throw new Exception("Codex 安装失败，请检查网络和 npm 安装权限，或使用手动安装入口。");
        return new { installed = true, message = "Codex 安装完成，正在重启并识别环境…" };
    }
    private void StopBackend() {
        var process = backend; backend = null; if (process == null) return;
        var writer = backendInput; backendInput = null;
        if (writer != null) writer.Complete();
        try { if (!process.WaitForExit(3000)) process.Kill(); } catch { }
    }
    private async Task ShutdownBackend() {
        if (backend == null || backend.HasExited) return;
        try { await Task.WhenAny(BackendRequest("shutdown", new { }), Task.Delay(5000)); } catch { }
    }
    private async void OnClosing(object sender, FormClosingEventArgs e) {
        if (exiting) return;
        e.Cancel = true; exiting = true;
        await ShutdownBackend();
        StopBackend(); if (job != IntPtr.Zero) { CloseHandle(job); job = IntPtr.Zero; }
        Close();
    }
    [StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS { public ulong a, b, c, d, e, f; }
    [StructLayout(LayoutKind.Sequential)] struct BASIC_LIMIT { public long perProcess, perJob; public uint flags; public UIntPtr minimum, maximum; public uint active; public UIntPtr affinity; public uint priority, scheduling; }
    [StructLayout(LayoutKind.Sequential)] struct EXTENDED_LIMIT { public BASIC_LIMIT basic; public IO_COUNTERS io; public UIntPtr processMemory, jobMemory, peakProcess, peakJob; }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref EXTENDED_LIMIT info, uint size);
    [DllImport("kernel32.dll")] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    private void CreateJob() {
        job = CreateJobObject(IntPtr.Zero, null); var info = new EXTENDED_LIMIT(); info.basic.flags = 0x2000;
        if (job != IntPtr.Zero) SetInformationJobObject(job, 9, ref info, (uint)Marshal.SizeOf(typeof(EXTENDED_LIMIT)));
    }
}

// A pipe write may block even when the process is alive. Never perform it on
// the UI thread or inside OutputDataReceived: Windows Node stdout writes can
// also block, making both sides wait for each other to drain the opposite pipe.
internal sealed class BackendPipeWriter {
    private readonly BlockingCollection<string> queue = new BlockingCollection<string>();
    private readonly object gate = new object();
    private long queuedCharacters;
    private bool completed;
    private const long MaximumQueuedCharacters = 32 * 1024 * 1024;

    internal BackendPipeWriter(Stream stream, Action failed) {
        Task.Factory.StartNew(delegate {
            try {
                using (var writer = new StreamWriter(stream, new UTF8Encoding(false)) { AutoFlush = true }) {
                    foreach (var line in queue.GetConsumingEnumerable()) {
                        lock (gate) queuedCharacters -= line.Length;
                        writer.WriteLine(line);
                    }
                }
            } catch {
                lock (gate) { completed = true; queue.CompleteAdding(); }
                try { failed(); } catch { }
            } finally {
                lock (gate) { completed = true; queue.Dispose(); }
            }
        }, CancellationToken.None, TaskCreationOptions.LongRunning, TaskScheduler.Default);
    }
    internal void Enqueue(string line) {
        lock (gate) {
            if (completed) throw new IOException("后台通信已经结束。");
            if (queuedCharacters + line.Length > MaximumQueuedCharacters) throw new IOException("后台通信队列已满，请等待当前操作完成。");
            queue.Add(line);
            queuedCharacters += line.Length;
        }
    }
    internal void Complete() {
        lock (gate) {
            if (completed) return;
            completed = true;
            queue.CompleteAdding();
        }
    }
}
