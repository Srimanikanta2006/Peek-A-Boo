Set WshShell = CreateObject("WScript.Shell")
appDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\desktop-app"
WshShell.CurrentDirectory = appDir
WshShell.Run "node_modules\electron\dist\electron.exe .", 0, False
