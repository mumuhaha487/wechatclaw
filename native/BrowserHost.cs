using System;
using System.IO;
using System.Drawing;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

// Untrusted pages are native child controls. They receive neither QQClaw's
// application message bridge nor its virtual host mapping.
internal sealed class BrowserHost {
    private readonly Form parent;
    private readonly Action<object> notify;
    private readonly Action<object> shortcutNotify;
    private readonly Dictionary<string, BrowserSession> sessions = new Dictionary<string, BrowserSession>();
    private readonly HashSet<string> disposedOwners = new HashSet<string>();
    private readonly Func<CefEngineFiles> cefFiles;
    private readonly Action<Process> attachProcess;
    private readonly object cefLogGate = new object();
    private string visibleOwner = "";
    private Rectangle bounds = new Rectangle(-2000, 0, 1000, 760);
    private bool visible;
    internal readonly BrowserDownloads Downloads;
    internal readonly BrowserHistory History;
    internal BrowserHost(Form parent, Action<object> notify, Action<object> downloadNotify = null, Action<object> historyNotify = null, Action<object> shortcutNotify = null, Func<CefEngineFiles> cefFiles = null, Action<Process> attachProcess = null) {
        this.parent = parent; this.notify = notify; Downloads = new BrowserDownloads(downloadNotify ?? delegate { });
        this.shortcutNotify = shortcutNotify ?? delegate { };
        History = new BrowserHistory(historyNotify ?? delegate { });
        this.cefFiles = cefFiles ?? (() => CefBrowserRuntime.RequireFiles());
        this.attachProcess = attachProcess ?? delegate { };
    }
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
        foreach (var pair in sessions) {
            foreach (var tab in pair.Value.Tabs) {
                bool show = visible && pair.Key == visibleOwner && !pair.Value.CefSelected && pair.Value.Active == tab && bounds.Width > 0 && bounds.Height > 0;
                tab.Web.Bounds = show ? bounds : new Rectangle(-2000, 0, 1000, 760);
                tab.Web.Visible = show;
                if (show) tab.Web.BringToFront();
            }
            if (pair.Value.Cef != null) pair.Value.Cef.SetView(visible && pair.Key == visibleOwner && pair.Value.CefSelected && bounds.Width > 0 && bounds.Height > 0,
                bounds.X, bounds.Y, Math.Max(1, bounds.Width), Math.Max(1, bounds.Height));
        }
    }
    internal async Task<bool> FocusAsync(string owner, string tabId) {
        BrowserSession session;
        if (!visible || owner != visibleOwner || !sessions.TryGetValue(owner, out session) || session.Disposed) return false;
        if (!session.CefSelected) return Focus(owner, tabId);
        if (session.Cef == null || Value(session.Cef.State, "activeTab") != tabId) return false;
        await session.Cef.Call("focus", new Dictionary<string, object> { { "tabId", tabId } }); return true;
    }
    internal bool Focus(string owner, string tabId) {
        BrowserSession session;
        if (!visible || owner != visibleOwner || !sessions.TryGetValue(owner, out session) || session.Disposed || session.CefSelected || session.Active == null || session.Active.Id != tabId || !session.Active.Web.Visible) return false;
        return session.Active.Web.Focus();
    }
    private void Shortcut(BrowserSession session, BrowserTab tab, string command) {
        if (!visible || session.Owner != visibleOwner || session.Disposed || session.Active != tab || !tab.Web.ContainsFocus || parent.IsDisposed || !parent.IsHandleCreated) return;
        // Native keyboard notifications are synchronous. Dispatch on the next UI
        // turn before focusing the application view or posting across WebViews.
        try {
            parent.BeginInvoke(new Action(delegate {
                if (parent.IsDisposed || session.Disposed || !visible || visibleOwner != session.Owner || session.Active != tab) return;
                shortcutNotify(new { owner = session.Owner, tabId = tab.Id, command = command });
            }));
        } catch (InvalidOperationException) { /* The window has already closed. */ }
    }
    internal async Task<object> Handle(Dictionary<string, object> p) {
        string owner = Value(p, "owner"), action = Value(p, "action"); Guid id;
        if (!Guid.TryParseExact(owner, "D", out id)) throw new Exception("浏览器会话无效。");
        BrowserSession session;
        if (disposedOwners.Contains(owner) && action != "dispose") {
            throw new Exception("浏览器会话已关闭。");
        }
        if (sessions.TryGetValue(owner, out session) && action != "dispose" && action != "prepareOfficial") {
            string requested = Value(p, "tabId");
            bool cefTarget = requested.StartsWith("cef:", StringComparison.Ordinal) || requested == "" && session.CefSelected;
            if (action == "state") return State(session, false);
            if (session.Cef != null && (cefTarget || action == "newTab" || action == "restoreTab")) {
                if (session.Disposed) throw new Exception("浏览器会话已关闭。");
                var result = await session.Cef.Call(action, p);
                if (session.Disposed) throw new Exception("浏览器会话已关闭。");
                if (action == "selectTab" || action == "newTab" || action == "open") session.CefSelected = true;
                if (CefTabs(session).Length == 0 && session.Tabs.Count > 0) session.CefSelected = false;
                Layout(); Publish(session, action == "newTab");
                if (action == "restoreTab") return new { tabId = Value(result, "tabId"), state = State(session, false) };
                if (action == "find") return result;
                return State(session, false);
            }
            if (requested != "" && cefTarget) throw new Exception("浏览器标签页已关闭。");
            if (action == "selectTab") { session.CefSelected = false; session.LastCefActive = session.Cef == null ? "" : Value(session.Cef.State, "activeTab"); }
        }
        if (action == "stop") {
            if (sessions.TryGetValue(owner, out session)) {
                foreach (var page in session.Tabs) if (Value(p, "tabId") == "" || Value(p, "tabId") == page.Id) page.Stop();
            }
            return new { stopped = true };
        }
        if (action == "find") {
            if (!sessions.TryGetValue(owner, out session) || session.Disposed) throw new Exception("浏览器会话已关闭。");
            var page = session.Tabs.Find(t => t.Id == Value(p, "tabId"));
            if (page == null) throw new Exception("浏览器标签页已关闭。");
            return await page.Find(p);
        }
        if (action == "dispose") {
            disposedOwners.Add(owner);
            if (sessions.TryGetValue(owner, out session)) {
                if (session.Disposal == null) session.Disposal = DisposeSession(session);
                await session.Disposal;
            }
            return new { disposed = true };
        }
        if (!sessions.TryGetValue(owner, out session)) {
            string profile = Value(p, "profile");
            if (!System.Text.RegularExpressions.Regex.IsMatch(profile, "^[0-9a-f]{32}$")) throw new Exception("浏览器用户目录无效。");
            session = new BrowserSession(owner, profile); sessions[owner] = session;
        }
        if (session.Disposed) throw new Exception("浏览器会话已关闭。");
        if (action == "prepareOfficial") {
            if (Value(p, "extensionId") != "hehggadaopoacecdllhhajmbjkdcmajg") throw new Exception("只允许官方 ChatGPT 扩展。");
            string extensionPath = Path.GetFullPath(Value(p, "extensionPath"));
            if (!File.Exists(Path.Combine(extensionPath, "manifest.json"))) throw new Exception("未找到官方 ChatGPT 扩展文件。");
            string automationProfile = Value(p, "profile");
            if (!System.Text.RegularExpressions.Regex.IsMatch(automationProfile, "^[0-9a-f]{32}$")) throw new Exception("浏览器用户目录无效。");
            if (session.CefPreparing != null && session.CefPreparing.IsCompleted && (session.CefPreparing.IsFaulted || session.CefPreparing.IsCanceled) && (session.Cef == null || !session.Cef.Running)) {
                session.Cef = null; session.CefPreparing = null;
            }
            if (session.Cef != null && session.OfficialExtensionPath != extensionPath) throw new Exception("官方扩展已更新，请结束当前浏览器会话后重新连接。");
            if (session.CefPreparing == null && session.Cef == null) session.CefPreparing = PrepareCef(session, extensionPath);
            if (session.CefPreparing != null) await session.CefPreparing;
            if (session.Disposed || session.Cef == null) throw new Exception("浏览器会话已关闭。");
            Publish(session, false);
            return new { applicationPath = Application.ExecutablePath, applicationProcessId = Process.GetCurrentProcess().Id, browserProcessId = session.Cef.ProcessId,
                extensionId = "hehggadaopoacecdllhhajmbjkdcmajg", tabId = Value(session.Cef.State, "activeTab"), engine = "cef", browserFamily = "chrome", tabCreation = true };
        }
        if (action == "restoreTab") {
            string url = Value(p, "url");
            if (url != "" && !Allowed(url)) throw new Exception("浏览器仅支持 HTTP/HTTPS 网页。");
            var previous = session.Active;
            var restored = NewTab(session); session.Active = previous; Layout();
            try {
                if (url != "") await restored.Restore(url);
                return new { tabId = restored.Id, state = State(session, false) };
            } catch { CloseTab(session, restored); throw; }
        }
        if (action == "newTab") NewTab(session);
        else if (action == "selectTab" || action == "closeTab") {
            var tab = session.Tabs.Find(t => t.Id == Value(p, "tabId"));
            if (tab == null) throw new Exception("浏览器标签页已关闭。");
            if (action == "selectTab") { session.Active = tab; session.CefSelected = false; session.LastCefActive = session.Cef == null ? "" : Value(session.Cef.State, "activeTab"); }
            else CloseTab(session, tab);
        }
        if (new [] { "state", "newTab", "selectTab", "closeTab" }.Contains(action)) { Layout(); Publish(session, action == "newTab"); return State(session, false); }
        string targetId = Value(p, "tabId");
        var target = targetId == "" ? session.Active : session.Tabs.Find(t => t.Id == targetId);
        if (targetId != "" && target == null) throw new Exception("浏览器标签页已关闭。");
        if (action == "open" && !Allowed(Value(p, "url"))) throw new Exception("浏览器仅支持 HTTP/HTTPS 网页。");
        // Capture the actual target before any await. Later selection cannot
        // redirect queued work into a different page.
        if (target == null && action == "open") target = NewTab(session);
        if (target == null) throw new Exception("没有打开的标签页，请先打开网页。");
        int revision = new [] { "open", "back", "forward", "reload" }.Contains(action) ? target.BeginNavigation(action == "open" ? Value(p, "url") : "") : target.OperationRevision;
        Task interrupted = target.OperationInterruption;
        Layout(); Publish(session, action == "open" && session.Active == target);
        await target.Serial.WaitAsync();
        try {
            if (session.Disposed || !session.Tabs.Contains(target)) throw new Exception("浏览器标签页已关闭。");
            return await target.Run(p, revision, interrupted);
        } finally { target.Serial.Release(); Publish(session, false); }
    }
    private BrowserTab NewTab(BrowserSession session) {
        if (session.Tabs.Count >= 12) throw new Exception("最多打开 12 个标签页，请先关闭不用的页面。");
        var tab = new BrowserTab(parent, session.Profile, () => Publish(session, false), Downloads, session.Owner, History,
            opener => OpenWindow(session, opener), page => CloseTab(session, page), (page, command) => Shortcut(session, page, command));
        session.Tabs.Add(tab); session.Active = tab; session.CefSelected = false;
        return tab;
    }
    private void CloseTab(BrowserSession session, BrowserTab tab) {
        int index = session.Tabs.IndexOf(tab); if (index < 0 || session.Disposed) return;
        session.Tabs.RemoveAt(index);
        if (session.Active == tab) session.Active = session.Tabs.Count == 0 ? null : session.Tabs[Math.Min(index, session.Tabs.Count - 1)];
        if (session.Active == null && CefTabs(session).Length > 0) session.CefSelected = true;
        tab.Close(); Layout(); Publish(session, false);
    }
    private async Task<BrowserTab> OpenWindow(BrowserSession session, BrowserTab opener) {
        if (session.Disposed || !session.Tabs.Contains(opener)) throw new Exception("来源标签页已关闭。");
        var previous = session.Active;
        var tab = NewTab(session); Layout(); Publish(session, false);
        try {
            // A native window target must share the opener's exact environment,
            // remain unnavigated, and be returned to WebView2. Navigating its URL
            // ourselves would lose POST bodies, window.opener and window names.
            await tab.EnsureReady(opener.Web.CoreWebView2.Environment);
            if (session.Disposed || !session.Tabs.Contains(opener) || !session.Tabs.Contains(tab)) throw new Exception("来源或新标签页已关闭。");
            return tab;
        } catch {
            bool selected = session.Active == tab;
            CloseTab(session, tab);
            if (selected && !session.Disposed && session.Tabs.Contains(previous)) session.Active = previous;
            Layout(); Publish(session, false); throw;
        }
    }
    private object State(BrowserSession s, bool reveal) {
        var tab = s.Active;
        var cef = s.Cef == null ? null : s.Cef.State;
        var all = s.Tabs.Select(t => (object)new { id = t.Id, title = t.Title, url = t.DisplayUrl, loading = t.Loading }).ToList();
        all.AddRange(CefTabs(s));
        if (s.CefSelected && cef != null) {
            return new { owner = s.Owner, revision = ++s.Revision, reveal = reveal, activeTab = Value(cef, "activeTab"), tabs = all.ToArray(),
                url = Value(cef, "url") == "about:blank" ? "" : Value(cef, "url"), title = Value(cef, "title"),
                loading = Flag(cef, "loading"), canGoBack = Flag(cef, "canGoBack"), canGoForward = Flag(cef, "canGoForward"), error = Value(cef, "error"), engine = "cef" };
        }
        return new { owner = s.Owner, revision = ++s.Revision, reveal = reveal, activeTab = tab == null ? "" : tab.Id,
            tabs = all.ToArray(),
            url = tab == null ? "" : tab.DisplayUrl, title = tab == null ? "" : tab.Title, loading = tab != null && tab.Loading,
            canGoBack = tab != null && tab.CanGoBack, canGoForward = tab != null && tab.CanGoForward, error = tab == null ? "" : tab.Error };
    }
    private void Publish(BrowserSession session, bool reveal) { if (!session.Disposed) notify(State(session, reveal)); }
    private static bool Flag(Dictionary<string, object> p, string key) { object value; return p != null && p.TryGetValue(key, out value) && Object.Equals(value, true); }
    private static object[] CefTabs(BrowserSession session) {
        object raw;
        if (session.Cef == null || session.Cef.State == null || !session.Cef.State.TryGetValue("tabs", out raw)) return new object[0];
        return ((System.Collections.IEnumerable)raw).Cast<object>().Select(item => {
            var tab = new Dictionary<string, object>((Dictionary<string, object>)item);
            if (Value(tab, "url") == "about:blank") tab["url"] = "";
            if (Value(tab, "title") == "about:blank" || Value(tab, "title") == "") tab["title"] = "新标签页";
            return (object)tab;
        }).ToArray();
    }
    private void CefChanged(BrowserSession session, Dictionary<string, object> state) {
        if (session.Disposed || session.Cef == null || !Object.ReferenceEquals(session.Cef.State, state) || !sessions.ContainsKey(session.Owner) || sessions[session.Owner] != session) return;
        string next = Value(state, "activeTab");
        if (next != "" && next != session.LastCefActive) session.CefSelected = true;
        session.LastCefActive = next;
        if (next == "" && session.Tabs.Count > 0) session.CefSelected = false;
        Layout(); Publish(session, false);
    }
    private async Task PrepareCef(BrowserSession session, string extensionPath) {
        var engine = new CefBrowserEngine(parent, session.Owner, cefFiles(), state => CefChanged(session, state), message => {
            try { lock (cefLogGate) { var directory = Path.Combine(Program.DataDirectory, "logs"); Directory.CreateDirectory(directory); File.AppendAllText(Path.Combine(directory, "browser-native.log"), message + Environment.NewLine, Encoding.UTF8); } } catch { }
        }, attachProcess);
        session.Cef = engine; session.OfficialExtensionPath = extensionPath;
        string profile;
        using (var sha = SHA256.Create()) profile = BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(Program.DataDirectory.ToLowerInvariant() + ":" + session.Owner))).Replace("-", "").ToLowerInvariant().Substring(0, 32);
        string data = Path.Combine(Program.DataDirectory, "browser-runtime", session.Owner);
        Exception failure = null;
        try { await engine.Start(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "QQClaw", "browser-profiles", profile), extensionPath, Path.Combine(data, "engine.json"), Path.Combine(data, "cef.log")); }
        catch (Exception error) { failure = error; }
        if (failure != null || session.Disposed) {
            try { await engine.Close(); } catch { }
            if (!session.Disposed && !engine.Running) session.Cef = null;
            throw failure ?? new Exception("浏览器会话已关闭。");
        }
        Layout();
    }
    internal async Task CloseAll() {
        foreach (var owner in sessions.Keys.ToArray()) await Handle(new Dictionary<string, object> { { "owner", owner }, { "action", "dispose" } });
    }
    private async Task DisposeSession(BrowserSession session) {
        session.Disposed = true;
        foreach (var tab in session.Tabs) tab.Close();
        session.Tabs.Clear(); session.Active = null;
        if (session.CefPreparing != null) { try { await session.CefPreparing; } catch { } }
        if (session.Cef != null) await session.Cef.Close();
        sessions.Remove(session.Owner);
        if (visibleOwner == session.Owner) { visibleOwner = ""; visible = false; }
        Layout();
    }
    internal static string Value(Dictionary<string, object> p, string key) {
        object v; return p != null && p.TryGetValue(key, out v) && v != null ? Convert.ToString(v) : "";
    }
    internal static bool Allowed(string value) {
        Uri uri;
        return Uri.TryCreate(value, UriKind.Absolute, out uri) && (uri.Scheme == "http" || uri.Scheme == "https") && String.IsNullOrEmpty(uri.UserInfo) && !String.Equals(uri.Host, "qqclaw.local", StringComparison.OrdinalIgnoreCase);
    }
}
internal sealed class BrowserHistoryRecord {
    public string id { get; set; }
    public string url { get; set; }
    public string title { get; set; }
    public long at { get; set; }
}
// A separate, bounded user history, never injected into model input. Page views
// call Visit only after a successful top-level load; downloads/errors stay out.
internal sealed class BrowserHistory {
    private List<BrowserHistoryRecord> items = new List<BrowserHistoryRecord>();
    private readonly string file = Path.Combine(Program.DataDirectory, "browser-history.json");
    private readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 16 * 1024 * 1024 };
    private readonly Action<object> notify;
    private string storageError = "";
    private long revision;
    internal BrowserHistory(Action<object> notify) {
        this.notify = notify;
        try {
            if (Directory.Exists(file)) throw new Exception("历史记录位置是目录。");
            if (File.Exists(file)) {
                var bytes = ProtectedData.Unprotect(Convert.FromBase64String(File.ReadAllText(file)), Encoding.UTF8.GetBytes("QQClaw/browser-history/v1"), DataProtectionScope.CurrentUser);
                var saved = json.Deserialize<List<BrowserHistoryRecord>>(Encoding.UTF8.GetString(bytes));
                if (saved == null || saved.Count > 500 || saved.Any(item => item == null || String.IsNullOrEmpty(item.id) || item.at <= 0 || item.title == null || item.title.Length > 256 || Normalize(item.url) == null || Normalize(item.url) != item.url) || saved.Select(item => item.id).Distinct().Count() != saved.Count || saved.Select(item => item.url).Distinct().Count() != saved.Count) throw new Exception("历史记录格式无效。");
                items = saved.OrderByDescending(item => item.at).ToList();
            }
        } catch { storageError = "无法读取加密浏览记录，原文件已保留。请使用原系统账户检查数据目录后重启。"; }
    }
    private static string Normalize(string value) {
        if (String.IsNullOrEmpty(value) || value.Length > 8192 || !BrowserHost.Allowed(value)) return null;
        try { var uri = new UriBuilder(value) { Fragment = "" }; var result = uri.Uri.AbsoluteUri; return result.Length <= 8192 ? result : null; } catch { return null; }
    }
    private static long Now() { return (long)(DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalMilliseconds; }
    private static string CleanTitle(string value, string url) {
        var title = new string((value ?? "").Where(c => !Char.IsControl(c)).ToArray()).Trim();
        if (title.Length > 256) title = title.Substring(0, Char.IsHighSurrogate(title[255]) ? 255 : 256);
        return title == "" ? new Uri(url).Host : title;
    }
    internal void Visit(string value, string title) {
        var url = Normalize(value); if (url == null || storageError != "") return;
        var original = items; var previous = items.Find(item => item.url == url);
        var record = new BrowserHistoryRecord { id = previous == null ? Guid.NewGuid().ToString("D") : previous.id, url = url, title = CleanTitle(title, url), at = Now() };
        items = new [] { record }.Concat(items.Where(item => item.url != url)).Take(500).ToList();
        try { Save(); } catch { items = original; }
        notify(State());
    }
    internal void UpdateTitle(string value, string title) {
        var url = Normalize(value); if (url == null || storageError != "") return;
        var previous = items.Find(item => item.url == url); if (previous == null) return;
        title = CleanTitle(title, url); if (previous.title == title) return;
        var original = items;
        items = items.Select(item => item == previous ? new BrowserHistoryRecord { id = item.id, url = item.url, at = item.at, title = title } : item).ToList();
        try { Save(); } catch { items = original; }
        notify(State());
    }
    private void Save() {
        var temporary = file + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try {
            var bytes = ProtectedData.Protect(Encoding.UTF8.GetBytes(json.Serialize(items)), Encoding.UTF8.GetBytes("QQClaw/browser-history/v1"), DataProtectionScope.CurrentUser);
            Directory.CreateDirectory(Program.DataDirectory); File.WriteAllText(temporary, Convert.ToBase64String(bytes));
            if (File.Exists(file)) File.Replace(temporary, file, null); else File.Move(temporary, file);
        } catch { storageError = "浏览记录保存失败，原记录已保留。请检查磁盘空间和数据目录权限后重启。"; throw new Exception(storageError); }
        finally { try { if (File.Exists(temporary)) File.Delete(temporary); } catch { } }
    }
    internal object State() { return new { revision = ++revision, items = items.ToArray(), storageError = storageError }; }
    internal object Handle(Dictionary<string, object> p) {
        var action = BrowserHost.Value(p, "action"); if (action == "state") return State();
        if (storageError != "") throw new Exception(storageError);
        var original = items;
        if (action == "remove") {
            string id = BrowserHost.Value(p, "id");
            if (!items.Any(item => item.id == id)) throw new Exception("该浏览记录已不存在。");
            items = items.Where(item => item.id != id).ToList();
        } else if (action == "clear") {
            string range = BrowserHost.Value(p, "range");
            if (!new [] { "hour", "day", "all" }.Contains(range)) throw new Exception("清除时间范围无效。");
            long since = range == "all" ? 0 : Now() - (range == "hour" ? 3600000L : 86400000L);
            items = items.Where(item => item.at < since).ToList();
        } else throw new Exception("不支持的浏览记录操作。");
        try { Save(); } catch { items = original; notify(State()); throw; }
        var state = State(); notify(state); return state;
    }
}
internal sealed class BrowserSession {
    internal long Revision;
    internal bool Disposed;
    internal string Owner, Profile;
    internal string OfficialExtensionPath;
    internal readonly List<BrowserTab> Tabs = new List<BrowserTab>();
    internal BrowserTab Active;
    internal CefBrowserEngine Cef;
    internal Task CefPreparing;
    internal Task Disposal;
    internal bool CefSelected;
    internal string LastCefActive = "";
    internal BrowserSession(string owner, string profile) { Owner = owner; Profile = profile; }
}
internal sealed class BrowserTab {
    internal readonly SemaphoreSlim Serial = new SemaphoreSlim(1, 1);
    internal int OperationRevision;
    private TaskCompletionSource<bool> operationInterrupted = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly TaskCompletionSource<bool> closedSignal = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
    internal Task OperationInterruption { get { return operationInterrupted.Task; } }
    internal readonly string Id = Guid.NewGuid().ToString("D");
    internal readonly WebView2 Web = new WebView2 { DefaultBackgroundColor = Color.White, Visible = false };
    internal bool Loading;
    internal string Error = "";
    internal string Url { get { return Web.CoreWebView2 == null || Web.CoreWebView2.Source == "about:blank" ? "" : Web.CoreWebView2.Source; } }
    private string requestedUrl = "";
    internal string DisplayUrl { get { return Loading && requestedUrl != "" ? requestedUrl : Url; } }
    internal string Title { get { return Web.CoreWebView2 == null || String.IsNullOrEmpty(Web.CoreWebView2.DocumentTitle) ? "新标签页" : Web.CoreWebView2.DocumentTitle; } }
    internal bool CanGoBack { get { return Web.CoreWebView2 != null && Web.CoreWebView2.CanGoBack; } }
    internal bool CanGoForward { get { return Web.CoreWebView2 != null && Web.CoreWebView2.CanGoForward; } }
    private readonly Action changed;
    private readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 8 * 1024 * 1024, RecursionLimit = 100 };
    private readonly string profile;
    private readonly CoreWebView2Environment defaultEnvironment;
    internal bool IsOfficial { get { return defaultEnvironment != null; } }
    private Task ready;
    private bool stopping;
    private bool closed;
    private bool downloadNavigation;
    private readonly SemaphoreSlim findSerial = new SemaphoreSlim(1, 1);
    private int findRevision;
    private bool findOpen;
    private string findQuery = "";
    private CoreWebView2Find findSession;
    private TaskCompletionSource<bool> findInterrupted = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
    private TaskCompletionSource<bool> navigation;
    internal ulong NavigationId;
    private readonly BrowserDownloads downloads;
    private readonly BrowserHistory history;
    private readonly string owner;
    private readonly Func<BrowserTab, Task<BrowserTab>> openWindow;
    private readonly Action<BrowserTab> closeWindow;
    internal BrowserTab(Form parent, string profile, Action changed, BrowserDownloads downloads, string owner, BrowserHistory history,
        Func<BrowserTab, Task<BrowserTab>> openWindow, Action<BrowserTab> closeWindow, Action<BrowserTab, string> shortcut, CoreWebView2Environment defaultEnvironment = null) {
        this.profile = profile; this.changed = changed;
        this.defaultEnvironment = defaultEnvironment;
        this.downloads = downloads; this.owner = owner; this.history = history;
        this.openWindow = openWindow; this.closeWindow = closeWindow;
        Web.KeyDown += delegate(object sender, KeyEventArgs e) {
            if (closed || e.Alt) return;
            string command = "";
            if (e.Control && e.KeyCode == Keys.F && !e.Shift) command = "find-browser";
            else if (findOpen && (e.Control && e.KeyCode == Keys.G || !e.Control && e.KeyCode == Keys.F3)) command = e.Shift ? "find-browser-previous" : "find-browser-next";
            else if (findOpen && !e.Control && e.KeyCode == Keys.Escape) command = "find-browser-close";
            else if (e.Control && e.KeyCode == Keys.Tab) command = e.Shift ? "panel-previous-tab" : "panel-next-tab";
            else if (e.Control && e.KeyCode == Keys.B) command = e.Shift ? "toggle-panel" : "toggle-sidebar";
            else if (e.Control && e.KeyCode == Keys.T && e.Shift) command = "panel-reopen-tab";
            else if (e.Control && !e.Shift) {
                switch (e.KeyCode) {
                    case Keys.T: command = "browser-new-tab"; break;
                    case Keys.W: command = "panel-close-active"; break;
                    case Keys.L: command = "browser-focus-address"; break;
                    case Keys.N: command = "new-session"; break;
                    case Keys.K: command = "search"; break;
                    case Keys.Oemcomma: command = "settings"; break;
                }
            }
            if (command == "") return;
            e.Handled = true; e.SuppressKeyPress = true; shortcut(this, command);
        };
        Web.Bounds = new Rectangle(-2000, 0, 1000, 760); parent.Controls.Add(Web);
    }
    internal async Task EnsureReady(CoreWebView2Environment environment = null) {
        if (closed) throw new Exception("浏览器标签页已关闭。");
        ready = ready ?? Initialize(environment ?? defaultEnvironment);
        if (!await AwaitCompletion(ready, closedSignal.Task)) throw new Exception("浏览器标签页已关闭。");
        if (closed || Web.IsDisposed) throw new Exception("浏览器标签页已关闭。");
    }
    private async Task Initialize(CoreWebView2Environment environment) {
        environment = environment ?? await CoreWebView2Environment.CreateAsync(null, Path.Combine(Program.DataDirectory, "browsers", profile));
        await Web.EnsureCoreWebView2Async(environment);
        Web.CoreWebView2.Settings.IsWebMessageEnabled = false;
        Web.CoreWebView2.Settings.AreHostObjectsAllowed = false;
        Web.CoreWebView2.Settings.AreDevToolsEnabled = false;
        Web.CoreWebView2.Settings.IsStatusBarEnabled = false;
        Web.CoreWebView2.NavigationStarting += delegate(object sender, CoreWebView2NavigationStartingEventArgs e) {
            NavigationId = e.NavigationId;
            if (e.Uri != "about:blank" && !BrowserHost.Allowed(e.Uri)) { e.Cancel = true; Error = "已阻止不支持的链接。"; }
            else { Loading = true; requestedUrl = e.Uri == "about:blank" ? "" : e.Uri; Error = ""; downloadNavigation = false; }
            changed();
        };
        Web.CoreWebView2.NavigationCompleted += async delegate(object sender, CoreWebView2NavigationCompletedEventArgs e) {
            if (!e.IsSuccess && !stopping) await Task.Delay(200);
            if (Web.IsDisposed || e.NavigationId != NavigationId) return;
            if (e.IsSuccess && !closed && !downloadNavigation) history.Visit(Url, Title);
            Loading = false; requestedUrl = ""; Error = e.IsSuccess || stopping || downloadNavigation ? "" : "网页未能加载：" + e.WebErrorStatus; changed();
        };
        Web.CoreWebView2.SourceChanged += delegate { changed(); };
        Web.CoreWebView2.DocumentTitleChanged += delegate { if (!Loading && !closed && !downloadNavigation) history.UpdateTitle(Url, Title); changed(); };
        Web.CoreWebView2.HistoryChanged += delegate { changed(); };
        Web.CoreWebView2.NewWindowRequested += async delegate(object sender, CoreWebView2NewWindowRequestedEventArgs e) {
            e.Handled = true;
            if (closed) return;
            if (!e.IsUserInitiated || e.Uri != "about:blank" && !BrowserHost.Allowed(e.Uri)) {
                Error = "已阻止自动弹窗或不支持的链接。"; changed(); return;
            }
            var deferral = e.GetDeferral();
            BrowserTab target = null;
            try { target = await openWindow(this); e.NewWindow = target.Web.CoreWebView2; }
            catch (Exception error) {
                if (target != null) closeWindow(target);
                if (!closed) { Error = "无法打开新标签页：" + error.Message; changed(); }
            }
            finally {
                // Dispose completes the request. Calling Complete as well would
                // complete it twice and throw E_ILLEGAL_METHOD_CALL (0x8000000E).
                try { deferral.Dispose(); }
                catch (Exception error) { if (!closed) { Error = "新标签页请求已取消：" + error.Message; changed(); } }
            }
        };
        Web.CoreWebView2.WindowCloseRequested += delegate { closeWindow(this); };
        Web.CoreWebView2.PermissionRequested += delegate(object sender, CoreWebView2PermissionRequestedEventArgs e) { e.State = CoreWebView2PermissionState.Deny; };
        Web.CoreWebView2.DownloadStarting += delegate(object sender, CoreWebView2DownloadStartingEventArgs e) {
            try { downloads.Start(e, this, owner); Error = ""; }
            catch (Exception error) { e.Cancel = true; Error = "无法开始下载：" + error.Message; }
            downloadNavigation = true;
            if (navigation != null) {
                if (e.Cancel) navigation.TrySetException(new Exception(Error));
                else navigation.TrySetResult(false);
            }
            Loading = false; requestedUrl = ""; changed();
        };
    }
    internal void Close() { if (closed) return; Stop(); closed = true; closedSignal.TrySetResult(true); findRevision++; findOpen = false; findInterrupted.TrySetResult(true); Web.Visible = false; Web.Bounds = new Rectangle(-2000, 0, 1000, 760); ReleaseDownloadView(); }
    internal void ReleaseDownloadView() { if (closed && !downloads.Active(Id) && !Web.IsDisposed) Web.Dispose(); }
    internal void Stop() { stopping = true; OperationRevision++; operationInterrupted.TrySetResult(true); if (!Web.IsDisposed && Web.CoreWebView2 != null) Web.CoreWebView2.Stop(); Loading = false; requestedUrl = ""; changed(); }
    internal int BeginNavigation(string url) { Stop(); operationInterrupted = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously); requestedUrl = url; Loading = true; Error = ""; return OperationRevision; }
    private async Task<bool> Navigate(Action action, Task interrupted) {
        var result = new TaskCompletionSource<bool>();
        navigation = result; downloadNavigation = false;
        ulong expectedNavigation = 0;
        EventHandler<CoreWebView2NavigationStartingEventArgs> starting = delegate(object sender, CoreWebView2NavigationStartingEventArgs e) { if (expectedNavigation == 0) expectedNavigation = e.NavigationId; };
        EventHandler<CoreWebView2NavigationCompletedEventArgs> completed = null;
        completed = async delegate(object sender, CoreWebView2NavigationCompletedEventArgs e) {
            if (expectedNavigation == 0 || e.NavigationId != expectedNavigation) return;
            if (e.IsSuccess) result.TrySetResult(true);
            else {
                if (!stopping) await Task.Delay(200);
                if (downloadNavigation) result.TrySetResult(false);
                else result.TrySetException(new Exception(stopping ? "浏览器操作已停止。" : "网页未能加载：" + e.WebErrorStatus));
            }
        };
        Web.CoreWebView2.NavigationStarting += starting;
        Web.CoreWebView2.NavigationCompleted += completed;
        try {
            action();
            var finished = await Task.WhenAny(result.Task, interrupted, Task.Delay(25000));
            if (finished == interrupted) throw new Exception("浏览器操作已停止或被新的导航替代。");
            if (finished != result.Task) { Web.CoreWebView2.Stop(); throw new Exception("网页加载超时，请重试或检查网络。"); }
            return await result.Task;
        } finally { navigation = null; if (!Web.IsDisposed) { Web.CoreWebView2.NavigationStarting -= starting; Web.CoreWebView2.NavigationCompleted -= completed; } }
    }
    private async Task<object> Page(Dictionary<string, object> p) {
        string script = File.ReadAllText(Path.Combine(Program.RuntimeDirectory, "browser-page.js"));
        var output = await Web.CoreWebView2.ExecuteScriptAsync("(() => { try { " + script + "\nreturn { ok: true, value: qqclawBrowserPage(" + json.Serialize(p) + ") }; } catch (e) { return { ok: false, error: String(e.message || e) }; } })()");
        var response = json.Deserialize<Dictionary<string, object>>(output);
        if (response == null || !response.ContainsKey("ok")) throw new Exception("无法读取网页，页面可能正在跳转，请重试快照。");
        if (!(bool)response["ok"]) throw new Exception(Convert.ToString(response["error"]));
        return response["value"];
    }
    private async Task<object> ReadPage(Dictionary<string, object> p, int revision, Task interrupted) {
        if (closed || revision != OperationRevision) throw new Exception("网页已变化或标签页已关闭。");
        var result = Page(p);
        if (!await AwaitCompletion(result, interrupted) || closed || revision != OperationRevision) throw new Exception("网页已变化或标签页已关闭。");
        return await result;
    }
    internal async Task Restore(string url) {
        stopping = false;
        await EnsureReady();
        if (closed || stopping) throw new Exception("浏览器恢复已停止或标签页已关闭。");
        // A closed page is reopened by URL. Never replay an old POST body.
        Web.CoreWebView2.Navigate(url);
    }
    private static async Task<bool> AwaitCompletion(Task operation, Task interrupted) {
        if (await Task.WhenAny(operation, interrupted) == operation) { await operation; return true; }
        // A disposed WebView can leave StartAsync without a completion callback.
        // Settle our RPC immediately and observe any later native failure.
        var observe = operation.ContinueWith(completed => GC.KeepAlive(completed.Exception), TaskContinuationOptions.OnlyOnFaulted | TaskContinuationOptions.ExecuteSynchronously);
        return false;
    }
    internal async Task<object> Find(Dictionary<string, object> p) {
        string operation = BrowserHost.Value(p, "operation"), query = BrowserHost.Value(p, "query");
        if (!new [] { "search", "next", "previous", "clear" }.Contains(operation) || query.Length > 512) throw new Exception("网页查找参数无效。");
        if (operation == "search" || operation == "clear") {
            findRevision++; findInterrupted.TrySetResult(true);
            findInterrupted = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        }
        int revision = findRevision;
        Task interrupted = findInterrupted.Task;
        if (operation == "search" || operation == "clear") findOpen = operation != "clear";
        await findSerial.WaitAsync();
        try {
            if (closed || revision != findRevision) return new { stale = true };
            if (operation == "clear" || query == "") {
                if (findSession != null) findSession.Stop();
                findQuery = ""; return new { cleared = true, found = false };
            }
            if (!await AwaitCompletion(EnsureReady(), interrupted)) return new { stale = true };
            if (closed || revision != findRevision) return new { stale = true };
            findSession = Web.CoreWebView2.Find;
            if (operation == "search" || query != findQuery) {
                var options = Web.CoreWebView2.Environment.CreateFindOptions();
                options.FindTerm = query; options.IsCaseSensitive = false;
                options.ShouldHighlightAllMatches = true; options.SuppressDefaultFindDialog = true;
                findSession.Stop();
                if (!await AwaitCompletion(findSession.StartAsync(options), interrupted)) return new { stale = true };
                if (revision == findRevision) findQuery = query;
            } else {
                var changedIndex = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
                EventHandler<object> changed = delegate { changedIndex.TrySetResult(true); };
                findSession.ActiveMatchIndexChanged += changed;
                try {
                    int total = findSession.MatchCount;
                    if (operation == "previous") findSession.FindPrevious(); else findSession.FindNext();
                    if (total > 1 && await Task.WhenAny(changedIndex.Task, interrupted, Task.Delay(2000)) != changedIndex.Task && revision == findRevision && !closed)
                        throw new Exception("网页没有返回新的查找位置，请重试。");
                } finally {
                    try { findSession.ActiveMatchIndexChanged -= changed; }
                    catch (System.Runtime.InteropServices.COMException) { if (!closed) throw; }
                    catch (ObjectDisposedException) { if (!closed) throw; }
                }
            }
            if (closed || revision != findRevision) return new { stale = true };
            int count = findSession.MatchCount, index = findSession.ActiveMatchIndex;
            return new { found = count > 0, total = (int?)Math.Max(0, count), index = index > 0 ? (int?)index : null };
        } catch (System.Runtime.InteropServices.COMException error) {
            if (error.ErrorCode == unchecked((int)0x80004002)) throw new Exception("当前 WebView2 不支持网页查找，请在运行环境中更新 WebView2。");
            throw;
        } finally { findSerial.Release(); }
    }
    internal async Task<object> Run(Dictionary<string, object> p, int revision, Task interrupted) {
        try {
            if (revision != OperationRevision || closed) throw new Exception("浏览器操作已停止或标签页已关闭。");
            stopping = false;
            if (!await AwaitCompletion(EnsureReady(), interrupted) || revision != OperationRevision || closed) throw new Exception("浏览器操作已停止或标签页已关闭。");
            string action = BrowserHost.Value(p, "action");
            if (action == "open") {
                string url = BrowserHost.Value(p, "url"); if (!BrowserHost.Allowed(url)) throw new Exception("浏览器仅支持 HTTP/HTTPS 网页。");
                if (!await Navigate(() => Web.CoreWebView2.Navigate(url), interrupted)) return new { downloadStarted = true };
            } else if (action == "back" && CanGoBack) { if (!await Navigate(() => Web.CoreWebView2.GoBack(), interrupted)) return new { downloadStarted = true }; }
            else if (action == "forward" && CanGoForward) { if (!await Navigate(() => Web.CoreWebView2.GoForward(), interrupted)) return new { downloadStarted = true }; }
            else if (action == "reload") { if (!await Navigate(() => Web.CoreWebView2.Reload(), interrupted)) return new { downloadStarted = true }; }
            else if (action == "screenshot") {
                using (var stream = new MemoryStream()) {
                    if (!await AwaitCompletion(Web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, stream), interrupted) || closed || revision != OperationRevision) throw new Exception("网页已变化或标签页已关闭。");
                    return new { url = Url, imageBase64 = Convert.ToBase64String(stream.ToArray()) };
                }
            } else if (action != "back" && action != "forward") return await ReadPage(p, revision, interrupted);
            return await ReadPage(new Dictionary<string, object> { { "action", "snapshot" } }, revision, interrupted);
        } catch (Exception e) { if (!closed && revision == OperationRevision) Error = e.Message; throw; }
    }
}

internal sealed class BrowserDownloadRecord {
    public string id { get; set; }
    public string owner { get; set; }
    public string name { get; set; }
    public string path { get; set; }
    public string url { get; set; }
    public string at { get; set; }
    public string status { get; set; }
    public string error { get; set; }
    public long received { get; set; }
    public long total { get; set; }
    internal CoreWebView2DownloadOperation Operation;
    internal BrowserTab Source;
    internal bool Cancelled;
    internal ulong NavigationId;
    internal EventHandler<object> StateChanged;
}

internal sealed class BrowserDownloads {
    private readonly Action<object> notify;
    private readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 32 * 1024 * 1024 };
    private readonly List<BrowserDownloadRecord> items = new List<BrowserDownloadRecord>();
    private readonly string history = Path.Combine(Program.DataDirectory, "browser-downloads.json");
    private readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer { Interval = 500 };
    private string storageError = "";
    private long revision;
    internal BrowserDownloads(Action<object> notify) {
        this.notify = notify;
        try {
            if (File.Exists(history)) {
                var bytes = ProtectedData.Unprotect(Convert.FromBase64String(File.ReadAllText(history)), Encoding.UTF8.GetBytes("QQClaw/downloads/v1"), DataProtectionScope.CurrentUser);
                var saved = json.Deserialize<List<BrowserDownloadRecord>>(Encoding.UTF8.GetString(bytes));
                if (saved == null) throw new Exception("下载记录格式无效。");
                items.AddRange(saved);
                foreach (var item in items.Where(item => item.status == "running")) { item.status = "interrupted"; item.error = "应用退出时下载尚未完成，请在原网页重新下载。"; }
            }
        } catch { storageError = "无法读取加密下载记录，原文件已保留。请使用原系统账户重试。"; }
        timer.Tick += delegate { bool changed = false; foreach (var item in items.Where(item => item.Operation != null).ToArray()) changed |= Update(item); if (changed) Publish(); };
        timer.Start();
    }
    internal bool Active(string tabId) { return items.Any(item => item.Source != null && item.Source.Id == tabId && item.status == "running"); }
    private static long Total(CoreWebView2DownloadOperation operation) { var value = operation.TotalBytesToReceive; return value.HasValue ? value.Value > Int64.MaxValue ? Int64.MaxValue : (long)value.Value : 0; }
    private static string Filename(string suggested) {
        string name = Path.GetFileName((suggested ?? "").Replace('\\', '/'));
        foreach (char value in Path.GetInvalidFileNameChars()) name = name.Replace(value, '_');
        name = name.Trim().TrimEnd('.');
        if (name.Length > 180) name = name.Substring(0, Char.IsHighSurrogate(name[179]) ? 179 : 180);
        if (String.IsNullOrEmpty(name)) name = "download";
        if (System.Text.RegularExpressions.Regex.IsMatch(name, "^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(?:\\.|$)", System.Text.RegularExpressions.RegexOptions.IgnoreCase)) name = "_" + name;
        return name;
    }
    private static string DirectoryRoot() {
        var configured = Environment.GetEnvironmentVariable("QQCLAW_DOWNLOADS_DIR");
        if (!String.IsNullOrEmpty(configured)) return Path.GetFullPath(configured);
        Guid id = new Guid("374DE290-123F-4565-9164-39C4925E467B"); IntPtr pointer;
        int result = SHGetKnownFolderPath(ref id, 0, IntPtr.Zero, out pointer);
        if (result != 0) throw new Exception("无法定位系统下载目录。");
        try { return Path.Combine(System.Runtime.InteropServices.Marshal.PtrToStringUni(pointer), "QQClaw"); }
        finally { System.Runtime.InteropServices.Marshal.FreeCoTaskMem(pointer); }
    }
    [System.Runtime.InteropServices.DllImport("shell32.dll")]
    private static extern int SHGetKnownFolderPath(ref Guid id, uint flags, IntPtr token, out IntPtr path);
    internal void Start(CoreWebView2DownloadStartingEventArgs args, BrowserTab source, string owner) {
        if (storageError != "") throw new Exception(storageError);
        var operation = args.DownloadOperation;
        // A retry may provide a fresh .NET wrapper for the same native download.
        // Do not cancel that wrapper: it cancels the replacement as well.
        var item = items.Find(entry => entry.Source == source && entry.url == operation.Uri && entry.NavigationId == source.NavigationId && entry.status == "running");
        bool fresh = item == null;
        if (fresh) { item = new BrowserDownloadRecord { id = Guid.NewGuid().ToString("D"), owner = owner, at = DateTime.UtcNow.ToString("o"), status = "running" }; items.Add(item); }
        else if (item.Operation != null && item.StateChanged != null) item.Operation.StateChanged -= item.StateChanged;
        item.name = Filename(args.ResultFilePath); item.url = operation.Uri; item.error = ""; item.received = 0; item.total = Total(operation); item.Operation = operation; item.Source = source; item.NavigationId = source.NavigationId;
        try {
            string directory = Path.Combine(DirectoryRoot(), Guid.NewGuid().ToString("D")); Directory.CreateDirectory(directory);
            item.path = Path.Combine(directory, item.name); Save();
        } catch (Exception error) {
            item.status = "interrupted"; item.error = storageError == "" ? error.Message : storageError; item.Operation = null; item.Source = null;
            if (storageError == "") { try { Save(); } catch { } }
            source.ReleaseDownloadView(); Publish(); throw;
        }
        args.ResultFilePath = item.path; args.Handled = true;
        item.StateChanged = delegate { if (Object.ReferenceEquals(item.Operation, operation)) { Update(item); Publish(); } };
        operation.StateChanged += item.StateChanged;
        Publish();
    }
    private bool Update(BrowserDownloadRecord item) {
        var operation = item.Operation; if (operation == null) return false;
        long received = operation.BytesReceived, total = Total(operation);
        bool changed = item.received != received || item.total != total;
        item.received = received; item.total = total;
        if (operation.State != CoreWebView2DownloadState.InProgress) {
            item.status = operation.State == CoreWebView2DownloadState.Completed ? "completed" : item.Cancelled || operation.InterruptReason == CoreWebView2DownloadInterruptReason.UserCanceled ? "cancelled" : "interrupted";
            item.error = item.status == "interrupted" ? "下载中断：" + operation.InterruptReason : "";
            if (item.StateChanged != null) operation.StateChanged -= item.StateChanged;
            item.StateChanged = null;
            var source = item.Source; item.Source = null; item.Operation = null;
            try { Save(); } catch { }
            source.ReleaseDownloadView(); changed = true;
        }
        return changed;
    }
    private void Save() {
        string temporary = history + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try {
            var bytes = ProtectedData.Protect(Encoding.UTF8.GetBytes(json.Serialize(items)), Encoding.UTF8.GetBytes("QQClaw/downloads/v1"), DataProtectionScope.CurrentUser);
            File.WriteAllText(temporary, Convert.ToBase64String(bytes));
            if (File.Exists(history)) File.Replace(temporary, history, null); else File.Move(temporary, history);
        } catch { storageError = "下载记录保存失败，现有记录文件已保留，请检查磁盘空间和数据目录权限。"; throw new Exception(storageError); }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
    internal object State() {
        return new { revision = ++revision, items = items.AsEnumerable().Reverse().Select(item => new { item.id, item.owner, item.name, item.path, item.url, item.at, item.status, item.error, item.received, item.total, available = item.status == "completed" && File.Exists(item.path) }).ToArray(), storageError = storageError };
    }
    private void Publish() { notify(State()); }
    internal object Handle(Dictionary<string, object> p) {
        string action = BrowserHost.Value(p, "action");
        if (action == "state") return State();
        if (action == "cancel") {
            var active = items.Find(value => value.id == BrowserHost.Value(p, "id"));
            if (active == null) throw new Exception("下载记录已不存在。");
            if (active.Operation != null) { active.Cancelled = true; active.Operation.Cancel(); Update(active); Publish(); }
            return State();
        }
        if (storageError != "") throw new Exception(storageError);
        if (action == "clear") { var original = items.ToArray(); items.RemoveAll(entry => entry.status != "running"); try { Save(); } catch { items.Clear(); items.AddRange(original); throw; } Publish(); return State(); }
        var item = items.Find(value => value.id == BrowserHost.Value(p, "id"));
        if (item == null) throw new Exception("下载记录已不存在。");
        if (action != "open" && action != "reveal") throw new Exception("不支持的下载操作。");
        if (item.status != "completed" || !File.Exists(item.path)) throw new Exception("下载文件尚未完成，或已被移动或删除。");
        if (action == "open") Process.Start(new ProcessStartInfo(item.path) { UseShellExecute = true });
        else Process.Start(new ProcessStartInfo("explorer.exe", "/select,\"" + item.path + "\"") { UseShellExecute = true });
        return State();
    }
}
