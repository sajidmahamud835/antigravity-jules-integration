/**
 * Jules API Client
 * 
 * Handles communication with the Google Jules API for creating agent sessions.
 * Based on the proven legacy Send2Jules implementation.
 * 
 * API Endpoint: https://jules.googleapis.com/v1alpha/sessions
 * Authentication: X-Goog-Api-Key header
 */

import * as vscode from 'vscode';
import { getApiKey } from './secrets';

// ============================================================================
// API Configuration
// ============================================================================

const API_CONFIG = {
    /** Base URL for Jules API */
    BASE_URL: 'https://jules.googleapis.com/v1alpha/sessions',
    /** Request timeout in milliseconds */
    TIMEOUT_MS: 30000,
};

// ============================================================================
// Type Definitions
// ============================================================================

export interface JulesSession {
    /** Display name of the session */
    name: string;
    /** Unique session identifier for dashboard URLs */
    id: string;
}

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

// Jules API Response Types (from GET /sessions)
interface JulesApiSession {
    name?: string;
    title?: string;
    prompt?: string;
    state?: string;
    createTime?: string;
    updateTime?: string;
    outputBranch?: string;
}

interface JulesActivity {
    name?: string;
    type?: string;
    description?: string;
    createTime?: string;
}

// ============================================================================
// Error Classes
// ============================================================================

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
// Jules Client Implementation
// ============================================================================

export class JulesClient {
    private _activeSessions: Map<string, SessionStatus> = new Map();

    /**
     * Create a new Jules session for the given repository and prompt.
     * 
     * @param owner - GitHub repository owner
     * @param repo - GitHub repository name 
     * @param branch - Starting branch name
     * @param prompt - Context-aware prompt
     * @returns JulesSession object with session name and ID
     */
    async createSession(
        owner: string,
        repo: string,
        branch: string,
        prompt: string
    ): Promise<JulesSession> {
        // 1. Get and validate API key
        const apiKey = await getApiKey();
        if (!apiKey) {
            throw new JulesApiError(
                'Jules API key is required. Run "Set Jules API Key" command to configure.',
                401
            );
        }

        // 2. Prepare request payload (matching legacy structure)
        const payload = {
            prompt: prompt.trim(),
            sourceContext: {
                source: `sources/github/${owner}/${repo}`,
                githubRepoContext: { startingBranch: branch }
            },
            title: `Auto-Handoff: ${new Date().toLocaleTimeString()}`
        };

        // 3. Add request timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT_MS);

        try {
            // 4. Make API request to correct endpoint
            const response = await fetch(API_CONFIG.BASE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': apiKey
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            // 5. Handle API errors with user-friendly messages
            if (!response.ok) {
                const errorText = await response.text();

                // Special handling for repository not initialized (404)
                if (response.status === 404 && errorText.includes("Requested entity was not found")) {
                    throw new ProjectNotInitializedError(owner, repo);
                }

                // Sanitize error message
                const sanitizedError = this.sanitizeApiError(response.status);
                throw new JulesApiError(sanitizedError, response.status, errorText);
            }

            // 6. Parse and return response
            const responseData = await response.json() as JulesSession;
            return responseData;

        } catch (error: unknown) {
            clearTimeout(timeoutId);

            // Handle timeout
            if (error instanceof Error && error.name === 'AbortError') {
                throw new JulesApiError(
                    'Request to Jules API timed out. Please check your network connection.',
                    408
                );
            }

            // Re-throw our custom errors
            if (error instanceof JulesApiError || error instanceof ProjectNotInitializedError) {
                throw error;
            }

            // Wrap unexpected errors
            throw new JulesApiError(
                'An unexpected error occurred while creating Jules session',
                undefined,
                error instanceof Error ? error.message : String(error)
            );
        }
    }

    /**
     * Add a session to local tracking after creation.
     */
    addSession(session: SessionStatus): void {
        this._activeSessions.set(session.id, session);
    }

    /**
     * Get all sessions from Jules API (including completed/old sessions).
     * Fetches real session data and syncs with local cache.
     * @param options.pageSize - Number of sessions to fetch (default: 50, max: 100)
     * @param options.includeCompleted - Whether to include completed sessions (default: true)
     */
    async getActiveSessions(options?: { pageSize?: number; includeCompleted?: boolean }): Promise<SessionStatus[]> {
        const apiKey = await getApiKey();
        if (!apiKey) {
            // Return cached sessions if no API key
            return Array.from(this._activeSessions.values());
        }

        const pageSize = options?.pageSize || 50;

        try {
            // Build URL with query parameters for pagination
            const url = new URL(API_CONFIG.BASE_URL);
            url.searchParams.set('pageSize', String(Math.min(pageSize, 100)));

            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': apiKey
                }
            });

            if (!response.ok) {
                console.warn('Failed to fetch sessions from API, using cache');
                return Array.from(this._activeSessions.values());
            }

            const data = await response.json() as {
                sessions?: JulesApiSession[];
                nextPageToken?: string;
            };
            const sessions = data.sessions || [];

            // Parse API response into SessionStatus format
            const parsedSessions: SessionStatus[] = sessions.map(s => this.parseApiSession(s));

            // Sort by creation date (newest first)
            parsedSessions.sort((a, b) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );

            // Update local cache
            this._activeSessions.clear();
            for (const session of parsedSessions) {
                this._activeSessions.set(session.id, session);
            }

            return parsedSessions;
        } catch (error) {
            console.warn('Error fetching sessions:', error);
            return Array.from(this._activeSessions.values());
        }
    }

    /**
     * Parse Jules API session format to our SessionStatus format.
     */
    private parseApiSession(apiSession: JulesApiSession): SessionStatus {
        // Extract session ID from name (format: "sessions/xxx")
        const id = apiSession.name?.split('/').pop() || apiSession.name || 'unknown';

        // Map API state to our status
        let status: SessionStatus['status'] = 'pending';
        const state = apiSession.state?.toLowerCase() || '';
        if (state.includes('complete') || state.includes('finished')) {
            status = 'completed';
        } else if (state.includes('running') || state.includes('active') || state.includes('in_progress')) {
            status = 'running';
        } else if (state.includes('fail') || state.includes('error')) {
            status = 'failed';
        } else if (state.includes('cancel')) {
            status = 'cancelled';
        }

        return {
            id,
            task: apiSession.title || apiSession.prompt?.substring(0, 100) || 'Jules Session',
            status,
            createdAt: apiSession.createTime || new Date().toISOString(),
            updatedAt: apiSession.updateTime || new Date().toISOString(),
            remoteBranch: apiSession.outputBranch
        };
    }

    /**
     * Get thought signatures for a session (activities/events).
     */
    async getThoughtSignatures(sessionId: string): Promise<ThoughtSignature[]> {
        const apiKey = await getApiKey();
        if (!apiKey) return [];

        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}/${sessionId}/activities`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': apiKey
                }
            });

            if (!response.ok) return [];

            const data = await response.json() as { activities?: JulesActivity[] };
            const activities = data.activities || [];

            return activities.map(a => ({
                id: a.name?.split('/').pop() || 'unknown',
                sessionId,
                content: a.description || a.type || 'Activity',
                timestamp: a.createTime || new Date().toISOString(),
                type: this.mapActivityType(a.type)
            }));
        } catch (error) {
            console.warn('Error fetching activities:', error);
            return [];
        }
    }

    /**
     * Map API activity type to our ThoughtSignature type.
     */
    private mapActivityType(apiType?: string): ThoughtSignature['type'] {
        const type = apiType?.toLowerCase() || '';
        if (type.includes('plan')) return 'planning';
        if (type.includes('execut') || type.includes('code')) return 'executing';
        if (type.includes('review') || type.includes('test')) return 'reviewing';
        if (type.includes('complete') || type.includes('finish')) return 'completed';
        return 'executing';
    }

    /**
     * Get the diff/patch from a completed session.
     */
    async getSessionDiff(sessionId: string): Promise<SessionDiff> {
        // Placeholder - would call Jules API in production
        throw new JulesApiError('Session diff not yet available', 404);
    }

    /**
     * Cancel an active session.
     */
    async cancelSession(sessionId: string): Promise<void> {
        this._activeSessions.delete(sessionId);
    }

    /**
     * Sanitize API error messages to prevent information disclosure.
     */
    private sanitizeApiError(statusCode: number): string {
        const genericErrors: Record<number, string> = {
            400: 'Invalid request. Please check your repository configuration.',
            401: 'Authentication failed. Please verify your API key is correct.',
            403: 'Access denied. Check your Jules permissions.',
            404: 'Repository not found in Jules. Please add it at jules.google.com/settings/repositories',
            408: 'Request timed out. Please try again.',
            429: 'Rate limit exceeded. Please try again later.',
            500: 'Jules API error. Please try again.',
            503: 'Jules service is temporarily unavailable.'
        };
        return genericErrors[statusCode] || `API request failed with status ${statusCode}`;
    }

    /**
     * Dispose resources.
     */
    dispose(): void {
        this._activeSessions.clear();
    }
}
