// PUBLIC INTERFACES

interface LlaminateConfig {
    endpoint: string;
    key: string;
    model?: string;
    schema?: Record<string, any>;
    system?: string[];
    tools?: Tool[];
    attachments?: URLAttachment[];
    window?: number;
    headers?: Record<string, string>;
    options?: Record<string, any>;
    rpm?: number;
    history?: LlaminateMessage[];
    fetch?: (endpoint: string, options: Record<string, any>) => Promise<Response>;
    handler?: (name: string, args: Record<string, any>) => Promise<any>;
    quirks?: LlaminateQuirks;
}

interface LlaminateResponse {
    message: string | any;
    result: LlaminateMessage[];
    tokens: Tokens;
    uuid: string;
}

interface LlaminateMessage {
    role: "assistant" | "developer" | "system" | "user" | "tool";
    content?: string | any; // Content can be a string or any JSON-serializable object, especially for tool messages
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
    };
}

// PRIVATE INTERFACES (USED INTERNALLY)

interface Context {
    messages: LlaminateMessage[];
    result: LlaminateMessage[];
    tools: Tool[];
    subtotal: Tokens;
    config: LlaminateConfig;
    recurse: (messages: LlaminateMessage[], subtotal: Tokens) => AsyncGenerator<LlaminateResponse> | Promise<LlaminateResponse>;
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

interface URLAttachment {
    type: string;
    url: string;
}

interface Tokens {
    input: number;
    output: number;
    total: number;
}