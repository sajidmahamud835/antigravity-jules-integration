/**
 * MCP Protocol Types
 * 
 * TypeScript interfaces for the Model Context Protocol.
 * Strictly adheres to JSON-RPC 2.0 and MCP specification.
 */

// ============================================================================
// JSON-RPC 2.0 Base Types
// ============================================================================

export interface JsonRpcRequest {
    jsonrpc: '2.0';
    id: string | number;
    method: string;
    params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: string | number;
    result?: unknown;
    error?: JsonRpcError;
}

export interface JsonRpcError {
    code: number;
    message: string;
    data?: unknown;
}

export interface JsonRpcNotification {
    jsonrpc: '2.0';
    method: string;
    params?: Record<string, unknown>;
}

// Standard JSON-RPC Error Codes
export const JsonRpcErrorCodes = {
    PARSE_ERROR: -32700,
    INVALID_REQUEST: -32600,
    METHOD_NOT_FOUND: -32601,
    INVALID_PARAMS: -32602,
    INTERNAL_ERROR: -32603
} as const;

// ============================================================================
// MCP Protocol Types
// ============================================================================

export interface McpServerInfo {
    name: string;
    version: string;
    protocolVersion: string;
}

export interface McpCapabilities {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
    logging?: boolean;
}

export interface McpInitializeParams {
    protocolVersion: string;
    capabilities: McpCapabilities;
    clientInfo: {
        name: string;
        version: string;
    };
}

export interface McpInitializeResult {
    protocolVersion: string;
    capabilities: McpCapabilities;
    serverInfo: McpServerInfo;
}

// ============================================================================
// Tool Types
// ============================================================================

export interface McpTool {
    name: string;
    description: string;
    inputSchema: JsonSchema;
}

export interface McpToolsListResult {
    tools: McpTool[];
}

export interface McpToolCallParams {
    name: string;
    arguments?: Record<string, unknown>;
}

export interface McpToolCallResult {
    content: McpContent[];
    isError?: boolean;
}

export interface McpContent {
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
}

// ============================================================================
// JSON Schema Types (subset for tool definitions)
// ============================================================================

export interface JsonSchema {
    type: 'object' | 'string' | 'number' | 'boolean' | 'array';
    properties?: Record<string, JsonSchemaProperty>;
    required?: string[];
    description?: string;
    items?: JsonSchemaProperty;
}

export interface JsonSchemaProperty {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    description?: string;
    items?: JsonSchemaProperty;
    properties?: Record<string, JsonSchemaProperty>;
    enum?: (string | number)[];
    default?: unknown;
}

// ============================================================================
// Bridge Server Specific Types
// ============================================================================

export interface DelegateToJulesInput {
    task: string;
    context_files: string[];
}

export interface DelegateToJulesOutput {
    sessionId: string;
    status: string;
    message: string;
}

export const DELEGATE_TO_JULES_SCHEMA: JsonSchema = {
    type: 'object',
    properties: {
        task: {
            type: 'string',
            description: 'The task description to delegate to Jules for execution'
        },
        context_files: {
            type: 'array',
            description: 'List of file paths that provide context for the task',
            items: {
                type: 'string'
            }
        }
    },
    required: ['task', 'context_files']
};

// ============================================================================
// Transport Types
// ============================================================================

export type TransportType = 'stdio' | 'http' | 'websocket';

export interface TransportConfig {
    type: TransportType;
    options?: Record<string, unknown>;
}
