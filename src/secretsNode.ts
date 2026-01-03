/**
 * Node.js Secrets Manager
 * 
 * Provides API key access for standalone Node.js processes (like MCP servers).
 * Reads from environment variables injected by the main extension.
 */

export async function getApiKey(): Promise<string | undefined> {
    // Check environment variables injected by the extension
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

    return undefined;
}
