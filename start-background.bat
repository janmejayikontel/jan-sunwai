@echo off
echo Starting Jan Sunwai background services (Backend, Web, Caddy, Cloudflare Tunnel)...
wscript.exe "%~dp0start-background.vbs"
echo Services are now running silently in the background.
echo You can close this window.
timeout /t 3 >nul
