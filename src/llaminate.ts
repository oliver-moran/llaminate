/**
 * @license
 * Copyright 2026 Oliver Moran <oliver.moran@gmail.com>
 * This source code is licensed under the MIT license found in the
 * LICENSE file at https://github.com/oliver-moran/llaminate
 */

const os = require("os");
import Ajv from "ajv";

// @ts-ignore - This will be replaced with a minified version in the build process
import { RateLimiter } from "./ratelimiter.min.js";

const ajv = new Ajv();
const validate = {
    config: ajv.compile(require("./config.schema.json"))
};

// Polyfill for environments that don't support structuredClone (like Node.js versions prior to 17 or some older browsers)
const structuredClone = globalThis.structuredClone || ((obj) => JSON.parse(JSON.stringify(obj)));
const noop = () => {};

// Dynamically determine the Llaminate version and Node.js version
const { version: LLAMINATE_VERSION } = require("./build-info.json");
const NODE_TITLE = process.title || "Node.js";
const NODE_VERSION = process.version;
const OS_TYPE = os.type();
const OS_ARCH = os.arch();
const USER_AGENT = `Llaminate/${LLAMINATE_VERSION} (https://github.com/oliver-moran/llaminate; ${NODE_TITLE}/${NODE_VERSION}; ${OS_TYPE}/${OS_ARCH})`;

interface Tool {
    function: {
        name: string;
        description?: string;
        parameters: Record<string, any>;
        strict?: boolean;
    };
    handler?: (id, args) => Promise<any>;
}

interface LlaminateConfig {
    endpoint: string;
    key: string;
    model?: string;
    schema?: Record<string, any>;
    system?: string[];
    window?: number;
    tools?: Tool[];

    headers?: Record<string, string>;
    options?: Record<string, any>;
    rpm?: number;

    handler?: (name, args) => Promise<any>;
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
    result: Message[];
    tokens: Tokens;
    uuid: string;
}

interface LlaminateContext {
    messages: Message[];
    result: Message[];
    tools: Tool[];
    subtotal: Tokens;
    config: LlaminateConfig;
    recurse: (messages: Message[], subtotal: Tokens) => AsyncGenerator<LlaminateResponse> | Promise<LlaminateResponse>;
}

/**
 * Represents the Llaminate service for managing and interacting with AI models.
 */
export class Llaminate {

    /* PRIVATE PROPERTIES */

    // The history of messages exchanged with the service.
    private history: Message[] = [];

    // The rate limiter instance for managing API request rates.
    private readonly limiter: RateLimiter;

    // The configuration options for the Llaminate service.
    private readonly config: LlaminateConfig = {
        endpoint: null,
        key: null,
        model: null,
        tools: [],
        system: [],
        window: 12,
        headers: {},
        options: {
            parallel_tool_calls: true,
            response_format: { type: "text" }
        },
        handler: async (name, args) => { throw new Error(`No \`handler\` method provided for tool ${name}`) },
        fetch: globalThis.fetch.bind(globalThis),
    };

    /* CONSTRUCTOR */

    /**
     * Constructs a new instance of the Llaminate class.
     * @param endpoint - The endpoint URL for the Llaminate service.
     * @param key - The API key for authenticating requests.
     * @param config - Optional configuration settings for the service.
     * @throws Will throw an error if the provided configuration is invalid.
     */
    constructor(config: LlaminateConfig) {
        validateConfig(config);

        this.config.endpoint = config.endpoint;
        this.config.key = config.key;
        this.config.model = config.model;

        this.config.schema = config.schema;

        this.config.tools = config.tools || this.config.tools;
        this.config.system = config.system || this.config.system;
        this.config.window = config.window || this.config.window;
        this.config.headers = config.headers || this.config.headers;
        this.config.options = {
            ...this.config.options,
            ...config.options,
            model: config.model,
        };
        this.config.handler = config.handler || this.config.handler;
        this.config.fetch = config.fetch || this.config.fetch;

        deepFreeze(this.config);

        this.limiter = new RateLimiter(config.rpm);
    }

    /* PUBLIC METHODS */

    /**
     * Sends a prompt to the Llaminate service and retrieves a complete response.
     * @param prompt - The input prompt or messages to send to the service.
     * @param config - Optional configuration settings this completion.
     * @returns A promise resolving to the response from the service.
     * @throws Will throw an error if the prompt is not a string or an array of messages, if the response from the service is not successful, or if the response does not conform to the expected format.
     */
    async complete(prompt: string | Message[], config?: LlaminateConfig): Promise<LlaminateResponse> {
        const _config = generateCompletionConfig.call(this, config, false);
        const messages = prepareMessageWindow.call(this, prompt, _config);
        const result: Message[] = [];
        const subtotal: Tokens = { input: 0, output: 0, total: 0 };

        return await _complete.call(this, messages);

        async function _complete(): Promise<LlaminateResponse> {
            const response = await this.limiter.queue(() => fetch([...messages, ...result], _config) );
            if (!response.ok) throw new Error(`HTTP status ${response.status} from ${_config.endpoint}: ${await response.text()}`);

            const completion = await response.json();

            const tokens = getUsageFromCompletion(completion);
            subtotal.input += tokens.input || 0;
            subtotal.output += tokens.output || 0;
            subtotal.total += tokens.total || 0;

            const recursed = await handleTools.call(this, completion, { messages, result, subtotal, config: _config, recurse: _complete });
            if (recursed) return recursed;
            else {
                const role = completion?.choices?.[0]?.message?.role || "assistant";
                const message = validateResponse(completion?.choices?.[0]?.message?.content || "", _config);
                result.push({
                    role: role,
                    content: message
                });
                updateHistory.call(this, prompt, result);
                return generateOutputObject(message, result, subtotal);
            }
        }
	}

    /**
     * Streams responses from the Llaminate service based on the provided prompt and configuration.
     * @param prompt - The input prompt or messages to send to the service.
     * @param config - Optional configuration settings for this streamed completion.
     * @returns An asynchronous generator yielding responses from the service.
     * @throws Will throw an error if the prompt is not a string or an array of messages, if the response from the service is not successful, or if the response does not conform to the expected format.
     */
    async *stream(prompt: string | Message[], config?: LlaminateConfig): AsyncGenerator<LlaminateResponse> {
        const _config = generateCompletionConfig.call(this, config, true);
        const messages = prepareMessageWindow.call(this, prompt, _config);
        const result: Message[] = [];
        const subtotal: Tokens = { input: 0, output: 0, total: 0 };

        const stream = await _stream.call(this, messages);
        for await (const result of stream) yield result;

        async function* _stream(): AsyncGenerator<LlaminateResponse> {
            const response = await this.limiter.queue(() => fetch([...messages, ...result], _config) );

            if (!response.ok) throw new Error(`HTTP status ${response.status} from ${_config.endpoint}: ${await response.text()}`);
            if (!response.body) throw new Error(`Readable stream not supported at ${_config.endpoint}: ${await response.text()}`);

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');

            let buffer = "";
            let message = "";
            let completion = null;
            const uuid = uuid_v4();

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
                                const tokens = getUsageFromCompletion(completion);
                                subtotal.input += tokens.input || 0;
                                subtotal.output += tokens.output || 0;
                                subtotal.total += tokens.total || 0;
                                yield generateOutputObject(message, null, null, uuid);
                            }
                        } catch (error) { /* meh */ } // Ignore JSON parsing errors for incomplete lines or non-JSON lines
                    }
                }
            }

            const recursed = await handleTools.call(this, completion, { messages, result, subtotal, config: _config, recurse: _stream });
            if (recursed) for await (const result of recursed) yield result;
            else {
                const role = completion?.choices?.[0]?.delta?.role || "assistant";
                message = validateResponse(message, _config);
                result.push({
                    role: role,
                    content: message
                });
                updateHistory.call(this, prompt, result);
                yield generateOutputObject(message, result, subtotal, uuid);
            }
        }
	}

    /**
     * This method resets the internal history of messages exchanged with the service, allowing for a fresh start for subsequent interactions.
     * Note that this does not affect the configuration or any other settings of the Llaminate instance, only the message history.
     * @returns void
     */
    clear():void {
        this.history = [];
    }

    /**
     * Retrieves a window of messages from the internal history based on the instance's configuration, allowing for review or debugging of recent interactions with the service.
     * Note that the window of messages returned is determined by the `window` setting in the configuration, which specifies how many recent user messages to include along with any system messages.
     * By default, this will include all messages in the history.
     * @param window - The number of recent user messages to include along with any system messages.
     * @returns An array of messages from the internal history.
     * @throws Will throw an error if the provided window size is invalid (e.g., negative number).
     */
    export(window: number = Infinity): Message[] {
        if (window && (isNaN(window) || window < 1)) throw new Error("Window size must be an integer greater than 0.");
        const config = { ...this.config, window } as LlaminateConfig;
        const history = getWindowFromHistory(this.history, config);
        return structuredClone(history);
    }

}

/* PRIVATE METHODS */

// These are defined as standalone functions rather than class methods so as to
// be fully private and not accessible on the instance, while still allowing
// them to be called with the instance context (i.e., using .call(this, ...))
// to access and modify the instance's history when necessary.

/**
 * Generates a complete configuration object for a completion request by
 * merging the instance's default configuration with any provided overrides,
 * and setting the appropriate response format based on the presence of a schema.
 * @param config - Optional configuration overrides for this completion request.
 * @param stream - Whether to enable streaming for this completion request.
 * @returns The complete configuration object for the completion request.
 */
function generateCompletionConfig(config?: LlaminateConfig, stream: boolean = false): LlaminateConfig {
    if (config && config.rpm) {
        throw new Error("RPM cannot be set on a per-request basis. Please set the RPM in the constructor configuration.");
    }

    const _config = {
        ...this.config,
        ...config,
        // Combine system messages from instance config and provided config
        system: this.config.system.concat(config?.system || []),
        options: {
            ...this.config?.options,
            ...config?.options,
            stream: stream
        } as Record<string, any>
    };

    // If there are no tools, don't set these in the options (and delete all references)
    const tools = config?.tools || this.config?.tools || [];
    if (tools.length > 0) {
        _config.options.tools = tools.map(tool => ({ type: "function", function: tool.function }) );
    } else {
        delete _config.options.tools;
        delete _config.options.parallel_tool_calls;
    }

    validateConfig(_config);

    // Some models (e.g. Mistral) don't support structured output with tools,
    // so if both a schema and tools are provided we fall back to a text
    // response and include instructions in the system prompt to format the
    // response as JSON adhering to the schema. If only a schema is provided
    // without tools, we can use the structured response format with the JSON
    // schema directly.

    if (hasSchemaAndTools(_config)) {
        _config.system.push(`Your response must be in JSON format adhering to the provided schema:\n\n${JSON.stringify(_config.schema, null, 2)}`);
        _config.options.response_format = { type: "text" };
    } else if (_config.schema) {
        _config.options.response_format = { type: "json_schema", json_schema:  { name: `schema_${uuid_v4()}`, schema: _config.schema } };
    }

    return _config;
}

/**
 * Validates the provided configuration for the Llaminate instance.
 * @param config - The configuration object to validate.
 * @throws Will throw an error if the configuration is invalid.
 */
function validateConfig(config: LlaminateConfig) {

    
    if (!validate.config(config)) {
        throw new Error(`Invalid configuration: ${ajv.errorsText(validate.config.errors)}`);
    }
}

/**
 * Sends a fetch request to the Llaminate service.
 * @param messages - The messages to include in the request.
 * @param options - Additional options for the request.
 * @returns A promise resolving to the fetch response.
 */
async function fetch(messages: Message[], config: LlaminateConfig): Promise<Response> {
    const headers = {
        "Authorization": `Bearer ${config.key}`,
        "X-Api-Key": `${config.key}`,
        "x-goog-api-key": `${config.key}`,
        "Content-Type": "application/json",
        "Connection": "keep-alive", // Added to support streaming
        "Accept": "application/json, text/event-stream", // Specify multiple types to handle both streaming and non-streaming responses
        "User-Agent": USER_AGENT,
        ...config.headers
    };

    const body: Record<string, any> = {
        ...config.options,
        messages,
    };

    return config.fetch(config.endpoint, {
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
async function handleTools(completion: any, context: LlaminateContext): Promise<LlaminateResponse> {
    const calls = completion?.choices?.[0]?.message?.tool_calls || completion?.choices?.[0]?.delta?.tool_calls || [];
    const role = completion?.choices?.[0]?.message?.role || completion?.choices?.[0]?.delta?.role || "assistant";

    if (calls.length > 0) {
        context.result.push({
            role: role,
            tool_calls: calls.map(call => cleanse(call))
        });

        for (const call of calls) {
            const tool = context.config.tools.find((tool) => tool.function.name === call.function.name);
            if (tool) {
                const args = JSON.parse(call.function.arguments);
                try {
                    const response = await (tool.handler || context.config.handler || noop).call(globalThis, call.function.name, args);
                    context.result.push({
                        role: "tool",
                        name: tool.function.name,
                        content: serialize(response),
                        tool_call_id: call.id,
                    });
                } catch (error) {
                    context.result.push({
                        role: "tool",
                        name: tool.function.name,
                        content: JSON.stringify({ error: error.message }),
                        tool_call_id: call.id,
                    });
                }
            } else {
                throw new Error(`Tool ${call.function.name} not found.`);
            }
        };

        return await context.recurse.call(this);
    }
}

/**
 * Extracts token usage details from a completion response.
 * @param completion - The completion response.
 * @returns The token usage details.
 */
function getUsageFromCompletion(completion: any): Tokens {
    const input = completion?.usage?.prompt_tokens || null;
    const output = completion?.usage?.completion_tokens || null;
    const total = completion?.usage?.total_tokens || null;
    return { input, output, total };
}

/**
 * Generates an output object based on the provided parameters.
 * @param message - The message content.
 * @param result - The list of messages.
 * @param tokens - The token usage details.
 * @param uuid - Optional unique identifier for the response.
 * @returns The generated response object.
 */
function generateOutputObject(message: string | any, result: Message[], tokens: Tokens, uuid: string = uuid_v4()): LlaminateResponse {
    return { message, result, tokens, uuid };
}

/**
 * Prepares a window of messages from the given prompt, modifying the message history accordingly.
 * NB: This function is designed to be called with the Llaminate instance as its context (i.e.,
 * using .call(this, ...)) to access and modify the instance's history.
 * @param prompt - The input prompt, either a string or an array of messages.
 * @param config - The configuration containing system messages and window size.
 * @returns The prepared window of messages based on the history and configuration.
 * @throws Will throw an error if the prompt is not a string or an array of messages.
 */
function prepareMessageWindow(prompt: string | Message[], config: LlaminateConfig): Message[] {
    if (Array.isArray(prompt)) return getWindowFromHistory(prompt, config); // Set history to the initial messages if an array is provided
    else if (typeof prompt === "string") return getWindowFromHistory(this.history.concat({ role: "user", content: prompt } as Message), config);
    else throw new Error("Prompt must be a string or an array of messages.");
}

/**
 * Retrieves a window of messages from the history based on the configuration.
 * @param messages - The message history.
 * @param config - The configuration containing system messages and window size.
 * @returns The filtered list of messages within the window.
 */
function getWindowFromHistory(messages: Message[], config: LlaminateConfig): Message[] {
    let count = 0;
    return [
        ...(config.system || []).map(content => ({ role: "system", content } as Message)),
        ...(messages.concat().reverse().map(message => {
            if (message.role === "system") return message; // Always include system messages
            if (count < config.window) {
                if (message.role === "user") count++;
                return message;
            }
        }).filter(Boolean).reverse())
    ];
}

/**
 * Updates the instance's history with the new messages based on the prompt and result.
 * This function is designed to be called with the Llaminate instance as its context (i.e.,
 * using .call(this, ...)) to access and modify the instance's history.
 * @param prompt - The original prompt, either a string or an array of messages.
 * @param result - The new messages to add to the history based on the prompt.
 * @returns void
 */
function updateHistory(prompt: string | Message[], result: Message[]): void {
    if (Array.isArray(prompt)) this.history = prompt.concat(result);
    else if (typeof prompt === "string") this.history.push({ role: "user", content: prompt } as Message, ...result);
}

/**
 * Recursively cleanses an object by removing properties with null values and applying the same process to nested objects.
 * @param obj - The object to be cleansed.
 * @returns The cleansed object.
 */
function cleanse(obj: Record<string, any>): Record<string, any> {
    if (obj && obj.constructor !== Object) return Object.entries(obj).reduce((acc, [key, value]) => {
        if (value === null) {
            // Skip null properties
            return acc;
        } else if (typeof value === "object" && !Array.isArray(value) && value !== null) {
            // Recursively cleanse nested objects
            acc[key] = cleanse(value);
        } else {
            acc[key] = value;
        }
        return acc;
    }, {} as Record<string, any>);
    else return obj;
}

/**
 * Validates the response message against the provided schema in the configuration, if applicable.
 * If a schema is present, it attempts to parse the message as JSON and validate it against the schema.
 * @param message - The response message to validate.
 * @param config - The configuration containing the schema for validation.
 * @returns The validated message, either as a JSON string or the original message if no schema is present.
 * @throws Will throw an error if the message does not conform to the schema or if the message is empty when no schema is provided.
 */
function validateResponse(message:string, config: LlaminateConfig):any {
    if (config.schema) {
        const json:string = hasSchemaAndTools(config)
            ? message.replace(/^```json\n/, "").replace(/^```\n/, "").replace(/\n```$/, "").trim()
            : message;
        const obj:any = JSON.parse(json);

        const schema = ajv.compile(config.schema);
        const valid:any = schema(obj);
        if (!valid) throw(schema.errors);

        return JSON.stringify(obj);
    } else if (message) return message;
    else throw new Error("Response message is empty.");
}

/**
 * Checks if the configuration includes both a schema and tools.
 * @param config - The configuration to check.
 * @returns True if both a schema and tools are present, false otherwise.
 */
function hasSchemaAndTools(config: LlaminateConfig): boolean {
    return !!(config.schema && config.tools && config.tools.length > 0);
}

/**
 * Serializes an object to a JSON string, with error handling for non-serializable objects.
 * @param obj - The object to serialize.
 * @returns The JSON string representation of the object.
 * @throws Will throw an error if the object cannot be serialized to JSON.
 */
function serialize(obj: any): string {
    try {
        return JSON.stringify(obj);
    } catch (error) {
        try {
            // Handle non-serializable objects
            if (obj && typeof obj.toString === "function") {
                const str = obj.toString();
                if (typeof str === "string") return JSON.stringify(str);
            }
        } catch (error) { /* meh */ }

        throw error;
    }
}

/**
 * Generates a UUIDv4 string.
 * @returns A UUIDv4 string.
 */
function uuid_v4(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Deeply freezes an object, making it immutable by recursively freezing all nested objects and arrays.
 * @param obj - The object to be deeply frozen.
 * @returns The deeply frozen object.
 */
function deepFreeze(obj: any): any {
    if (typeof obj !== "object") {
        throw new Error("Only Objects can be frozen.");
    }

    const props = Object.getOwnPropertyNames(obj);
    for (const name of props) {
        const value = obj[name];
        if (value && typeof value === "object") deepFreeze(value);
    }

    return Object.freeze(obj);
}