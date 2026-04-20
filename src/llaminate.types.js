/**
 * @file Type definitions for Llaminate
 * @name Llaminate.types.js
 * @ignore
 * @description This file defines the JSDoc type definitions for the Llaminate
 * library, including the configuration options and response structure for the
 * Llaminate service.
 * @license MIT
 */

/**
 * Represents the configuration options for the Llaminate service.
 * @interface LlaminateConfig
 * @type {Object}
 * @property {string} endpoint The endpoint URL for the LLM service to use.
 * @example { endpoint: Llaminate.MISTRAL }
 * @example { endpoint: "https://api.example.com/v1/chat/completions" }
 * @property {string} key The API key for the LLM service.
 * @example { key: "12345-abcde-67890-fghij-klm" }
 * @property {string} [model] The model name to use with the LLM service.
 * @example { model: "mistral-small-latest" }
 * @property {Array<{
 *   type: string,
 *   url: string
 * }>} [attachments] Attachments to include with the request. A tool call can
 * also return attachments in its response using {"@attachments": [...]}, which
 * will be included in the context for subsequent messages, if supported by the
 * LLM service.
 * @example
 * { attachments: [
 *   {
 *     type: Llaminate.JPEG,
 *     url: "https://example.com/image.jpg"
 *   },
 *   {
 *     type: Llaminate.PDF,
 *     url: "data:application/pdf;base64,JVBERi0xLjcKJcfs..."
 *   }
 * ] }
 * @property {Object} [headers] Additional headers to include in the API
 * requests to the LLM service.
 * @example
 * { headers: {
 *   "OpenAI-Organization": "org-12345-abcde-67890",
 *   "OpenAI-Project": "project-abcde-12345-fghij",
 * } }
 * @property {LlaminateMessage[]} [history] An array of messages to include as
 * part of the conversation history for the request.
 * @example
 * { history: [
 *   { role: "user", content: "What is the capital of France?" },
 *   { role: "assistant", content: "The capital of France is Paris." },
 * ] }
 * @property {Object<{
 *   tokens: number,
 *   attachments: number,
 *   recursions: number
 * }>} [limits] An object specifying various limits to enforce when
 * processing requests and responses.
 * @example
 * { limits: {
 *   tokens: 1000,
 *   attachments: 5,
 *   recursions: 3,
 * } }
 * @property {Object} [options] Additional options to include in the request
 * body sent to the LLM service.
 * @example
 * { options: {
 *   temperature: 0.7,
 *   max_tokens: 150,
 * } }
 * @property {number} [retries] The maximum number of retries to attempt for
 * failed API requests before giving up.
 * @example { retries: 3 }
 * @property {number} [rpm] - The maximum number of requests per minute (RPM) to
 * allow when making API requests.
 * @example { rpm: 720 }
 * @property {Object} [schema] An optional JSON schema to specify the expected
 * structure of the response.
 * @example
 * { schema: {
 *   type: "object",
 *   properties: {
 *     reply: {
 *         type: "string",
 *         description: "Your response to the user's query."
 *     },
 *     thoughts: {
 *       type: "string",
 *       description: "Your internal thoughts about the user's query."
 *     },
 *   },
 *   required: ["reply", "thoughts"],
 *   additionalProperties: false,
 * } }
 * @property {string[]} [system] System prompts to include with every request. A
 * tool call can also return system prompts in its response using {"@system": 
 * [...]}, which will be included in the context for that completion.
 * @example
 * { system: [
 *   "You are an assistant who answers questions about movies.",
 *   "You are always excited about movie trivia and love sharing fun facts.",
 * ] }
 * @property {Array<{
 *   function: {
 *     name: string,
 *     description: string,
 *     parameters: Object,
 *     strict: boolean
 *   },
 *   handler: Function
 * }>} [tools] Tool definitions to include with the request.
 * @example
 * { tools: [
 *   {
 *     function: {
 *       name: "get_current_time",
 *       description: "Returns the current time in ISO format.",
 *       parameters: {
 *         type: "object",
 *         properties: {},
 *         required: [],
 *       }
 *     },
 *     handler: async () => {
 *       return new Date().toISOString();
 *     }
 *   }
 * ] }
 * @property {number} [window] The number of recent user messages to include in
 * the context window for each request.
 * @example { window: 5 }
 * @property {Function} [fetch] A custom fetch function to use for making API
 * requests to the LLM service.
 * @example
 * { fetch: async (url, options) => {
 *   // Example fetch using Node's https module
 *   return new Promise((resolve, reject) => {
 *     const request = https.request(url, options, (response) => {
 *       let data = "";
 *       response.on("data", (chunk) => data += chunk);
 *       response.on("end", () => resolve({
 *         ok: response.statusCode >= 200 && response.statusCode < 300,
 *         status: response.statusCode,
 *         json: async () => JSON.parse(data),
 *         text: async () => data,
 *       }));
 *     });
 *     request.on("error", reject);
 *     if (options.body) request.write(options.body);
 *     request.end();
 *   });
 * } }
 * @param {Function} [handler] An optional function to handle tool calls when using the `complete`
 * method. This function will be called with the tool call details and should return the result of the tool execution.
 * @example
 * { handler: async (name, args) => {
 *   console.log(`Tool called: ${name} with arguments:`, args);
 * } }
 * @default {
 *   attachments: [],
 *   headers: {},
 *   history: [],
 *   limits: {
 *     attachments: 8,
 *     recursions: 5
 *   },
 *   options: {},
 *   rpm: Infinity,
 *   system: [],
 *   tools: [],
 *   window: 12,
 *   fetch: fetch,
 *   handler: async (name, args) => {
 *     throw new Error(`No \`handler\` method provided for \`${name}\` was provided in the Llaminate configuration.`)
 *   }
 * }
 */

/**
 * Represents the response from the Llaminate service.
 * @interface LlaminateResponse
 * @type {Object}
 * @property {string|any} message The final response message, which can be a
 * string or an object conforming to a provided JSON schema.
 * @property {LlaminateMessage[]} result The array of messages returned as part
 * of the response.
 * @property {Object<{
 *   input: number,
 *   output: number,
 *   total: number
 * }>} tokens The token usage information for the request.
 * @property {string} uuid The unique identifier for the response.
 */

/**
 * Represents a message in the Llaminate service.
 * @interface LlaminateMessage
 * @type {Object}
 * @property {"assistant" | "developer" | "system" | "user" | "tool"} role The
 * role of the message sender.
 * @property {string|Array<{
 *   type: "text",
 *   text: string
 * } | { type: "attachment", attachment: { mime: string, url: string } }>} [content] The content of the message, which can be a
 * string or an array of content objects (either text or URL attachments).
 * @property {string} [name] The name of the tool used in tool responses.
 * @property {string} [tool_call_id] The ID linking tool messages to calls.
 * @property {Array<{
 *   type: string,
 *   function: {
 *     name: string,
 *     arguments: string
 *   },
 *   id: string
 * }>} [tool_calls] The tool calls associated with assistant messages.
 */