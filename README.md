# Jules for Antigravity

> Bridge local Antigravity agents to remote Jules orchestration via MCP.

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](package.json)
[![Protocol](https://img.shields.io/badge/MCP-2024--11--05-green.svg)](https://spec.modelcontextprotocol.io/)

## Overview

**Jules for Antigravity** (`antigravity-jules-integration`) is a VS Code extension that creates a bi-directional bridge between local Antigravity agents and the remote Jules orchestration service. It enables:

1. **Task Delegation**: Local agents can delegate complex coding tasks to Jules via MCP.
2. **Session Monitoring**: A reactive WebView panel displays active sessions and "Thought Signatures".
3. **Automatic Synchronization**: Remote changes are patched into the local workspace using Git primitives.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     VS Code Extension                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ JulesPanel  │  │ JulesClient  │  │ BridgeServer (MCP)    │  │
│  │ (WebView)   │──│ (API Client) │──│ Stdio Transport       │  │
│  └─────────────┘  └──────────────┘  └───────────────────────┘  │
│         │                │                      │               │
│         └────────────────┼──────────────────────┘               │
│                          ▼                                      │
│                   ┌─────────────┐                               │
│                   │ GitContext  │                               │
│                   └─────────────┘                               │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │  Remote Jules Service  │
              └────────────────────────┘
```

## Features

### 🎯 MCP Bridge Server

The extension exposes an MCP server with the `delegate_to_jules` tool:

```json
{
  "name": "delegate_to_jules",
  "description": "Delegate a coding task to the remote Jules orchestration service",
  "inputSchema": {
    "type": "object",
    "properties": {
      "task": { "type": "string" },
      "context_files": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["task", "context_files"]
  }
}
```

### 📊 Session Monitoring Panel

- Real-time session status updates via long-polling
- "Thought Signatures" display showing agent reasoning
- One-click application of remote changes

### 🔄 Git Integration

- Automatic fetching of remote branches
- Merge/rebase/patch strategies for applying changes
- Conflict detection and resolution support

## Installation

```bash
# Clone the repository
git clone https://github.com/antigravity/antigravity-jules-integration.git

# Install dependencies
npm install

# Compile TypeScript
npm run compile
```

## Development

```bash
# Watch mode for development
npm run watch

# Run linter
npm run lint

# Package extension
npx vsce package
```

## Configuration

### API Key

Set your Jules API key using one of these methods:

1. **Command Palette**: `Jules: Set API Key`
2. **Environment Variable**: `JULES_API_KEY`
3. **VS Code Settings**: `julesForAntigravity.apiKey`

### Antigravity Detection

The extension automatically detects Antigravity environments by checking:

- Antigravity VS Code extensions
- Configuration files in `~/.antigravity/`
- Environment variables (`ANTIGRAVITY_ENABLED`, `GEMINI_API_KEY`)
- `.gemini` directory in workspace

## Protocol Compliance

This extension strictly adheres to:

- **Model Context Protocol**: Version 2024-11-05
- **JSON-RPC 2.0**: For MCP communication
- **Stdio Transport**: For MCP server

## License

MIT © Antigravity Platform
