using System;
using System.IO;
using System.Drawing;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

// Untrusted pages are native child controls. They receive neither QQClaw's
// application message bridge nor its virtual host mapping.
internal sealed class BrowserHost {
    private readonly Form parent;
    private readonly Action<object> notify;
    private readonly Dictionary<string, BrowserSession> sessions = new Dictionary<string, BrowserSession>();
    private string visibleOwner = "";
    private Rectangle bounds = new Rectangle(-2000, 0, 1000, 760);
    private bool visible;
    internal BrowserHost(Form parent, Action<object> notify) { this.parent = parent; this.notify = notify; }
    internal void SetView(Dictionary<string, object> p) {
        visibleOwner = Value(p, "owner");
        double width = Number(p, "viewportWidth"), height = Number(p, "viewportHeight");
        visible = p.ContainsKey("visible") && p["visible"] is bool && (bool)p["visible"] && width > 0 && height > 0;
        if (visible) {
            double sx = parent.ClientSize.Width / width, sy = parent.ClientSize.Height / height;
            bounds = Rectangle.Intersect(parent.ClientRectangle, new Rectangle(
                (int)Math.Round(Number(p, "x") * sx), (int)Math.Round(Number(p, "y") * sy),
                Math.Max(0, (int)Math.Round(Number(p, "width") * sx)), Math.Max(0, (int)Math.Round(Number(p, "height") * sy))));
        }
        Layout();
    }
    private static double Number(Dictionary<string, object> p, string key) {
        double value; return Double.TryParse(Value(p, key), out value) && !Double.IsInfinity(value) && !Double.IsNaN(value) ? Math.Max(-10000, Math.Min(30000, value)) : 0;
    }
    private void Layout() {
        foreach (var pair in sessions) foreach (var tab in pair.Value.Tabs) {
            bool show = visible && pair.Key == visibleOwner && pair.Value.Active == tab && bounds.Width > 0 && bounds.Height > 0;
            tab.Web.Bounds = show ? bounds : new Rectangle(-2000, 0, 1000, 760);
            tab.Web.Visible = show;
            if (show) tab.Web.BringToFront();
        }
    }
    internal async Task<object> Handle(Dictionary<string, object> p) {
        string owner = Value(p, "owner"), action = Value(p, "action"); Guid id;
        if (!Guid.TryParseExact(owner, "D", out id)) throw new Exception("浏览器会话无效。");
        BrowserSession session;
        if (action == "stop") {
            if (sessions.TryGetValue(owner, out session)) foreach (var tab in session.Tabs) tab.Stop();
            return new { stopped = true };
        }
        if (!sessions.TryGetValue(owner, out session)) {
            string profile = Value(p, "profile");
            if (!System.Text.RegularExpressions.Regex.IsMatch(profile, "^[0-9a-f]{32}$")) throw new Exception("浏览器用户目录无效。");
            session = new BrowserSession(owner, profile); sessions[owner] = session;
        }
        await session.Serial.WaitAsync();
        try {
            if (action == "newTab") NewTab(session);
            else if (action == "selectTab" || action == "closeTab") {
                var tab = session.Tabs.Find(t => t.Id == Value(p, "tabId"));
                if (tab == null) throw new Exception("浏览器标签页已关闭。");
                if (action == "selectTab") session.Active = tab;
                else {
                    int index = session.Tabs.IndexOf(tab); session.Tabs.Remove(tab);
                    if (session.Active == tab) session.Active = session.Tabs.Count == 0 ? null : session.Tabs[Math.Min(index, session.Tabs.Count - 1)];
                    tab.Web.Dispose();
                }
            }
            // Empty sessions stay empty after the last tab closes. Only an
            // explicit new tab or navigation creates a replacement page.
            if (session.Active == null && action == "open") NewTab(session);
            Layout(); Publish(session, action == "open" || action == "newTab");
            if (new [] { "state", "newTab", "selectTab", "closeTab" }.Contains(action)) return State(session, false);
            if (session.Active == null) throw new Exception("没有打开的标签页，请先打开网页。");
            return await session.Active.Run(p);
        } finally { Publish(session, false); session.Serial.Release(); }
    }
    private void NewTab(BrowserSession session) {
        if (session.Tabs.Count >= 12) throw new Exception("最多打开 12 个标签页，请先关闭不用的页面。");
        var tab = new BrowserTab(parent, session.Profile, () => Publish(session, false));
        session.Tabs.Add(tab); session.Active = tab;
    }
    private object State(BrowserSession s, bool reveal) {
        var tab = s.Active;
        return new { owner = s.Owner, reveal = reveal, activeTab = tab == null ? "" : tab.Id,
            tabs = s.Tabs.Select(t => new { id = t.Id, title = t.Title, url = t.Url, loading = t.Loading }).ToArray(),
            url = tab == null ? "" : tab.Url, title = tab == null ? "" : tab.Title, loading = tab != null && tab.Loading,
            canGoBack = tab != null && tab.CanGoBack, canGoForward = tab != null && tab.CanGoForward, error = tab == null ? "" : tab.Error };
    }
    private void Publish(BrowserSession session, bool reveal) { notify(State(session, reveal)); }
    internal static string Value(Dictionary<string, object> p, string key) {
        object v; return p.TryGetValue(key, out v) && v != null ? Convert.ToString(v) : "";
    }
    internal static bool Allowed(string value) {
        Uri uri;
        return Uri.TryCreate(value, UriKind.Absolute, out uri) && (uri.Scheme == "http" || uri.Scheme == "https") && String.IsNullOrEmpty(uri.UserInfo) && !String.Equals(uri.Host, "qqclaw.local", StringComparison.OrdinalIgnoreCase);
    }
}
internal sealed class BrowserSession {
    internal string Owner, Profile;
    internal readonly List<BrowserTab> Tabs = new List<BrowserTab>();
    internal BrowserTab Active;
    internal readonly SemaphoreSlim Serial = new SemaphoreSlim(1, 1);
    internal BrowserSession(string owner, string profile) { Owner = owner; Profile = profile; }
}
internal sealed class BrowserTab {
    internal readonly string Id = Guid.NewGuid().ToString("D");
    internal readonly WebView2 Web = new WebView2 { DefaultBackgroundColor = Color.White, Visible = false };
    internal bool Loading;
    internal string Error = "";
    internal string Url { get { return Web.CoreWebView2 == null || Web.CoreWebView2.Source == "about:blank" ? "" : Web.CoreWebView2.Source; } }
    internal string Title { get { return Web.CoreWebView2 == null || String.IsNullOrEmpty(Web.CoreWebView2.DocumentTitle) ? "新标签页" : Web.CoreWebView2.DocumentTitle; } }
    internal bool CanGoBack { get { return Web.CoreWebView2 != null && Web.CoreWebView2.CanGoBack; } }
    internal bool CanGoForward { get { return Web.CoreWebView2 != null && Web.CoreWebView2.CanGoForward; } }
    private readonly Action changed;
    private readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 8 * 1024 * 1024, RecursionLimit = 100 };
    private readonly string profile;
    private Task ready;
    private bool stopping;
    internal BrowserTab(Form parent, string profile, Action changed) {
        this.profile = profile; this.changed = changed;
        Web.Bounds = new Rectangle(-2000, 0, 1000, 760); parent.Controls.Add(Web);
    }
    private async Task Initialize() {
        var environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(Program.DataDirectory, "browsers", profile));
        await Web.EnsureCoreWebView2Async(environment);
        Web.CoreWebView2.Settings.IsWebMessageEnabled = false;
        Web.CoreWebView2.Settings.AreHostObjectsAllowed = false;
        Web.CoreWebView2.Settings.AreDevToolsEnabled = false;
        Web.CoreWebView2.Settings.IsStatusBarEnabled = false;
        Web.CoreWebView2.NavigationStarting += delegate(object sender, CoreWebView2NavigationStartingEventArgs e) {
            if (e.Uri != "about:blank" && !BrowserHost.Allowed(e.Uri)) { e.Cancel = true; Error = "已阻止不支持的链接。"; }
            else { Loading = true; Error = ""; }
            changed();
        };
        Web.CoreWebView2.NavigationCompleted += delegate(object sender, CoreWebView2NavigationCompletedEventArgs e) {
            Loading = false; Error = e.IsSuccess || stopping ? "" : "网页未能加载：" + e.WebErrorStatus; changed();
        };
        Web.CoreWebView2.SourceChanged += delegate { changed(); };
        Web.CoreWebView2.DocumentTitleChanged += delegate { changed(); };
        Web.CoreWebView2.HistoryChanged += delegate { changed(); };
        Web.CoreWebView2.NewWindowRequested += delegate(object sender, CoreWebView2NewWindowRequestedEventArgs e) {
            e.Handled = true; if (BrowserHost.Allowed(e.Uri)) Web.CoreWebView2.Navigate(e.Uri);
        };
        Web.CoreWebView2.PermissionRequested += delegate(object sender, CoreWebView2PermissionRequestedEventArgs e) { e.State = CoreWebView2PermissionState.Deny; };
        Web.CoreWebView2.DownloadStarting += delegate(object sender, CoreWebView2DownloadStartingEventArgs e) { e.Cancel = true; Error = "下载请在系统浏览器中完成。"; changed(); };
    }
    internal void Stop() { stopping = true; if (Web.CoreWebView2 != null) Web.CoreWebView2.Stop(); Loading = false; changed(); }
    private async Task Navigate(Action action) {
        var result = new TaskCompletionSource<bool>();
        EventHandler<CoreWebView2NavigationCompletedEventArgs> completed = null;
        completed = delegate(object sender, CoreWebView2NavigationCompletedEventArgs e) {
            if (e.IsSuccess) result.TrySetResult(true);
            else result.TrySetException(new Exception(stopping ? "浏览器操作已停止。" : "网页未能加载：" + e.WebErrorStatus));
        };
        Web.CoreWebView2.NavigationCompleted += completed;
        try {
            action();
            if (await Task.WhenAny(result.Task, Task.Delay(25000)) != result.Task) { Web.CoreWebView2.Stop(); throw new Exception("网页加载超时，请重试或检查网络。"); }
            await result.Task;
        } finally { Web.CoreWebView2.NavigationCompleted -= completed; }
    }
    private async Task<object> Page(Dictionary<string, object> p) {
        string script = File.ReadAllText(Path.Combine(Program.RuntimeDirectory, "browser-page.js"));
        var output = await Web.CoreWebView2.ExecuteScriptAsync("(() => { try { " + script + "\nreturn { ok: true, value: qqclawBrowserPage(" + json.Serialize(p) + ") }; } catch (e) { return { ok: false, error: String(e.message || e) }; } })()");
        var response = json.Deserialize<Dictionary<string, object>>(output);
        if (response == null || !response.ContainsKey("ok")) throw new Exception("无法读取网页，页面可能正在跳转，请重试快照。");
        if (!(bool)response["ok"]) throw new Exception(Convert.ToString(response["error"]));
        return response["value"];
    }
    internal async Task<object> Run(Dictionary<string, object> p) {
        try {
            stopping = false; ready = ready ?? Initialize(); await ready;
            string action = BrowserHost.Value(p, "action");
            if (action == "open") {
                string url = BrowserHost.Value(p, "url"); if (!BrowserHost.Allowed(url)) throw new Exception("浏览器仅支持 HTTP/HTTPS 网页。");
                await Navigate(() => Web.CoreWebView2.Navigate(url));
            } else if (action == "back" && CanGoBack) await Navigate(() => Web.CoreWebView2.GoBack());
            else if (action == "forward" && CanGoForward) await Navigate(() => Web.CoreWebView2.GoForward());
            else if (action == "reload") await Navigate(() => Web.CoreWebView2.Reload());
            else if (action == "screenshot") {
                using (var stream = new MemoryStream()) { await Web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, stream); return new { url = Url, imageBase64 = Convert.ToBase64String(stream.ToArray()) }; }
            } else if (action != "back" && action != "forward") return await Page(p);
            return await Page(new Dictionary<string, object> { { "action", "snapshot" } });
        } catch (Exception e) { Error = e.Message; throw; }
    }
}
