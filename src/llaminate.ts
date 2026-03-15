/**
 * @license
 * Copyright 2026 Oliver Moran <oliver.moran@gmail.com>
 * This source code is licensed under the MIT license found in the
 * LICENSE file at https://github.com/oliver-moran/llaminate
 */

import { v4 as UUIDv4 } from "uuid";

interface Tool {
    schema: {
        function: {
            name: string;
            description?: string;
            parameters: Record<string, any>;
            strict?: boolean;
        }
    };
    handler?: (id, args) => Promise<any>;
}

interface LlaminateConfig {
    endpoint: string;
    key: string;
    model?: string;
    system?: string[];
    window?: number;
    tools?: Tool[];
    handler?: (name, args) => Promise<any>;
    options?: Record<string, any>;
    fetch?: (endpoint: string, options: Record<string, any>) => Promise<Response>;
}

interface Message {
    role: "system" | "user" | "assistant" | "tool";
    content?: string | any; // Content can be a string or any JSON-serializable object, especially for tool messages
    name?: string; // For tool messages
    tool_calls?: any[]; // For assistant messages with tool calls
    tool_call_id?: string; // For tool messages to link back to the call
}

interface Tokens {
    input: number;
    output: number;
    total: number;
}

interface LlaminateResponse {
    message: string | any;
    messages: Message[];
    tokens: Tokens;
    uuid: string;
}

interface LlaminateContext {
    messages: Message[];
    tools: Tool[];
    subtotal: Tokens;
    recurse: (messages: Message[], tools: Tool[], subtotal: Tokens) => AsyncGenerator<LlaminateResponse> | Promise<LlaminateResponse>;
}

/**
 * Represents the Llaminate service for managing and interacting with AI models.
 */
export class Llaminate {

    /* PRIVATE PROPERTIES */

    // The history of messages exchanged with the service.
    private history: Message[] = [];

    // The configuration options for the Llaminate service.
    private config: LlaminateConfig = {
        endpoint: null,
        key: null,
        model: null,
        tools: null,
        fetch: globalThis.fetch.bind(globalThis),
        system: [],
        window: 12,
        handler: async (name, args) => { throw new Error(`No handler provided for tool ${name}`) },
        options: {
            parallel_tool_calls: false,
            response_format: { type: "text" }
        } as Record<string, any>
    };

    /* CONSTRUCTOR */

    /**
     * Constructs a new instance of the Llaminate class.
     * @param endpoint - The endpoint URL for the Llaminate service.
     * @param key - The API key for authenticating requests.
     * @param config - Optional configuration settings for the service.
     */
    constructor(config: LlaminateConfig) {
        if (!config.endpoint || typeof config.endpoint !== "string" || config.endpoint.trim() === "") throw new Error("config.endpoint is required.");
        if (!config.key || typeof config.key !== "string" || config.key.trim() === "") throw new Error("config.key is required.");

        if (config.window !== undefined && (typeof config.window !== "number" || config.window < 1)) {
            throw new Error("config.window must be a positive integer.");
        }

        if (config.system !== undefined && !Array.isArray(config.system)) {
            throw new Error("config.system must be an array of strings.");
        }

        if (config.model !== undefined && typeof config.model !== "string") {
            throw new Error("config.model must be a string.");
        }

        if (config.handler !== undefined && typeof config.handler !== "function") {
            throw new Error("config.handler must be a function.");
        }

        if (config.tools !== undefined && !Array.isArray(config.tools)) {
            throw new Error("config.tools must be an array of tool definitions.");
        }

        if (config.options !== undefined && typeof config.options !== "object") {
            throw new Error("config.options must be an object.");
        }

        this.config.endpoint = config.endpoint;
        this.config.key = config.key;

        this.config.fetch = config.fetch || this.config.fetch;
        this.config.system = config.system || this.config.system;
        this.config.window = config.window || this.config.window;
        this.config.handler = config.handler || this.config.handler;
        this.config.tools = config.tools || this.config.tools;
        this.config.options = {
            ...config.options,
            model: config.model,
        };
    }

    /* PUBLIC METHODS */

    /**
     * Sends a prompt to the Llaminate service and retrieves a complete response.
     * @param prompt - The input prompt or messages to send to the service.
     * @param tools - Optional tools to use during the interaction.
     * @returns A promise resolving to the response from the service.
     */
    async complete(prompt: string | Message[], tools: Tool[] = this.config.tools || []): Promise<LlaminateResponse> {
        const messages = this.prepareMessageWindow(prompt);        
        return await _recurse.call(this, messages, tools);

        async function _recurse(messages: Message[], tools: Tool[], subtotal: Tokens = { input: 0, output: 0, total: 0 }): Promise<LlaminateResponse> {
            const response = await this.fetch(messages, { tools: this.getSchemaFromTools(tools), stream: false });
            if (!response.ok) throw new Error(`HTTP status ${response.status} from ${this.config.endpoint}: ${await response.text()}`);

            const completion = await response.json();

            const tokens = this.getUsageFromCompletion(completion);
            subtotal.input += tokens.input || 0;
            subtotal.output += tokens.output || 0;
            subtotal.total += tokens.total || 0;

            const recursed = await this.handleTools(completion, { messages, tools, subtotal, recurse: _recurse });
            if (recursed) return recursed;
            else {
                const message = completion?.choices?.[0]?.message?.content || null;
                messages.push({
                    role: "assistant",
                    content: message
                });
                const result = this.getLastAssistantMessages(messages);
                this.addMessagesToHistory(result);
                return this.generateOutputObject(message, result, subtotal);
            }
        }
	}

    /**
     * Streams responses from the Llaminate service based on the provided prompt and tools.
     * @param prompt - The input prompt or messages to send to the service.
     * @param tools - Optional tools to use during the interaction.
     * @returns An asynchronous generator yielding responses from the service.
     */
    async *stream(prompt: string | Message[], tools: Tool[] = this.config.tools || []): AsyncGenerator<LlaminateResponse> {
        const messages = this.prepareMessageWindow(prompt);
        const recursed = await _recurse.call(this, messages, tools);
        for await (const result of recursed) yield result;

        async function* _recurse(messages: Message[], tools: Tool[], subtotal: Tokens = { input: 0, output: 0, total: 0 }): AsyncGenerator<LlaminateResponse> {
            const response = await this.fetch(messages, { tools: this.getSchemaFromTools(tools), stream: true });

            if (!response.body) {
                throw new Error(`Readable stream not supported at ${this.config.endpoint}: ${await response.text()}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');

            let buffer = "";
            let message = "";
            let completion = null;
            const uuid = UUIDv4();

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Process each line in the buffer
                let lines = buffer.split('\n');
                buffer = lines.pop()!; // Keep the last incomplete line in the buffer

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        try {
                            const json = line.slice(6).trim(); // Extract the data after "data: "
                            const data = JSON.parse(json);
                            if (data.object === "chat.completion.chunk") {
                                completion = data; // Update the completion object with the latest chunk
                                const delta = completion.choices?.[0]?.delta?.content || "";
                                message += delta; // Append the new content to the message
                                const tokens = this.getUsageFromCompletion(completion);
                                subtotal.input += tokens.input || 0;
                                subtotal.output += tokens.output || 0;
                                subtotal.total += tokens.total || 0;
                                yield this.generateOutputObject(message, null, null, uuid);
                            }
                        } catch (error) { /* meh */ } // Ignore JSON parsing errors for incomplete lines or non-JSON lines
                    }
                }
            }

            const recursed = await this.handleTools(completion, { messages, tools, subtotal, recurse: _recurse });
            if (recursed) for await (const result of recursed) yield result;
            else {
                messages.push({
                    role: "assistant",
                    content: message
                });
                const result = this.getLastAssistantMessages(messages);
                this.addMessagesToHistory(result);
                yield this.generateOutputObject(message, result, subtotal, uuid);
            }
        }
	}

    /**
     * Clears the message history.
     */
    clear() {
        this.history = [];
    }

    /* PRIVATE METHODS */

    /**
     * Sends a fetch request to the Llaminate service.
     * @param messages - The messages to include in the request.
     * @param options - Additional options for the request.
     * @returns A promise resolving to the fetch response.
     */
    private async fetch(messages: Message[], options: Record<string, any> = {}): Promise<Response> {
        const headers = {
            "Authorization": `Bearer ${this.config.key}`,
            "Content-Type": "application/json",
            "Connection": "keep-alive", // Added to support streaming
            "Accept": "application/json, text/event-stream", // Specify multiple types to handle both streaming and non-streaming responses
        };

        const body: Record<string, any> = {
            ...this.config.options,
            ...options,
            messages,
        };

        return this.config.fetch(this.config.endpoint, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(body),
        });
    }

    /**
     * Handles tool calls based on the completion response.
     * @param completion - The completion response containing tool calls.
     * @param context - The context for handling the tools.
     * @returns A promise resolving to the response after handling tools.
     */
    private async handleTools(completion: any, context: LlaminateContext): Promise<LlaminateResponse> {
        const calls = completion?.choices?.[0]?.message?.tool_calls || completion?.choices?.[0]?.delta?.tool_calls || [];

        if (calls.length > 0) {
            context.messages.push({
                role: "assistant",
                tool_calls: calls.map((call) => ({
                    type: "function",
                    function: {
                        name: call.function.name,
                        arguments: call.function.arguments
                    },
                    id: call.id
                }))
            });

            for (const call of calls) {
                const tool = context.tools.find((tool) => tool.schema.function.name === call.function.name);
                if (tool) {
                    const args = JSON.parse(call.function.arguments);
                    try {
                        const response = await (tool.handler || this.config.handler).call(globalThis, call.function.name, args);
                        context.messages.push({
                            role: "tool",
                            name: tool.schema.function.name,
                            content: JSON.stringify(response),
                            tool_call_id: call.id
                        });
                    } catch (error) {
                        context.messages.push({
                            role: "tool",
                            name: tool.schema.function.name,
                            content: JSON.stringify({ error: error.message }),
                            tool_call_id: call.id
                        });
                    }
                } else {
                    throw new Error(`Tool ${call.function.name} not found.`);
                }
            };

            return await context.recurse.call(this, context.messages, context.tools, context.subtotal);
        }
    }

    /**
     * Retrieves the schema definitions from the provided tools.
     * @param tools - The tools to extract schemas from.
     * @returns The extracted schema definitions.
     */
    private getSchemaFromTools(tools: Tool[]): Partial<Tool["schema"]>[] {
        return tools.map(tool => tool.schema );
    }

    /**
     * Extracts token usage details from a completion response.
     * @param completion - The completion response.
     * @returns The token usage details.
     */
    private getUsageFromCompletion(completion: any): Tokens {
        const input = completion?.usage?.prompt_tokens || null;
        const output = completion?.usage?.completion_tokens || null;
        const total = completion?.usage?.total_tokens || null;
        return { input, output, total };
    }

    /**
     * Generates an output object based on the provided parameters.
     * @param message - The message content.
     * @param messages - The list of messages.
     * @param tokens - The token usage details.
     * @param uuid - Optional unique identifier for the response.
     * @returns The generated response object.
     */
    private generateOutputObject(message: string | any, messages: Message[], tokens: Tokens, uuid: string = UUIDv4()): LlaminateResponse {
        return {
            message: message,
            messages: messages,
            tokens: tokens,
            uuid: uuid,
        };
    }

    /**
     * Prepares a window of messages from the given prompt, modifying the message history accordingly.
     * @param prompt - The input prompt, either a string or an array of messages.
     * @returns The prepared window of messages based on the history and configuration.
     */
    private prepareMessageWindow(prompt: string | Message[]): Message[] {
        if (Array.isArray(prompt)) this.history = prompt; // Set history to the initial messages if an array is provided, otherwise it will be built up over time with addMessagesToHistory
        else this.addMessagesToHistory([{ role: "user", content: prompt }] as Message[]);
        const messages = this.getWindowFromHistory(this.history);
        return messages;
    }

    /**
     * Adds new messages to the message history.
     * @param messages - The messages to add.
     * @returns The updated message history.
     */
    private addMessagesToHistory(messages: Message[]): Message[] {
        this.history.push(...messages);
        return this.history;
    }

    /**
     * Retrieves a window of messages from the history based on the configuration.
     * @param messages - The message history.
     * @param system - Optional system messages to include.
     * @returns The filtered list of messages within the window.
     */
    private getWindowFromHistory(messages: Message[], system: string[] = this.config.system): Message[] {
        let count = 0;
        return [
            ...system.map(content => ({ role: "system", content } as Message)),
            ...messages.reverse().map(message => {
                if (message.role === "system") return message; // Always include system messages
                if (count < this.config.window) {
                    if (message.role === "user") count++;
                    return message;
                }
            }).filter(Boolean).reverse()
        ];
    }

    /**
     * Retrieves the last assistant messages from the message history.
     * @param messages - The message history.
     * @returns The filtered list of assistant messages.
     */
    private getLastAssistantMessages(messages: Message[] = []): Message[] {
        let stop = false;
        return messages.reverse().map(message => {
            if (message.role === "user") stop = true;
            if (!stop) return message; // Pass through system messages until we find the first user message
        }).filter(Boolean).reverse();
    }

}