/**
 * Node.js Context Gatherer
 * 
 * Standalone version of ContextGatherer for MCP Bridge Server.
 * Does NOT depend on 'vscode' module.
 * 
 * Capabilities:
 * - Git context (via CLI spawn)
 * - Artifacts (via fs)
 * - Diagnostics/ActiveEditor (Not supported in standalone mode)
 */

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { spawn } from 'child_process';

// ============================================================================
// Type Definitions
// ============================================================================

export interface GatheredContext {
    /** Git repository information */
    gitContext?: {
        owner: string;
        repo: string;
        branch: string;
        isDirty: boolean;
        diff: string;
    };
    /** Antigravity artifacts content */
    artifacts: {
        taskMd?: string;
        implementationPlan?: string;
    };
    // VS Code specific fields are omitted or empty
    activeEditor?: undefined;
    diagnostics: string[];
    openFiles: string[];
}

// ============================================================================
// Context Gatherer Class
// ============================================================================

export class ContextGathererNode {
    constructor() { }

    /**
     * Gather context available to Node.js process.
     */
    async gatherContext(): Promise<GatheredContext> {
        this.log('Starting automatic context gathering (Node Mode)...');

        // Gather applicable context sources
        const [gitContext, artifacts] = await Promise.all([
            this.getGitContext(),
            this.getArtifacts()
        ]);

        const context: GatheredContext = {
            gitContext,
            artifacts,
            diagnostics: [], // Not available in Node
            openFiles: [],   // Not available in Node
            activeEditor: undefined
        };

        this.log('Context gathering complete.');
        return context;
    }

    /**
     * Generate an XML prompt from gathered context.
     */
    generatePrompt(context: GatheredContext, missionBrief?: string): string {
        const instruction =
            "You are an expert software engineer. You are working on a WIP branch. " +
            "Analyze the workspace context and complete the mission brief.";

        let workspaceContext = '';

        // Git context
        if (context.gitContext) {
            workspaceContext += `<git_context>
<repository>${context.gitContext.owner}/${context.gitContext.repo}</repository>
<branch>${context.gitContext.branch}</branch>
<has_uncommitted_changes>${context.gitContext.isDirty}</has_uncommitted_changes>
${context.gitContext.diff ? `<diff>\n${context.gitContext.diff}\n</diff>` : ''}
</git_context>\n`;
        }

        // Artifacts
        if (context.artifacts.taskMd || context.artifacts.implementationPlan) {
            workspaceContext += `<artifacts>\n`;
            if (context.artifacts.taskMd) {
                workspaceContext += `<task_checklist>\n${context.artifacts.taskMd}\n</task_checklist>\n`;
            }
            if (context.artifacts.implementationPlan) {
                workspaceContext += `<implementation_plan>\n${context.artifacts.implementationPlan}\n</implementation_plan>\n`;
            }
            workspaceContext += `</artifacts>\n`;
        }

        const brief = missionBrief || '[Describe your task here]';

        return `<instruction>${instruction}</instruction>
<workspace_context>
${workspaceContext}</workspace_context>
<mission_brief>${brief}</mission_brief>`;
    }

    // ========================================================================
    // Private Context Gathering Methods
    // ========================================================================

    /**
     * Get Git repository context including diff.
     * Assumes process is running in repo root.
     */
    private async getGitContext(): Promise<GatheredContext['gitContext'] | undefined> {
        try {
            // Check if current directory is a git repo
            const remoteUrl = await this.execGit(['config', '--get', 'remote.origin.url']);
            if (!remoteUrl) {
                return undefined;
            }

            const { owner, name } = this.parseGithubUrl(remoteUrl.trim());

            // Check status
            const status = await this.execGit(['status', '--porcelain']);
            const isDirty = status.length > 0;

            // Get branch
            const branch = (await this.execGit(['rev-parse', '--abbrev-ref', 'HEAD'])).trim() || 'main';

            // Get diff (staged + unstaged)
            const diff = await this.getGitDiff();

            return {
                owner,
                repo: name,
                branch,
                isDirty,
                diff
            };
        } catch (error) {
            this.log(`Error getting Git context: ${error}`);
            return undefined;
        }
    }

    /**
     * Get git diff using command line.
     */
    private async getGitDiff(): Promise<string> {
        return new Promise((resolve) => {
            const parts: string[] = [];

            // Get diff
            const diffProcess = spawn('git', ['diff', 'HEAD'], {
                shell: true
            });

            diffProcess.stdout.on('data', (data) => {
                parts.push(data.toString());
            });

            diffProcess.on('close', () => {
                const diff = parts.join('');
                resolve(diff.length > 10000 ? diff.substring(0, 10000) + '\n... (truncated)' : diff);
            });

            diffProcess.on('error', () => {
                resolve('');
            });

            setTimeout(() => {
                diffProcess.kill();
                resolve(parts.join(''));
            }, 5000);
        });
    }

    /**
     * Execute a git command and return the output.
     */
    private async execGit(args: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            const proc = spawn('git', args, { shell: true });
            let stdout = '';

            proc.stdout.on('data', (data) => stdout += data.toString());

            proc.on('close', (code) => {
                if (code === 0) resolve(stdout);
                else resolve(''); // Fail gracefully
            });

            proc.on('error', () => resolve(''));
        });
    }

    /**
     * Parse GitHub URL.
     */
    private parseGithubUrl(url: string): { owner: string; name: string } {
        const regex = new RegExp('(?:git@|https://)(?:[\\w.@]+)[/:]([a-zA-Z0-9_.-]+)/([a-zA-Z0-9_.-]+?)(?:\\.git)?$');
        const match = url.match(regex);
        if (!match) {
            throw new Error(`Could not parse Git Remote URL: ${url}`);
        }
        return { owner: match[1], name: match[2] };
    }

    /**
     * Get Antigravity artifacts.
     */
    private async getArtifacts(): Promise<GatheredContext['artifacts']> {
        const artifacts: GatheredContext['artifacts'] = {};

        try {
            const homeDir = os.homedir();
            const brainDir = path.join(homeDir, '.gemini', 'antigravity', 'brain');

            // Get most recent context directory
            const entries = await fs.readdir(brainDir, { withFileTypes: true });
            const dirs = entries.filter(e => e.isDirectory());

            if (dirs.length > 0) {
                let latestDir = dirs[0].name;
                let latestTime = 0;

                for (const dir of dirs) {
                    const stats = await fs.stat(path.join(brainDir, dir.name));
                    if (stats.mtimeMs > latestTime) {
                        latestTime = stats.mtimeMs;
                        latestDir = dir.name;
                    }
                }

                const contextPath = path.join(brainDir, latestDir);

                try {
                    artifacts.taskMd = await fs.readFile(path.join(contextPath, 'task.md'), 'utf-8');
                } catch {
                    // File might not exist
                }

                try {
                    artifacts.implementationPlan = await fs.readFile(path.join(contextPath, 'implementation_plan.md'), 'utf-8');
                } catch {
                    // File might not exist
                }
            }
        } catch (error) {
            this.log(`Error reading artifacts: ${error}`);
        }

        return artifacts;
    }

    private log(message: string): void {
        console.error(`[ContextGatherer] ${message}`);
    }
}
