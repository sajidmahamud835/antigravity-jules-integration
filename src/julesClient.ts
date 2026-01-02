/**
 * Jules Client
 * 
 * Implements robust long-polling methods for session status and diff retrieval.
 * Handles communication with the remote Jules orchestration service.
 */

import * as vscode from 'vscode';
import { getApiKey } from './secrets';

// ============================================================================
// Type Definitions
// ============================================================================

export interface SessionStatus {
    id: string;
    task: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    createdAt: string;
    updatedAt: string;
    remoteBranch?: string;
    error?: string;
}

export interface ThoughtSignature {
    id: string;
    sessionId: string;
    content: string;
    timestamp: string;
    type: 'planning' | 'executing' | 'reviewing' | 'completed';
}

export interface SessionDiff {
    sessionId: string;
    files: FileDiff[];
    commitHash?: string;
    remoteBranch: string;
}

export interface FileDiff {
    path: string;
    status: 'added' | 'modified' | 'deleted';
    patch: string;
}

interface CreateSessionRequest {
    task: string;
    contextFiles: string[];
    repositoryUrl?: string;
    baseBranch?: string;
}

interface JulesApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}

// ============================================================================
// Jules Client Implementation
// ============================================================================

export class JulesClient {
    private readonly _baseUrl: string;
    private readonly _maxRetries = 3;
    private readonly _retryDelayMs = 1000;
    private readonly _pollTimeoutMs = 30000;

    private _activeSessions: Map<string, SessionStatus> = new Map();

    constructor(baseUrl?: string) {
        this._baseUrl = baseUrl || 'https://jules.antigravity.dev/api/v1';
    }

    // ========================================================================
    // Session Management
    // ========================================================================

    /**
     * Create a new Jules session for task delegation.
     */
    public async createSession(
        task: string,
        contextFiles: string[]
    ): Promise<SessionStatus> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

        const request: CreateSessionRequest = {
            task,
            contextFiles,
            repositoryUrl: await this._getRepositoryUrl(),
            baseBranch: await this._getCurrentBranch()
        };

        const response = await this._apiRequest<SessionStatus>(
            'POST',
            '/sessions',
            request
        );

        if (response.success && response.data) {
            this._activeSessions.set(response.data.id, response.data);
            return response.data;
        }

        throw new Error(response.error || 'Failed to create session');
    }

    /**
     * Get all active sessions.
     */
    public async getActiveSessions(): Promise<SessionStatus[]> {
        const response = await this._apiRequest<SessionStatus[]>(
            'GET',
            '/sessions?status=active'
        );

        if (response.success && response.data) {
            // Update local cache
            for (const session of response.data) {
                this._activeSessions.set(session.id, session);
            }
            return response.data;
        }

        // Return cached sessions on failure
        return Array.from(this._activeSessions.values());
    }

    /**
     * Get the status of a specific session with long-polling support.
     */
    public async pollSessionStatus(
        sessionId: string,
        timeoutMs: number = this._pollTimeoutMs
    ): Promise<SessionStatus> {
        const startTime = Date.now();
        let lastStatus: SessionStatus | undefined;

        while (Date.now() - startTime < timeoutMs) {
            const response = await this._apiRequest<SessionStatus>(
                'GET',
                `/sessions/${sessionId}`,
                undefined,
                { 'X-Long-Poll': 'true', 'X-Poll-Timeout': String(timeoutMs) }
            );

            if (response.success && response.data) {
                lastStatus = response.data;
                this._activeSessions.set(sessionId, response.data);

                // Return immediately if session is complete
                if (['completed', 'failed', 'cancelled'].includes(response.data.status)) {
                    return response.data;
                }
            }

            // Short delay before next poll
            await this._delay(1000);
        }

        if (lastStatus) {
            return lastStatus;
        }

        throw new Error(`Timeout waiting for session ${sessionId} status`);
    }

    /**
     * Cancel an active session.
     */
    public async cancelSession(sessionId: string): Promise<void> {
        const response = await this._apiRequest<void>(
            'POST',
            `/sessions/${sessionId}/cancel`
        );

        if (!response.success) {
            throw new Error(response.error || 'Failed to cancel session');
        }

        this._activeSessions.delete(sessionId);
    }

    // ========================================================================
    // Thought Signatures
    // ========================================================================

    /**
     * Get thought signatures for a session.
     * These represent the agent's reasoning process.
     */
    public async getThoughtSignatures(
        sessionId: string
    ): Promise<ThoughtSignature[]> {
        const response = await this._apiRequest<ThoughtSignature[]>(
            'GET',
            `/sessions/${sessionId}/thoughts`
        );

        if (response.success && response.data) {
            return response.data;
        }

        return [];
    }

    // ========================================================================
    // Diff Retrieval
    // ========================================================================

    /**
     * Get the diff/patch from a completed session.
     */
    public async getSessionDiff(sessionId: string): Promise<SessionDiff> {
        const response = await this._apiRequest<SessionDiff>(
            'GET',
            `/sessions/${sessionId}/diff`
        );

        if (response.success && response.data) {
            return response.data;
        }

        throw new Error(response.error || 'Failed to retrieve session diff');
    }

    // ========================================================================
    // Private Helpers
    // ========================================================================

    /**
     * Make an API request with retry logic and exponential backoff.
     */
    private async _apiRequest<T>(
        method: string,
        endpoint: string,
        body?: unknown,
        additionalHeaders?: Record<string, string>
    ): Promise<JulesApiResponse<T>> {
        let lastError: Error | undefined;

        for (let attempt = 0; attempt < this._maxRetries; attempt++) {
            try {
                const apiKey = await getApiKey();

                const headers: Record<string, string> = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'X-Client': 'antigravity-jules-integration',
                    ...additionalHeaders
                };

                const response = await fetch(`${this._baseUrl}${endpoint}`, {
                    method,
                    headers,
                    body: body ? JSON.stringify(body) : undefined
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({})) as { message?: string };
                    throw new Error(
                        errorData.message ||
                        `HTTP ${response.status}: ${response.statusText}`
                    );
                }

                const data = await response.json() as T;
                return { success: true, data };

            } catch (error) {
                lastError = error as Error;

                // Exponential backoff
                if (attempt < this._maxRetries - 1) {
                    const delay = this._retryDelayMs * Math.pow(2, attempt);
                    await this._delay(delay);
                }
            }
        }

        return {
            success: false,
            error: lastError?.message || 'Unknown error occurred'
        };
    }

    /**
     * Get the repository URL from git config.
     */
    private async _getRepositoryUrl(): Promise<string | undefined> {
        try {
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (gitExtension) {
                const git = gitExtension.exports.getAPI(1);
                const repo = git.repositories[0];
                if (repo) {
                    const remotes = repo.state.remotes;
                    const origin = remotes.find((r: { name: string }) => r.name === 'origin');
                    return origin?.fetchUrl || origin?.pushUrl;
                }
            }
        } catch {
            // Ignore errors
        }
        return undefined;
    }

    /**
     * Get the current branch name.
     */
    private async _getCurrentBranch(): Promise<string | undefined> {
        try {
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (gitExtension) {
                const git = gitExtension.exports.getAPI(1);
                const repo = git.repositories[0];
                return repo?.state.HEAD?.name;
            }
        } catch {
            // Ignore errors
        }
        return undefined;
    }

    /**
     * Delay execution for a specified duration.
     */
    private _delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Dispose resources.
     */
    public dispose(): void {
        this._activeSessions.clear();
    }
}
