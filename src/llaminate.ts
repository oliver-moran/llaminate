/**
 * @license
 * Copyright 2026 Oliver Moran <oliver.moran@gmail.com>
 * This source code is licensed under the MIT license found in the
 * LICENSE file at https://github.com/oliver-moran/llaminate
 */

const os = require("os");
import Ajv from "ajv";
import { Buffer } from "buffer";

// @ts-ignore - This will be replaced with a minified version in the build process
import { RateLimiter } from "./ratelimiter.min.js";

const ajv = new Ajv();
const validate = {
    config: ajv.compile(require("./config.schema.json"))
};

// Polyfill for environments that don't support structuredClone (like Node.js versions prior to 17 or some older browsers)
const structuredClone = globalThis.structuredClone || ((obj) => JSON.parse(JSON.stringify(obj)));
const noop = () => {};

// read the file system.hbs and compile it into a function that takes a schema and returns the system prompt string with the schema injected
const SYSTEM_HBS = (() => {
    const fs = require("fs");
    const Handlebars = require("handlebars");
    const template = Handlebars.compile(fs.readFileSync(require.resolve("./system.hbs"), "utf-8"));
    return (schema) => template({ schema });
})();

// Dynamically determine the Llaminate version and Node.js version
const { version: LLAMINATE_VERSION } = require("./build-info.json");
const NODE_TITLE = process.title || "Node.js";
const NODE_VERSION = process.version;
const OS_TYPE = os.type();
const OS_ARCH = os.arch();
const USER_AGENT = `Llaminate/${LLAMINATE_VERSION} (https://github.com/oliver-moran/llaminate; ${NODE_TITLE}/${NODE_VERSION}; ${OS_TYPE}/${OS_ARCH})`;

const enum ROLE {
    ASSISTANT = "assistant",
    DEVELOPER = "developer",
    SYSTEM = "system",
    USER = "user",
    TOOL = "tool",
}

const ROLES = [ROLE.ASSISTANT, ROLE.DEVELOPER, ROLE.SYSTEM, ROLE.USER, ROLE.TOOL];

interface Tool {
    function: {
        name: string;
        description?: string;
        parameters: Record<string, any>;
        strict?: boolean;
    };
    handler?: (id, args) => Promise<any>;
}

interface URLAttachment {
    type: "image" | "document";
    url: string;
}

interface Base64Attachment {
    type: "file";
    data: string;
    mime: "application/pdf" | string;
}

interface LlaminateConfig {
    endpoint: string;
    key: string;
    model?: string;
    schema?: Record<string, any>;
    system?: string[];
    attachments?: URLAttachment[] | Base64Attachment[];
    window?: number;
    tools?: Tool[];

    headers?: Record<string, string>;
    options?: Record<string, any>;
    rpm?: number;

    quirks?: LlaminateQuirks;

    handler?: (name, args) => Promise<any>;
    fetch?: (endpoint: string, options: Record<string, any>) => Promise<Response>;
}

interface Message {
    role: ROLE;
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

interface LlaminateQuirks {
    attachments?: {
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

/**
 * Represents the Llaminate service for managing and interacting with AI models.
 */
export class Llaminate {

    /* PUBLIC STATIC PROPERTIES */

    public static PDF = "application/pdf";

    public static JPEG = "image/jpeg";
    public static PNG = "image/png";
    public static GIF = "image/gif";
    public static WEBP = "image/webp";

    public static VERSION = LLAMINATE_VERSION;
    public static USER_AGENT = USER_AGENT;

    public static MISTRAL = "https://api.mistral.ai/v1/chat/completions";
    public static OPENAI = "https://api.openai.com/v1/chat/completions";
    public static ANTHROPIC = "https://api.anthropic.com/v1/messages";
    public static GOOGLE = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
    public static DEEPSEEK = "https://api.deepseek.com/chat/completions";

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
        attachments: [],
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
        };
        this.config.handler = config.handler || this.config.handler;
        this.config.fetch = config.fetch || this.config.fetch;

        const quirks = getQuirks(this.config);
        this.config.quirks = { ...quirks, ...config.quirks };

        // Attachments are only allowed on a per-request basis, not in the constructor config
        delete this.config.attachments;

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
            const response = await this.limiter.queue(() => sendMessages([...messages, ...result], _config) );
            if (!response.ok) throw new Error(`HTTP status ${response.status} from ${_config.endpoint}: ${await response.text()}`);

            const completion = await response.json();
            const message = completion?.choices?.[0]?.message || completion?.content?.[0] || null;

            const tokens = getUsageFromCompletion(completion);
            subtotal.input += tokens.input || 0;
            subtotal.output += tokens.output || 0;
            subtotal.total += tokens.total || subtotal.input + subtotal.output || 0;

            const calls = message.tool_calls || transformAnthropicToolCalls(completion?.content) || [];
            const role = message.role;

            const recursed = await handleTools.call(this, role, calls, { messages, result, subtotal, config: _config, recurse: _complete });
            if (recursed) return recursed;
            else {
                const content = validateResponse(message?.content || message?.text || "", _config);
                result.push({
                    role: role || ROLE.ASSISTANT,
                    content: content
                });
                updateHistory.call(this, prompt, result);
                return generateOutputObject(content, result, subtotal);
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
            const response = await this.limiter.queue(() => sendMessages([...messages, ...result], _config) );

            if (!response.ok) throw new Error(`HTTP status ${response.status} from ${_config.endpoint}: ${await response.text()}`);
            if (!response.body) throw new Error(`Readable stream not supported at ${_config.endpoint}: ${await response.text()}`);

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');

            let buffer = "";
            let message = "";
            let role = "" as any;
            let tokens: Tokens = { input: 0, output: 0, total: 0 };
            let tools = [];

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
                            const completion = JSON.parse(json);
                            const delta = completion.choices?.[0]?.delta || completion.delta;

                            message += delta?.content || delta?.text || ""; // Append the new content to the message
                            if (!ROLES.includes(role)) role += delta?.role || ""; // Update the role if provided in the delta, unless we already have a complete role
                            tools = mergeToolsDeltas(tools, delta?.tool_calls || transformAnthropicToolCalls(completion.content_block)); // Merge any new tool calls with the existing ones

                            const usage = getUsageFromCompletion(completion);
                            tokens.input = usage.input || tokens.input;
                            tokens.output = usage.output || tokens.output;
                            tokens.total = usage.total || tokens.total;

                            yield generateOutputObject(message, null, null, uuid);
                        } catch (error) { /* meh */ } // Ignore JSON parsing errors for incomplete lines or non-JSON lines
                    }
                }
            }

            subtotal.input += tokens.input || 0;
            subtotal.output += tokens.output || 0;
            subtotal.total += tokens.total || subtotal.input + subtotal.output || 0;

            const recursed = await handleTools.call(this, role, tools, { messages, result, subtotal, config: _config, recurse: _stream });
            if (recursed) for await (const result of recursed) yield result;
            else {
                message = validateResponse(message, _config);
                result.push({
                    role: role || ROLE.ASSISTANT,
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
    const _config = {
        ...this.config,
        ...config,
        // Combine system messages from instance config and provided config
        system: this.config.system.concat(config?.system || []),
        options: {
            ...this.config?.options,
            ...config?.options,
            stream: stream,
            stream_options: stream ? { include_usage: true } : undefined // required by OpenAI
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

    // RPM cannot be set on a per-request basis, so delete it from the config if provided
    delete _config.rpm;

    validateConfig(_config);

    if (_config.schema) {
        _config.options.response_format = { type: "json_schema", json_schema: { name: `schema_${uuid_v4()}`, schema: _config.schema } };
    }

    return _config;
}

/**
 * Validates the provided configuration for the Llaminate instance.
 * @param config - The configuration object to validate.
 * @throws Will throw an error if the configuration is invalid.
 */
function validateConfig(config: LlaminateConfig): void {
    if (!validate.config(config)) {
        throw new Error(`Invalid configuration: ${ajv.errorsText(validate.config.errors)}`);
    }
}

/**
 * Sends a fetch request to the Llaminate service.
 * @param messages - The messages to include in the request.
 * @param config - The configuration object for the request.
 * @returns A promise resolving to the fetch response.
 */
async function sendMessages(messages: Message[], config: LlaminateConfig): Promise<Response> {
    const headers = {
        "Authorization": `Bearer ${config.key}`,
        "X-Api-Key": `${config.key}`,
        "x-goog-api-key": `${config.key}`,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
        "Connection": "keep-alive", // Added to support streaming
        "Accept": "application/json, text/event-stream", // Specify multiple types to handle both streaming and non-streaming responses
        "User-Agent": USER_AGENT,
        ...config.headers
    };

    const body: Record<string, any> = await applyQuirks({
        ...config.options,
        model: config.model,
        messages,
    }, config);

    const json = JSON.stringify(body, null, 2);

    return config.fetch(config.endpoint, {
        method: "POST",
        headers: headers,
        body: json,
    });
}

/**
 * Applies any necessary quirks to the request body based on the configuration
 * and the target API's requirements, such as adjusting content formats,
 * handling schema support, and modifying message structures.
 * @param body - The request body to apply quirks to.
 * @param config - The configuration object containing quirks and other settings.
 * @returns The modified request body with quirks applied.
 */
async function applyQuirks(body: Record<string, any>, config: LlaminateConfig): Promise<Record<string, any>> {

    // Avoid mutating the original body object, it will have references to the config and other objects that we don't want to modify directly
    const modified = structuredClone(body);

    // additional system prompts to be injected (e.g. for schema instructions)
    const instructions = [];

    for (const message of modified?.messages || []) {

        /**
         * Antropic don't have the concept of a "tool" role for tool responses,
         * instead they require tool responses to be sent with the "user" role
         * and a specific content format, so we transform any messages with the
         * "tool" role into the format they require if the quirk is set.
         */
        if (message.role === ROLE.TOOL && config.quirks?.role?.tool === false) {
            message.role = ROLE.USER;
            message.content = [{
                "type": "tool_result",
                "tool_use_id": message.tool_call_id,
                "content": message.content
            }];

            delete message.name;
            delete message.tool_call_id;
        }

        /**
         * We also need to reverse that process to transform tool calls from
         * the assistant into the format that Anthropic requires.
         */
        if (message.role === ROLE.ASSISTANT && message.tool_calls && config.quirks?.role?.tool === false) {
            message.content = message.tool_calls?.map((call) => ({
                    "type": "tool_use",
                    "id": call.id,
                    "name": call.function.name,
                    "input": JSON.parse(call.function.arguments),
            }));

            delete message.tool_calls;
        }

        if (Array.isArray(message.content)) {
            // content might be a string, so we need to check if it's an array before trying to iterate over it

            for (const content of message?.content || []) {
                console.log(content);

                /**
                 * Anthropic's API requires attachments to be sent in a unique
                 * format using a "source" property, so if the quirk is set we
                 * transform any content with the "image_url", "document_url",
                 * or "file" types into the format they require.
                 */
                if (content.type === "image_url" && isHttpUrl(content.image_url?.url)
                    && config.quirks?.attachments?.source === true) {
                        content.type = "image";
                        content.source = {
                            type: "url",
                            url: content.image_url.url
                        };
                        delete content.image_url;
                }

                if (content.type === "document_url" && isHttpUrl(content.document_url)
                    && config.quirks?.attachments?.source === true) {
                        content.type = "document";
                        content.source = {
                            type: "url",
                            url: content.document_url
                        };
                        delete content.document_url;
                }

                if (["image_url", "document_url"].includes(content.type) && isBase64DataUri(content[content.type]?.url || content[content.type])
                    && config.quirks?.attachments?.source === true) {
                        const uri = content[content.type]?.url || content[content.type];
                        const [meta, data] = uri.split(",");
                        const mime = meta.match(/data:(.*);base64/)?.[1] || "application/octet-stream";
                        content.type = mime === Llaminate.PDF ? "document" : "image";
                        content.source = {
                            type: "base64",
                            data: data,
                            media_type: mime
                        };
                        delete content.image_url;
                        delete content.document_url;
                }

                /**
                 * OpenAI's API supports a "file" content type with base64
                 * data, so if the quirk is set we convert any "document_url"
                 * content into that format, using the URL as the base64 data.
                 */
                if (content.type === "document_url" && config.quirks?.attachments?.file === true) {
                    const data = isHttpUrl(content.document_url)
                        ? await fetchUrlAsBase64(content.document_url)
                        : content.document_url; // If the URL is already a data URI, we can use it directly without fetching

                    content.type = "file";
                    content.file = {
                        file_data: data,
                        filename: uuid_v4()
                    };
                    delete content.document_url;
                }

            }
        }
    }

    modified.tools?.forEach((tool, i, tools) => {

        /**
         * Anthropic has a unique format for tools, so we transform the usual
         * definition into the format they require.
         */
        if (config.quirks?.input_schema === true) {
            tools[i] = {
                name: tool.function.name,
                description: tool.function.description,
                input_schema: tool.function.parameters,
                strict: tool.strict
            };
        }
        
    });

    /**
     * Mistral doesn't support structured output with tools, so
     * if both a schema and tools are provided we fall back to
     * a text response and include instructions in the system
     * prompt.
     */
    if (["json_schema", "json_object"].includes(modified.response_format?.type)) {
        if (modified.tools?.length > 0
            && config.quirks?.tools?.json_schema === false
            && config.quirks?.tools?.json_object === false) {
                const schema = JSON.stringify(cleanse(modified.response_format?.json_schema), null, 2);
                instructions.push(SYSTEM_HBS(schema));
                modified.response_format.type = "text";
                delete modified.response_format.json_schema;
        }
    }

    /**
     * Mistral and Deepseek don't support the "json_schema"
     * response format, so if it's set in the options we
     * convert it to a system prompt with instructions and
     * set the content type to "json_object" instead.
     */
    if (modified.response_format?.type === "json_schema" && config.quirks?.json_schema === false) {
        const schema = JSON.stringify(cleanse(modified.response_format?.json_schema), null, 2);
        instructions.push(SYSTEM_HBS(schema));
        modified.response_format.type = "json_object";
        delete modified.response_format.json_schema;
    }

    /**
     * Anthropic rejects tool-requests with the parallel_tool_calls property.
     */
    if (config.quirks?.parallel_tool_calls === false) {
        delete modified.parallel_tool_calls;
    }

    /**
     * Anthropic's API requires system messages to be included in the main
     * message array with the role "system",
     */
    if (config.quirks?.role?.system === false) {
        modified.messages = modified.messages.filter(message => message.role !== ROLE.SYSTEM);
        modified.system = [...instructions.map(text => ({ role: ROLE.SYSTEM, content: text })), ...modified.messages.filter(message => message.role === ROLE.SYSTEM).map((message => ({ type: "text", text: message.content })))];
    } else {
        modified.messages = [...instructions.map(text => ({ role: ROLE.SYSTEM, content: text })), ...(modified.messages || [])];
    }

    /**
     * Anthropic requires the "max_tokens" parameter, so we set it based on
     * quirks if not set already.
     */
    if (typeof config.quirks?.max_tokens === "number") {
        modified.max_tokens = modified.max_tokens || config.quirks?.max_tokens;
    }

    /**
     * Anthropic doesn't support the "response_format" option and instead
     * uses its own output_config property for structured output.
     */
    if (config.quirks?.output_config === true) {
        if (modified.response_format.type === "json_schema") {
            modified.output_config = {
                format: {
                    type: "json_schema",
                    schema: modified.response_format.json_schema.schema
                }
            };
        }

        // Anthropic will throw an error for unrecognized property
        delete modified.response_format;
    }

    /**
     * Anthropic doesn't support streaming options, so we remove it from the options.
     */
    if (config.quirks?.stream_options === false) {
        delete modified.stream_options;
    }

    return cleanse(modified);
}

/**
 * Transforms tool calls from the format used by Anthropic's API into the usual
 * format expected by the rest of the code, allowing for compatibility with
 * Anthropic's unique tool call structure.
 * @param messages - The messages from the completion response, which may contain tool calls in Anthropic's format.
 * @returns An array of tool calls in the usual format, extracted and transformed from the provided messages.
 */
function transformAnthropicToolCalls(messages: any[] | any): any {
    if (!Array.isArray(messages)) messages = [messages]
    return messages?.map((message) => {
        // Anthropic has a unique format for tool calls, so transform
        // it into the usual format here (if present in the response)
        if (message?.type == "tool_use") return {
            type: "function",
            function: {
                name: message.name,
                arguments: JSON.stringify(message.input)
            },
            id: message.id
        }
    }).filter(Boolean);
};

/**
 * Merges incoming tool call deltas with existing tool calls, combining their properties based on their index.
 * @param existing - The existing tool calls.
 * @param incoming - The incoming tool call deltas.
 * @returns The merged tool calls.
 */
function mergeToolsDeltas(existing: any[], incoming: any[] = []): any[] {
    const merged = [...existing];
    incoming?.forEach((delta, i) => {
        if (!delta.id) return; // If there's no ID, we can't reliably merge, so skip this delta
        let found = existing.find((call) => call.id === delta.id);
        if (!found) {
            found = {
                type: "",
                function: {
                    name: "",
                    arguments: ""
                },
                id: ""
            }
            merged.push(found);
        }
        found.type += delta.type || "";
        found.function.name += delta.function?.name || "";
        found.function.arguments += delta.function?.arguments || "";
        found.id += delta.id || "";
    });
    return merged;
}

/**
 * Handles tool calls based on the completion response.
 * @param role - The role of the entity making the tool calls.
 * @param calls - The tool calls to handle.
 * @param context - The context for handling the tools.
 * @returns A promise resolving to the response after handling tools.
 */
async function handleTools(role: ROLE, calls: any, context: LlaminateContext): Promise<LlaminateResponse> {
    if (calls.length > 0) {
        context.result.push({
            role: role || ROLE.ASSISTANT,
            tool_calls: calls.map(call => {
                const cleansed = cleanse(call);
                cleansed.type = cleansed.type || "function"; // Ensure type is set to "function" for backward compatibility with models that don't include the type in the delta updates
                cleansed.function.arguments = sanatiseJSON(cleansed.function.arguments);
                return cleansed;
            })
        });

        for (const call of calls) {
            const tool = context.config.tools.find((tool) => tool.function.name === call.function.name);
            if (tool) {
                try {
                    const args = JSON.parse(call.function.arguments);
                    const response = await (tool.handler || context.config.handler || noop).call(globalThis, call.function.name, args);
                    context.result.push({
                        role: ROLE.TOOL,
                        name: tool.function.name,
                        content: serialize(response),
                        tool_call_id: call.id,
                    });
                } catch (error) {
                    context.result.push({
                        role: ROLE.TOOL,
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
    const input = completion?.usage?.prompt_tokens || completion?.usage?.input_tokens || null;
    const output = completion?.usage?.completion_tokens || completion?.usage?.output_tokens || null;
    const total = completion?.usage?.total_tokens || null;
    return { input: parseInt(input), output: parseInt(output), total: parseInt(total) };
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
    let messages = [];
    if (Array.isArray(prompt)) messages = getWindowFromHistory(prompt, config); // Set history to the initial messages if an array is provided
    else if (typeof prompt === "string") messages = getWindowFromHistory(this.history.concat({ role: ROLE.USER, content: prompt } as Message), config);
    else throw new Error("Prompt must be a string or an array of messages.");

    // If attachments are provided in the config, append them to the content of the last message
    if (config.attachments && config.attachments.length > 0) {
        messages[messages.length - 1].content = [
            { type: "text", text: messages[messages.length - 1].content },
            ...config.attachments.map((attachment) => {
                return attachment.type?.startsWith("image") ? {
                    type: "image_url",
                    image_url: { url: attachment.url }
                } : {
                    type: "document_url",
                    document_url: attachment.url
                };
            })
        ]
    }

    return messages;
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
        ...(config.system || []).map(content => ({ role: ROLE.SYSTEM, content } as Message)),
        ...(messages.concat().reverse().map(message => {
            if (message.role === ROLE.SYSTEM) return message; // Always include system messages
            if (count < config.window) {
                if (message.role === ROLE.USER) count++;
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
    else if (typeof prompt === "string") this.history.push({ role: ROLE.USER, content: prompt } as Message, ...result);
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
        const json:string = sanatiseJSON(message);
        const obj:any = JSON.parse(json);

        const schema = ajv.compile(config.schema);
        const valid:any = schema(obj);
        if (!valid) throw(schema.errors);

        return JSON.stringify(obj);
    } else if (message) return message;
    else throw new Error("Response from LLM is empty.");
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

/**
 * Sanitises a JSON string by extracting the JSON object from the string and ensuring it is valid JSON.
 * This is necessary because some models may return the JSON response wrapped in additional text or formatting.
 * @param json - The JSON string to sanitise.
 * @returns The sanitised JSON string.
 */
function sanatiseJSON(json: string): string {
    try {
        const match = json.match(/{.*}/s)?.[0] || "{}"; // Extract the JSON object from the string, or default to an empty object if not found
        JSON.parse(match); // try to parse the JSON to ensure it's valid
        return match;
    } catch (error) {
        throw new Error(`Invalid JSON response: ${json}`);
    }
}

/**
 * Determines specific quirks or requirements for different AI service
 * endpoints, such as how to format attachments for Mistral's API.
 * @param config - The configuration object to determine quirks based on the endpoint.
 * @returns An object containing boolean flags for different services
 * indicating whether the endpoint matches that service's API format.
 * This can be used to apply service-specific formatting or handling logic in
 * other parts of the code.
 */
function getQuirks(config: LlaminateConfig): LlaminateQuirks {
    const endpoint = config.endpoint;

    const isMistral = endpoint.startsWith(Llaminate.MISTRAL);
    const isOpenAI = endpoint.startsWith(Llaminate.OPENAI);
    const isGoogle = endpoint.startsWith(Llaminate.GOOGLE);
    const isDeepSeek = endpoint.startsWith(Llaminate.DEEPSEEK);
    const isAnthropic = endpoint.startsWith(Llaminate.ANTHROPIC);

    return {
        attachments: {
            source: isAnthropic, // Whether to use the "source" stynax for attachements, required by Anthropic's API, or to use the standard content array with "image_url", "document_url", or "file" types for other APIs
            file: isOpenAI // Whether to support the "file" content type with base64 data, as used by OpenAI's API
        },
        input_schema: isAnthropic, // Whether to use the "input_schema"
        json_schema: !isDeepSeek && !isMistral, // { type: "json_schema" } (true), otherwise fallback to { type: "json_object" }
        max_tokens: isAnthropic ? 64000 : undefined, // max_tokens may be required (e.g. by Anthropic)
        output_config: isAnthropic, // Whether to use the "output_config", otherwise use response_format
        parallel_tool_calls: !isAnthropic, // Whether to allow parallel tool calls (true), or force sequential tool calls (false)
        role: {
            system: !isAnthropic, // Whether to use the "system" role for system messages, as required by Anthropic's API, or to use the "system" property in the options object for other APIs
            tool: !isAnthropic // Whether to use the "tool" role for tool responses, as required by Anthropic's API, or to use the "tool" property in the options object for other APIs
        },
        stream_options: !isAnthropic, // Whether to include the "stream_options" property in the request body for streaming completions, as required by OpenAI's API
        tools: { // only, if we have config.tools
            json_schema: !isMistral, // { type: "json_schema" } (true), otherwise fallback to { type: "json_object" }
            json_object: !isMistral // { type: "json_object" } (true), otherwise fallback to { type: "json_object" }
        },
    };
}

/**
 * Fetches a file from the given URL and returns its content as a base64-encoded string.
 * This is useful for handling file attachments that need to be sent in base64 format, such as when using OpenAI's API.
 * @param url - The URL of the file to fetch and encode.
 * @returns A promise that resolves to the base64-encoded string of the file's content.
 * @throws Will throw an error if the fetch request fails or if there is an issue reading the file.
 */
async function fetchUrlAsBase64(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    return `data:${contentType};base64,${base64}`;
}

/**
 * Checks if a given URL is an HTTP or HTTPS URL.
 * @param url - The URL string to check.
 * @returns A boolean indicating whether the URL is an HTTP or HTTPS URL.
 */
function isHttpUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return ["http:", "https:"].includes(parsed.protocol);
    } catch (error) {
        return false;
    }
}

/**
 * Checks if a given URI is a base64 data URI.
 * @param uri - The URI string to check.
 * @returns A boolean indicating whether the URI is a base64 data URI.
 */
function isBase64DataUri(uri: string): boolean {
    return /^data:.*;base64,/.test(uri);
}