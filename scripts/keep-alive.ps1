# Jan Sunwai Persistent Background Supervisor
# Keeps Web (3000), Backend (3001), Caddy (8080), and Cloudflared running continuously

$RootDir = "d:\jan-sunwai-main\jan-sunwai-main"
$LogFile = "$RootDir\scripts\services.log"
$CaddyPath = "C:\Users\HP\AppData\Local\Microsoft\WinGet\Packages\CaddyServer.Caddy_Microsoft.Winget.Source_8wekyb3d8bbwe\caddy.exe"
$CloudflaredPath = "C:\Users\HP\AppData\Local\cloudflared\cloudflared.exe"
$NodeDir = "C:\Program Files\nodejs"
$env:PATH = "$NodeDir;$env:PATH"

function Log($msg) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $LogFile -Value "[$timestamp] $msg"
}

Log "=== Jan Sunwai Background Supervisor Started ==="

while ($true) {
    try {
        # 1. Check Backend on port 3001
        $backendConn = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
        if (-not $backendConn) {
            Log "Backend on 3001 not detected. Starting..."
            Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd /d $RootDir\server && npm run dev" -WindowStyle Hidden
            Start-Sleep -Seconds 5
        }

        # 2. Check Next.js Web on port 3000
        $webConn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
        if (-not $webConn) {
            Log "Web on 3000 not detected. Starting..."
            Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd /d $RootDir\web && npm run dev" -WindowStyle Hidden
            Start-Sleep -Seconds 5
        }

        # 3. Check Caddy on port 8080
        $caddyConn = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue
        if (-not $caddyConn) {
            Log "Caddy on 8080 not detected. Starting..."
            Start-Process -FilePath $CaddyPath -ArgumentList "run --config $RootDir\Caddyfile" -WorkingDirectory $RootDir -WindowStyle Hidden
            Start-Sleep -Seconds 3
        }

        # 4. Check Cloudflared Tunnel
        $cfProc = Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue
        if (-not $cfProc) {
            Log "Cloudflared not running. Starting..."
            $cfLog = "$RootDir\scripts\cloudflared.log"
            Start-Process -FilePath "cmd.exe" -ArgumentList "/c `"$CloudflaredPath`" tunnel --url http://localhost:8080 --protocol http2 --edge-ip-version 4 > `"$cfLog`" 2>&1" -WindowStyle Hidden
            Start-Sleep -Seconds 6

            # Extract assigned quick tunnel URL and update server-url.txt
            if (Test-Path $cfLog) {
                $lines = Get-Content $cfLog -ErrorAction SilentlyContinue
                $urlLine = $lines | Select-String -Pattern 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
                if ($urlLine -match '(https://[a-zA-Z0-9-]+\.trycloudflare\.com)') {
                    $newUrl = $matches[1]
                    Log "New Cloudflare Tunnel URL: $newUrl"
                    Set-Content -Path "$RootDir\server-url.txt" -Value $newUrl
                }
            }
        }
    } catch {
        Log "Error in supervisor loop: $_"
    }

    Start-Sleep -Seconds 15
}
