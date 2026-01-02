/**
 * Antigravity Detector
 * 
 * Detects if the extension is running within an Antigravity environment.
 * Provides graceful failure handling for unsupported environments.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// Detection Result
// ============================================================================

export interface AntigravityEnvironment {
    detected: boolean;
    version?: string;
    configPath?: string;
    reason?: string;
}

// ============================================================================
// Detector Implementation
// ============================================================================

export class AntigravityDetector {
    private _environment: AntigravityEnvironment | null = null;
    private readonly _outputChannel: vscode.OutputChannel;

    constructor() {
        this._outputChannel = vscode.window.createOutputChannel('Antigravity Detector');
    }

    /**
     * Detect if running in an Antigravity environment.
     */
    public async detect(): Promise<AntigravityEnvironment> {
        if (this._environment) {
            return this._environment;
        }

        this._log('Starting Antigravity environment detection...');

        // Check multiple indicators
        const checks = await Promise.all([
            this._checkAntigravityExtension(),
            this._checkAntigravityConfig(),
            this._checkEnvironmentVariables(),
            this._checkGeminiDirectory()
        ]);

        // Evaluate results
        const detected = checks.some(c => c.detected);
        const version = checks.find(c => c.version)?.version;
        const configPath = checks.find(c => c.configPath)?.configPath;

        this._environment = {
            detected,
            version,
            configPath,
            reason: detected
                ? 'Antigravity environment detected'
                : 'No Antigravity environment indicators found'
        };

        this._log(`Detection result: ${JSON.stringify(this._environment)}`);

        return this._environment;
    }

    /**
     * Check if Antigravity environment is available.
     * Returns true if detected, false otherwise.
     */
    public async isAvailable(): Promise<boolean> {
        const env = await this.detect();
        return env.detected;
    }

    /**
     * Get the cached environment information.
     */
    public getEnvironment(): AntigravityEnvironment | null {
        return this._environment;
    }

    /**
     * Show a notification if Antigravity is not detected.
     */
    public showNotAvailableMessage(): void {
        vscode.window.showWarningMessage(
            'Jules for Antigravity: Antigravity environment not detected. ' +
            'Some features may be limited.',
            'Learn More',
            'Dismiss'
        ).then(selection => {
            if (selection === 'Learn More') {
                vscode.env.openExternal(
                    vscode.Uri.parse('https://antigravity.dev/docs/setup')
                );
            }
        });
    }

    // ========================================================================
    // Detection Methods
    // ========================================================================

    /**
     * Check for Antigravity VS Code extension.
     */
    private async _checkAntigravityExtension(): Promise<AntigravityEnvironment> {
        const extensionIds = [
            'google.antigravity',
            'antigravity.antigravity-vscode',
            'gemini.gemini-code-assist'
        ];

        for (const id of extensionIds) {
            const ext = vscode.extensions.getExtension(id);
            if (ext) {
                this._log(`Found Antigravity extension: ${id}`);
                return {
                    detected: true,
                    version: ext.packageJSON?.version
                };
            }
        }

        return { detected: false };
    }

    /**
     * Check for Antigravity configuration files.
     */
    private async _checkAntigravityConfig(): Promise<AntigravityEnvironment> {
        const homeDir = os.homedir();
        const possiblePaths = [
            path.join(homeDir, '.antigravity', 'config.json'),
            path.join(homeDir, '.config', 'antigravity', 'config.json'),
            path.join(homeDir, 'AppData', 'Roaming', 'Antigravity', 'config.json'),
        ];

        for (const configPath of possiblePaths) {
            if (fs.existsSync(configPath)) {
                this._log(`Found Antigravity config: ${configPath}`);

                try {
                    const content = fs.readFileSync(configPath, 'utf-8');
                    const config = JSON.parse(content);
                    return {
                        detected: true,
                        version: config.version,
                        configPath
                    };
                } catch {
                    return {
                        detected: true,
                        configPath
                    };
                }
            }
        }

        return { detected: false };
    }

    /**
     * Check for Antigravity environment variables.
     */
    private async _checkEnvironmentVariables(): Promise<AntigravityEnvironment> {
        const envVars = [
            'ANTIGRAVITY_ENABLED',
            'ANTIGRAVITY_API_KEY',
            'GEMINI_API_KEY',
            'GOOGLE_AI_API_KEY'
        ];

        for (const envVar of envVars) {
            if (process.env[envVar]) {
                this._log(`Found environment variable: ${envVar}`);
                return { detected: true };
            }
        }

        return { detected: false };
    }

    /**
     * Check for .gemini directory (Antigravity workspace marker).
     */
    private async _checkGeminiDirectory(): Promise<AntigravityEnvironment> {
        // Check in workspace
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            const geminiPath = path.join(workspaceFolder.uri.fsPath, '.gemini');
            if (fs.existsSync(geminiPath)) {
                this._log(`Found .gemini directory in workspace`);
                return { detected: true };
            }
        }

        // Check in home directory
        const homeDir = os.homedir();
        const homeGeminiPath = path.join(homeDir, '.gemini');
        if (fs.existsSync(homeGeminiPath)) {
            this._log(`Found .gemini directory in home`);
            return { detected: true };
        }

        return { detected: false };
    }

    // ========================================================================
    // Logging
    // ========================================================================

    private _log(message: string): void {
        const timestamp = new Date().toISOString();
        this._outputChannel.appendLine(`[${timestamp}] ${message}`);
    }

    /**
     * Dispose resources.
     */
    public dispose(): void {
        this._outputChannel.dispose();
    }
}
