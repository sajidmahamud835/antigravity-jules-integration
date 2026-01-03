/**
 * Node.js Jules Client
 * 
 * Standalone version of JulesClient for MCP Bridge Server.
 * Uses 'fetch' (available in Node 18+) and standard Environment Variables for auth.
 * Does NOT depend on 'vscode'.
 */

import { getApiKey } from './secretsNode';

// ============================================================================
// Types (Same as julesClient.ts)
// ============================================================================

export interface JulesSession {
    name: string;
    id: string;
}

export class JulesApiError extends Error {
    constructor(
        message: string,
        public statusCode?: number,
        public rawError?: string
    ) {
        super(message);
        this.name = 'JulesApiError';
    }
}

export class ProjectNotInitializedError extends Error {
    constructor(public owner: string, public repo: string) {
        super(
            `Jules does not have access to ${owner}/${repo}. ` +
            `Please install the Jules GitHub App at https://jules.google.com/settings/repositories`
        );
        this.name = 'ProjectNotInitializedError';
    }
}

// ============================================================================
// Jules Client Node Implementation
// ============================================================================

export class JulesClientNode {
    private readonly BASE_URL = 'https://jules.googleapis.com/v1alpha/sessions';
    private readonly TIMEOUT_MS = 30000;

    constructor() { }

    /**
     * Create a new Jules session.
     */
    async createSession(
        owner: string,
        repo: string,
        branch: string,
        prompt: string
    ): Promise<JulesSession> {
        // 1. Get API key from Environment
        const apiKey = await getApiKey();
        if (!apiKey) {
            throw new JulesApiError(
                'Jules API key is missing. Please set JULES_API_KEY environment variable.',
                401
            );
        }

        // 2. Prepare payload
        const payload = {
            prompt: prompt.trim(),
            sourceContext: {
                source: `sources/github/${owner}/${repo}`,
                githubRepoContext: { startingBranch: branch }
            },
            title: `Auto-Handoff: ${new Date().toLocaleTimeString()}`
        };

        // 3. Make Request with Timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

        try {
            const response = await fetch(this.BASE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': apiKey
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();

                if (response.status === 404 && errorText.includes("Requested entity was not found")) {
                    throw new ProjectNotInitializedError(owner, repo);
                }

                throw new JulesApiError(`API Request failed: ${errorText}`, response.status, errorText);
            }

            return await response.json() as JulesSession;

        } catch (error: any) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new JulesApiError('Request timed out', 408);
            }
            if (error instanceof JulesApiError || error instanceof ProjectNotInitializedError) {
                throw error;
            }
            throw new JulesApiError(`Unexpected error: ${error.message}`);
        }
    }
}
