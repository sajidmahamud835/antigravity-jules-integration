/**
 * MCP Server Registration
 * 
 * Logic to register the Jules Bridge Server in the global Antigravity config.
 * Mocked implementation for unavailable global config API.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getApiKey } from '../secrets';

export async function registerBridgeServer(
    extensionPath: string
): Promise<boolean> {
    const outputChannel = vscode.window.createOutputChannel('Jules Registration');

    try {
        outputChannel.appendLine('Registering Jules Bridge Server...');

        // Get the config path
        const configPath = getAntigravityConfigPath();
        outputChannel.appendLine(`Config path: ${configPath}`);

        // Load or create config
        const config = await loadConfig(configPath);

        // Get API Key securely
        let apiKey: string | undefined;
        try {
            apiKey = await getApiKey();
        } catch (e) {
            outputChannel.appendLine(`Warning: Could not retrieve API Key: ${e}`);
        }

        const env: Record<string, string> = {
            NODE_ENV: 'production'
        };

        if (apiKey) {
            env['JULES_API_KEY'] = apiKey;
        }

        // Create server configuration
        const serverConfig: McpServerConfig = {
            name: 'jules-bridge',
            command: 'node',
            args: [path.join(extensionPath, 'out', 'mcp', 'BridgeServer.js')],
            env,
            enabled: true
        };

        // Check if already registered
        const existingIndex = config.mcpServers.findIndex(
            s => s.name === serverConfig.name
        );

        if (existingIndex >= 0) {
            // Update existing registration
            config.mcpServers[existingIndex] = serverConfig;
            outputChannel.appendLine('Updated existing server registration');
        } else {
            // Add new registration
            config.mcpServers.push(serverConfig);
            outputChannel.appendLine('Added new server registration');
        }

        // Save config to file-based Antigravity config
        await saveConfig(configPath, config);
        outputChannel.appendLine('Configuration saved successfully');

        // Note: We don't register in VS Code settings as that requires
        // the parent Antigravity extension to declare the setting schema.
        // File-based configuration is sufficient for MCP server discovery.

        return true;

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`Registration failed: ${message}`);

        // Show warning but don't fail activation
        vscode.window.showWarningMessage(
            `Jules Bridge Server registration failed: ${message}. ` +
            'The server will still work when started manually.'
        );

        return false;
    } finally {
        outputChannel.dispose();
    }
}

/**
 * Unregister the Jules Bridge Server from the Antigravity configuration.
 */
export async function unregisterBridgeServer(): Promise<void> {
    try {
        const configPath = getAntigravityConfigPath();
        const config = await loadConfig(configPath);

        // Remove our server from the list
        config.mcpServers = config.mcpServers.filter(
            s => s.name !== 'jules-bridge'
        );

        await saveConfig(configPath, config);
    } catch {
        // Ignore errors during unregistration
    }
}

// ============================================================================
// Types
// ============================================================================

export interface McpServerConfig {
    name: string;
    command: string;
    args: string[];
    env?: Record<string, string>;
    enabled: boolean;
}

export interface AntigravityConfig {
    mcpServers: McpServerConfig[];
}

// ============================================================================
// Registration Implementation
// ============================================================================

/**
 * Get the path to the Antigravity configuration file.
 */
function getAntigravityConfigPath(): string {
    const homeDir = os.homedir();

    // Check for Antigravity-specific config locations
    const possiblePaths = [
        path.join(homeDir, '.antigravity', 'config.json'),
        path.join(homeDir, '.config', 'antigravity', 'mcp-servers.json'),
        path.join(homeDir, 'AppData', 'Roaming', 'Antigravity', 'config.json'), // Windows
    ];

    // Use the first existing path, or default to the first option
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            return p;
        }
    }

    // Default location
    const defaultPath = possiblePaths[0];

    // Ensure directory exists
    const dir = path.dirname(defaultPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    return defaultPath;
}

/**
 * Load the Antigravity configuration.
 */
async function loadConfig(configPath: string): Promise<AntigravityConfig> {
    try {
        if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, 'utf-8');
            return JSON.parse(content) as AntigravityConfig;
        }
    } catch {
        // Ignore parse errors, return empty config
    }

    return { mcpServers: [] };
}

/**
 * Save the Antigravity configuration.
 */
async function saveConfig(
    configPath: string,
    config: AntigravityConfig
): Promise<void> {
    const content = JSON.stringify(config, null, 2);
    fs.writeFileSync(configPath, content, 'utf-8');
}
