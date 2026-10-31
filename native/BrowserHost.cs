using System;
using System.IO;
using System.Drawing;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

// Web content never receives QQClaw's application messaging bridge. Each owner
// has its own window; profiles are scoped to the WeChat account or local chat.
internal sealed class BrowserHost {
    private readonly Form parent;
    private readonly Dictionary<string, BrowserWindow> windows = new Dictionary<string, BrowserWindow>();
    internal BrowserHost(Form owner) { parent = owner; }
    internal async Task<object> Handle(Dictionary<string, object> p) {
        string owner = Value(p, "owner"), action = Value(p, "action");
        Guid id;
        if (!Guid.TryParseExact(owner, "D", out id)) throw new Exception("浏览器会话无效。");
        BrowserWindow window;
        if (action == "stop") {
            if (windows.TryGetValue(owner, out window) && !window.IsDisposed) window.Stop();
            return new { stopped = true };
        }
        if (!windows.TryGetValue(owner, out window) || window.IsDisposed) {
            string profile = Value(p, "profile");
            if (!System.Text.RegularExpressions.Regex.IsMatch(profile, "^[0-9a-f]{32}$")) throw new Exception("浏览器用户目录无效。");
            window = new BrowserWindow(parent, profile); windows[owner] = window;
        }
        return await window.Run(p);
    }
    internal static string Value(Dictionary<string, object> p, string key) {
        object v; return p.TryGetValue(key, out v) && v != null ? Convert.ToString(v) : "";
    }
    internal static bool Allowed(string value) {
        Uri uri;
        return Uri.TryCreate(value, UriKind.Absolute, out uri) && (uri.Scheme == "http" || uri.Scheme == "https") && String.IsNullOrEmpty(uri.UserInfo) && !String.Equals(uri.Host, "qqclaw.local", StringComparison.OrdinalIgnoreCase);
    }
}

internal sealed class BrowserWindow : Form {
    private readonly WebView2 web = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.White };
    private readonly TextBox address = new TextBox { Dock = DockStyle.Fill, Font = new Font("Segoe UI", 11), BorderStyle = BorderStyle.FixedSingle };
    private readonly Label status = new Label { Dock = DockStyle.Bottom, Height = 24, Text = "QQClaw 内置浏览器", Padding = new Padding(8, 4, 0, 0) };
    private readonly SemaphoreSlim serial = new SemaphoreSlim(1, 1);
    private readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 8 * 1024 * 1024, RecursionLimit = 100 };
    private readonly string profile;
    private Task ready;
    private bool stopping;
    internal BrowserWindow(Form owner, string browserProfile) {
        profile = browserProfile; Owner = owner;
        Text = "QQClaw · 内置浏览器"; Size = new Size(1180, 820); MinimumSize = new Size(720, 480);
        StartPosition = FormStartPosition.CenterScreen; BackColor = Color.White; AutoScaleMode = AutoScaleMode.Dpi;
        var bar = new Panel { Dock = DockStyle.Top, Height = 42, Padding = new Padding(8, 7, 8, 6) };
        var back = new Button { Dock = DockStyle.Left, Width = 44, Text = "←" };
        var reload = new Button { Dock = DockStyle.Left, Width = 44, Text = "↻" };
        var go = new Button { Dock = DockStyle.Right, Width = 60, Text = "打开" };
        bar.Controls.Add(address); bar.Controls.Add(go); bar.Controls.Add(reload); bar.Controls.Add(back);
        Controls.Add(web); Controls.Add(status); Controls.Add(bar);
        back.Click += delegate { if (web.CoreWebView2 != null && web.CoreWebView2.CanGoBack) web.CoreWebView2.GoBack(); };
        reload.Click += delegate { if (web.CoreWebView2 != null) web.CoreWebView2.Reload(); };
        go.Click += async delegate { await ManualOpen(); };
        address.KeyDown += async delegate(object sender, KeyEventArgs e) { if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; await ManualOpen(); } };
        FormClosing += delegate(object sender, FormClosingEventArgs e) { if (e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; Hide(); } };
    }
    private async Task Initialize() {
        var environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(Program.DataDirectory, "browsers", profile));
        await web.EnsureCoreWebView2Async(environment);
        web.CoreWebView2.Settings.IsWebMessageEnabled = false;
        web.CoreWebView2.Settings.AreHostObjectsAllowed = false;
        web.CoreWebView2.Settings.AreDevToolsEnabled = false;
        web.CoreWebView2.Settings.IsStatusBarEnabled = false;
        web.CoreWebView2.NavigationStarting += delegate(object sender, CoreWebView2NavigationStartingEventArgs e) {
            if (e.Uri != "about:blank" && !BrowserHost.Allowed(e.Uri)) { e.Cancel = true; status.Text = "已阻止不支持的链接。"; }
        };
        web.CoreWebView2.SourceChanged += delegate { address.Text = web.CoreWebView2.Source; };
        web.CoreWebView2.DocumentTitleChanged += delegate { Text = "QQClaw · " + web.CoreWebView2.DocumentTitle; };
        web.CoreWebView2.NewWindowRequested += delegate(object sender, CoreWebView2NewWindowRequestedEventArgs e) {
            e.Handled = true; if (BrowserHost.Allowed(e.Uri)) web.CoreWebView2.Navigate(e.Uri);
        };
        web.CoreWebView2.PermissionRequested += delegate(object sender, CoreWebView2PermissionRequestedEventArgs e) { e.State = CoreWebView2PermissionState.Deny; };
        web.CoreWebView2.DownloadStarting += delegate(object sender, CoreWebView2DownloadStartingEventArgs e) { e.Cancel = true; status.Text = "此版内置浏览器支持网页操作，下载请使用系统浏览器。"; };
    }
    internal void Stop() { stopping = true; if (web.CoreWebView2 != null) web.CoreWebView2.Stop(); }
    private async Task ManualOpen() {
        try { await Run(new Dictionary<string, object> { { "action", "open" }, { "url", address.Text.Trim() } }); }
        catch (Exception e) { status.Text = e.Message; }
    }
    private async Task Navigate(Action action) {
        var result = new TaskCompletionSource<bool>();
        EventHandler<CoreWebView2NavigationCompletedEventArgs> completed = null;
        completed = delegate(object sender, CoreWebView2NavigationCompletedEventArgs e) {
            if (e.IsSuccess) result.TrySetResult(true);
            else result.TrySetException(new Exception(stopping ? "浏览器操作已停止。" : "网页未能加载：" + e.WebErrorStatus));
        };
        web.CoreWebView2.NavigationCompleted += completed;
        try {
            action();
            if (await Task.WhenAny(result.Task, Task.Delay(25000)) != result.Task) { web.CoreWebView2.Stop(); throw new Exception("网页加载超时，请重试或检查网络。"); }
            await result.Task;
        } finally { web.CoreWebView2.NavigationCompleted -= completed; }
    }
    private async Task<object> Page(Dictionary<string, object> p) {
        string script = File.ReadAllText(Path.Combine(Program.RuntimeDirectory, "browser-page.js"));
        // ExecuteScriptAsync returns a JSON representation of the script result.
        var output = await web.CoreWebView2.ExecuteScriptAsync("(() => { try { " + script + "\nreturn { ok: true, value: qqclawBrowserPage(" + json.Serialize(p) + ") }; } catch (e) { return { ok: false, error: String(e.message || e) }; } })()");
        var response = json.Deserialize<Dictionary<string, object>>(output);
        if (response == null || !response.ContainsKey("ok")) throw new Exception("无法读取网页，页面可能正在跳转，请重试快照。");
        if (!(bool)response["ok"]) throw new Exception(Convert.ToString(response["error"]));
        return response["value"];
    }
    internal async Task<object> Run(Dictionary<string, object> p) {
        await serial.WaitAsync();
        try {
            stopping = false;
            if (!Visible) Show();
            ready = ready ?? Initialize(); await ready;
            string action = BrowserHost.Value(p, "action");
            status.Text = "正在执行：" + action;
            object result;
            if (action == "open") {
                string url = BrowserHost.Value(p, "url"); if (!BrowserHost.Allowed(url)) throw new Exception("浏览器仅支持 HTTP/HTTPS 网页。");
                await Navigate(() => web.CoreWebView2.Navigate(url));
                result = await Page(new Dictionary<string, object> { { "action", "snapshot" } });
            } else if (action == "back") {
                if (web.CoreWebView2.CanGoBack) await Navigate(() => web.CoreWebView2.GoBack());
                result = await Page(new Dictionary<string, object> { { "action", "snapshot" } });
            } else if (action == "screenshot") {
                using (var stream = new MemoryStream()) { await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, stream); result = new { url = web.CoreWebView2.Source, imageBase64 = Convert.ToBase64String(stream.ToArray()) }; }
            } else result = await Page(p);
            status.Text = "QQClaw 内置浏览器 · " + web.CoreWebView2.Source;
            return result;
        } finally { serial.Release(); }
    }
}
