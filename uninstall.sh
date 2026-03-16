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

# Detect service directory and database
SERVICE_DIR="$HOME/.config/systemd/user"
DB_PATH="$HOME/.clawui/clawui.sqlite"
WORKSPACE_BASE="$HOME/.openclaw"

# Find all OpenClaw WebUI services
SERVICES=$(ls $SERVICE_DIR/openclaw-webui-*.service 2>/dev/null || true)
# Also check for legacy service names
for legacy in clawui.service clawui-*.service; do
    if ls $SERVICE_DIR/$legacy 2>/dev/null | head -n 1 | grep -q . 2>/dev/null; then
        SERVICES="$SERVICES $(ls $SERVICE_DIR/$legacy 2>/dev/null)"
    fi
done

# Detect project directories from service files
DETECTED_DIRS=""
for S_PATH in $SERVICES; do
    if [ -f "$S_PATH" ]; then
        W_DIR=$(grep "^WorkingDirectory=" "$S_PATH" | cut -d'=' -f2)
        P_DIR=$(dirname "$W_DIR")
        if [ -d "$P_DIR" ]; then
            DETECTED_DIRS="$DETECTED_DIRS $P_DIR"
        fi
    fi
done

# Add current directory if it contains deploy script
if [ -f "./deploy-release.sh" ]; then
    DETECTED_DIRS="$DETECTED_DIRS $(pwd)"
fi

# Add default install directory
DETECTED_DIRS="$DETECTED_DIRS $INSTALL_DIR"

# Remove duplicates and empty entries
CLEAN_DIRS=$(echo "$DETECTED_DIRS" | tr ' ' '\n' | sort -u | grep -v "^$" || true)

# Detect workspaces associated with this project
TARGET_WORKSPACES=""

# From SQLite database (if exists)
if [ -f "$DB_PATH" ] && command -v sqlite3 &>/dev/null; then
    AGENT_IDS=$(sqlite3 "$DB_PATH" "SELECT DISTINCT agentId FROM characters;" 2>/dev/null || true)
    for id in $AGENT_IDS; do
        if [ "$id" == "main" ]; then
            TARGET_WORKSPACES="$TARGET_WORKSPACES $WORKSPACE_BASE/workspace-main"
        else
            TARGET_WORKSPACES="$TARGET_WORKSPACES $WORKSPACE_BASE/workspace-$id"
        fi
    done
fi

# From openclaw.json
OPENCLAW_CONFIG="$WORKSPACE_BASE/openclaw.json"
if [ -f "$OPENCLAW_CONFIG" ]; then
    if command -v jq &>/dev/null; then
        JSON_WS=$(jq -r '.agents.list[].workspace' "$OPENCLAW_CONFIG" 2>/dev/null || true)
        TARGET_WORKSPACES="$TARGET_WORKSPACES $JSON_WS"
    else
        JSON_WS=$(grep '"workspace":' "$OPENCLAW_CONFIG" | sed 's/.*"workspace": "\(.*\)".*/\1/' || true)
        TARGET_WORKSPACES="$TARGET_WORKSPACES $JSON_WS"
    fi
fi

# Heuristic scan for workspace directories
if [ -d "$WORKSPACE_BASE" ]; then
    H_WS=$(find "$WORKSPACE_BASE" -maxdepth 2 -type f -name "SOUL.md" 2>/dev/null | xargs -I {} dirname {} | grep "/workspace-" || true)
    TARGET_WORKSPACES="$TARGET_WORKSPACES $H_WS"
fi

# Include main workspace if exists
[ -d "$WORKSPACE_BASE/workspace-main" ] && TARGET_WORKSPACES="$TARGET_WORKSPACES $WORKSPACE_BASE/workspace-main"

# Clean and deduplicate workspace list
CLEAN_WS=""
for ws in $TARGET_WORKSPACES; do
    [ -d "$ws" ] && CLEAN_WS="$CLEAN_WS $ws"
done
TARGET_WORKSPACES=$(echo "$CLEAN_WS" | tr ' ' '\n' | sort -u | grep -v "^$" || true)

# Show warning and confirm
echo -e "${RED}"
echo "================================================"
echo "   WARNING: This will DELETE the following:"
echo "================================================${NC}"
echo ""
for d in $CLEAN_DIRS; do
    [ -d "$d" ] && echo -e " ${RED}•${NC} $d ${YELLOW}(project files)${NC}"
done
for ws in $TARGET_WORKSPACES; do
    echo -e " ${RED}•${NC} $ws ${YELLOW}(agent workspace)${NC}"
done
echo -e " ${RED}•${NC} $HOME/.clawui ${YELLOW}(database & runtime data)${NC}"
echo ""

# Use /dev/tty for piped input
read -p "Are you sure you want to uninstall? (y/N) " confirm < /dev/tty

if [[ ! $confirm =~ ^[Yy]$ ]]; then
    echo "Uninstall cancelled."
    exit 0
fi

# Stop and remove services
echo -e "${BLUE}[1/3] Stopping and removing services...${NC}"
for S_PATH in $SERVICES; do
    if [ -f "$S_PATH" ]; then
        S_FILE=$(basename "$S_PATH")
        echo "Stopping: $S_FILE"
        systemctl --user stop "$S_FILE" 2>/dev/null || true
        systemctl --user disable "$S_FILE" 2>/dev/null || true
        rm "$S_PATH"
    fi
done
systemctl --user daemon-reload

# Remove data and workspaces
echo -e "${BLUE}[2/3] Removing data and workspaces...${NC}"
for ws in $TARGET_WORKSPACES; do
    if [ -d "$ws" ]; then
        rm -rf "$ws"
        echo "Removed workspace: $ws"
    fi
done

rm -rf "$HOME/.clawui"
rm -rf "$HOME/.clawui_release"
rm -rf "$HOME/.clawui_dev"
echo "Removed data directory: $HOME/.clawui"

# Remove project files
echo -e "${BLUE}[3/3] Removing project files...${NC}"
for d in $CLEAN_DIRS; do
    if [ -d "$d" ]; then
        rm -rf "$d"
        echo "Removed: $d"
    fi
done

echo ""
echo -e "${GREEN}================================================"
echo "   Uninstall Complete!"
echo "================================================${NC}"