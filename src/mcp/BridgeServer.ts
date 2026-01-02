/**
 * MCP Bridge Server
 * 
 * Implements a local MCP server using Stdio transport.
 * Exposes the `delegate_to_jules` tool for workflow triggering.
 * Strictly adheres to Model Context Protocol JSON-RPC 2.0 standards.
 */

import { spawn, ChildProcess } from 'child_process';
import * as readline from 'readline';
import * as vscode from 'vscode';
import {
    JsonRpcRequest,
    JsonRpcResponse,
    JsonRpcNotification,
    JsonRpcErrorCodes,
    McpTool,
    McpToolsListResult,
    McpToolCallParams,
    McpToolCallResult,
    McpInitializeParams,
    McpInitializeResult,
    DelegateToJulesInput,
    DELEGATE_TO_JULES_SCHEMA
} from './types';
import { JulesClient } from '../julesClient';
import { ContextGatherer } from '../context/ContextGatherer';

// ============================================================================
// Bridge Server Implementation
// ============================================================================

export class BridgeServer {
    private readonly _serverName = 'jules-bridge';
    private readonly _serverVersion = '2.0.0';
    private readonly _protocolVersion = '2024-11-05';

    private _process: ChildProcess | null = null;
    private _readline: readline.Interface | null = null;
    private _outputChannel: vscode.OutputChannel;
    private _isInitialized = false;
    private _messageBuffer: string = '';

    constructor(private readonly _julesClient: JulesClient) {
        this._outputChannel = vscode.window.createOutputChannel('Jules MCP Bridge');
    }

    // ========================================================================
    // Public API
    // ========================================================================

    /**
     * Start the MCP bridge server.
     * Sets up Stdio transport for JSON-RPC communication.
     */
    public start(): void {
        this._log('Starting MCP Bridge Server...');

        // Set up stdin/stdout handlers for Stdio transport
        this._setupStdioTransport();

        this._log('MCP Bridge Server started successfully');
        this._outputChannel.show(true);
    }

    /**
     * Stop the MCP bridge server.
     */
    public stop(): void {
        this._log('Stopping MCP Bridge Server...');

        if (this._readline) {
            this._readline.close();
            this._readline = null;
        }

        if (this._process) {
            this._process.kill();
            this._process = null;
        }

        this._isInitialized = false;
        this._log('MCP Bridge Server stopped');
    }

    /**
     * Check if the server is running.
     */
    public isRunning(): boolean {
        return this._isInitialized;
    }

    /**
     * Get the list of available tools.
     */
    public getTools(): McpTool[] {
        return [
            {
                name: 'delegate_to_jules',
                description: 'Delegate a coding task to the remote Jules orchestration service. ' +
                    'Jules will execute the task and return any code changes as a remote branch.',
                inputSchema: DELEGATE_TO_JULES_SCHEMA
            }
        ];
    }

    // ========================================================================
    // Stdio Transport
    // ========================================================================

    /**
     * Set up Stdio transport for receiving and sending JSON-RPC messages.
     */
    private _setupStdioTransport(): void {
        // Read from stdin
        this._readline = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false
        });

        this._readline.on('line', (line) => {
            this._handleIncomingLine(line);
        });

        this._readline.on('close', () => {
            this._log('Stdio transport closed');
            this._isInitialized = false;
        });

        // Send capabilities notification
        this._isInitialized = true;
    }

    /**
     * Handle incoming JSON-RPC message line.
     */
    private async _handleIncomingLine(line: string): Promise<void> {
        if (!line.trim()) {
            return;
        }

        this._log(`Received: ${line}`);

        try {
            const message = JSON.parse(line) as JsonRpcRequest | JsonRpcNotification;

            if ('id' in message) {
                // It's a request, needs response
                const response = await this._handleRequest(message as JsonRpcRequest);
                this._sendResponse(response);
            } else {
                // It's a notification, no response needed
                await this._handleNotification(message as JsonRpcNotification);
            }
        } catch (error) {
            this._log(`Parse error: ${error}`);
            this._sendResponse({
                jsonrpc: '2.0',
                id: null as unknown as string,
                error: {
                    code: JsonRpcErrorCodes.PARSE_ERROR,
                    message: 'Parse error: Invalid JSON'
                }
            });
        }
    }

    /**
     * Handle a JSON-RPC request.
     */
    private async _handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
        this._log(`Handling request: ${request.method}`);

        try {
            switch (request.method) {
                case 'initialize':
                    return this._handleInitialize(request);

                case 'tools/list':
                    return this._handleToolsList(request);

                case 'tools/call':
                    return await this._handleToolCall(request);

                case 'ping':
                    return {
                        jsonrpc: '2.0',
                        id: request.id,
                        result: { pong: true }
                    };

                default:
                    return {
                        jsonrpc: '2.0',
                        id: request.id,
                        error: {
                            code: JsonRpcErrorCodes.METHOD_NOT_FOUND,
                            message: `Method not found: ${request.method}`
                        }
                    };
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                jsonrpc: '2.0',
                id: request.id,
                error: {
                    code: JsonRpcErrorCodes.INTERNAL_ERROR,
                    message: `Internal error: ${message}`
                }
            };
        }
    }

    /**
     * Handle a JSON-RPC notification.
     */
    private async _handleNotification(notification: JsonRpcNotification): Promise<void> {
        this._log(`Handling notification: ${notification.method}`);

        switch (notification.method) {
            case 'notifications/cancelled':
                // Handle cancellation if needed
                break;

            case 'initialized':
                this._log('Client initialized');
                break;

            default:
                this._log(`Unknown notification: ${notification.method}`);
        }
    }

    // ========================================================================
    // Request Handlers
    // ========================================================================

    /**
     * Handle initialize request.
     */
    private _handleInitialize(request: JsonRpcRequest): JsonRpcResponse {
        const params = request.params as Partial<McpInitializeParams> | undefined;
        this._log(`Client: ${params?.clientInfo?.name} v${params?.clientInfo?.version}`);

        const result: McpInitializeResult = {
            protocolVersion: this._protocolVersion,
            capabilities: {
                tools: true,
                resources: false,
                prompts: false,
                logging: true
            },
            serverInfo: {
                name: this._serverName,
                version: this._serverVersion,
                protocolVersion: this._protocolVersion
            }
        };

        return {
            jsonrpc: '2.0',
            id: request.id,
            result
        };
    }

    /**
     * Handle tools/list request.
     */
    private _handleToolsList(request: JsonRpcRequest): JsonRpcResponse {
        const result: McpToolsListResult = {
            tools: this.getTools()
        };

        return {
            jsonrpc: '2.0',
            id: request.id,
            result
        };
    }

    /**
     * Handle tools/call request.
     */
    private async _handleToolCall(request: JsonRpcRequest): Promise<JsonRpcResponse> {
        const params = request.params as Partial<McpToolCallParams> | undefined;

        if (!params?.name) {
            return {
                jsonrpc: '2.0',
                id: request.id,
                error: {
                    code: JsonRpcErrorCodes.INVALID_PARAMS,
                    message: 'Missing tool name'
                }
            };
        }

        switch (params.name) {
            case 'delegate_to_jules':
                return await this._executeDelegateToJules(request.id, params.arguments);

            default:
                return {
                    jsonrpc: '2.0',
                    id: request.id,
                    error: {
                        code: JsonRpcErrorCodes.INVALID_PARAMS,
                        message: `Unknown tool: ${params.name}`
                    }
                };
        }
    }

    /**
     * Execute the delegate_to_jules tool.
     */
    private async _executeDelegateToJules(
        id: string | number,
        args?: Record<string, unknown>
    ): Promise<JsonRpcResponse> {
        const input = args as unknown as DelegateToJulesInput;

        // Validate input
        if (!input?.task) {
            return {
                jsonrpc: '2.0',
                id,
                error: {
                    code: JsonRpcErrorCodes.INVALID_PARAMS,
                    message: 'Missing required parameter: task'
                }
            };
        }

        try {
            this._log(`Delegating task to Jules: ${input.task.substring(0, 100)}...`);

            // Automatically gather context
            const gatherer = new ContextGatherer();
            const context = await gatherer.gatherContext();
            const fullPrompt = gatherer.generatePrompt(context, input.task);

            const owner = context.gitContext?.owner || 'unknown';
            const repo = context.gitContext?.repo || 'unknown';
            const branch = context.gitContext?.branch || 'main';

            // Create a session via the JulesClient
            const sessionData = await this._julesClient.createSession(
                owner,
                repo,
                branch,
                fullPrompt
            );

            // Construct response object (since API returns JulesSession, we need to wrap it if needed, 
            // but the tool output just needs an ID and status)
            const session = {
                id: sessionData.id,
                status: 'pending' // Initial status
            };

            const result: McpToolCallResult = {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            sessionId: session.id,
                            status: session.status,
                            message: `Task delegated successfully. Session ID: ${session.id}`
                        }, null, 2)
                    }
                ]
            };

            this._log(`Session created: ${session.id}`);

            return {
                jsonrpc: '2.0',
                id,
                result
            };

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this._log(`Error delegating to Jules: ${message}`);

            const result: McpToolCallResult = {
                content: [
                    {
                        type: 'text',
                        text: `Error: ${message}`
                    }
                ],
                isError: true
            };

            return {
                jsonrpc: '2.0',
                id,
                result
            };
        }
    }

    // ========================================================================
    // Response Handling
    // ========================================================================

    /**
     * Send a JSON-RPC response via stdout.
     */
    private _sendResponse(response: JsonRpcResponse): void {
        const json = JSON.stringify(response);
        this._log(`Sending: ${json}`);
        process.stdout.write(json + '\n');
    }

    /**
     * Send a JSON-RPC notification via stdout.
     */
    private _sendNotification(method: string, params?: Record<string, unknown>): void {
        const notification: JsonRpcNotification = {
            jsonrpc: '2.0',
            method,
            params
        };
        const json = JSON.stringify(notification);
        this._log(`Sending notification: ${json}`);
        process.stdout.write(json + '\n');
    }

    // ========================================================================
    // Logging
    // ========================================================================

    /**
     * Log a message to the output channel.
     */
    private _log(message: string): void {
        const timestamp = new Date().toISOString();
        this._outputChannel.appendLine(`[${timestamp}] ${message}`);
    }

    /**
     * Dispose of resources.
     */
    public dispose(): void {
        this.stop();
        this._outputChannel.dispose();
    }
}
