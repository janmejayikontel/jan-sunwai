Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File ""d:\jan-sunwai-main\jan-sunwai-main\scripts\keep-alive.ps1""", 0, False
