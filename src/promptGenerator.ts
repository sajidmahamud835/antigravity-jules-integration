/**
 * Prompt Generator
 * 
 * XML prompt generation strategy for Jules task delegation.
 * NOTE: This file's XML generation strategy is critical and should be preserved.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface PromptContext {
    task: string;
    contextFiles: ContextFile[];
    repositoryInfo?: RepositoryInfo;
    userPreferences?: UserPreferences;
}

export interface ContextFile {
    path: string;
    content: string;
    language?: string;
}

export interface RepositoryInfo {
    name: string;
    remoteUrl?: string;
    currentBranch: string;
    recentCommits?: string[];
}

export interface UserPreferences {
    codingStyle?: string;
    preferredLanguages?: string[];
    avoidPatterns?: string[];
}

// ============================================================================
// Prompt Generator Implementation
// ============================================================================

export class PromptGenerator {
    private readonly _maxFileSize = 100000; // 100KB max per file
    private readonly _maxTotalSize = 500000; // 500KB max total

    /**
     * Generate an XML-structured prompt for Jules.
     */
    public generate(context: PromptContext): string {
        const parts: string[] = [];

        // XML Declaration
        parts.push('<?xml version="1.0" encoding="UTF-8"?>');
        parts.push('<jules_task_request version="2.0">');

        // Task section
        parts.push(this._generateTaskSection(context.task));

        // Context files section
        if (context.contextFiles.length > 0) {
            parts.push(this._generateContextSection(context.contextFiles));
        }

        // Repository info section
        if (context.repositoryInfo) {
            parts.push(this._generateRepositorySection(context.repositoryInfo));
        }

        // User preferences section
        if (context.userPreferences) {
            parts.push(this._generatePreferencesSection(context.userPreferences));
        }

        // Metadata section
        parts.push(this._generateMetadataSection());

        parts.push('</jules_task_request>');

        return parts.join('\n');
    }

    /**
     * Load context files from the filesystem.
     */
    public async loadContextFiles(filePaths: string[]): Promise<ContextFile[]> {
        const contextFiles: ContextFile[] = [];
        let totalSize = 0;

        for (const filePath of filePaths) {
            try {
                // Resolve to absolute path
                const absolutePath = this._resolveFilePath(filePath);

                if (!fs.existsSync(absolutePath)) {
                    continue;
                }

                const stats = fs.statSync(absolutePath);

                // Skip files that are too large
                if (stats.size > this._maxFileSize) {
                    continue;
                }

                // Check total size limit
                if (totalSize + stats.size > this._maxTotalSize) {
                    break;
                }

                const content = fs.readFileSync(absolutePath, 'utf-8');
                const language = this._detectLanguage(absolutePath);

                contextFiles.push({
                    path: filePath,
                    content,
                    language
                });

                totalSize += stats.size;

            } catch {
                // Skip files that can't be read
                continue;
            }
        }

        return contextFiles;
    }

    // ========================================================================
    // XML Section Generators
    // ========================================================================

    private _generateTaskSection(task: string): string {
        return `
  <task>
    <description><![CDATA[${task}]]></description>
    <priority>normal</priority>
    <type>code_modification</type>
  </task>`;
    }

    private _generateContextSection(files: ContextFile[]): string {
        const fileElements = files.map(file => `
    <file path="${this._escapeXml(file.path)}" language="${file.language || 'unknown'}">
      <content><![CDATA[${file.content}]]></content>
    </file>`).join('');

        return `
  <context>
    <files count="${files.length}">${fileElements}
    </files>
  </context>`;
    }

    private _generateRepositorySection(repo: RepositoryInfo): string {
        const commits = repo.recentCommits?.map(c =>
            `      <commit>${this._escapeXml(c)}</commit>`
        ).join('\n') || '';

        return `
  <repository>
    <name>${this._escapeXml(repo.name)}</name>
    ${repo.remoteUrl ? `<remote_url>${this._escapeXml(repo.remoteUrl)}</remote_url>` : ''}
    <current_branch>${this._escapeXml(repo.currentBranch)}</current_branch>
    ${commits ? `<recent_commits>\n${commits}\n    </recent_commits>` : ''}
  </repository>`;
    }

    private _generatePreferencesSection(prefs: UserPreferences): string {
        const parts: string[] = ['  <preferences>'];

        if (prefs.codingStyle) {
            parts.push(`    <coding_style>${this._escapeXml(prefs.codingStyle)}</coding_style>`);
        }

        if (prefs.preferredLanguages?.length) {
            parts.push(`    <preferred_languages>${prefs.preferredLanguages.join(', ')}</preferred_languages>`);
        }

        if (prefs.avoidPatterns?.length) {
            parts.push(`    <avoid_patterns>`);
            prefs.avoidPatterns.forEach(p => {
                parts.push(`      <pattern>${this._escapeXml(p)}</pattern>`);
            });
            parts.push(`    </avoid_patterns>`);
        }

        parts.push('  </preferences>');
        return parts.join('\n');
    }

    private _generateMetadataSection(): string {
        return `
  <metadata>
    <client>antigravity-jules-integration</client>
    <client_version>2.0.0</client_version>
    <timestamp>${new Date().toISOString()}</timestamp>
    <platform>${process.platform}</platform>
  </metadata>`;
    }

    // ========================================================================
    // Helpers
    // ========================================================================

    private _resolveFilePath(filePath: string): string {
        if (path.isAbsolute(filePath)) {
            return filePath;
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            return path.join(workspaceFolder.uri.fsPath, filePath);
        }

        return filePath;
    }

    private _detectLanguage(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        const languageMap: Record<string, string> = {
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.js': 'javascript',
            '.jsx': 'javascript',
            '.py': 'python',
            '.go': 'go',
            '.rs': 'rust',
            '.java': 'java',
            '.kt': 'kotlin',
            '.swift': 'swift',
            '.cs': 'csharp',
            '.cpp': 'cpp',
            '.c': 'c',
            '.h': 'c',
            '.hpp': 'cpp',
            '.rb': 'ruby',
            '.php': 'php',
            '.sql': 'sql',
            '.json': 'json',
            '.yaml': 'yaml',
            '.yml': 'yaml',
            '.xml': 'xml',
            '.html': 'html',
            '.css': 'css',
            '.scss': 'scss',
            '.md': 'markdown',
            '.sh': 'shell',
            '.bash': 'shell',
            '.zsh': 'shell',
        };

        return languageMap[ext] || 'plaintext';
    }

    private _escapeXml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}
