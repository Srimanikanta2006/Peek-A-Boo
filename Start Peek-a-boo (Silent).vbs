Set WshShell = CreateObject("WScript.Shell")
' Shells opened from VS Code can carry this, which makes Electron run as plain Node.
On Error Resume Next
WshShell.Environment("Process").Remove "ELECTRON_RUN_AS_NODE"
On Error GoTo 0
appDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\desktop-app"
WshShell.CurrentDirectory = appDir
WshShell.Run """" & appDir & "\node_modules\electron\dist\electron.exe"" .", 0, False
