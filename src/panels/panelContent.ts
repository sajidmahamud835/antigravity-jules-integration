/**
 * Jules Panel Content Generator
 * 
 * Generates HTML/CSS/JS for the Jules session monitoring webview.
 * Includes styling for session cards and thought signatures.
 */

import * as vscode from 'vscode';

export function getPanelContent(
    webview: vscode.Webview,
    extensionUri: vscode.Uri
): string {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Jules Sessions</title>
    <style>
        :root {
            --bg-primary: var(--vscode-editor-background);
            --bg-secondary: var(--vscode-sideBar-background);
            --text-primary: var(--vscode-foreground);
            --text-secondary: var(--vscode-descriptionForeground);
            --accent: var(--vscode-button-background);
            --accent-hover: var(--vscode-button-hoverBackground);
            --border: var(--vscode-panel-border);
            --success: var(--vscode-terminal-ansiGreen);
            --warning: var(--vscode-terminal-ansiYellow);
            --error: var(--vscode-terminal-ansiRed);
            --info: var(--vscode-terminal-ansiBlue);
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--text-primary);
            background: var(--bg-primary);
            padding: 12px;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--border);
        }

        .header h2 {
            font-size: 14px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .status-indicator {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            animation: pulse 2s infinite;
        }

        .status-indicator.connected {
            background: var(--success);
        }

        .status-indicator.disconnected {
            background: var(--error);
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        .btn {
            background: var(--accent);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            transition: background 0.2s;
        }

        .btn:hover {
            background: var(--accent-hover);
        }

        .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .btn-icon {
            background: transparent;
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .btn-icon:hover {
            background: var(--vscode-toolbar-hoverBackground);
        }

        .session-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .session-card {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 12px;
            transition: border-color 0.2s;
        }

        .session-card:hover {
            border-color: var(--accent);
        }

        .session-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 8px;
        }

        .session-id {
            font-family: var(--vscode-editor-font-family);
            font-size: 11px;
            color: var(--text-secondary);
            background: var(--vscode-badge-background);
            padding: 2px 6px;
            border-radius: 3px;
        }

        .session-status {
            font-size: 11px;
            padding: 2px 8px;
            border-radius: 10px;
            font-weight: 500;
        }

        .session-status.running {
            background: rgba(var(--info), 0.2);
            color: var(--info);
        }

        .session-status.completed {
            background: rgba(var(--success), 0.2);
            color: var(--success);
        }

        .session-status.failed {
            background: rgba(var(--error), 0.2);
            color: var(--error);
        }

        .session-status.pending {
            background: rgba(var(--warning), 0.2);
            color: var(--warning);
        }

        .session-task {
            font-size: 13px;
            line-height: 1.4;
            margin-bottom: 12px;
            color: var(--text-primary);
        }

        .thought-signatures {
            border-top: 1px solid var(--border);
            padding-top: 10px;
            margin-top: 10px;
        }

        .thought-signatures-header {
            font-size: 11px;
            color: var(--text-secondary);
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .thought-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
            max-height: 150px;
            overflow-y: auto;
        }

        .thought-item {
            font-size: 12px;
            padding: 6px 8px;
            background: var(--bg-primary);
            border-radius: 4px;
            border-left: 3px solid var(--accent);
        }

        .thought-item .timestamp {
            font-size: 10px;
            color: var(--text-secondary);
            margin-top: 4px;
        }

        .session-actions {
            display: flex;
            gap: 8px;
            margin-top: 12px;
        }

        .session-actions .btn {
            flex: 1;
            font-size: 11px;
            padding: 6px 10px;
        }

        .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: var(--text-secondary);
        }

        .empty-state svg {
            width: 48px;
            height: 48px;
            margin-bottom: 12px;
            opacity: 0.5;
        }

        .empty-state h3 {
            font-size: 14px;
            margin-bottom: 8px;
            color: var(--text-primary);
        }

        .loading-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 100;
        }

        .loading-overlay.hidden {
            display: none;
        }

        .spinner {
            width: 32px;
            height: 32px;
            border: 3px solid var(--border);
            border-top-color: var(--accent);
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .toast {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            padding: 10px 20px;
            border-radius: 6px;
            font-size: 12px;
            z-index: 101;
            animation: slideUp 0.3s ease;
        }

        .toast.success {
            background: var(--success);
            color: white;
        }

        .toast.error {
            background: var(--error);
            color: white;
        }

        .toast.hidden {
            display: none;
        }

        @keyframes slideUp {
            from {
                transform: translateX(-50%) translateY(20px);
                opacity: 0;
            }
            to {
                transform: translateX(-50%) translateY(0);
                opacity: 1;
            }
        }

        .create-form {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 12px;
            margin-bottom: 16px;
        }

        .create-form.hidden {
            display: none;
        }

        .form-group {
            margin-bottom: 12px;
        }

        .form-group label {
            display: block;
            font-size: 11px;
            color: var(--text-secondary);
            margin-bottom: 4px;
        }

        .form-group textarea,
        .form-group input {
            width: 100%;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 8px;
            font-family: inherit;
            font-size: 12px;
            resize: vertical;
        }

        .form-group textarea:focus,
        .form-group input:focus {
            outline: none;
            border-color: var(--accent);
        }

        .form-actions {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
        }
    </style>
</head>
<body>
    <div class="header">
        <h2>
            <span class="status-indicator connected" id="statusIndicator"></span>
            Jules Sessions
        </h2>
        <div style="display: flex; gap: 8px;">
            <button class="btn" id="newSessionBtn" title="New Session">+ New</button>
            <button class="btn btn-icon" id="refreshBtn" title="Refresh">↻</button>
        </div>
    </div>

    <div class="create-form hidden" id="createForm">
        <div class="form-group">
            <label>Task Description</label>
            <textarea id="taskInput" rows="3" placeholder="Describe the task for Jules..."></textarea>
        </div>
        <div class="form-group">
            <label>Context Files (comma-separated paths)</label>
            <input type="text" id="contextFilesInput" placeholder="src/main.ts, src/utils.ts">
        </div>
        <div class="form-actions">
            <button class="btn" style="background: transparent; color: var(--text-secondary);" id="cancelCreateBtn">Cancel</button>
            <button class="btn" id="submitCreateBtn">Create Session</button>
        </div>
    </div>

    <div class="session-list" id="sessionList">
        <div class="empty-state" id="emptyState">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
            </svg>
            <h3>No Active Sessions</h3>
            <p>Create a new session to delegate tasks to Jules</p>
        </div>
    </div>

    <div class="loading-overlay hidden" id="loadingOverlay">
        <div class="spinner"></div>
    </div>

    <div class="toast hidden" id="toast"></div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        
        // State
        let sessions = [];
        let thoughtSignatures = new Map();
        let isFormVisible = false;

        // DOM Elements
        const sessionList = document.getElementById('sessionList');
        const emptyState = document.getElementById('emptyState');
        const createForm = document.getElementById('createForm');
        const newSessionBtn = document.getElementById('newSessionBtn');
        const cancelCreateBtn = document.getElementById('cancelCreateBtn');
        const submitCreateBtn = document.getElementById('submitCreateBtn');
        const refreshBtn = document.getElementById('refreshBtn');
        const loadingOverlay = document.getElementById('loadingOverlay');
        const toast = document.getElementById('toast');
        const statusIndicator = document.getElementById('statusIndicator');
        const taskInput = document.getElementById('taskInput');
        const contextFilesInput = document.getElementById('contextFilesInput');

        // Event Listeners
        newSessionBtn.addEventListener('click', toggleCreateForm);
        cancelCreateBtn.addEventListener('click', toggleCreateForm);
        submitCreateBtn.addEventListener('click', handleCreateSession);
        refreshBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'refreshSessions' });
        });

        // Message Handler
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
                case 'sessionsUpdated':
                    sessions = message.sessions || [];
                    thoughtSignatures = new Map(Object.entries(message.thoughtSignatures || {}));
                    renderSessions();
                    break;
                case 'sessionCreated':
                    showToast('Session created successfully', 'success');
                    toggleCreateForm();
                    break;
                case 'loading':
                    setLoading(message.loading);
                    break;
                case 'error':
                    showToast(message.message, 'error');
                    break;
                case 'success':
                    showToast(message.message, 'success');
                    break;
            }
        });

        function toggleCreateForm() {
            isFormVisible = !isFormVisible;
            createForm.classList.toggle('hidden', !isFormVisible);
            if (isFormVisible) {
                taskInput.focus();
            } else {
                taskInput.value = '';
                contextFilesInput.value = '';
            }
        }

        function handleCreateSession() {
            const task = taskInput.value.trim();
            const contextFiles = contextFilesInput.value
                .split(',')
                .map(f => f.trim())
                .filter(f => f.length > 0);
            
            if (!task) {
                showToast('Please enter a task description', 'error');
                return;
            }
            
            vscode.postMessage({
                command: 'createSession',
                task,
                contextFiles
            });
        }

        function renderSessions() {
            if (sessions.length === 0) {
                sessionList.innerHTML = '';
                sessionList.appendChild(emptyState);
                emptyState.classList.remove('hidden');
                return;
            }

            emptyState.classList.add('hidden');
            
            sessionList.innerHTML = sessions.map(session => {
                const signatures = thoughtSignatures.get(session.id) || [];
                return createSessionCard(session, signatures);
            }).join('');

            // Attach event listeners
            document.querySelectorAll('.apply-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const sessionId = e.target.dataset.sessionId;
                    vscode.postMessage({ command: 'applyRemoteBranch', sessionId });
                });
            });

            document.querySelectorAll('.cancel-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const sessionId = e.target.dataset.sessionId;
                    vscode.postMessage({ command: 'cancelSession', sessionId });
                });
            });
        }

        function createSessionCard(session, signatures) {
            const statusClass = session.status.toLowerCase();
            const isComplete = session.status === 'completed';
            const isRunning = session.status === 'running' || session.status === 'pending';

            return \`
                <div class="session-card">
                    <div class="session-header">
                        <span class="session-id">\${session.id.substring(0, 8)}...</span>
                        <span class="session-status \${statusClass}">\${session.status}</span>
                    </div>
                    <div class="session-task">\${escapeHtml(session.task)}</div>
                    \${signatures.length > 0 ? \`
                        <div class="thought-signatures">
                            <div class="thought-signatures-header">
                                💭 Thought Signatures (\${signatures.length})
                            </div>
                            <div class="thought-list">
                                \${signatures.slice(-5).map(sig => \`
                                    <div class="thought-item">
                                        \${escapeHtml(sig.content)}
                                        <div class="timestamp">\${formatTime(sig.timestamp)}</div>
                                    </div>
                                \`).join('')}
                            </div>
                        </div>
                    \` : ''}
                    <div class="session-actions">
                        \${isComplete ? \`
                            <button class="btn apply-btn" data-session-id="\${session.id}">
                                Apply Changes
                            </button>
                        \` : ''}
                        \${isRunning ? \`
                            <button class="btn cancel-btn" data-session-id="\${session.id}" style="background: var(--error);">
                                Cancel
                            </button>
                        \` : ''}
                    </div>
                </div>
            \`;
        }

        function setLoading(loading) {
            loadingOverlay.classList.toggle('hidden', !loading);
        }

        function showToast(message, type) {
            toast.textContent = message;
            toast.className = \`toast \${type}\`;
            setTimeout(() => {
                toast.classList.add('hidden');
            }, 3000);
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function formatTime(timestamp) {
            const date = new Date(timestamp);
            return date.toLocaleTimeString();
        }

        // Initial state
        renderSessions();
    </script>
</body>
</html>`;
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
