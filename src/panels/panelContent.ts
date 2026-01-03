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
            transition: opacity 0.3s ease;
        }

        .session-list.fade {
            opacity: 0.5;
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

        .session-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 11px;
            color: var(--text-secondary);
            margin-top: 12px;
        }

        .progress-bar {
            width: 100%;
            height: 4px;
            background: var(--vscode-progressBar-background);
            border-radius: 2px;
            margin-bottom: 8px;
            overflow: hidden;
        }

        .progress-bar-inner {
            height: 100%;
            background: var(--accent);
            transition: width 0.3s ease;
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
            cursor: pointer;
            user-select: none;
        }

        .thought-signatures-header .chevron {
            transition: transform 0.2s;
        }

        .thought-signatures.collapsed .chevron {
            transform: rotate(-90deg);
        }

        .thought-signatures.collapsed .thought-list {
            display: none;
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
            animation: float 3s ease-in-out infinite;
        }

        @keyframes float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-5px); }
        }

        .empty-state h3 {
            font-size: 14px;
            margin-bottom: 8px;
            color: var(--text-primary);
        }

        .error-state {
            text-align: center;
            padding: 40px 20px;
            color: var(--text-secondary);
        }

        .error-state h3 {
            color: var(--error);
            margin-bottom: 8px;
        }

        .error-state p {
            margin-bottom: 16px;
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

        /* Repository Setup Wizard Styles */
        .wizard-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 200;
            animation: fadeIn 0.2s ease;
        }

        .wizard-overlay.hidden {
            display: none;
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        .wizard-modal {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 20px;
            max-width: 380px;
            width: 90%;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            animation: slideIn 0.3s ease;
        }

        @keyframes slideIn {
            from {
                transform: translateY(-20px);
                opacity: 0;
            }
            to {
                transform: translateY(0);
                opacity: 1;
            }
        }

        .wizard-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--border);
        }

        .wizard-header .icon {
            font-size: 24px;
        }

        .wizard-header h3 {
            font-size: 15px;
            font-weight: 600;
            margin: 0;
        }

        .wizard-repo {
            background: var(--bg-primary);
            padding: 10px 12px;
            border-radius: 6px;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
        }

        .wizard-repo .folder-icon {
            font-size: 16px;
        }

        .wizard-steps {
            margin-bottom: 20px;
        }

        .wizard-step {
            display: flex;
            gap: 12px;
            padding: 12px 0;
            border-bottom: 1px solid var(--border);
        }

        .wizard-step:last-child {
            border-bottom: none;
        }

        .step-number {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: var(--accent);
            color: var(--vscode-button-foreground);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 600;
            flex-shrink: 0;
        }

        .step-number.completed {
            background: var(--success);
        }

        .step-content {
            flex: 1;
        }

        .step-title {
            font-size: 13px;
            font-weight: 500;
            margin-bottom: 4px;
        }

        .step-description {
            font-size: 11px;
            color: var(--text-secondary);
            line-height: 1.4;
        }

        .wizard-link {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
            font-size: 12px;
            margin-top: 6px;
            cursor: pointer;
        }

        .wizard-link:hover {
            text-decoration: underline;
        }

        .wizard-actions {
            display: flex;
            gap: 10px;
            justify-content: flex-end;
        }

        .wizard-actions .btn {
            padding: 8px 16px;
        }

        .btn-secondary {
            background: transparent;
            border: 1px solid var(--border);
            color: var(--text-primary);
        }

        .btn-secondary:hover {
            background: var(--vscode-toolbar-hoverBackground);
        }

        .wizard-status {
            padding: 10px;
            border-radius: 6px;
            margin-bottom: 16px;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .wizard-status.hidden {
            display: none;
        }

        .wizard-status.error {
            background: rgba(255, 100, 100, 0.15);
            color: var(--error);
        }

        .wizard-status.success {
            background: rgba(100, 255, 100, 0.15);
            color: var(--success);
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
            <label>Task Description (Mission Brief)</label>
            <textarea id="taskInput" rows="3" placeholder="Describe what you want Jules to do..."></textarea>
            <p style="font-size: 10px; color: var(--text-secondary); margin-top: 4px;">
                * Context (active file, git diff, artifacts) will be gathered automatically.
            </p>
        </div>
        <div class="form-actions">
            <button class="btn" style="background: transparent; color: var(--text-secondary);" id="cancelCreateBtn">Cancel</button>
            <button class="btn" id="submitCreateBtn">Start Session</button>
        </div>
    </div>

    <div class="session-list" id="sessionList">
        <div class="empty-state" id="emptyState">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.25a.75.75 0 01.75.75v3a.75.75 0 01-1.5 0v-3a.75.75 0 01.75-.75zM12 18a.75.75 0 01.75.75v3a.75.75 0 01-1.5 0v-3A.75.75 0 0112 18zM5.106 5.106a.75.75 0 010 1.06l-2.122 2.122a.75.75 0 01-1.06-1.06l2.121-2.121a.75.75 0 011.06 0zM18.894 18.894a.75.75 0 010 1.06l-2.121 2.121a.75.75 0 01-1.06-1.06l2.12-2.122a.75.75 0 011.06 0zM21.75 12a.75.75 0 01-.75.75h-3a.75.75 0 010-1.5h3a.75.75 0 01.75.75zM6 12a.75.75 0 01-.75.75h-3a.75.75 0 010-1.5h3A.75.75 0 016 12zM5.106 18.894a.75.75 0 011.06 0l2.121-2.121a.75.75 0 011.06 1.06l-2.122 2.121a.75.75 0 01-1.06 0zM18.894 5.106a.75.75 0 011.06 0l2.121 2.121a.75.75 0 01-1.06 1.06l-2.121-2.12a.75.75 0 010-1.06z"/>
            </svg>
            <h3>Ready for a new mission?</h3>
            <p>Click the "+ New" button to start a new session with Jules.</p>
        </div>
        <div class="error-state hidden" id="errorState">
            <h3>❌ Failed to Load Sessions</h3>
            <p id="errorMessage"></p>
            <button class="btn" id="retryBtn">Retry</button>
        </div>
    </div>

    <div class="loading-overlay hidden" id="loadingOverlay">
        <div class="spinner"></div>
    </div>

    <div class="toast hidden" id="toast"></div>

    <!-- Repository Setup Wizard Modal -->
    <div class="wizard-overlay hidden" id="wizardOverlay">
        <div class="wizard-modal">
            <div class="wizard-header">
                <span class="icon">⚠️</span>
                <h3>Repository Access Required</h3>
            </div>
            
            <div class="wizard-repo">
                <span class="folder-icon">📁</span>
                <span id="wizardRepoName">owner/repo</span>
            </div>

            <div class="wizard-status hidden" id="wizardStatus"></div>

            <div class="wizard-steps">
                <div class="wizard-step">
                    <span class="step-number">1</span>
                    <div class="step-content">
                        <div class="step-title">Install Jules GitHub App</div>
                        <div class="step-description">Jules needs permission to access your repositories</div>
                        <a class="wizard-link" id="openJulesSettings">
                            Open Jules Settings →
                        </a>
                    </div>
                </div>
                <div class="wizard-step">
                    <span class="step-number">2</span>
                    <div class="step-content">
                        <div class="step-title">Grant Access to This Repository</div>
                        <div class="step-description">Select the repository from the list and authorize Jules</div>
                    </div>
                </div>
                <div class="wizard-step">
                    <span class="step-number">3</span>
                    <div class="step-content">
                        <div class="step-title">Return Here</div>
                        <div class="step-description">Click "Check Access" to verify and continue with your task</div>
                    </div>
                </div>
            </div>

            <div class="wizard-actions">
                <button class="btn btn-secondary" id="wizardCancelBtn">Cancel</button>
                <button class="btn" id="wizardCheckBtn">Check Access</button>
            </div>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        console.log('[WebView] Script initialized, vscode API acquired');
        
        // State
        let sessions = [];
        let thoughtSignatures = new Map();
        let isFormVisible = false;

        console.log('[WebView] Initial state - sessions:', sessions.length);

        // DOM Elements
        const sessionList = document.getElementById('sessionList');
        const emptyState = document.getElementById('emptyState');
        const errorState = document.getElementById('errorState');
        const errorMessage = document.getElementById('errorMessage');
        const retryBtn = document.getElementById('retryBtn');
        const createForm = document.getElementById('createForm');
        const newSessionBtn = document.getElementById('newSessionBtn');
        const cancelCreateBtn = document.getElementById('cancelCreateBtn');
        const submitCreateBtn = document.getElementById('submitCreateBtn');
        const refreshBtn = document.getElementById('refreshBtn');
        const loadingOverlay = document.getElementById('loadingOverlay');
        const toast = document.getElementById('toast');
        const statusIndicator = document.getElementById('statusIndicator');
        const taskInput = document.getElementById('taskInput');
        const wizardOverlay = document.getElementById('wizardOverlay');
        const wizardRepoName = document.getElementById('wizardRepoName');
        const wizardStatus = document.getElementById('wizardStatus');
        const openJulesSettings = document.getElementById('openJulesSettings');
        const wizardCancelBtn = document.getElementById('wizardCancelBtn');
        const wizardCheckBtn = document.getElementById('wizardCheckBtn');

        // Wizard state
        let pendingWizardData = null;

        // Event Listeners
        newSessionBtn.addEventListener('click', toggleCreateForm);
        cancelCreateBtn.addEventListener('click', toggleCreateForm);
        submitCreateBtn.addEventListener('click', handleCreateSession);
        refreshBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'refreshSessions' });
        });
        retryBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'refreshSessions' });
        });

        // Wizard event listeners
        openJulesSettings.addEventListener('click', () => {
            vscode.postMessage({ 
                command: 'openExternalUrl', 
                url: 'https://jules.google.com/settings/repositories' 
            });
        });

        wizardCancelBtn.addEventListener('click', hideWizard);

        wizardCheckBtn.addEventListener('click', () => {
            if (pendingWizardData) {
                vscode.postMessage({
                    command: 'checkRepoAccess',
                    owner: pendingWizardData.owner,
                    repo: pendingWizardData.repo,
                    pendingTask: pendingWizardData.pendingTask
                });
            }
        });

        // Message Handler
        window.addEventListener('message', event => {
            const message = event.data;
            console.log('[WebView] Received message:', message.type, message);
            
            switch (message.type) {
                case 'sessionsUpdated':
                    console.log('[WebView] Sessions updated, count:', message.sessions?.length || 0);
                    errorState.classList.add('hidden');
                    sessions = message.sessions || [];
                    thoughtSignatures = new Map(Object.entries(message.thoughtSignatures || {}));
                    renderSessions();
                    break;
                case 'sessionCreated':
                    console.log('[WebView] Session created:', message.session);
                    // CRITICAL FIX: Add the new session to local state immediately
                    if (message.session) {
                        // Check if session already exists (avoid duplicates)
                        const existingIndex = sessions.findIndex(s => s.id === message.session.id);
                        if (existingIndex === -1) {
                            sessions.unshift(message.session); // Add to beginning (newest first)
                            console.log('[WebView] Added session to local state, total:', sessions.length);
                            renderSessions();
                        } else {
                            console.log('[WebView] Session already exists at index:', existingIndex);
                        }
                    }
                    showToast('Session created successfully', 'success');
                    toggleCreateForm();
                    break;
                case 'loading':
                    setLoading(message.loading);
                    break;
                case 'error':
                    console.error('[WebView] Error:', message.message);
                    if (sessions.length === 0) {
                        errorMessage.textContent = message.message;
                        errorState.classList.remove('hidden');
                        emptyState.classList.add('hidden');
                        sessionList.innerHTML = '';
                    }
                    showToast(message.message, 'error');
                    break;
                case 'success':
                    showToast(message.message, 'success');
                    break;
                case 'showRepoSetupWizard':
                    showWizard(message.owner, message.repo, message.pendingTask);
                    break;
                case 'repoAccessGranted':
                    showWizardSuccess();
                    break;
                case 'repoAccessStillDenied':
                    showWizardError(message.message);
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
            }
        }

        function handleCreateSession() {
            const task = taskInput.value.trim();
            
            if (!task) {
                showToast('Please enter a task description', 'error');
                return;
            }
            
            // Context gathered automatically by extension
            vscode.postMessage({
                command: 'createSession',
                task
            });
        }

        function renderSessions() {
            console.log('[WebView] renderSessions called, sessions count:', sessions.length);

            sessionList.classList.add('fade');

            setTimeout(() => {
                if (sessions.length === 0) {
                    console.log('[WebView] No sessions, showing empty state');
                    sessionList.innerHTML = '';
                    sessionList.appendChild(emptyState);
                    emptyState.classList.remove('hidden');
                } else {
                    console.log('[WebView] Rendering', sessions.length, 'sessions');
                    emptyState.classList.add('hidden');

                    sessionList.innerHTML = sessions.map(session => {
                        const signatures = thoughtSignatures.get(session.id) || [];
                        return createSessionCard(session, signatures);
                    }).join('');
                }

                sessionList.classList.remove('fade');

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

            document.querySelectorAll('.thought-signatures-header').forEach(header => {
                header.addEventListener('click', (e) => {
                    const container = e.currentTarget.closest('.thought-signatures');
                    container.classList.toggle('collapsed');
                });
            });
        }

        function getThoughtIcon(type) {
            switch (type) {
                case 'planning': return '📝';
                case 'executing': return '💻';
                case 'reviewing': return '🤔';
                case 'completed': return '🏁';
                default: return '➡️';
            }
        }

        function createSessionCard(session, signatures) {
            const statusClass = session.status.toLowerCase();
            const isComplete = session.status === 'completed';
            const isRunning = session.status === 'running' || session.status === 'pending';
            const progress = isComplete ? 100 : (isRunning ? 50 : 0);
            const statusIcons = {
                pending: '⏱️',
                running: '⚙️',
                completed: '✅',
                failed: '❌',
                cancelled: '🚫'
            };

            return \`
                <div class="session-card">
                    <div class="session-header">
                        <span class="session-id">\${session.id.substring(0, 8)}...</span>
                        <span class="session-status \${statusClass}">
                            \${statusIcons[session.status] || ''} \${session.status}
                        </span>
                    </div>
                    <div class="session-task">\${escapeHtml(session.task)}</div>
                    <div class="progress-bar">
                        <div class="progress-bar-inner" style="width: \${progress}%;"></div>
                    </div>
                    \${signatures.length > 0 ? \`
                        <div class="thought-signatures collapsed" data-session-id="\${session.id}">
                            <div class="thought-signatures-header">
                                <span class="chevron">▼</span>
                                💭 Thought Signatures (\${signatures.length})
                            </div>
                            <div class="thought-list">
                                \${signatures.slice(-5).map(sig => \`
                                    <div class="thought-item">
                                        <span>\${getThoughtIcon(sig.type)}</span>
                                        \${escapeHtml(sig.content)}
                                        <div class="timestamp">\${formatTime(sig.timestamp)}</div>
                                    </div>
                                \`).join('')}
                            </div>
                        </div>
                    \` : ''}
                    <div class="session-footer">
                        <span>Created: \${formatTime(session.createdAt)}</span>
                        <span>Updated: \${formatTime(session.updatedAt)}</span>
                    </div>
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

        function showWizard(owner, repo, pendingTask) {
            pendingWizardData = { owner, repo, pendingTask };
            wizardRepoName.textContent = owner + '/' + repo;
            wizardStatus.classList.add('hidden');
            wizardOverlay.classList.remove('hidden');
        }

        function hideWizard() {
            wizardOverlay.classList.add('hidden');
            pendingWizardData = null;
        }

        function showWizardSuccess() {
            wizardStatus.textContent = '✓ Access granted! Starting your session...';
            wizardStatus.className = 'wizard-status success';
            setTimeout(() => {
                hideWizard();
            }, 1500);
        }

        function showWizardError(message) {
            wizardStatus.textContent = '✗ ' + (message || 'Access not yet granted');
            wizardStatus.className = 'wizard-status error';
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
