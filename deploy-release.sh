#!/bin/bash
set -e

# Configuration
PROJECT_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVICE_DIR="$HOME/.config/systemd/user"

# Default Port
CLAWUI_PORT=${1:-8899}
SERVICE_NAME="openclaw-webui-${CLAWUI_PORT}"

echo "================================================"
echo "   OpenClaw Agent WebUI - Deployment Script"
echo "================================================"
echo "Project Root:   $PROJECT_ROOT"
echo "Service Port:   $CLAWUI_PORT"
echo "Service Name:   $SERVICE_NAME"
echo "================================================"

echo ""
echo "[1/5] Installing dependencies..."
cd "$PROJECT_ROOT"
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

echo ""
echo "[2/5] Building projects..."
npm run build

echo ""
echo "[3/5] Setting up systemd service..."
mkdir -p "$SERVICE_DIR"

# Remove old services with legacy names
for old_service in clawui.service openclaw-webui.service; do
    if [ -f "$SERVICE_DIR/$old_service" ]; then
        echo "Removing legacy service: $old_service"
        systemctl --user stop "$old_service" 2>/dev/null || true
        systemctl --user disable "$old_service" 2>/dev/null || true
        rm -f "$SERVICE_DIR/$old_service"
    fi
done

# Create service file
cat > "$SERVICE_DIR/$SERVICE_NAME.service" << EOF
[Unit]
Description=OpenClaw Agent WebUI (Port $CLAWUI_PORT)
After=network.target

[Service]
Type=simple
Environment=PORT=$CLAWUI_PORT
Environment=NODE_ENV=production
Environment=CLAWUI_DATA_DIR=.clawui
WorkingDirectory=$PROJECT_ROOT/backend
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
EOF

echo ""
echo "[4/5] Reloading systemd daemon..."
systemctl --user daemon-reload

echo ""
echo "[5/5] Enabling and starting service..."
systemctl --user enable "$SERVICE_NAME.service"
systemctl --user restart "$SERVICE_NAME.service"

# Ensure services stay running after logout
echo ""
echo "Enabling lingering for user $(whoami)..."
if command -v loginctl >/dev/null 2>&1; then
    sudo loginctl enable-linger $(whoami) 2>/dev/null || echo "Note: Could not enable lingering. Run manually: sudo loginctl enable-linger $(whoami)"
fi

# Get local IP address
LOCAL_IP=$(hostname -I | awk '{print $1}')
[ -z "$LOCAL_IP" ] && LOCAL_IP="localhost"

echo ""
echo "================================================"
echo "   Deployment Complete!"
echo "================================================"
echo "Local Access:    http://localhost:$CLAWUI_PORT"
echo "Network Access:  http://$LOCAL_IP:$CLAWUI_PORT"
echo "Service Status:  systemctl --user status $SERVICE_NAME"
echo "View Logs:       journalctl --user -u $SERVICE_NAME -f"
echo "================================================"