#!/bin/bash
# ═════════════════════════════════════════════════
# Jan Sunwai — Update Deployed App from GitHub
# Run: bash /opt/jan-sunwai/deploy/update.sh
# ═════════════════════════════════════════════════
set -e
APP_DIR="/opt/jan-sunwai"
echo "Pulling latest code from GitHub..."
cd $APP_DIR && git pull origin main

echo "Rebuilding server..."
cd $APP_DIR/server && npm install && npm run build

echo "Rebuilding web dashboard..."
cd $APP_DIR/web && npm install && npm run build

echo "Restarting apps..."
pm2 restart jan-sunwai-api
pm2 restart jan-sunwai-web

echo "Done! Status:"
pm2 status
