# Welcome to the Antigravity Jules Integration Wiki

This project connects **Google's Jules API** directly to **VS Code** via the Model Context Protocol (MCP), enabling a seamless, AI-powered coding experience.

> [!NOTE]
> **Compatibility Notice**: This extension currently **requires [Antigravity](https://antigravity.dev)** to function. A standalone VS Code version will be released soon.

### Preview

<div align="center">
  <img src="https://raw.githubusercontent.com/sajid-mah-m/antigravity-jules-integration/master/resources/ui-active-sessions.png" alt="Active Sessions Panel" width="45%">
  <img src="https://raw.githubusercontent.com/sajid-mah-m/antigravity-jules-integration/master/resources/ui-new-session.png" alt="New Session Wizard" width="45%">
</div>

## Key Features

*   **Lazy Loading**: Session logs are fetched only when you need them, saving API quota.
*   **Robust Retry Logic**: Automatically handles `429` rate limits with exponential backoff.
*   **Context Awareness**: Automatically gathers file context and git diffs for Jules.
*   **Two-Way Sync**: Apply AI suggestions directly to your local codebase.

## Navigation

*   [Architecture Guide](https://github.com/sajid-mah-m/antigravity-jules-integration/blob/master/docs/Architecture.md) - Learn how the extension is built.
*   [Troubleshooting](https://github.com/sajid-mah-m/antigravity-jules-integration/blob/master/docs/Troubleshooting.md) - Common issues and fixes.
*   [Contributing](https://github.com/sajid-mah-m/antigravity-jules-integration/blob/master/CONTRIBUTING.md) - How to get involved.
