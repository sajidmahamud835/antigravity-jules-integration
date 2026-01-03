/**
 * Jules for Antigravity - WebviewViewProvider
 * 
 * Implements a reactive HTML interface for session polling and
 * displays "Thought Signatures" from the Jules agent.
 */

import * as vscode from 'vscode';
import { JulesClient, SessionStatus, ThoughtSignature, ProjectNotInitializedError } from '../julesClient';
import { getPanelContent } from './panelContent';
import { ContextGatherer } from '../context/ContextGatherer';

export class JulesPanel implements vscode.WebviewViewProvider {
    public static readonly viewType = 'julesForAntigravity.panel';

    private _view?: vscode.WebviewView;
    private _disposables: vscode.Disposable[] = [];
    private _pollingInterval?: NodeJS.Timeout;
    private readonly _pollIntervalMs = 5000;
    private _contextGatherer: ContextGatherer;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _julesClient: JulesClient
    ) {
        this._contextGatherer = new ContextGatherer();
    }

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
                await this._createSession(message.task || '');
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
            case 'checkRepoAccess':
                if (message.owner && message.repo) {
                    await this._checkRepoAccess(message.owner, message.repo, message.pendingTask);
                }
                break;
            case 'openExternalUrl':
                if (message.url) {
                    vscode.env.openExternal(vscode.Uri.parse(message.url));
                }
                break;
        }
    }

    /**
     * Create a new Jules session with automated context gathering.
     */
    private async _createSession(missionBrief: string): Promise<void> {
        try {
            this._postMessage({ type: 'loading', loading: true });

            // 1. Automatically gather workspace context
            const context = await this._contextGatherer.gatherContext();

            // 2. Generate optimized XML prompt
            const fullPrompt = this._contextGatherer.generatePrompt(context, missionBrief);

            // 3. Determine best repository context
            let owner = context.gitContext?.owner;
            let repo = context.gitContext?.repo;
            let branch = context.gitContext?.branch || 'main';

            // Validate git context exists and is valid
            if (!owner || !repo) {
                const msg = 'Jules requires a GitHub repository. Please open a folder that is a clone of a GitHub repo.';
                vscode.window.showErrorMessage(msg);
                this._postMessage({
                    type: 'error',
                    message: msg
                });
                return;
            }

            // 4. Create session via API
            const sessionData = await this._julesClient.createSession(
                owner,
                repo,
                branch,
                fullPrompt
            );

            // Construct full session status object for UI
            const session: SessionStatus = {
                id: sessionData.id,
                task: missionBrief,
                status: 'pending',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            this._postMessage({
                type: 'sessionCreated',
                session
            });
            await this._refreshSessions();
        } catch (error) {
            // Check if this is a repository access error
            if (error instanceof ProjectNotInitializedError) {
                this._postMessage({
                    type: 'showRepoSetupWizard',
                    owner: error.owner,
                    repo: error.repo,
                    pendingTask: missionBrief
                });
            } else {
                const msg = error instanceof Error ? error.message : String(error);
                this._postMessage({
                    type: 'error',
                    message: `Failed to start session: ${msg}`
                });
            }
        } finally {
            this._postMessage({ type: 'loading', loading: false });
        }
    }

    /**
     * Check if Jules now has access to the repository and retry if successful.
     */
    private async _checkRepoAccess(owner: string, repo: string, pendingTask?: string): Promise<void> {
        try {
            this._postMessage({ type: 'loading', loading: true });

            // Try a minimal API call to check access
            const testSession = await this._julesClient.createSession(
                owner,
                repo,
                'main',
                'Test access - this session will be used for: ' + (pendingTask || 'user task')
            );

            // If we get here, access is granted!
            this._postMessage({
                type: 'repoAccessGranted',
                owner,
                repo
            });

            // If there was a pending task, create the real session
            if (pendingTask) {
                // Small delay for UX
                setTimeout(() => {
                    this._createSession(pendingTask);
                }, 500);
            }

        } catch (error) {
            if (error instanceof ProjectNotInitializedError) {
                this._postMessage({
                    type: 'repoAccessStillDenied',
                    owner,
                    repo,
                    message: 'Jules still doesn\'t have access. Please complete the setup steps.'
                });
            } else {
                const msg = error instanceof Error ? error.message : String(error);
                this._postMessage({
                    type: 'error',
                    message: `Error checking access: ${msg}`
                });
            }
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

interface WebviewMessage {
    command: 'createSession' | 'refreshSessions' | 'applyRemoteBranch' | 'cancelSession' | 'checkRepoAccess' | 'openExternalUrl';
    task?: string;
    contextFiles?: string[];
    sessionId?: string;
    owner?: string;
    repo?: string;
    pendingTask?: string;
    url?: string;
}

interface ExtensionMessage {
    type: 'sessionsUpdated' | 'sessionCreated' | 'loading' | 'error' | 'success' | 'showRepoSetupWizard' | 'repoAccessGranted' | 'repoAccessStillDenied';
    sessions?: SessionStatus[];
    session?: SessionStatus;
    thoughtSignatures?: Map<string, ThoughtSignature[]>;
    loading?: boolean;
    message?: string;
    owner?: string;
    repo?: string;
    pendingTask?: string;
}
