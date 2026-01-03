# Welcome to the Antigravity Jules Integration Wiki

This project connects **Google's Jules API** directly to **VS Code** via the Model Context Protocol (MCP), enabling a seamless, AI-powered coding experience.

## Key Features

*   **Lazy Loading**: Session logs are fetched only when you need them, saving API quota.
*   **Robust Retry Logic**: Automatically handles `429` rate limits with exponential backoff.
*   **Context Awareness**: Automatically gathers file context and git diffs for Jules.
*   **Two-Way Sync**: Apply AI suggestions directly to your local codebase.

## Navigation

*   [Architecture Guide](Architecture.md) - Learn how the extension is built.
*   [Troubleshooting](Troubleshooting.md) - Common issues and fixes.
*   [Contributing](../CONTRIBUTING.md) - How to get involved.
