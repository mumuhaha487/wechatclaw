using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal sealed class DesktopPreferences {
    private readonly string file;
    internal string CloseBehavior { get; private set; }
    internal DesktopPreferences(string directory) {
        file = Path.Combine(directory, "desktop.json"); CloseBehavior = "ask";
        if (!File.Exists(file)) return;
        try {
            var saved = new JavaScriptSerializer().Deserialize<Dictionary<string, string>>(File.ReadAllText(file));
            string value;
            if (saved.TryGetValue("closeBehavior", out value) && Valid(value)) CloseBehavior = value;
        } catch (Exception error) { Program.LogNativeFailure(error); }
    }
    private static bool Valid(string value) { return value == "ask" || value == "tray" || value == "exit"; }
    internal void Save(string value) {
        if (!Valid(value)) throw new Exception("关闭方式无效。");
        File.WriteAllText(file, new JavaScriptSerializer().Serialize(new { closeBehavior = value }), new UTF8Encoding(false));
        CloseBehavior = value;
    }
    internal object Snapshot() { return new { closeBehavior = CloseBehavior }; }
}

internal sealed class CloseChoiceDialog : Form {
    internal string Choice { get; private set; }
    internal bool Remember { get { return remember.Checked; } }
    private readonly CheckBox remember;
    internal CloseChoiceDialog() {
        Text = "关闭 QQClaw"; ClientSize = new Size(460, 215); FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false; MinimizeBox = false; ShowInTaskbar = false; StartPosition = FormStartPosition.CenterParent;
        AutoScaleMode = AutoScaleMode.Dpi; BackColor = Color.White; ForeColor = Color.FromArgb(24, 24, 24);
        Font = new Font("Microsoft YaHei UI", 9F);
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(24, 18, 24, 18), ColumnCount = 1, RowCount = 4 };
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 35));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 30));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
        layout.Controls.Add(new Label { Text = "要退出程序，还是退出到托盘？", AutoSize = true, Font = new Font(Font.FontFamily, 12F), Margin = new Padding(0) }, 0, 0);
        layout.Controls.Add(new Label { Text = "退出到托盘后，微信连接和正在执行的任务会继续运行。", Dock = DockStyle.Fill, Margin = new Padding(0, 3, 0, 0) }, 0, 1);
        remember = new CheckBox { Name = "remember-choice", Text = "下次不再询问", AutoSize = true, Margin = new Padding(0, 3, 0, 0) };
        layout.Controls.Add(remember, 0, 2);
        var buttons = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, Margin = new Padding(0), WrapContents = false };
        var tray = new Button { Name = "close-to-tray", Text = "退出到托盘", Size = new Size(128, 34), BackColor = Color.FromArgb(24, 24, 24), ForeColor = Color.White, FlatStyle = FlatStyle.Flat, Margin = new Padding(10, 0, 0, 0) };
        tray.FlatAppearance.BorderSize = 0;
        var exit = new Button { Name = "exit-app", Text = "退出程序", Size = new Size(112, 34), BackColor = Color.White, FlatStyle = FlatStyle.Flat, Margin = new Padding(0) };
        exit.FlatAppearance.BorderColor = Color.FromArgb(210, 210, 210);
        tray.Click += delegate { Choose("tray"); }; exit.Click += delegate { Choose("exit"); };
        buttons.Controls.Add(tray); buttons.Controls.Add(exit); layout.Controls.Add(buttons, 0, 3);
        Controls.Add(layout); AcceptButton = tray;
    }
    private void Choose(string value) { Choice = value; DialogResult = DialogResult.OK; Close(); }
}
