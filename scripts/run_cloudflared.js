const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const cloudflaredPath = 'C:\\Users\\HP\\AppData\\Local\\cloudflared\\cloudflared.exe';
const rootDir = path.resolve(__dirname, '..');
const urlFile = path.join(rootDir, 'server-url.txt');
const configFile = path.join(rootDir, 'mobile', 'src', 'config.ts');

console.log('[TunnelManager] Spawning cloudflared...');
const proc = spawn(cloudflaredPath, ['tunnel', '--url', 'http://localhost:8080'], {
  stdio: ['ignore', 'pipe', 'pipe']
});

proc.on('error', (err) => {
  console.error('[TunnelManager] Failed to start cloudflared:', err);
});

function handleData(chunk) {
  const text = chunk.toString();
  process.stdout.write(text);
  const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
  if (match) {
    const url = match[0];
    console.log('\n========================================');
    console.log('[TunnelManager] DETECTED LIVE TUNNEL URL:', url);
    console.log('========================================\n');
    fs.writeFileSync(urlFile, url + '\n');
    if (fs.existsSync(configFile)) {
      let content = fs.readFileSync(configFile, 'utf8');
      content = content.replace(/export const DEFAULT_SERVER_URL = '[^']*';/, `export const DEFAULT_SERVER_URL = '${url}';`);
      fs.writeFileSync(configFile, content, 'utf8');
    }
  }
}

proc.stdout.on('data', handleData);
proc.stderr.on('data', handleData);

proc.on('exit', (code, sig) => {
  console.log(`[TunnelManager] cloudflared exited with code ${code}, signal ${sig}`);
});
