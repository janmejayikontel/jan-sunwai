#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Jan Sunwai — Full Server Automated Setup Script
# Platform: Ubuntu 20.04 / 22.04 / 24.04
# Run as:   sudo bash setup-server.sh
#
# This script installs:
#   - Node.js 20 LTS
#   - PM2 (process manager, auto-restart on crash/reboot)
#   - Caddy (reverse proxy with auto HTTPS)
#   - Jan Sunwai backend (server/) and web dashboard (web/)
#
# NOTE: LiveKit is managed via LiveKit Cloud (no self-hosting needed)
# ═══════════════════════════════════════════════════════════════════

set -e
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

[[ $EUID -ne 0 ]] && error "Run as root: sudo bash setup-server.sh"

# ─── 1. System ──────────────────────────────────────────────────────
info "Updating system..."
apt-get update -y && apt-get upgrade -y
apt-get install -y curl wget git unzip software-properties-common build-essential

# ─── 2. Node.js 20 LTS ──────────────────────────────────────────────
info "Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
node --version && npm --version

# ─── 3. PM2 ────────────────────────────────────────────────────────
info "Installing PM2..."
npm install -g pm2
pm2 startup systemd -u root --hp /root || true

# ─── 4. Caddy ───────────────────────────────────────────────────────
info "Installing Caddy (auto HTTPS reverse proxy)..."
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy

# ─── 5. Clone / Update repo ─────────────────────────────────────────
APP_DIR="/opt/jan-sunwai"
if [ -d "$APP_DIR/.git" ]; then
    info "Repo exists, pulling latest..."
    cd $APP_DIR && git pull origin main
else
    read -p "Enter your GitHub repo URL (e.g. https://github.com/janmejayikontel/jan-sunwai.git): " REPO_URL
    git clone "$REPO_URL" $APP_DIR
fi

# ─── 6. Build server (Node.js / TypeScript) ─────────────────────────
info "Building server..."
cd $APP_DIR/server
npm install
npm run build
info "Server built ✅"

# ─── 7. Build web dashboard (Next.js) ───────────────────────────────
info "Building web dashboard..."
cd $APP_DIR/web
npm install
npm run build
info "Web dashboard built ✅"

# ─── 8. Create data & log directories ───────────────────────────────
mkdir -p $APP_DIR/server/data /var/log/jan-sunwai

# ─── 9. Setup server .env ───────────────────────────────────────────
if [ ! -f "$APP_DIR/server/.env" ]; then
    cp $APP_DIR/server/.env.example $APP_DIR/server/.env
    warn ".env created from example. EDIT IT BEFORE CONTINUING."
    warn "  nano $APP_DIR/server/.env"
fi

# ─── 10. PM2 ecosystem file ─────────────────────────────────────────
cat > $APP_DIR/ecosystem.config.js << 'PMEOF'
module.exports = {
  apps: [
    {
      name: 'jan-sunwai-api',
      cwd: '/opt/jan-sunwai/server',
      script: 'dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      error_file: '/var/log/jan-sunwai/api-error.log',
      out_file: '/var/log/jan-sunwai/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'jan-sunwai-web',
      cwd: '/opt/jan-sunwai/web',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: '/var/log/jan-sunwai/web-error.log',
      out_file: '/var/log/jan-sunwai/web-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
PMEOF

# ─── 11. Start with PM2 ─────────────────────────────────────────────
cd $APP_DIR
pm2 start ecosystem.config.js
pm2 save
info "Apps started with PM2 ✅"

# ─── 12. Caddy configuration ────────────────────────────────────────
read -p "Enter your domain or DuckDNS subdomain (e.g. jansunwai.duckdns.org): " DOMAIN

cat > /etc/caddy/Caddyfile << CADDYEOF
$DOMAIN {
    # WebSocket signaling
    handle /ws* {
        reverse_proxy localhost:3001
    }

    # REST API
    handle /api/* {
        reverse_proxy localhost:3001
    }

    # APK direct download
    handle /app-release.apk {
        root * /opt/jan-sunwai/web/public
        file_server
    }

    # Next.js web dashboard
    handle {
        reverse_proxy localhost:3000
    }

    encode gzip

    log {
        output file /var/log/jan-sunwai/caddy.log
        format json
    }
}
CADDYEOF

systemctl enable caddy
systemctl restart caddy
info "Caddy configured for $DOMAIN ✅"

# ─── 13. UFW Firewall ───────────────────────────────────────────────
info "Configuring firewall..."
ufw allow OpenSSH
ufw allow 80/tcp    # HTTP → Caddy auto-redirects to HTTPS
ufw allow 443/tcp   # HTTPS
echo "y" | ufw enable
ufw status

# ─── 14. Done ───────────────────────────────────────────────────────
SERVER_IP=$(curl -s ifconfig.me || echo "YOUR_SERVER_IP")
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo -e "║  ${GREEN}Jan Sunwai Server Deployed Successfully!${NC}              ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Web Dashboard:  https://$DOMAIN"
echo "║  APK Download:   https://$DOMAIN/app-release.apk"
echo "║  API:            https://$DOMAIN/api"
echo "║  Server IP:      $SERVER_IP"
echo "╠══════════════════════════════════════════════════════════╣"
echo -e "║  ${YELLOW}IMPORTANT — Check these:${NC}"
echo "║"
echo "║  1. DuckDNS: Point $DOMAIN → $SERVER_IP"
echo "║     https://www.duckdns.org"
echo "║"
echo "║  2. Edit .env if not already done:"
echo "║     nano /opt/jan-sunwai/server/.env"
echo "║"
echo "║  3. Useful commands:"
echo "║     pm2 status          → app status"
echo "║     pm2 logs            → live logs"
echo "║     pm2 restart all     → restart"
echo "║     bash /opt/jan-sunwai/deploy/update.sh → pull + deploy"
echo "╚══════════════════════════════════════════════════════════╝"
