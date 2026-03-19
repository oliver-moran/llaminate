# Llaminate

Llaminate is a simple but powerful library designed to abstract chat completions with AI models. It provides robust tools for managing prompts, message histories, token usage and integrating custom tools, making it ideal for quickly building applications that interact with large language models (LLMs).

## Features
- **Chat Completions**: Streamline chat completions, including streaming.
- **Tool Integration**: Easily integrate tools to extend functionality.
- **Structured Output**: Define schemas for structured JSON output.
- **Images and Documents**: Attach images and documents to your messages.
- **Usage Tracking**: Track token usage across completions and tool calls.
- **Rate Limiter**: Ensure compliance with API rate limits.

---

## Installation

```bash
npm install llaminate
```

---

## Basic Usage

### Importing the library
```typescript
import { Llaminate } from "llaminate";
```

### Example 1: Sending a prompt
```typescript
const llaminate = new Llaminate({
  endpoint: "https://api.example.com/chat/completions",
  key: "your-api-key",
  model: "llm-model-name"
});

const completion = await llaminate.complete("Hello, AI!");
console.log(completion.message); // Outputs the AI's response
```

### Example 2: Streaming responses
```typescript
const stream = await llaminate.stream("Stream this response.");
for await (const chunk of stream) {
  console.log(chunk.message); // Outputs updates to the response as they arrive
}
```

### Example 3: Chaining completion responses
Llaminate also supports the Promise chaining pattern with `.then()` and `.catch()`. This approach is useful for handling asynchronous operations in a more functional style.

```typescript
llaminate.complete("Why was six afraid of seven?")
  .then((result) => {
    console.log(result.message);
  })
  .catch ((error) => {
    console.error(error.message);
  });
```

### Example 4: Keeping a chat history
Llaminate keeps track of the message history, allowing you to maintain context across multiple interactions. You can clear the history as needed.

```typescript
// Prompt 1
const first = await llaminate.complete("What is your name?");
console.log(first.message);

// Prompt 2 (builds on the context of Prompt 1)
const second = await llaminate.complete("How do you spell that?");
console.log(second.message);

// Export the chat history (optionally, pass a number for the length to export)
llaminate.export();

// Clear the message history
llaminate.clear();
```

### Alternative: Managing the history yourself
You can provide a message history to the `complete` method. This allows you to directly manage system, user and assistant messages:

```typescript
const messages = [
  { role: "system", content: "You can't resist finishing the last line of a knock-knock joke." },
  { role: "user", content: "Knock, knock." },
  { role: "assistant", content: "Who's there?" },
  { role: "user", content: "Lettuce." },
];

const completion = await llaminate.complete(messages);
console.log(completion.result); // Raw response messages from the LLM
```

### Example 5: Retrieving token usage
Llaminate provides token usage details for each interaction, including input, output, and total tokens.

```typescript
const completion = await llaminate.complete("How much wood would a woodchuck chuck if a woodchuck could chuck wood?");
console.log(`${completion.message} (${completion.tokens.total} tokens)`);
```

---

## Images and Documents

With LLM's that support images and documents, you can included these as URL attachments to your completions. Note, however, that the `attachment` property cannot be passed to the constructor.

### Example: Including files with completions
```typescript
const attachments = [{
    type: Llaminate.IMAGE,
    url: "https://www.example.com/files/image.jpg"
}, {
    type: Llaminate.DOCUMENT,
    url: "https://www.example.com/files/document.pdf"
}, {
    type: Llaminate.IMAGE,
    url: "data:image/jpeg;base64,..."
}];

const completion = await llaminate.complete("Describe the attached files as if seeing them in a dream.", { attachments });
console.log(completion.message);
```

---

## Using Tools

Llaminate allows you to integrate custom tools to extend its functionality. Tools can be used to handle specific tasks during interactions with the AI model.

### Example: Defining and using a tool
```typescript
const tools = [
  {
    function: {
      name: "make_a_decision",
      description: "Randomly selects one option from a list of choices.",
      parameters: {
        options: { type: "array", items: { type: "string" }, description: "The list of options to choose from." }
      }
    },
    handler: async (name, args) => {
      const { options } = args;
      const decision = options[Math.floor(Math.random() * options.length)];
      return { decision };
    }
  }
];

const llaminate = new Llaminate({
  endpoint: "https://api.example.com/chat/completions",
  key: "your-api-key",
  model: "llm-model-name",
  tools: tools
});

const completion = await llaminate.complete("Should I keep working on this project or take the afternoon off?");
console.log(completion.result);
```

### Alternative: Passing tools as configuration alongside prompts
```typescript
const completion = await llaminate.complete("Should I read a book or watch a movie?", { tools });
console.log(completion.result);
```

---

## Structured Output

Llaminate allows you to define a schema for structured output, ensuring that the AI's responses adhere to a specific format. This is particularly useful when you need predictable and well-defined responses for further processing.

### Example: Defining a schema
```typescript
const schema = {
  type: "object",
  properties: {
      reply: {
          type: "string",
          description: "Your response to the user's query."
      },
      thoughts: {
        type: "string",
        description: "Your internal thoughts about the user's query."
      }
  },
  required: ["reply", "thoughts"]
};

const completion = await llaminate.complete("Should I cycle my bike or take public transport?", { tools, schema });
console.log(completion.result);
```

---

## Error Handling

Llaminate provides robust error handling to ensure that your application can gracefully handle issues during interactions with the AI model. Below are some common scenarios and how to handle them:

### Example 1: Invalid configuration
If the configuration provided to the `Llaminate` constructor is invalid, an error will be thrown. Ensure that the `endpoint`, `key` and `model` fields are correctly set and validate any additional configuration options.

```typescript
try {
  const llaminate = new Llaminate({
    endpoint: "https://api.example.com/chat/completions",
    key: "your-api-key"
    // no model provided
  });
} catch (error) {
  console.error(error.message);
}
```

### Example 2: Completion and streaming errors
The `complete` and `stream` methods will throw an error if the API response is unsuccessful (e.g., invalid configuration or API response). Use `try-catch` blocks to handle these errors.

```typescript
const schema = { // invalid schema
  foo: "bar"
};

try {
  const completion = await llaminate.complete("Hello, AI!", { schema });
  console.log(completion.message);
} catch (error) {
  console.error(error.message);
}
```

### Example 3: Errors in tools
If an error thrown while executing a tool, Llaminate will capture this. The error messsage will be passed to the LLM in the tool response.

```typescript
const tools = [
  {
    function: {
      name: "convert_kelvin_to_celsius",
      description: "Converts a temperature from Kelvin to Celsius.",
      parameters: {
        type: "object",
        properties: {
          kelvin: {
            type: "number",
            description: "The temperature in Kelvin to convert to Celsius."
          }
        },
        required: ["kelvin"]
      }
    },
    handler: async (name, args) => {
      const { kelvin } = args;

      // Check for invalid Kelvin values
      if (kelvin < 0) {
        throw new Error("Temperature in Kelvin cannot be negative.");
      }

      // Convert Kelvin to Celsius
      const celsius = kelvin - 273.15;
      return { celsius };
    }
  }
];

const completion = await llaminate.complete("Convert -5 Kelvin to Celsius.", { tools });
console.log(completion.result);
```

---

## Advanced Configuration

The `Llaminate` constructor accepts a configuration object with the following options:

- **`endpoint`** (required): The endpoint URL for the AI service.
- **`key`** (required): The API key for authenticating requests.
- **`model`** (required): Specify the model to use (e.g., `"mistral-small-latest"`).
- **`rpm`**: Throttle requests in requests per minute (i.e. rate limiter).
- **`attachments`** An array of image and documents to include in a completion:
  - `type`: Either `Llaminate.IMAGE` or `Llaminate.DOCUMENT`.
  - `url`: An internet accessible URL or base64 encoded URI to the file.
- **`schema`**: A schema defining the format for JSON output.
- **`system`**: An array of system messages to include in each interaction.
- **`window`**: The number of messages to retain in the context window (default: `12`).
- **`tools`**: An array of custom tools to extend functionality. Each tool includes:
  - `function`: A schema defining the tool and how to use it.
  - `handler`: A function to execute tool calls and recieve arguments.
- **`handler`**: A global fallback function to execute tool calls.
- **`fetch`** A custom fetch implementation for making HTTP requests.
- **`headers`** Additional HTTP headers to include in requests.
- **`options`**: Additional parameters to include in the LLM API call, such as:
  - `max_tokens`: The maximum number of tokens to use.
  - `response_format`: The response format (e.g., `{ type: "json_object" }`).

### Example: Custom configuration
```typescript
const llaminate = new Llaminate({
  endpoint: "https://api.example.com/ai",
  key: "your-api-key",
  model: "gpt-4",
  system: ["You always talk like a cowboy from an old-fashioned Western."],
  window: 20,
  rpm: 5,
  options: {
    max_tokens: 100,
  }
});
```

### Alternative: Configuration can be over-ridden on each prompt
A one-time configuration can also passed alongside a prompt. Configuration properties set in this way override the main configuration for the duration of the commpletion.

Two exceptions are that the `system` property is appended to main system prompts for that completion. The `rpm` property can only be set in the constructor.

The `attachment` property can only be set in this way.

```typescript
const completion = await llaminate.complete("What's an easy recipe for French toast?", { [
  system: ["You always talk like a villian from a 19th century murder-mystery."]
] });
console.log(completion.result);
```

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.