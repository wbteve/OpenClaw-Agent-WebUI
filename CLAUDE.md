# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**OpenClaw Chat Gateway** is a production-grade Web client for the OpenClaw ecosystem. It provides a multi-agent sandboxing management solution with a responsive React frontend and Express backend that connects to the OpenClaw gateway via WebSocket.

## Development Commands

### Full Stack (from root)
```bash
npm run dev          # Development mode: backend on :3100, frontend on :3105
npm run build        # Build both backend and frontend
npm run release      # Production mode: backend on :3110, frontend on :3115
```

### Backend Only (from backend/)
```bash
npm run dev          # Development with nodemon + ts-node
npm run build        # TypeScript compilation to dist/
npm start            # Run compiled dist/index.js
```

### Frontend Only (from frontend/)
```bash
npm run dev          # Vite dev server with API proxy
npm run build        # Production build to dist/
```

### Environment Variables
- `BACKEND_PORT` - Backend server port (default: 3100)
- `FRONTEND_PORT` - Frontend dev server port (default: 3105)
- `CLAWUI_DATA_DIR` - Data directory for SQLite DB and uploads (default: `.clawui`)

## Architecture

### Backend (`backend/src/`)
- **index.ts** - Express server with all API routes. Handles REST endpoints for sessions, chat, files, models, endpoints, and characters. Also serves static frontend assets.
- **openclaw-client.ts** - WebSocket client connecting to OpenClaw gateway. Emits `chat.delta` and `chat.final` events for streaming responses.
- **session-manager.ts** - Manages chat sessions (create, update, delete, reorder). Each session has an associated agentId.
- **config-manager.ts** - App-level configuration stored in SQLite (gateway URL, auth, language, etc.).
- **agent-provisioner.ts** - Creates isolated agent workspaces at `~/.openclaw/workspace-{agentId}/`. Each agent has its own SOUL.md, USER.md, AGENTS.md files and memory directory. Also manages model configurations in `~/.openclaw/openclaw.json`.
- **db.ts** - SQLite database layer using better-sqlite3. Tables: sessions, characters, chat_messages, files, quick_commands, config.

### Frontend (`frontend/src/`)
- **App.tsx** - Main component with hash-based routing between chat and settings views. Manages auth state and session list.
- **components/Sidebar.tsx** - Session list with drag-to-reorder, settings navigation.
- **components/ChatView.tsx** - Main chat interface with message streaming via WebSocket.
- **components/SettingsView.tsx** - Tabbed settings for gateway, general, models, commands, and about.
- **config/api.ts** - Simple API helper using `/api` prefix.

### Key Data Flows
1. **Chat messages**: Frontend → POST `/api/chat` → Backend → OpenClawClient.sendChatMessageStreaming() → WebSocket to OpenClaw gateway → Streaming events back to frontend via WebSocket
2. **Agent provisioning**: POST `/api/characters` → AgentProvisioner.provision() → Creates workspace directory and updates `~/.openclaw/openclaw.json`
3. **File uploads**: POST `/api/files/upload` → Stored in `workspace-{agentId}/uploads/` for proper workspace isolation

### OpenClaw Integration
- Requires OpenClaw installed at `~/.openclaw`
- Gateway URL default: `ws://127.0.0.1:18789`
- Agent workspaces: `~/.openclaw/workspace-{agentId}/`
- Agent configs registered in `~/.openclaw/openclaw.json` under `agents.list[]`
- Models configured in `~/.openclaw/openclaw.json` under `agents.defaults.models`

## API Endpoints (Key Routes)

| Route | Description |
|-------|-------------|
| `GET /api/sessions` | List all chat sessions |
| `POST /api/sessions` | Create new session |
| `GET /api/history/:sessionId` | Get chat history for session |
| `POST /api/chat` | Send chat message (returns streaming response) |
| `GET /api/characters` | List all agents/characters |
| `POST /api/characters` | Create new agent (provisions workspace) |
| `GET /api/models` | List available models from OpenClaw config |
| `POST /api/models/manage` | Add model to configuration |
| `GET /api/endpoints` | List model provider endpoints |
| `GET /api/gateway/status` | Check connection to OpenClaw gateway |
| `GET /api/config` | Get app configuration |
| `POST /api/config` | Update app configuration |

## Deployment

The `deploy-release.sh` script:
1. Installs npm dependencies
2. Builds both projects
3. Creates a systemd user service at `~/.config/systemd/user/clawui-{port}.service`
4. Enables lingering for the user

Default production port is 3115. Custom port: `./deploy-release.sh 8080`