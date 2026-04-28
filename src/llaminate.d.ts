// PUBLIC INTERFACES

interface LlaminateConfig {
    endpoint: string;
    key: string;
    model: string;
    attachments?: URLAttachment[];
    headers?: Record<string, string>;
    history?: LlaminateMessage[];
    input?: NodeJS.ReadStream;
    limits?: {
        attachments?: number;
        recursions?: number;
        tokens?: number;
    };
    options?: Record<string, any>;
    output?: NodeJS.WriteStream;
    quirks?: LlaminateQuirks;
    retries?: number;
    rpm?: number;
    schema?: Record<string, any>;
    system?: string[];
    tools?: Tool[];
    window?: number;
    fetch?: (endpoint: string, options: Record<string, any>) => Promise<Response>;
    handler?: (name: string, args: Record<string, any>) => Promise<any>;
}

interface LlaminateResponse {
    message: string | any;
    uuid: string;
    delta?: string;
    result?: LlaminateMessage[];
    tokens?: Tokens;
}

interface LlaminateMessage {
    role: Role;
    content?: string | (TextContent | AttachmentContent)[]; // Content can be a string, TextContent, or any JSON-serializable object, especially for tool messages
    name?: string; // For tool messages
    tool_calls?: ToolCall[]; // For assistant messages with tool calls
    tool_call_id?: string; // For tool messages to link back to the call
}

// SUBJECT TO CHANGE WITHOUT A MAJOR VERSION BUMP

interface LlaminateQuirks {
    attachments?: {
        document_url?: "image_url";
        file?: boolean;
        source?: boolean;
    },
    json_schema?: boolean;
    input_schema?: boolean;
    max_tokens?: number;
    output_config?: boolean;
    parallel_tool_calls?: boolean;
    role?: {
        system?: boolean;
        tool?: boolean;
    };
    stream_options?: boolean;
    tools?: {
        json_schema?: boolean;
        json_object?: boolean;
        content?: ("string" | "array")[];
    };
}

// PRIVATE INTERFACES (USED INTERNALLY)

type Role = "assistant" | "developer" | "system" | "user" | "tool";

interface TextContent {
    type: "text";
    text: string;
}

interface AttachmentContent {
    type: "attachment";
    attachment: URLAttachment;
}

interface URLAttachment {
    mime: string;
    url: string;
}

interface Context {
    messages: LlaminateMessage[];
    result: LlaminateMessage[];
    tools: Tool[];
    subtotal: Tokens;
    config: LlaminateConfig;
    recurse: () => AsyncGenerator<LlaminateResponse> | Promise<LlaminateResponse>;
}

interface Tool {
    function: {
        name: string;
        description?: string;
        parameters: Record<string, any>;
        strict?: boolean;
    };
    handler?: (id: string, args: Record<string, any>) => Promise<any>;
}

interface ToolCall {
    type: string;
    function: {
        name: string;
        arguments: Record<string, any>;
    }
    id: string;
}

interface Tokens {
    input: number;
    output: number;
    total: number;
}