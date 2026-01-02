/**
 * Jules for Antigravity - WebviewViewProvider
 * 
 * Implements a reactive HTML interface for session polling and
 * displays "Thought Signatures" from the Jules agent.
 */

import * as vscode from 'vscode';
import { JulesClient, SessionStatus, ThoughtSignature } from '../julesClient';
import { getPanelContent } from './panelContent';

export class JulesPanel implements vscode.WebviewViewProvider {
    public static readonly viewType = 'julesForAntigravity.panel';

    private _view?: vscode.WebviewView;
    private _disposables: vscode.Disposable[] = [];
    private _pollingInterval?: NodeJS.Timeout;
    private readonly _pollIntervalMs = 5000;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _julesClient: JulesClient
    ) { }

    /**
     * Called when a view first becomes visible.
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void | Thenable<void> {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        this._disposables.push(
            webviewView.webview.onDidReceiveMessage(
                async (message) => {
                    await this._handleWebviewMessage(message);
                }
            )
        );

        // Start polling when view becomes visible
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this._startPolling();
            } else {
                this._stopPolling();
            }
        });

        // Initial polling start
        this._startPolling();

        // Cleanup on dispose
        webviewView.onDidDispose(() => {
            this._stopPolling();
            this._disposables.forEach(d => d.dispose());
        });
    }

    /**
     * Handle messages received from the webview.
     */
    private async _handleWebviewMessage(message: WebviewMessage): Promise<void> {
        switch (message.command) {
            case 'createSession':
                await this._createSession(message.task || '', message.contextFiles || []);
                break;
            case 'refreshSessions':
                await this._refreshSessions();
                break;
            case 'applyRemoteBranch':
                if (message.sessionId) {
                    await this._applyRemoteBranch(message.sessionId);
                }
                break;
            case 'cancelSession':
                if (message.sessionId) {
                    await this._cancelSession(message.sessionId);
                }
                break;
        }
    }

    /**
     * Create a new Jules session.
     */
    private async _createSession(task: string, contextFiles: string[]): Promise<void> {
        try {
            this._postMessage({ type: 'loading', loading: true });
            const session = await this._julesClient.createSession(task, contextFiles);
            this._postMessage({
                type: 'sessionCreated',
                session
            });
            await this._refreshSessions();
        } catch (error) {
            this._postMessage({
                type: 'error',
                message: `Failed to create session: ${error}`
            });
        } finally {
            this._postMessage({ type: 'loading', loading: false });
        }
    }

    /**
     * Refresh all active sessions.
     */
    private async _refreshSessions(): Promise<void> {
        try {
            const sessions = await this._julesClient.getActiveSessions();
            const thoughtSignatures = await this._getThoughtSignatures(sessions);

            this._postMessage({
                type: 'sessionsUpdated',
                sessions,
                thoughtSignatures
            });
        } catch (error) {
            this._postMessage({
                type: 'error',
                message: `Failed to refresh sessions: ${error}`
            });
        }
    }

    /**
     * Get thought signatures for all sessions.
     */
    private async _getThoughtSignatures(
        sessions: SessionStatus[]
    ): Promise<Map<string, ThoughtSignature[]>> {
        const signatures = new Map<string, ThoughtSignature[]>();

        for (const session of sessions) {
            try {
                const sessionSignatures = await this._julesClient.getThoughtSignatures(session.id);
                signatures.set(session.id, sessionSignatures);
            } catch {
                signatures.set(session.id, []);
            }
        }

        return signatures;
    }

    /**
     * Apply remote branch changes from a completed session.
     */
    private async _applyRemoteBranch(sessionId: string): Promise<void> {
        try {
            this._postMessage({ type: 'loading', loading: true });

            const diff = await this._julesClient.getSessionDiff(sessionId);

            // Emit event for git context to handle
            vscode.commands.executeCommand('julesForAntigravity.applyRemoteBranch', {
                sessionId,
                diff
            });

            this._postMessage({
                type: 'success',
                message: 'Remote branch changes applied successfully'
            });
        } catch (error) {
            this._postMessage({
                type: 'error',
                message: `Failed to apply remote branch: ${error}`
            });
        } finally {
            this._postMessage({ type: 'loading', loading: false });
        }
    }

    /**
     * Cancel an active session.
     */
    private async _cancelSession(sessionId: string): Promise<void> {
        try {
            await this._julesClient.cancelSession(sessionId);
            await this._refreshSessions();
            this._postMessage({
                type: 'success',
                message: 'Session cancelled successfully'
            });
        } catch (error) {
            this._postMessage({
                type: 'error',
                message: `Failed to cancel session: ${error}`
            });
        }
    }

    /**
     * Start polling for session updates.
     */
    private _startPolling(): void {
        if (this._pollingInterval) {
            return;
        }

        this._pollingInterval = setInterval(async () => {
            await this._refreshSessions();
        }, this._pollIntervalMs);

        // Initial refresh
        this._refreshSessions();
    }

    /**
     * Stop polling for session updates.
     */
    private _stopPolling(): void {
        if (this._pollingInterval) {
            clearInterval(this._pollingInterval);
            this._pollingInterval = undefined;
        }
    }

    /**
     * Post a message to the webview.
     */
    private _postMessage(message: ExtensionMessage): void {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    /**
     * Generate the HTML content for the webview.
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        return getPanelContent(webview, this._extensionUri);
    }

    /**
     * Dispose of all resources.
     */
    public dispose(): void {
        this._stopPolling();
        this._disposables.forEach(d => d.dispose());
    }
}

// Message types for webview communication
interface WebviewMessage {
    command: 'createSession' | 'refreshSessions' | 'applyRemoteBranch' | 'cancelSession';
    task?: string;
    contextFiles?: string[];
    sessionId?: string;
}

interface ExtensionMessage {
    type: 'sessionsUpdated' | 'sessionCreated' | 'loading' | 'error' | 'success';
    sessions?: SessionStatus[];
    session?: SessionStatus;
    thoughtSignatures?: Map<string, ThoughtSignature[]>;
    loading?: boolean;
    message?: string;
}
