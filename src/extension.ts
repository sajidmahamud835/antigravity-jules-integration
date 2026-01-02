/**
 * Jules for Antigravity - Extension Entry Point
 * 
 * Main activation flow:
 * 1. Check AntigravityDetector - abort gracefully if false
 * 2. Initialize JulesPanel and register the WebviewViewProvider
 * 3. Start the BridgeServer instance
 * 4. Proper disposal of resources on deactivation
 */

import * as vscode from 'vscode';
import { AntigravityDetector } from './antigravityDetector';
import { JulesPanel } from './panels/JulesPanel';
import { JulesClient } from './julesClient';
import { GitContext } from './gitContext';
import { BridgeServer } from './mcp/BridgeServer';
import { registerBridgeServer, unregisterBridgeServer } from './mcp/registration';
import { initializeSecretStorage, promptForApiKey, hasApiKey } from './secrets';
import { ContextGatherer } from './context/ContextGatherer';

// ============================================================================
// Extension State
// ============================================================================

let antigravityDetector: AntigravityDetector | undefined;
let julesClient: JulesClient | undefined;
let gitContext: GitContext | undefined;
let julesPanel: JulesPanel | undefined;
let bridgeServer: BridgeServer | undefined;

// ============================================================================
// Activation
// ============================================================================

export async function activate(
    context: vscode.ExtensionContext
): Promise<void> {
    console.log('Jules for Antigravity: Activating...');

    // Initialize secret storage first
    initializeSecretStorage(context);

    // ========================================================================
    // Step 1: Antigravity Detection
    // ========================================================================
    antigravityDetector = new AntigravityDetector();
    context.subscriptions.push(antigravityDetector);

    const isAntigravityAvailable = await antigravityDetector.isAvailable();

    if (!isAntigravityAvailable) {
        // Fail silently with a gentle notification
        console.log('Jules for Antigravity: Antigravity environment not detected');
        antigravityDetector.showNotAvailableMessage();

        // Still register a limited version of the panel for visibility
        // but without full functionality
        registerLimitedMode(context);
        return;
    }

    console.log('Jules for Antigravity: Antigravity environment detected');

    // ========================================================================
    // Step 2: Check API Key
    // ========================================================================
    const hasKey = await hasApiKey();
    if (!hasKey) {
        const setupNow = await vscode.window.showInformationMessage(
            'Jules for Antigravity requires an API key to function.',
            'Set Up Now',
            'Later'
        );

        if (setupNow === 'Set Up Now') {
            await promptForApiKey();
        }
    }

    // ========================================================================
    // Step 3: Initialize Core Services
    // ========================================================================
    try {
        julesClient = new JulesClient();
        context.subscriptions.push({ dispose: () => julesClient?.dispose() });

        gitContext = new GitContext();
        context.subscriptions.push({ dispose: () => gitContext?.dispose() });
    } catch (error) {
        console.error('Jules for Antigravity: Failed to initialize core services', error);
        vscode.window.showErrorMessage(
            `Jules for Antigravity: Failed to initialize - ${error}`
        );
        return;
    }

    // ========================================================================
    // Step 4: Initialize Jules Panel (WebviewViewProvider)
    // ========================================================================
    julesPanel = new JulesPanel(context.extensionUri, julesClient);
    context.subscriptions.push(julesPanel);

    const panelRegistration = vscode.window.registerWebviewViewProvider(
        JulesPanel.viewType,
        julesPanel,
        {
            webviewOptions: {
                retainContextWhenHidden: true
            }
        }
    );
    context.subscriptions.push(panelRegistration);

    console.log('Jules for Antigravity: Panel registered');

    // ========================================================================
    // Step 5: Start MCP Bridge Server
    // ========================================================================
    bridgeServer = new BridgeServer(julesClient);
    context.subscriptions.push({ dispose: () => bridgeServer?.dispose() });

    try {
        bridgeServer.start();
        console.log('Jules for Antigravity: Bridge Server started');

        // Register in Antigravity config
        await registerBridgeServer(context.extensionPath);
    } catch (error) {
        console.error('Jules for Antigravity: Failed to start Bridge Server', error);
        // Non-fatal - extension can work without MCP bridge
    }

    // ========================================================================
    // Step 6: Register Commands
    // ========================================================================
    registerCommands(context);

    console.log('Jules for Antigravity: Activation complete');
}

// ============================================================================
// Command Registration
// ============================================================================

function registerCommands(context: vscode.ExtensionContext): void {

    // Create Session Command
    const createSessionCommand = vscode.commands.registerCommand(
        'julesForAntigravity.createSession',
        async () => {
            const task = await vscode.window.showInputBox({
                prompt: 'Describe the task for Jules',
                placeHolder: 'e.g., Add unit tests for the authentication module'
            });

            if (task && julesClient) {
                try {
                    vscode.window.showInformationMessage('Gathering context and starting session...');

                    const gatherer = new ContextGatherer();
                    const context = await gatherer.gatherContext();
                    const fullPrompt = gatherer.generatePrompt(context, task);

                    const owner = context.gitContext?.owner || 'unknown';
                    const repo = context.gitContext?.repo || 'unknown';
                    const branch = context.gitContext?.branch || 'main';

                    const session = await julesClient.createSession(owner, repo, branch, fullPrompt);

                    vscode.window.showInformationMessage(
                        `Jules session created: ${session.id.substring(0, 8)}...`
                    );

                    // Refresh panel if visible
                    vscode.commands.executeCommand('julesForAntigravity.refreshSessions');

                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to create session: ${error}`);
                }
            }
        }
    );
    context.subscriptions.push(createSessionCommand);

    // Refresh Sessions Command
    const refreshCommand = vscode.commands.registerCommand(
        'julesForAntigravity.refreshSessions',
        async () => {
            if (julesClient) {
                try {
                    await julesClient.getActiveSessions();
                    vscode.window.showInformationMessage('Sessions refreshed');
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to refresh: ${error}`);
                }
            }
        }
    );
    context.subscriptions.push(refreshCommand);

    // Apply Remote Branch Command
    const applyBranchCommand = vscode.commands.registerCommand(
        'julesForAntigravity.applyRemoteBranch',
        async (params?: { sessionId: string; diff: unknown }) => {
            if (!gitContext) {
                vscode.window.showErrorMessage('Git context not available');
                return;
            }

            try {
                if (params?.diff) {
                    const result = await gitContext.applySessionDiff(params.diff as any);
                    if (result.success) {
                        vscode.window.showInformationMessage(result.message);
                    } else {
                        vscode.window.showWarningMessage(result.message);
                    }
                } else {
                    // Prompt for branch name
                    const branch = await vscode.window.showInputBox({
                        prompt: 'Enter the remote branch name',
                        placeHolder: 'origin/jules-session-xxx'
                    });

                    if (branch) {
                        const result = await gitContext.applyRemoteBranch(branch);
                        if (result.success) {
                            vscode.window.showInformationMessage(result.message);
                        } else {
                            vscode.window.showWarningMessage(result.message);
                        }
                    }
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to apply branch: ${error}`);
            }
        }
    );
    context.subscriptions.push(applyBranchCommand);

    // Set API Key Command
    const setApiKeyCommand = vscode.commands.registerCommand(
        'julesForAntigravity.setApiKey',
        async () => {
            await promptForApiKey();
        }
    );
    context.subscriptions.push(setApiKeyCommand);
}

// ============================================================================
// Limited Mode (When Antigravity Not Detected)
// ============================================================================

function registerLimitedMode(context: vscode.ExtensionContext): void {
    // Register a minimal panel that shows setup instructions
    const provider: vscode.WebviewViewProvider = {
        resolveWebviewView(webviewView) {
            webviewView.webview.html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body {
                            font-family: var(--vscode-font-family);
                            padding: 20px;
                            text-align: center;
                            color: var(--vscode-foreground);
                        }
                        h2 { margin-bottom: 16px; }
                        p { color: var(--vscode-descriptionForeground); line-height: 1.5; }
                        a {
                            color: var(--vscode-textLink-foreground);
                            text-decoration: none;
                        }
                        a:hover { text-decoration: underline; }
                    </style>
                </head>
                <body>
                    <h2>⚠️ Antigravity Required</h2>
                    <p>
                        Jules for Antigravity requires the Antigravity platform to be installed and configured.
                    </p>
                    <p>
                        <a href="https://antigravity.dev/docs/setup">Learn how to set up Antigravity →</a>
                    </p>
                </body>
                </html>
            `;
        }
    };

    const registration = vscode.window.registerWebviewViewProvider(
        'julesForAntigravity.panel',
        provider
    );
    context.subscriptions.push(registration);
}

// ============================================================================
// Deactivation
// ============================================================================

export async function deactivate(): Promise<void> {
    console.log('Jules for Antigravity: Deactivating...');

    // Stop Bridge Server
    if (bridgeServer) {
        bridgeServer.stop();
    }

    // Unregister from Antigravity config
    try {
        await unregisterBridgeServer();
    } catch {
        // Ignore unregistration errors
    }

    console.log('Jules for Antigravity: Deactivation complete');
}
