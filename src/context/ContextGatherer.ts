/**
 * Context Gatherer
 * 
 * Automatically gathers context from the VS Code workspace:
 * - Active editor content
 * - Git diffs (staged and unstaged)
 * - Antigravity artifacts (task.md, implementation_plan.md)
 * - Open files
 * - Active diagnostics/errors
 * 
 * No manual user input required - fully automated context collection.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { spawn } from 'child_process';

// ============================================================================
// Type Definitions
// ============================================================================

export interface GatheredContext {
    /** Current active file content and selection */
    activeEditor?: {
        fileName: string;
        language: string;
        content: string;
        selection?: string;
        cursorPosition: { line: number; character: number };
    };
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
    /** Active errors in workspace */
    diagnostics: string[];
    /** Open files list */
    openFiles: string[];
}

// ============================================================================
// Context Gatherer Class
// ============================================================================

export class ContextGatherer {
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel?: vscode.OutputChannel) {
        this.outputChannel = outputChannel || vscode.window.createOutputChannel('Jules Context');
    }

    /**
     * Gather all context automatically.
     * No user prompts required.
     */
    async gatherContext(): Promise<GatheredContext> {
        this.log('Starting automatic context gathering...');

        // Gather all context sources in parallel for performance
        const [activeEditor, gitContext, artifacts, diagnostics, openFiles] = await Promise.all([
            this.getActiveEditorContext(),
            this.getGitContext(),
            this.getArtifacts(),
            this.getDiagnostics(),
            this.getOpenFiles()
        ]);

        const context: GatheredContext = {
            activeEditor,
            gitContext,
            artifacts,
            diagnostics,
            openFiles
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

        // Active editor context
        if (context.activeEditor) {
            workspaceContext += `<active_file>
<path>${context.activeEditor.fileName}</path>
<language>${context.activeEditor.language}</language>
<cursor_line>${context.activeEditor.cursorPosition.line + 1}</cursor_line>
${context.activeEditor.selection ? `<selection>${context.activeEditor.selection}</selection>` : ''}
</active_file>\n`;
        }

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

        // Diagnostics/errors
        if (context.diagnostics.length > 0) {
            workspaceContext += `<active_errors>\n${context.diagnostics.join('\n')}\n</active_errors>\n`;
        }

        // Open files
        if (context.openFiles.length > 0) {
            workspaceContext += `<open_files>\n${context.openFiles.join('\n')}\n</open_files>\n`;
        }

        const brief = missionBrief || '[Describe your task here or continue from the artifacts above]';

        return `<instruction>${instruction}</instruction>
<workspace_context>
${workspaceContext}</workspace_context>
<mission_brief>${brief}</mission_brief>`;
    }

    // ========================================================================
    // Private Context Gathering Methods
    // ========================================================================

    /**
     * Get context from the active text editor.
     */
    private async getActiveEditorContext(): Promise<GatheredContext['activeEditor'] | undefined> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return undefined;
        }

        const document = editor.document;
        const selection = editor.selection;

        return {
            fileName: vscode.workspace.asRelativePath(document.uri),
            language: document.languageId,
            content: document.getText(),
            selection: selection.isEmpty ? undefined : document.getText(selection),
            cursorPosition: {
                line: selection.active.line,
                character: selection.active.character
            }
        };
    }

    /**
     * Get Git repository context including diff.
     */
    private async getGitContext(): Promise<GatheredContext['gitContext'] | undefined> {
        try {
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (!gitExtension) {
                return undefined;
            }

            const git = gitExtension.exports.getAPI(1);
            let repo = undefined;

            // Try to get repo from active file
            if (vscode.window.activeTextEditor) {
                repo = git.getRepository(vscode.window.activeTextEditor.document.uri);
            }

            // Fallback to first workspace folder
            if (!repo && vscode.workspace.workspaceFolders?.length) {
                for (const folder of vscode.workspace.workspaceFolders) {
                    repo = git.getRepository(folder.uri);
                    if (repo) break;
                }
            }

            if (!repo) {
                return undefined;
            }

            const remoteUrl = repo.state.remotes[0]?.fetchUrl;
            if (!remoteUrl) {
                return undefined;
            }

            const { owner, name } = this.parseGithubUrl(remoteUrl);
            const isDirty = repo.state.workingTreeChanges.length > 0 || repo.state.indexChanges.length > 0;

            // Get the diff
            const diff = await this.getGitDiff(repo.rootUri.fsPath);

            return {
                owner,
                repo: name,
                branch: repo.state.HEAD?.name || 'main',
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
    private async getGitDiff(workingDir: string): Promise<string> {
        return new Promise((resolve) => {
            const parts: string[] = [];

            // Get both staged and unstaged diff
            const diffProcess = spawn('git', ['diff', 'HEAD'], {
                cwd: workingDir,
                shell: true
            });

            diffProcess.stdout.on('data', (data) => {
                parts.push(data.toString());
            });

            diffProcess.on('close', () => {
                const diff = parts.join('');
                // Limit diff size to prevent huge prompts
                resolve(diff.length > 10000 ? diff.substring(0, 10000) + '\n... (truncated)' : diff);
            });

            diffProcess.on('error', () => {
                resolve('');
            });

            // Timeout after 5 seconds
            setTimeout(() => {
                diffProcess.kill();
                resolve(parts.join(''));
            }, 5000);
        });
    }

    /**
     * Parse GitHub URL to extract owner and repo name.
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
     * Get Antigravity artifacts (task.md, implementation_plan.md).
     */
    private async getArtifacts(): Promise<GatheredContext['artifacts']> {
        const artifacts: GatheredContext['artifacts'] = {};

        try {
            const homeDir = os.homedir();
            const brainDir = path.join(homeDir, '.gemini', 'antigravity', 'brain');

            // Get the most recent context directory
            const entries = await fs.readdir(brainDir, { withFileTypes: true });
            const dirs = entries.filter(e => e.isDirectory());

            if (dirs.length === 0) {
                return artifacts;
            }

            // Find most recent by modification time
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

            // Read task.md
            try {
                const taskPath = path.join(contextPath, 'task.md');
                artifacts.taskMd = await fs.readFile(taskPath, 'utf-8');
            } catch {
                // File doesn't exist
            }

            // Read implementation_plan.md
            try {
                const planPath = path.join(contextPath, 'implementation_plan.md');
                artifacts.implementationPlan = await fs.readFile(planPath, 'utf-8');
            } catch {
                // File doesn't exist
            }
        } catch (error) {
            this.log(`Error reading artifacts: ${error}`);
        }

        return artifacts;
    }

    /**
     * Get active diagnostics (errors) from the workspace.
     */
    private async getDiagnostics(): Promise<string[]> {
        const errors: string[] = [];
        const diagnostics = vscode.languages.getDiagnostics();

        for (const [uri, diags] of diagnostics) {
            for (const diag of diags) {
                if (diag.severity === vscode.DiagnosticSeverity.Error) {
                    const relativePath = vscode.workspace.asRelativePath(uri);
                    errors.push(`${relativePath}:${diag.range.start.line + 1}: ${diag.message}`);
                }
            }
        }

        return errors;
    }

    /**
     * Get list of open files.
     */
    private async getOpenFiles(): Promise<string[]> {
        const openFiles: string[] = [];
        const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);

        for (const tab of tabs) {
            if (tab.input && typeof tab.input === 'object' && 'uri' in tab.input) {
                const uri = (tab.input as { uri: vscode.Uri }).uri;
                openFiles.push(vscode.workspace.asRelativePath(uri));
            }
        }

        return openFiles;
    }

    /**
     * Log message to output channel.
     */
    private log(message: string): void {
        this.outputChannel.appendLine(`[ContextGatherer] ${message}`);
    }

    /**
     * Dispose resources.
     */
    dispose(): void {
        this.outputChannel.dispose();
    }
}
