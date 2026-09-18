@echo off
echo Stopping Jan Sunwai services...
powershell -Command "Get-Process -Name node, caddy, cloudflared -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*jan-sunwai*' -or $_.Path -like '*caddy*' -or $_.Path -like '*cloudflared*' } | Stop-Process -Force"
powershell -Command "Get-Process powershell -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*keep-alive.ps1*' } | Stop-Process -Force"
echo All Jan Sunwai services stopped.
pause
