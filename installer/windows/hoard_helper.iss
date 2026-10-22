; Hoard Helper installer (Inno Setup 6). Built by .github/workflows/hoard-helper.yml:
;   iscc /DAppVersion=<version> installer\windows\hoard_helper.iss
; Per-user install (no admin): bridge in %LOCALAPPDATA%\Programs\Hoard Helper, registered
; for Chrome, Edge, Brave and Chromium under HKCU.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{D9557A83-77A7-4EB1-84AE-A6B3FE4DF51B}
AppName=Hoard Helper
AppVersion={#AppVersion}
AppVerName=Hoard Helper {#AppVersion}
AppPublisher=Hoard
AppPublisherURL=https://github.com/druchen/Hoard
DefaultDirName={localappdata}\Programs\Hoard Helper
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
PrivilegesRequired=lowest
OutputDir=..\..\dist
OutputBaseFilename=Hoard-Helper-Windows
SetupIconFile=..\..\build\windows\hoard.ico
UninstallDisplayIcon={app}\bridge\hoard-bridge.exe
UninstallDisplayName=Hoard Helper
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

[Files]
Source: "..\..\build\windows\pyinstaller\hoard-bridge\*"; DestDir: "{app}\bridge"; Flags: recursesubdirs ignoreversion
Source: "..\..\build\windows\com.hoard.bridge.json"; DestDir: "{app}"; Flags: ignoreversion

[Registry]
Root: HKCU; Subkey: "Software\Google\Chrome\NativeMessagingHosts\com.hoard.bridge"; ValueType: string; ValueName: ""; ValueData: "{app}\com.hoard.bridge.json"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Microsoft\Edge\NativeMessagingHosts\com.hoard.bridge"; ValueType: string; ValueName: ""; ValueData: "{app}\com.hoard.bridge.json"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.hoard.bridge"; ValueType: string; ValueName: ""; ValueData: "{app}\com.hoard.bridge.json"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Chromium\NativeMessagingHosts\com.hoard.bridge"; ValueType: string; ValueName: ""; ValueData: "{app}\com.hoard.bridge.json"; Flags: uninsdeletekey

[Messages]
FinishedLabel=Hoard Helper is installed. Open Hoard settings in Chrome (or click "Check again") to connect.
