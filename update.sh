#!/bin/bash
set -e

# Configuration
INSTALL_DIR="$HOME/OpenClaw-Agent-WebUI"
DEFAULT_PORT=8899

# Terminal Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Detect installation directory
PROJECT_ROOT=""
if [ -f "deploy-release.sh" ]; then
    PROJECT_ROOT="$(pwd)"
elif [ -d "$INSTALL_DIR" ]; then
    PROJECT_ROOT="$INSTALL_DIR"
else
    echo -e "${RED}Error: Could not find OpenClaw Agent WebUI installation.${NC}"
    echo -e "Checked: $(pwd) and $INSTALL_DIR"
    exit 1
fi

SERVICE_DIR="$HOME/.config/systemd/user"

echo -e "${BLUE}"
echo "================================================"
echo "   OpenClaw Agent WebUI - Update Script"
echo "================================================"
echo -e "${NC}"

# Detect existing port from service files
EXISTING_PORT=""
SERVICES=$(ls $SERVICE_DIR/openclaw-webui-*.service 2>/dev/null | sort -V || true)

if [ -n "$SERVICES" ]; then
    FIRST_SERVICE=$(echo "$SERVICES" | head -n 1)
    EXISTING_PORT=$(basename "$FIRST_SERVICE" | sed 's/openclaw-webui-\([0-9]*\)\.service/\1/')
    echo -e "${GREEN}Detected running port: $EXISTING_PORT${NC}"
else
    # Check for legacy service names
    for legacy in clawui-*.service clawui.service; do
        if ls $SERVICE_DIR/$legacy 2>/dev/null | head -n 1 | grep -q .; then
            EXISTING_PORT="8899"
            echo -e "${YELLOW}Detected legacy installation, migrating to port $DEFAULT_PORT${NC}"
            break
        fi
    done
fi

TARGET_PORT=${1:-$EXISTING_PORT}
TARGET_PORT=${TARGET_PORT:-$DEFAULT_PORT}

echo -e "${BLUE}Project directory: $PROJECT_ROOT${NC}"
echo -e "${BLUE}Target port: $TARGET_PORT${NC}"
echo ""

echo -e "${BLUE}[1/2] Pulling latest code from GitHub...${NC}"
cd "$PROJECT_ROOT"
git pull

echo -e "${BLUE}[2/2] Rebuilding and redeploying...${NC}"
./deploy-release.sh "$TARGET_PORT"

echo ""
echo -e "${GREEN}================================================"
echo "   Update Complete!"
echo "================================================${NC}"
echo -e "Access URL: ${GREEN}http://$(hostname -I | awk '{print $1}' || echo 'localhost'):$TARGET_PORT${NC}"
echo -e "Your data and settings have been preserved."