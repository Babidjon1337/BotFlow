#!/bin/bash
# ============================================================
# BotFlow — Server Update Script
# Usage: /opt/BotFlow/update.sh
# Run this on the server after pushing changes to GitHub
# ============================================================
set -e

BOTFATHER_DIR="/var/www/BotFlow"
SERVICE_NAME="botflow"

echo "========================================"
echo "  BotFlow Update Script"
echo "========================================"

# Step 1: Pull latest code
echo ""
echo "[1/5] Pulling latest code from git..."
cd $BOTFATHER_DIR
git pull origin main

# Step 2: Backend dependencies
echo ""
echo "[2/5] Updating backend dependencies..."
cd $BOTFATHER_DIR/backend
source venv/bin/activate
pip install -r requirements.txt --quiet

# Step 3: Database migrations
echo ""
echo "[3/5] Applying database migrations..."
alembic upgrade head

# Step 4: Build frontend
echo ""
echo "[4/5] Building frontend..."
cd $BOTFATHER_DIR/frontend
npm install --silent
npm run build

# Step 5: Restart service
echo ""
echo "[5/5] Restarting backend service..."
systemctl restart $SERVICE_NAME

echo ""
echo "========================================"
echo "  Done! Checking service status..."
echo "========================================"
systemctl status $SERVICE_NAME --no-pager -l
