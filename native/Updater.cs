using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Windows.Forms;

internal static class UpdateInstaller {
    internal static object Location() { return new { executable = Application.ExecutablePath, installed = File.Exists(Path.Combine(Path.GetDirectoryName(Application.ExecutablePath), "unins000.exe")) }; }
    private static string Quote(string value) { return "\"" + value.Replace("\"", "\\\"") + "\""; }
    internal static void Apply(Dictionary<string, object> values) {
        string file = Convert.ToString(values["file"]), kind = Convert.ToString(values["kind"]);
        if (!File.Exists(file)) throw new Exception("更新包不存在，请重新检查更新。");
        var directory = Path.GetDirectoryName(Application.ExecutablePath);
        if (kind == "installer") {
            Process.Start(new ProcessStartInfo(file, "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /CLOSEAPPLICATIONS /LAUNCH=1 " + Quote("/DIR=" + directory)) { UseShellExecute = false, CreateNoWindow = true });
        } else {
            string helper = Path.Combine(Program.DataDirectory, "updates", "apply-update.ps1");
            File.WriteAllText(helper, "param([int]$AppProcessId,[string]$UpdateFile,[string]$Destination)\r\n$ErrorActionPreference='Stop'\r\nif(Get-Process -Id $AppProcessId -ErrorAction SilentlyContinue){Wait-Process -Id $AppProcessId -Timeout 90 -ErrorAction SilentlyContinue}\r\nCopy-Item -LiteralPath $UpdateFile -Destination $Destination -Force\r\nStart-Process -FilePath $Destination -WorkingDirectory ([IO.Path]::GetDirectoryName($Destination)) -WindowStyle Normal\r\nRemove-Item -LiteralPath $UpdateFile -Force\r\n", new UTF8Encoding(false));
            Process.Start(new ProcessStartInfo("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " + Quote(helper) + " -AppProcessId " + Process.GetCurrentProcess().Id + " -UpdateFile " + Quote(file) + " -Destination " + Quote(Application.ExecutablePath)) { UseShellExecute = false, CreateNoWindow = true });
        }
    }
}
