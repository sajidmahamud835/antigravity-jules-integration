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

            // 7. Add to local cache for immediate UI update
            const newSessionStatus: SessionStatus = {
                id: responseData.id,
                task: payload.title,
                status: 'pending',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            this.addSession(newSessionStatus);

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
     * Implements multiple fallback methods and extensive logging for debugging.
     * 
     * @param options.pageSize - Number of sessions to fetch (default: 50, max: 100)
     */
    async listSessions(options?: { pageSize?: number }): Promise<SessionStatus[]> {
        const apiKey = await getApiKey();
        if (!apiKey) {
            return [];
        }

        const pageSize = options?.pageSize || 50;
        return this._fetchSessionsMethod1(apiKey, pageSize);
    }

    async getActiveSessions(options?: { pageSize?: number }): Promise<SessionStatus[]> {
        const LOG_PREFIX = '[JulesClient.getActiveSessions]';
        console.log(`${LOG_PREFIX} Starting session fetch...`);

        try {
            const sessions = await this.listSessions(options);
            console.log(`${LOG_PREFIX} Fetched ${sessions.length} sessions from API.`);
            this._updateCache(sessions);
        } catch (error) {
            console.error(`${LOG_PREFIX} API fetch failed, returning cached sessions.`, error);
        }

        console.log(`${LOG_PREFIX} Returning ${this._activeSessions.size} sessions from cache.`);
        return Array.from(this._activeSessions.values());
    }

    /**
     * Method 1: Fetch sessions with pageSize parameter
     */
    private async _fetchSessionsMethod1(apiKey: string, pageSize: number): Promise<SessionStatus[]> {
        const LOG_PREFIX = '[JulesClient._fetchSessionsMethod1]';

        const url = new URL(API_CONFIG.BASE_URL);
        url.searchParams.set('pageSize', String(Math.min(pageSize, 100)));

        console.log(`${LOG_PREFIX} Fetching from: ${url.toString()}`);

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey
            }
        });

        console.log(`${LOG_PREFIX} Response status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`${LOG_PREFIX} Error response body:`, errorText);
            throw new Error(`API returned ${response.status}: ${errorText}`);
        }

        const rawData = await response.text();
        console.log(`${LOG_PREFIX} Raw response (first 500 chars):`, rawData.substring(0, 500));

        const data = JSON.parse(rawData) as {
            sessions?: JulesApiSession[];
            nextPageToken?: string;
        };

        console.log(`${LOG_PREFIX} Parsed data keys:`, Object.keys(data));
        console.log(`${LOG_PREFIX} Sessions array length:`, data.sessions?.length || 0);

        if (data.sessions && data.sessions.length > 0) {
            console.log(`${LOG_PREFIX} First session sample:`, JSON.stringify(data.sessions[0], null, 2));
        }

        const sessions = data.sessions || [];
        return sessions.map(s => this.parseApiSession(s));
    }

    /**
     * Method 2: Simple GET without any parameters
     */
    private async _fetchSessionsMethod2(apiKey: string): Promise<SessionStatus[]> {
        const LOG_PREFIX = '[JulesClient._fetchSessionsMethod2]';

        console.log(`${LOG_PREFIX} Fetching from: ${API_CONFIG.BASE_URL}`);

        const response = await fetch(API_CONFIG.BASE_URL, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey
            }
        });

        console.log(`${LOG_PREFIX} Response status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`${LOG_PREFIX} Error response body:`, errorText);
            throw new Error(`API returned ${response.status}: ${errorText}`);
        }

        const rawData = await response.text();
        console.log(`${LOG_PREFIX} Raw response (first 500 chars):`, rawData.substring(0, 500));

        const data = JSON.parse(rawData);
        console.log(`${LOG_PREFIX} Parsed data keys:`, Object.keys(data));

        // Try to find sessions in various possible response formats
        let sessionsArray: JulesApiSession[] = [];

        if (Array.isArray(data)) {
            console.log(`${LOG_PREFIX} Response is an array with ${data.length} items`);
            sessionsArray = data;
        } else if (data.sessions) {
            console.log(`${LOG_PREFIX} Found 'sessions' key with ${data.sessions.length} items`);
            sessionsArray = data.sessions;
        } else if (data.items) {
            console.log(`${LOG_PREFIX} Found 'items' key with ${data.items.length} items`);
            sessionsArray = data.items;
        } else {
            console.log(`${LOG_PREFIX} Could not find sessions in response`);
        }

        return sessionsArray.map(s => this.parseApiSession(s));
    }

    /**
     * Update local cache with fetched sessions.
     * IMPORTANT: If API returns empty but we have local sessions, merge them instead of overwriting.
     */
    private _updateCache(sessions: SessionStatus[]): void {
        const LOG_PREFIX = '[JulesClient._updateCache]';

        // CRITICAL FIX: Don't overwrite local sessions with empty API response
        if (sessions.length === 0 && this._activeSessions.size > 0) {
            console.warn(`${LOG_PREFIX} API returned empty but we have ${this._activeSessions.size} local sessions - keeping cache`);
            return;
        }

        // Merge: Keep local sessions that aren't in API response (recently created)
        const apiSessionIds = new Set(sessions.map(s => s.id));
        const localOnlySessions: SessionStatus[] = [];

        for (const [id, session] of this._activeSessions) {
            if (!apiSessionIds.has(id)) {
                // This session exists locally but not in API yet (just created)
                console.log(`${LOG_PREFIX} Preserving local-only session: ${id}`);
                localOnlySessions.push(session);
            }
        }

        // Combine API sessions with local-only sessions
        const allSessions = [...sessions, ...localOnlySessions];

        // Sort by creation date (newest first)
        allSessions.sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        this._activeSessions.clear();
        for (const session of allSessions) {
            this._activeSessions.set(session.id, session);
        }

        console.log(`${LOG_PREFIX} Updated cache: ${sessions.length} from API + ${localOnlySessions.length} local = ${allSessions.length} total`);
    }

    /**
     * Parse Jules API session format to our SessionStatus format.
     * API states: QUEUED, PLANNING, WAITING_FOR_PLAN_APPROVAL, IN_PROGRESS, PAUSED, FAILED, COMPLETED
     */
    private parseApiSession(apiSession: JulesApiSession): SessionStatus {
        const LOG_PREFIX = '[JulesClient.parseApiSession]';

        // Extract session ID from name (format: "sessions/xxx")
        const id = apiSession.name?.split('/').pop() || apiSession.name || 'unknown';

        // Log incoming session data
        console.log(`${LOG_PREFIX} Parsing session:`, {
            name: apiSession.name,
            id,
            state: apiSession.state,
            title: apiSession.title?.substring(0, 50)
        });

        // Map API state to our status using exact API state values
        let status: SessionStatus['status'] = 'pending';
        const state = (apiSession.state || '').toUpperCase();

        switch (state) {
            case 'COMPLETED':
            case 'FINISHED':
                status = 'completed';
                break;
            case 'IN_PROGRESS':
            case 'PLANNING':
            case 'WAITING_FOR_PLAN_APPROVAL':
                status = 'running';
                break;
            case 'FAILED':
            case 'ERROR':
                status = 'failed';
                break;
            case 'CANCELLED':
            case 'CANCELED':
                status = 'cancelled';
                break;
            case 'QUEUED':
            case 'PAUSED':
            default:
                status = 'pending';
                break;
        }

        console.log(`${LOG_PREFIX} Mapped state "${apiSession.state}" -> status "${status}"`);

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
