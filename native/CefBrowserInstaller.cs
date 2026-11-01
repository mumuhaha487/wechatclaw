using System;
using System.IO;
using System.Net;
using System.Linq;
using System.Text;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Security.AccessControl;
using System.Security.Principal;

// Installation is a user-initiated native operation, never a browser/model
// tool. The archive and every executable trust anchor come from our assembly.
internal static class CefBrowserInstaller {
    static readonly object gate = new object();
    static Task<object> installation;
    static CancellationTokenSource cancellation;
    static bool committing;
    static readonly string[] required = { "icudtl.dat", "resources.pak", "chrome_100_percent.pak", "chrome_200_percent.pak", "v8_context_snapshot.bin", "d3dcompiler_47.dll", "dxcompiler.dll", "dxil.dll", "locales/en-US.pak", "locales/zh-CN.pak" };
    internal static async Task<object> Status() {
        return await Task.Run<object>(delegate {
            CefEngineFiles files;
            try { files = CefBrowserRuntime.RequireFiles(); }
            catch { return new { packaged = false, installed = false, needsRepair = false, reason = "当前版本未包含浏览器组件，请更新应用。" }; }
            try { using (files.AcquireLease(false)) { VerifyRuntime(files); } return new { packaged = true, installed = true, needsRepair = false, reason = "浏览器组件已安装并通过校验。官方扩展需要另外安装和连接。" }; }
            catch { bool exists = Directory.Exists(files.Directory); return new { packaged = true, installed = false, needsRepair = exists, reason = exists ? "浏览器组件未通过校验，请修复后重试。" : "尚未安装浏览器组件，下载约 132 MiB。" }; }
        });
    }
    internal static Task<object> Install(string payloadDirectory, Action<object> progress, Action<Process> attach, string verifiedArchive = null) {
        lock (gate) {
            if (installation != null && !installation.IsCompleted) return installation;
            if (cancellation != null) cancellation.Dispose();
            cancellation = new CancellationTokenSource(); committing = false;
            var token = cancellation.Token;
            Action<object> report = value => { try { if (progress != null) progress(value); } catch { } };
            installation = Task.Run<object>(() => InstallCore(payloadDirectory, report, attach ?? delegate { }, token, verifiedArchive));
            return installation;
        }
    }
    internal static bool Cancel() { lock (gate) { if (installation == null || installation.IsCompleted || committing) return false; cancellation.Cancel(); return true; } }
    internal static async Task Shutdown() {
        Cancel(); Task<object> pending; lock (gate) pending = installation;
        if (pending != null) { try { await pending; } catch { } }
    }
    static void DeleteTemporary(string root, string directory) {
        if (!Path.GetFullPath(directory).StartsWith(Path.GetFullPath(root) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new Exception("组件清理路径无效。");
        Directory.Delete(directory, true);
    }
    static string Hash(string file) { using (var sha = SHA256.Create()) using (var input = File.OpenRead(file)) return BitConverter.ToString(sha.ComputeHash(input)).Replace("-", "").ToLowerInvariant(); }
    static void VerifyRuntime(CefEngineFiles files) {
        files.Verify();
        foreach (var name in required) if (!File.Exists(Path.Combine(files.Directory, name)) || new FileInfo(Path.Combine(files.Directory, name)).Length == 0) throw new Exception("浏览器运行资源不完整。");
    }
    static string Quote(string value) { return "\"" + value.Replace("\"", "\\\"") + "\""; }
    static string Tar(string arguments, Action<Process> attach, CancellationToken token) {
        string executable = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "tar.exe");
        if (!File.Exists(executable)) throw new Exception("当前 Windows 缺少系统 tar 组件，请更新 Windows 后重试。");
        using (var process = new Process { StartInfo = new ProcessStartInfo(executable, arguments) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true } }) {
            token.ThrowIfCancellationRequested(); process.Start();
            var output = process.StandardOutput.ReadToEndAsync(); var error = process.StandardError.ReadToEndAsync();
            try { attach(process); }
            catch { try { if (!process.HasExited) process.Kill(); } catch { } throw; }
            using (token.Register(delegate { try { if (!process.HasExited) process.Kill(); } catch { } })) {
                process.WaitForExit(); Task.WaitAll(output, error); token.ThrowIfCancellationRequested();
                if (process.ExitCode != 0) throw new Exception("浏览器组件解压失败，原有组件已保留。请检查磁盘空间后重试。");
                return output.Result;
            }
        }
    }
    static void Download(string destination, Action<object> progress, CancellationToken token) {
        if (ServicePointManager.SecurityProtocol != (SecurityProtocolType)0) ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
        var request = (HttpWebRequest)WebRequest.Create(CefBrowserRuntime.RuntimeUrl);
        request.AllowAutoRedirect = false; request.Timeout = 60000; request.ReadWriteTimeout = 60000;
        try {
            using (token.Register(request.Abort)) using (var response = (HttpWebResponse)request.GetResponse()) {
                if (response.StatusCode != HttpStatusCode.OK || response.ContentLength != CefBrowserRuntime.ArchiveBytes) throw new Exception("官方组件下载信息不匹配，已停止安装。");
                using (var input = response.GetResponseStream()) using (var output = new FileStream(destination, FileMode.CreateNew, FileAccess.Write, FileShare.None)) {
                    byte[] buffer = new byte[65536]; long count = 0; var clock = Stopwatch.StartNew();
                    while (true) {
                        token.ThrowIfCancellationRequested(); int read = input.Read(buffer, 0, buffer.Length); if (read == 0) break;
                        count += read; if (count > CefBrowserRuntime.ArchiveBytes) throw new Exception("官方组件下载大小超出限制。");
                        output.Write(buffer, 0, read);
                        if (clock.ElapsedMilliseconds >= 250) { progress(new { phase = "download", message = "正在下载浏览器组件…", received = count, total = CefBrowserRuntime.ArchiveBytes, canCancel = true }); clock.Restart(); }
                    }
                    if (count != CefBrowserRuntime.ArchiveBytes) throw new Exception("浏览器组件下载不完整，请重试。");
                }
            }
        } catch (WebException) { token.ThrowIfCancellationRequested(); throw new Exception("无法下载官方浏览器组件，请检查网络后重试。"); }
    }
    static void PublicRuntimeAccess(string directory) {
        var security = Directory.GetAccessControl(directory);
        foreach (var id in new [] { "S-1-15-2-1", "S-1-15-2-2" }) security.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(id), FileSystemRights.ReadAndExecute | FileSystemRights.Synchronize, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
        Directory.SetAccessControl(directory, security);
    }
    static object InstallCore(string payloadDirectory, Action<object> progress, Action<Process> attach, CancellationToken token, string verifiedArchive) {
        var files = CefBrowserRuntime.RequireFiles();
        string target = Path.GetDirectoryName(files.Directory), root = Path.GetDirectoryName(target), stage = Path.Combine(root, ".install-" + Guid.NewGuid().ToString("N")), backup = Path.Combine(root, ".previous-" + Guid.NewGuid().ToString("N"));
        string partial = null; bool moved = false, installed = false, committed = false;
        Directory.CreateDirectory(root);
        using (files.AcquireLease(true)) {
            try {
                try { VerifyRuntime(files); return new { installed = true, message = "浏览器组件已通过校验。" }; } catch { }
                progress(new { phase = "prepare", message = "正在准备浏览器组件…", canCancel = true });
                string archive = verifiedArchive;
                if (archive == null) {
                    string cache = Path.Combine(root, ".downloads"); Directory.CreateDirectory(cache);
                    archive = Path.Combine(cache, CefBrowserRuntime.ArchiveSha256 + ".tar.xz");
                    if (!File.Exists(archive) || new FileInfo(archive).Length != CefBrowserRuntime.ArchiveBytes || Hash(archive) != CefBrowserRuntime.ArchiveSha256) {
                        partial = Path.Combine(cache, Guid.NewGuid().ToString("N") + ".part"); Download(partial, progress, token);
                        progress(new { phase = "verify", message = "正在校验下载内容…", canCancel = true });
                        if (Hash(partial) != CefBrowserRuntime.ArchiveSha256) throw new Exception("浏览器组件下载校验失败，原有组件已保留。");
                        token.ThrowIfCancellationRequested();
                        if (File.Exists(archive)) File.Delete(archive); File.Move(partial, archive); partial = null;
                    }
                }
                if (new FileInfo(archive).Length != CefBrowserRuntime.ArchiveBytes || Hash(archive) != CefBrowserRuntime.ArchiveSha256) throw new Exception("浏览器组件来源校验失败，原有组件已保留。");
                token.ThrowIfCancellationRequested();
                progress(new { phase = "extract", message = "正在解压浏览器组件…", canCancel = true });
                string listing = Tar("-tf " + Quote(archive), attach, token);
                var entries = listing.Split(new [] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                if (entries.Length < 10 || entries.Length > 2000 || entries.Any(name => name.StartsWith("/") || name.Contains(":") || name.Contains("\\") || name.Split('/').Any(part => part == ".." || part == "."))) throw new Exception("浏览器组件档案路径无效。");
                Directory.CreateDirectory(stage); Tar("-xf " + Quote(archive) + " -C " + Quote(stage), attach, token);
                if (Directory.GetFiles(stage, "*", SearchOption.AllDirectories).Sum(name => new FileInfo(name).Length) > 2L * 1024 * 1024 * 1024) throw new Exception("浏览器组件解压大小无效。");
                foreach (var name in new [] { "QQClawBrowser.exe", "QQClawBrowser.dll", "chrome_elf.dll" }) File.Copy(Path.Combine(payloadDirectory, name), Path.Combine(stage, "Release", name), true);
                foreach (var name in new [] { "CEF-LICENSE.txt", "JSON-LICENSE.txt" }) File.Copy(Path.Combine(payloadDirectory, name), Path.Combine(stage, name), true);
                var prepared = new CefEngineFiles { Directory = Path.Combine(stage, "Release"), BootstrapSha256 = files.BootstrapSha256, ClientSha256 = files.ClientSha256, ElfSha256 = files.ElfSha256, LibrarySha256 = files.LibrarySha256 };
                progress(new { phase = "verify", message = "正在校验浏览器文件…", canCancel = true }); VerifyRuntime(prepared); PublicRuntimeAccess(stage);
                token.ThrowIfCancellationRequested();
                lock (gate) { token.ThrowIfCancellationRequested(); committing = true; }
                progress(new { phase = "commit", message = "正在完成安装…", canCancel = false });
                if (Directory.Exists(target)) { Directory.Move(target, backup); moved = true; }
                Directory.Move(stage, target); installed = true; VerifyRuntime(files); committed = true;
                return new { installed = true, message = "浏览器组件安装成功。请通过官方入口安装扩展，再开始浏览任务。" };
            } catch (OperationCanceledException) { return new { installed = false, cancelled = true, message = "已取消安装，原有组件已保留。" }; }
            catch {
                if (installed && Directory.Exists(target)) DeleteTemporary(root, target);
                if (moved && Directory.Exists(backup)) { Directory.Move(backup, target); moved = false; }
                throw;
            } finally {
                if (Directory.Exists(stage)) { try { DeleteTemporary(root, stage); } catch { } }
                // A failed rollback must preserve its only original copy.
                if ((committed || !moved) && Directory.Exists(backup)) { try { DeleteTemporary(root, backup); } catch { } }
                if (partial != null && File.Exists(partial)) { try { File.Delete(partial); } catch { } }
                lock (gate) committing = false;
            }
        }
    }
}
