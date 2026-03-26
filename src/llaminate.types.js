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
 * }>} [attachments] Attachments to include with the request.
 * @default []
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
 * @property {Function} [fetch] A custom fetch function to use for making API
 * requests to the LLM service.
 * @default fetch
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
 * @property {Object} [headers] Additional headers to include in the API
 * requests to the LLM service.
 * @default {}
 * @example
 * { headers: {
 *   "OpenAI-Organization": "org-12345-abcde-67890",
 *   "OpenAI-Project": "project-abcde-12345-fghij",
 * } }
 * @property {LlaminateMessage[]} [history] An array of messages to include as
 * part of the conversation history for the request.
 * @default []
 * @example
 * { history: [
 *   { role: "user", content: "What is the capital of France?" },
 *   { role: "assistant", content: "The capital of France is Paris." },
 * ] }
 * @property {Object} [options] Additional options to include in the request
 * body sent to the LLM service.
 * @default {}
 * @example
 * { options: {
 *   temperature: 0.7,
 *   max_tokens: 150,
 * } }
 * @property {number} [rpm] - The maximum number of requests per minute (RPM) to
 * allow when making API requests.
 * @default { rpm: Infinity }
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
 * @property {string[]} [system] System prompts to include with every request.
 * @default []
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
 * @default []
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
 * @default 12
 * @example { window: 5 }
 */

/**
 * Represents the response from the Llaminate service.
 * @interface LlaminateResponse
 * @type {Object}
 * @property {string|any} message The response message, which can be a string or
 * any JSON-serializable object.
 * @property {LlaminateMessage[]} result The array of messages returned as part
 * of the response.
 * @property {Tokens} tokens The token usage information for the request.
 * @property {string} uuid The unique identifier for the response.
 */

/**
 * Represents a message in the Llaminate service.
 * @interface LlaminateMessage
 * @type {Object}
 * @property {"assistant" | "developer" | "system" | "user" | "tool"} role The
 * role of the message sender.
 * @property {string|any} [content] The content of the message, which can be a
 * string or any JSON-serializable object.
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