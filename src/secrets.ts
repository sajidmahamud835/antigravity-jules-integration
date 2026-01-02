/**
 * Secrets Manager
 * 
 * Secure API key management using VS Code SecretStorage.
 * NOTE: This file should NOT be modified as per constraints.
 */

import * as vscode from 'vscode';

// ============================================================================
// Constants
// ============================================================================

const SECRET_KEY = 'jules-api-key';
const LEGACY_SECRET_KEYS = ['julesApiKey', 'jules.apiKey'];

// ============================================================================
// Secret Storage Instance
// ============================================================================

let _secretStorage: vscode.SecretStorage | null = null;

/**
 * Initialize the secret storage with the extension context.
 */
export function initializeSecretStorage(context: vscode.ExtensionContext): void {
    _secretStorage = context.secrets;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get the Jules API key from secure storage.
 * Falls back to environment variable if not stored.
 */
export async function getApiKey(): Promise<string> {
    // First, check secure storage
    if (_secretStorage) {
        const storedKey = await _secretStorage.get(SECRET_KEY);
        if (storedKey) {
            return storedKey;
        }

        // Check legacy keys for migration
        for (const legacyKey of LEGACY_SECRET_KEYS) {
            const legacyValue = await _secretStorage.get(legacyKey);
            if (legacyValue) {
                // Migrate to new key
                await _secretStorage.store(SECRET_KEY, legacyValue);
                await _secretStorage.delete(legacyKey);
                return legacyValue;
            }
        }
    }

    // Fall back to environment variables
    const envKeys = [
        'JULES_API_KEY',
        'ANTIGRAVITY_API_KEY',
        'GEMINI_API_KEY'
    ];

    for (const envKey of envKeys) {
        const value = process.env[envKey];
        if (value) {
            return value;
        }
    }

    // Check VS Code settings
    const config = vscode.workspace.getConfiguration('julesForAntigravity');
    const configKey = config.get<string>('apiKey');
    if (configKey) {
        return configKey;
    }

    throw new Error(
        'Jules API key not found. Please set it via the command palette or environment variable.'
    );
}

/**
 * Store the Jules API key in secure storage.
 */
export async function setApiKey(apiKey: string): Promise<void> {
    if (!_secretStorage) {
        throw new Error('Secret storage not initialized');
    }

    await _secretStorage.store(SECRET_KEY, apiKey);
}

/**
 * Delete the stored API key.
 */
export async function deleteApiKey(): Promise<void> {
    if (!_secretStorage) {
        return;
    }

    await _secretStorage.delete(SECRET_KEY);

    // Also delete legacy keys
    for (const legacyKey of LEGACY_SECRET_KEYS) {
        await _secretStorage.delete(legacyKey);
    }
}

/**
 * Check if an API key is stored.
 */
export async function hasApiKey(): Promise<boolean> {
    try {
        await getApiKey();
        return true;
    } catch {
        return false;
    }
}

/**
 * Prompt user to enter API key.
 */
export async function promptForApiKey(): Promise<string | undefined> {
    const apiKey = await vscode.window.showInputBox({
        prompt: 'Enter your Jules API key',
        password: true,
        placeHolder: 'sk-...',
        validateInput: (value) => {
            if (!value || value.trim().length === 0) {
                return 'API key cannot be empty';
            }
            if (value.length < 10) {
                return 'API key seems too short';
            }
            return null;
        }
    });

    if (apiKey) {
        await setApiKey(apiKey);
        vscode.window.showInformationMessage('Jules API key saved securely');
    }

    return apiKey;
}
