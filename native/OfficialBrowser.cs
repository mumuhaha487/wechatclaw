using System;
using System.IO;
using System.Diagnostics;
using System.Management;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.Cryptography.X509Certificates;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

// Metadata only. The caller must be the backend of the exact application that
// owns the browser. No window control, page access or arbitrary pipe discovery.
internal static class OfficialBrowserMetadata {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct TrustFile {
        internal uint Size; [MarshalAs(UnmanagedType.LPWStr)] internal string File; internal IntPtr Handle, Subject;
    }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct TrustData {
        internal uint Size; internal IntPtr Policy, Sip; internal uint Ui, Revocation, Choice; internal IntPtr File;
        internal uint StateAction; internal IntPtr State, Url; internal uint Flags, Context;
    }
    [DllImport("wintrust.dll", ExactSpelling = true, SetLastError = false)] static extern int WinVerifyTrust(IntPtr window, ref Guid action, ref TrustData data);
    [StructLayout(LayoutKind.Sequential)] struct Entry { internal IntPtr Object; internal UIntPtr Pid, Handle; internal uint Access; internal ushort Trace, Type; internal uint Attributes, Reserved; }
    [StructLayout(LayoutKind.Sequential)] struct Unicode { internal ushort Length, MaximumLength; internal IntPtr Buffer; }
    [DllImport("ntdll.dll")] static extern int NtQuerySystemInformation(int info, IntPtr buffer, int size, out int needed);
    [DllImport("ntdll.dll")] static extern int NtQueryObject(IntPtr handle, int info, IntPtr buffer, int size, out int needed);
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint rights, bool inherit, int pid);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool DuplicateHandle(IntPtr source, IntPtr sourceHandle, IntPtr target, out IntPtr copy, uint rights, bool inherit, uint options);
    [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    sealed class ProcessInfo { internal int Id, Parent; internal string Path, Created; }
    static ProcessInfo ProcessById(int id) {
        using (var search = new ManagementObjectSearcher("SELECT ProcessId, ParentProcessId, ExecutablePath, CreationDate FROM Win32_Process WHERE ProcessId=" + id))
            foreach (ManagementObject item in search.Get()) using (item) return new ProcessInfo {
                Id = Convert.ToInt32(item["ProcessId"]), Parent = Convert.ToInt32(item["ParentProcessId"]),
                Path = Convert.ToString(item["ExecutablePath"]), Created = Convert.ToString(item["CreationDate"])
            };
        throw new Exception("所属进程已经退出。");
    }
    static bool Same(string a, string b) { return String.Equals(Path.GetFullPath(a), Path.GetFullPath(b), StringComparison.OrdinalIgnoreCase); }
    static void Publisher(string file, string expected) {
        var info = new TrustFile { Size = (uint)Marshal.SizeOf(typeof(TrustFile)), File = file };
        var memory = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(TrustFile)));
        try {
            Marshal.StructureToPtr(info, memory, false);
            var data = new TrustData { Size = (uint)Marshal.SizeOf(typeof(TrustData)), Ui = 2, Choice = 1, File = memory, Flags = 0x1000 };
            var action = new Guid("00AAC56B-CD44-11d0-8CC2-00C04FC295EE");
            if (WinVerifyTrust(new IntPtr(-1), ref action, ref data) != 0) throw new Exception("官方组件的数字签名无效。");
            using (var certificate = new X509Certificate2(X509Certificate.CreateFromSignedFile(file)))
                if (certificate.GetNameInfo(X509NameType.SimpleName, false) != expected) throw new Exception("官方组件的发布者不匹配。");
        } finally { Marshal.DestroyStructure(memory, typeof(TrustFile)); Marshal.FreeHGlobal(memory); }
    }
    static string HandleText(IntPtr handle, int kind) {
        int needed, size = 1024; IntPtr buffer = Marshal.AllocHGlobal(size);
        try {
            int status = NtQueryObject(handle, kind, buffer, size, out needed);
            if (status != 0 && needed > size && needed <= 65536) { Marshal.FreeHGlobal(buffer); size = needed; buffer = Marshal.AllocHGlobal(size); status = NtQueryObject(handle, kind, buffer, size, out needed); }
            if (status != 0) return null;
            var value = (Unicode)Marshal.PtrToStructure(buffer, typeof(Unicode));
            return value.Buffer == IntPtr.Zero || value.Length == 0 ? "" : Marshal.PtrToStringUni(value.Buffer, value.Length / 2);
        } finally { Marshal.FreeHGlobal(buffer); }
    }
    static string[] PipeNames(int pid) {
        int size = 1024 * 1024, needed, inspected = 0; IntPtr buffer = IntPtr.Zero, process = IntPtr.Zero; var found = new HashSet<string>();
        try {
            while (true) {
                buffer = Marshal.AllocHGlobal(size);
                if (NtQuerySystemInformation(64, buffer, size, out needed) == 0) break;
                Marshal.FreeHGlobal(buffer); buffer = IntPtr.Zero;
                if (size >= 64 * 1024 * 1024) throw new Exception("进程句柄元数据超过限制。");
                size = Math.Max(size * 2, needed + 4096);
            }
            process = OpenProcess(0x40, false, pid); if (process == IntPtr.Zero) throw new Exception("无法查询本会话的官方原生宿主。");
            long count = Marshal.ReadIntPtr(buffer).ToInt64(); int stride = Marshal.SizeOf(typeof(Entry));
            for (long index = 0; index < count; index++) {
                long offset = IntPtr.Size * 2 + index * stride; if (offset + stride > size) break;
                var item = (Entry)Marshal.PtrToStructure(IntPtr.Add(buffer, checked((int)offset)), typeof(Entry));
                if (item.Pid.ToUInt64() != (ulong)pid) continue;
                if (++inspected > 512) throw new Exception("官方宿主的句柄数量超过限制。");
                IntPtr copy; if (!DuplicateHandle(process, new IntPtr(unchecked((long)item.Handle.ToUInt64())), GetCurrentProcess(), out copy, 0, false, 2)) continue;
                IntPtr owned = copy;
                var query = Task.Run(() => { try { return HandleText(owned, 2) == "File" ? HandleText(owned, 1) : null; } catch { return null; } finally { CloseHandle(owned); } });
                if (!query.Wait(50)) continue;
                string name = query.Result;
                if (name != null && System.Text.RegularExpressions.Regex.IsMatch(name, @"^\\Device\\NamedPipe\\codex-browser-use\\[a-fA-F0-9-]{36}$"))
                    found.Add(@"\\.\pipe\" + name.Substring(@"\Device\NamedPipe\".Length));
            }
            var result = new string[found.Count]; found.CopyTo(result); return result;
        } finally { if (process != IntPtr.Zero) CloseHandle(process); if (buffer != IntPtr.Zero) Marshal.FreeHGlobal(buffer); }
    }
    internal static int Run(string[] args) {
        Console.SetOut(new StreamWriter(Console.OpenStandardOutput(), new System.Text.UTF8Encoding(false)) { AutoFlush = true });
        var json = new JavaScriptSerializer();
        try {
            if (args.Length != 4 && args.Length != 5) throw new Exception("官方浏览器检测参数无效。");
            int browserId, applicationId;
            if (!Int32.TryParse(args[1], out browserId) || !Int32.TryParse(args[2], out applicationId) || browserId <= 0 || applicationId <= 0) throw new Exception("所属进程编号无效。");
            Publisher(args[3], "OpenAI OpCo, LLC");
            var helper = ProcessById(Process.GetCurrentProcess().Id);
            var backend = ProcessById(helper.Parent);
            var application = ProcessById(applicationId);
            var browser = ProcessById(browserId);
            if (backend.Parent != applicationId || !Same(helper.Path, application.Path) || browser.Parent != applicationId)
                throw new Exception("检测请求不属于同一个 QQClaw 浏览器进程。");
            string engine;
            if (Path.GetFileName(browser.Path) == "msedgewebview2.exe") { Publisher(browser.Path, "Microsoft Corporation"); engine = "webview2"; }
            else { CefBrowserRuntime.VerifyOwnedWorker(browser.Path); engine = "cef"; }
            string manifestPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OpenAI", "extension", "com.openai.codexextension.json");
            if (args.Length == 5) {
                string data = Environment.GetEnvironmentVariable("QQCLAW_DATA_DIR");
                if (String.IsNullOrEmpty(data) || !Path.GetFullPath(args[4]).StartsWith(Path.GetFullPath(Path.Combine(data, "browser-runtime")) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new Exception("原生宿主配置不属于当前应用。");
                manifestPath = args[4];
            }
            var manifest = json.Deserialize<Dictionary<string, object>>(File.ReadAllText(manifestPath));
            if (Convert.ToString(manifest["name"]) != "com.openai.codexextension" || Convert.ToString(manifest["type"]) != "stdio") throw new Exception("官方原生宿主注册无效。");
            bool origin = false; foreach (var value in (System.Collections.IEnumerable)manifest["allowed_origins"]) if (Convert.ToString(value) == "chrome-extension://hehggadaopoacecdllhhajmbjkdcmajg/") origin = true;
            if (!origin) throw new Exception("官方扩展标识不匹配。");
            string hostPath = Convert.ToString(manifest["path"]); Publisher(hostPath, "OpenAI OpCo, LLC");
            var candidates = new List<ProcessInfo>();
            using (var search = new ManagementObjectSearcher("SELECT ProcessId FROM Win32_Process WHERE Name='extension-host.exe'"))
                foreach (ManagementObject row in search.Get()) using (row) {
                    ProcessInfo candidate;
                    try { candidate = ProcessById(Convert.ToInt32(row["ProcessId"])); if (!Same(candidate.Path, hostPath)) continue; }
                    catch { continue; }
                    try {
                        var parent = ProcessById(candidate.Parent);
                        if (Path.GetFileName(parent.Path) == "cmd.exe") { if (!Same(parent.Path, Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "cmd.exe"))) continue; parent = ProcessById(parent.Parent); }
                        if (parent.Id == browserId) candidates.Add(candidate);
                    } catch { /* An unrelated native host may exit during enumeration. */ }
                }
            if (candidates.Count != 1) throw new Exception("没有找到唯一属于当前内置浏览器的官方宿主。");
            var native = candidates[0]; Publisher(native.Path, "OpenAI OpCo, LLC");
            string[] paths = PipeNames(native.Id);
            if (paths.Length != 1 || ProcessById(native.Id).Created != native.Created || ProcessById(browserId).Created != browser.Created) throw new Exception("官方扩展通道不唯一或所属进程已经变化。");
            Console.WriteLine(json.Serialize(new { verified = true, applicationPid = applicationId, browserPid = browserId, nativePid = native.Id, engine = engine, paths = paths })); return 0;
        } catch (Exception error) { Console.WriteLine(json.Serialize(new { verified = false, reason = error.Message })); return 1; }
    }
}
