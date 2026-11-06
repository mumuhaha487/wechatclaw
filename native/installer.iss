#ifndef AppVersion
  #define AppVersion "0.3.47"
#endif

[Setup]
AppId={{7066B035-F343-4D23-A810-BAD6B7F76155}
AppName=QQClaw
AppVersion={#AppVersion}
AppPublisher=QQClaw
AppPublisherURL=https://github.com/mumuhaha487/wechatclaw
DefaultDirName={localappdata}\Programs\QQClaw
DefaultGroupName=QQClaw
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
WizardStyle=modern
Compression=lzma2/fast
SolidCompression=yes
UninstallDisplayIcon={app}\QQClaw.exe
CloseApplications=yes
CloseApplicationsFilter=QQClaw.exe
RestartApplications=no
OutputDir={#InstallerOutput}
OutputBaseFilename={#InstallerName}

[Languages]
Name: "chinesesimplified"; MessagesFile: "compiler:Default.isl"

[LangOptions]
LanguageName=简体中文
LanguageID=$0804
DialogFontName=Microsoft YaHei UI

[Messages]
SetupWindowTitle=安装 - %1
WelcomeLabel1=欢迎使用 [name] 安装向导
WelcomeLabel2=本向导将在您的电脑上安装 [name/ver]。%n%n点击“下一步”继续安装。
ButtonBack=< 上一步(&B)
ButtonNext=下一步(&N) >
ButtonInstall=安装(&I)
ButtonCancel=取消
ButtonFinish=完成(&F)
SelectDirLabel3=安装程序将把 [name] 安装到下列文件夹。
SelectDirBrowseLabel=如需更改安装目录，请点击“浏览”。
SelectDirDesc=请选择安装位置。
WizardSelectDir=选择安装位置
WizardSelectTasks=选择附加任务
WizardReady=准备安装
WizardInstalling=正在安装
InstallingLabel=安装程序正在将 [name] 安装到您的电脑，请稍候。
WizardUninstalling=正在卸载
ButtonBrowse=浏览(&B)...
SelectTasksLabel2=选择要添加的快捷方式，然后点击“下一步”。
SelectTasksDesc=选择附加任务。
ReadyLabel1=现在可以开始在电脑上安装 [name]。
ReadyLabel2a=点击“安装”继续；如需更改设置，请点击“上一步”。
FinishedHeadingLabel=[name] 安装完成
FinishedLabelNoIcons=安装程序已将 [name] 安装到您的电脑。
FinishedLabel=安装程序已将 [name] 安装到您的电脑。可以通过已创建的快捷方式启动程序。
ClickFinish=点击“完成”退出安装向导。
StatusExtractFiles=正在安装程序文件...
StatusCreateIcons=正在创建快捷方式...
ConfirmUninstall=是否卸载 %1？%n%n卸载不会删除您的会话、微信账户或工作目录文件。
UninstalledAll=%1 已成功卸载。会话和个人数据已保留。

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "快捷方式："

[Files]
Source: "{#AppExecutable}"; DestDir: "{app}"; DestName: "QQClaw.exe"; Flags: ignoreversion

[Icons]
Name: "{group}\QQClaw"; Filename: "{app}\QQClaw.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\QQClaw"; Filename: "{app}\QQClaw.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\QQClaw.exe"; Description: "启动 QQClaw"; Flags: nowait postinstall skipifsilent
Filename: "{app}\QQClaw.exe"; Flags: nowait skipifnotsilent; Check: LaunchAfterUpdate

[Code]
function LaunchAfterUpdate: Boolean;
begin
  Result := ExpandConstant('{param:LAUNCH|0}') = '1';
end;
