/**
 * Git Context Manager
 * 
 * Implements Git operations for synchronizing remote Jules work
 * back into the local workspace using Git plumbing commands.
 */

import * as vscode from 'vscode';
import { spawn, SpawnOptions } from 'child_process';
import * as path from 'path';
import { SessionDiff } from './julesClient';

// ============================================================================
// Type Definitions
// ============================================================================

export interface GitContextInfo {
    workspaceRoot: string;
    currentBranch: string;
    isClean: boolean;
    remotes: RemoteInfo[];
}

export interface RemoteInfo {
    name: string;
    url: string;
    type: 'fetch' | 'push';
}

export interface ApplyResult {
    success: boolean;
    message: string;
    conflictFiles?: string[];
}

// ============================================================================
// Git Context Implementation
// ============================================================================

export class GitContext {
    private readonly _workspaceRoot: string;
    private readonly _outputChannel: vscode.OutputChannel;

    constructor() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder open');
        }

        this._workspaceRoot = workspaceFolder.uri.fsPath;
        this._outputChannel = vscode.window.createOutputChannel('Jules Git');
    }

    // ========================================================================
    // Public API
    // ========================================================================

    /**
     * Get the current workspace root path.
     */
    public getWorkspaceRoot(): string {
        return this._workspaceRoot;
    }

    /**
     * Get the current active branch name.
     */
    public async getCurrentBranch(): Promise<string> {
        const result = await this._execGit(['rev-parse', '--abbrev-ref', 'HEAD']);
        return result.trim();
    }

    /**
     * Get comprehensive Git context information.
     */
    public async getContext(): Promise<GitContextInfo> {
        const [currentBranch, isClean, remotes] = await Promise.all([
            this.getCurrentBranch(),
            this._isWorkingTreeClean(),
            this._getRemotes()
        ]);

        return {
            workspaceRoot: this._workspaceRoot,
            currentBranch,
            isClean,
            remotes
        };
    }

    /**
     * Apply remote branch changes from Jules into the local working directory.
     * This is the core synchronization method.
     */
    public async applyRemoteBranch(
        remoteBranch: string,
        strategy: 'merge' | 'rebase' | 'patch' = 'merge'
    ): Promise<ApplyResult> {
        this._log(`Applying remote branch: ${remoteBranch} with strategy: ${strategy}`);

        try {
            // Ensure working tree is clean
            const isClean = await this._isWorkingTreeClean();
            if (!isClean) {
                return {
                    success: false,
                    message: 'Working tree has uncommitted changes. Please commit or stash them first.'
                };
            }

            // Fetch the remote branch
            await this._fetchRemoteBranch(remoteBranch);

            // Apply changes based on strategy
            switch (strategy) {
                case 'merge':
                    return await this._mergeRemoteBranch(remoteBranch);
                case 'rebase':
                    return await this._rebaseOntoRemote(remoteBranch);
                case 'patch':
                    return await this._applyAsPatch(remoteBranch);
                default:
                    throw new Error(`Unknown strategy: ${strategy}`);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this._log(`Error applying remote branch: ${message}`);
            return { success: false, message };
        }
    }

    /**
     * Apply a session diff directly without fetching.
     * Used when the diff is already available from the Jules API.
     */
    public async applySessionDiff(diff: SessionDiff): Promise<ApplyResult> {
        this._log(`Applying session diff: ${diff.sessionId}`);

        try {
            // Check working tree status
            const isClean = await this._isWorkingTreeClean();
            if (!isClean) {
                return {
                    success: false,
                    message: 'Working tree has uncommitted changes.'
                };
            }

            // Create a temporary branch for the changes
            const tempBranch = `jules-${diff.sessionId.substring(0, 8)}`;
            await this._execGit(['checkout', '-b', tempBranch]);

            // Apply each file diff
            const failedFiles: string[] = [];

            for (const fileDiff of diff.files) {
                try {
                    await this._applyFileDiff(fileDiff);
                } catch {
                    failedFiles.push(fileDiff.path);
                }
            }

            if (failedFiles.length > 0) {
                return {
                    success: false,
                    message: `Failed to apply changes to ${failedFiles.length} file(s)`,
                    conflictFiles: failedFiles
                };
            }

            // Stage and commit changes
            await this._execGit(['add', '-A']);
            await this._execGit([
                'commit',
                '-m',
                `Apply Jules session ${diff.sessionId.substring(0, 8)} changes`
            ]);

            this._log('Session diff applied successfully');
            return { success: true, message: 'Changes applied successfully' };

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this._log(`Error applying session diff: ${message}`);
            return { success: false, message };
        }
    }

    /**
     * Abort any in-progress merge or rebase operation.
     */
    public async abortOperation(): Promise<void> {
        try {
            // Try to abort merge first
            await this._execGit(['merge', '--abort']);
        } catch {
            try {
                // Then try rebase
                await this._execGit(['rebase', '--abort']);
            } catch {
                // Neither in progress, ignore
            }
        }
    }

    // ========================================================================
    // Private Git Operations
    // ========================================================================

    /**
     * Fetch a remote branch.
     */
    private async _fetchRemoteBranch(remoteBranch: string): Promise<void> {
        const [remote, branch] = this._parseRemoteBranch(remoteBranch);
        this._log(`Fetching ${remote}/${branch}`);
        await this._execGit(['fetch', remote, branch]);
    }

    /**
     * Merge remote branch into current branch.
     */
    private async _mergeRemoteBranch(remoteBranch: string): Promise<ApplyResult> {
        try {
            await this._execGit(['merge', remoteBranch, '--no-edit']);
            return { success: true, message: 'Merged successfully' };
        } catch (error) {
            // Check for conflicts
            const conflicts = await this._getConflictFiles();
            if (conflicts.length > 0) {
                return {
                    success: false,
                    message: 'Merge conflicts detected',
                    conflictFiles: conflicts
                };
            }
            throw error;
        }
    }

    /**
     * Rebase current branch onto remote.
     */
    private async _rebaseOntoRemote(remoteBranch: string): Promise<ApplyResult> {
        try {
            await this._execGit(['rebase', remoteBranch]);
            return { success: true, message: 'Rebased successfully' };
        } catch (error) {
            const conflicts = await this._getConflictFiles();
            if (conflicts.length > 0) {
                return {
                    success: false,
                    message: 'Rebase conflicts detected',
                    conflictFiles: conflicts
                };
            }
            throw error;
        }
    }

    /**
     * Apply changes as a patch (cherry-pick style).
     */
    private async _applyAsPatch(remoteBranch: string): Promise<ApplyResult> {
        try {
            // Get the diff and apply it
            const diff = await this._execGit([
                'diff',
                `HEAD...${remoteBranch}`,
                '--patch'
            ]);

            if (!diff.trim()) {
                return { success: true, message: 'No changes to apply' };
            }

            await this._execGit(['apply', '--3way'], diff);
            return { success: true, message: 'Patch applied successfully' };
        } catch (error) {
            const conflicts = await this._getConflictFiles();
            if (conflicts.length > 0) {
                return {
                    success: false,
                    message: 'Patch conflicts detected',
                    conflictFiles: conflicts
                };
            }
            throw error;
        }
    }

    /**
     * Apply a single file diff.
     */
    private async _applyFileDiff(fileDiff: {
        path: string;
        status: string;
        patch: string;
    }): Promise<void> {
        const fullPath = path.join(this._workspaceRoot, fileDiff.path);

        switch (fileDiff.status) {
            case 'deleted':
                await this._execGit(['rm', fileDiff.path]);
                break;
            case 'added':
            case 'modified':
                // Write patch to temp file and apply
                await this._execGit(['apply', '--3way'], fileDiff.patch);
                break;
        }
    }

    /**
     * Check if the working tree is clean.
     */
    private async _isWorkingTreeClean(): Promise<boolean> {
        const status = await this._execGit(['status', '--porcelain']);
        return status.trim() === '';
    }

    /**
     * Get list of files with conflicts.
     */
    private async _getConflictFiles(): Promise<string[]> {
        try {
            const result = await this._execGit(['diff', '--name-only', '--diff-filter=U']);
            return result.trim().split('\n').filter(f => f.length > 0);
        } catch {
            return [];
        }
    }

    /**
     * Get all remote configurations.
     */
    private async _getRemotes(): Promise<RemoteInfo[]> {
        const result = await this._execGit(['remote', '-v']);
        const lines = result.trim().split('\n');

        return lines
            .filter(line => line.length > 0)
            .map(line => {
                const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
                if (match) {
                    return {
                        name: match[1],
                        url: match[2],
                        type: match[3] as 'fetch' | 'push'
                    };
                }
                return null;
            })
            .filter((r): r is RemoteInfo => r !== null);
    }

    /**
     * Parse remote branch string into remote and branch parts.
     */
    private _parseRemoteBranch(remoteBranch: string): [string, string] {
        const parts = remoteBranch.split('/');
        if (parts.length >= 2) {
            return [parts[0], parts.slice(1).join('/')];
        }
        return ['origin', remoteBranch];
    }

    // ========================================================================
    // Git Execution
    // ========================================================================

    /**
     * Execute a git command and return the output.
     */
    private async _execGit(args: string[], stdin?: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const spawnOptions: SpawnOptions = {
                cwd: this._workspaceRoot,
                env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
            };

            const proc = spawn('git', args, spawnOptions);
            let stdout = '';
            let stderr = '';

            proc.stdout?.on('data', (data) => {
                stdout += data.toString();
            });

            proc.stderr?.on('data', (data) => {
                stderr += data.toString();
            });

            if (stdin && proc.stdin) {
                proc.stdin.write(stdin);
                proc.stdin.end();
            }

            proc.on('close', (code) => {
                if (code === 0) {
                    resolve(stdout);
                } else {
                    reject(new Error(stderr || `Git command failed with code ${code}`));
                }
            });

            proc.on('error', (err) => {
                reject(err);
            });
        });
    }

    /**
     * Log a message to the output channel.
     */
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
