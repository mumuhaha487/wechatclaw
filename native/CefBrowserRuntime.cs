using System;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;
using System.Collections.Generic;

// Trust comes from the manifest embedded by the desktop packager. A manifest
// found next to an installed worker cannot authorize a different executable.
internal static class CefBrowserRuntime {
    internal const string ResourceName = "QQClaw.browser-engine";
    internal const string CefVersion = "154.0.34+g14c5a08+chromium-154.0.8037.98";
    internal const string LibrarySha256 = "23bc0d10e6a4b1980890f9e383d3747819598a803e5e860569cb381e5c47b472";
    internal const string ElfSha256 = "f26656bfe38e1b78e42f292b6a8be1b5f0b5db15395ac571d6e20a1dedf698fb";
    internal const string ArchiveSha256 = "ed5bed11096bedd69bfc9d534f3055a8cce290a583543959eca6d3fb22de8d5f";
    internal const long ArchiveBytes = 137799728;
    internal const string RuntimeUrl = "https://cef-builds.spotifycdn.com/cef_binary_154.0.34%2Bg14c5a08%2Bchromium-154.0.8037.98_windows64_signed.tar.xz";
    private static string HashValue(Dictionary<string, object> value, string key) {
        object raw; string hash = value.TryGetValue(key, out raw) ? Convert.ToString(raw) : "";
        if (!System.Text.RegularExpressions.Regex.IsMatch(hash, "\\A[0-9a-fA-F]{64}\\z")) throw new Exception("浏览器组件清单摘要无效。");
        return hash.ToLowerInvariant();
    }
    internal static Dictionary<string, object> Manifest() {
        using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(ResourceName)) {
            if (stream == null) throw new Exception("当前程序尚未包含官方扩展浏览器组件，请更新应用后安装组件。");
            using (var reader = new StreamReader(stream, Encoding.UTF8)) {
                var value = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(reader.ReadToEnd());
                if (Convert.ToInt32(value["version"]) != 1 || Convert.ToString(value["cefVersion"]) != CefVersion)
                    throw new Exception("浏览器组件清单版本不匹配。");
                var bootstrap = value["bootstrap"] as Dictionary<string, object>;
                var client = value["client"] as Dictionary<string, object>;
                var runtime = value["runtime"] as Dictionary<string, object>;
                var elf = value["elf"] as Dictionary<string, object>;
                if (bootstrap == null || client == null || runtime == null || elf == null || Convert.ToString(elf["file"]) != "chrome_elf.dll" || HashValue(elf, "sha256") != ElfSha256 || Convert.ToString(bootstrap["file"]) != "QQClawBrowser.exe" || HashValue(bootstrap, "sha256") != "0b6c80b6c81615f8c2b6c051d698cb9ff93d626fb82016ce61eefd62d8cc4fec" || Convert.ToString(client["file"]) != "QQClawBrowser.dll" || HashValue(runtime, "librarySha256") != LibrarySha256 || HashValue(runtime, "archiveSha256") != ArchiveSha256 || Convert.ToString(runtime["url"]) != RuntimeUrl)
                    throw new Exception("浏览器组件清单无效。");
                HashValue(client, "sha256"); return value;
            }
        }
    }
    internal static CefEngineFiles RequireFiles() {
        var value = Manifest();
        string bootHash = HashValue((Dictionary<string, object>)value["bootstrap"], "sha256"), clientHash = HashValue((Dictionary<string, object>)value["client"], "sha256"), bundle;
        using (var sha = SHA256.Create()) bundle = BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(bootHash + clientHash + ElfSha256 + LibrarySha256))).Replace("-", "").ToLowerInvariant().Substring(0, 32);
        string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "QQClaw", "components", "browser");
        return new CefEngineFiles { Directory = Path.Combine(root, bundle, "Release"), LeaseFile = Path.Combine(root, bundle + ".lease"), BootstrapSha256 = bootHash, ClientSha256 = clientHash, ElfSha256 = ElfSha256, LibrarySha256 = LibrarySha256 };
    }
    internal static void VerifyOwnedWorker(string path) {
        var files = RequireFiles();
        if (!String.Equals(Path.GetFullPath(path), Path.Combine(files.Directory, "QQClawBrowser.exe"), StringComparison.OrdinalIgnoreCase))
            throw new Exception("CEF 进程不属于当前应用的已校验组件。");
        files.Verify();
    }
}
