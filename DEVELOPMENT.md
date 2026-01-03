# Development Guide

This document provides an overview of the architecture and workflows for developing the **Antigravity Jules Integration** extension.

## Architecture

The extension is built with a clear separation of concerns:

-   **`src/julesClient.ts`**: The API Client layer. Handles all direct communication with the Google Jules API.
    -   *Key Pattern:* All API calls should be wrapped in `executeWithRetry` to handle rate limits (`429`) and transient errors (`503`).
-   **`src/panels/JulesPanel.ts`**: The Controller layer. Manages the Webview Panel state, polling logic, and message routing.
    -   *Key Logic:* Implements "Lazy Loading". The polling loop only fetches session status. Detailed logs (thought signatures) are fetched via `_handleGetThoughtSignatures` only when requested by the UI.
-   **`src/panels/panelContent.ts`**: The View layer. Generates the HTML/CSS/JS for the Webview.
    -   *Key Logic:* Uses vanilla JS for lightweight interactivity. Sends messages (commands) to the extension host for actions like `createSession` or `getThoughtSignatures`.

## Adding New Features

1.  **UI Updates (`panelContent.ts`)**:
    -   Modify the `getPanelContent` function to add new HTML elements.
    -   Add event listeners in the `<script>` section to post messages to the backend.
    -   Handle new message types in the `window.addEventListener('message', ...)` block.

2.  **Controller Logic (`JulesPanel.ts`)**:
    -   Add a handler for the new message in `_handleWebviewMessage`.
    -   Implement the logic (e.g., calling the API client).
    -   Post a success/error message back to the Webview.

3.  **API Interaction (`julesClient.ts`)**:
    -   Add new methods for API endpoints.
    -   Always use `executeWithRetry` for robustness.

## Conventions

-   **Logging**: Use `console.log` sparingly. Prefix logs with the class/method name (e.g., `[JulesPanel]`).
-   **Error Handling**: Never crush the extension process. Catch errors, log them, and send a user-friendly error message to the Webview.
-   **State Management**: The `JulesPanel` is the source of truth for session data. The Webview is a render target.

## Workflow

1.  Create a feature branch.
2.  Implement changes.
3.  Run `npm run compile` to catch TypeScript errors.
4.  Debug using the "Extension Development Host".
5.  Submit a Pull Request.
