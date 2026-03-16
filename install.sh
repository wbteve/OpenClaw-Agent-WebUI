#!/bin/bash
set -e

# Configuration
REPO_URL="https://github.com/Jioyzen/OpenClaw-Agent-WebUI.git"
INSTALL_DIR="$HOME/OpenClaw-Agent-WebUI"
DEFAULT_PORT=8899

# Terminal Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "================================================"
echo "   OpenClaw Agent WebUI - Installation Script"
echo "================================================"
echo -e "${NC}"

# Check for Prerequisites
echo -e "${BLUE}[1/4] Checking prerequisites...${NC}"

if ! command -v git &> /dev/null; then
    echo -e "${YELLOW}Git not found. Installing git...${NC}"
    sudo apt update && sudo apt install -y git
fi

if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed.${NC}"
    echo -e "${YELLOW}Please install Node.js v18+ first:${NC}"
    echo -e "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    echo -e "  sudo apt install -y nodejs"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed.${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}Error: Node.js version must be 18 or higher. Current: $(node -v)${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Node.js: $(node -v)${NC}"
echo -e "${GREEN}✓ npm: $(npm -v)${NC}"
echo -e "${GREEN}✓ git: $(git --version | cut -d' ' -f3)${NC}"

# Clone Repository
echo -e "${BLUE}[2/4] Cloning repository...${NC}"
if [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}Directory $INSTALL_DIR already exists. Updating...${NC}"
    cd "$INSTALL_DIR"
    git pull
else
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# Run Deployment Script
echo -e "${BLUE}[3/4] Building and deploying...${NC}"
chmod +x deploy-release.sh
./deploy-release.sh "${1:-$DEFAULT_PORT}"

# Get local IP address
LOCAL_IP=$(hostname -I | awk '{print $1}')
[ -z "$LOCAL_IP" ] && LOCAL_IP="localhost"
CLAWUI_PORT=${1:-$DEFAULT_PORT}

echo -e "${GREEN}"
echo "================================================"
echo "   Installation Complete!"
echo "================================================"
echo -e "${NC}"
echo -e "Access URL:      ${GREEN}http://$LOCAL_IP:$CLAWUI_PORT${NC}"
echo -e "Install Dir:     $INSTALL_DIR"
echo -e "Data Dir:        $HOME/.clawui"
echo ""
echo -e "${BLUE}------------------------------------------------${NC}"
echo -e "${YELLOW}Tip: Install LibreOffice for better document preview:${NC}"
echo -e "  ${GREEN}sudo apt update && sudo apt install libreoffice -y${NC}"
echo -e "${BLUE}------------------------------------------------${NC}"
echo ""
echo -e "Service commands:"
echo -e "  Status:   ${GREEN}systemctl --user status openclaw-webui-$CLAWUI_PORT${NC}"
echo -e "  Stop:     ${GREEN}systemctl --user stop openclaw-webui-$CLAWUI_PORT${NC}"
echo -e "  Restart:  ${GREEN}systemctl --user restart openclaw-webui-$CLAWUI_PORT${NC}"
echo -e "  Logs:     ${GREEN}journalctl --user -u openclaw-webui-$CLAWUI_PORT -f${NC}"