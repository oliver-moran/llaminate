# Llaminate

Llaminate is a simple but powerful library designed to abstract chat completions with AI models. It provides robust tools for managing prompts, message histories, token usage and integrating custom tools, making it ideal for quickly building applications that interact with large language models (LLMs).

## Features
- **Completions**: Manage and streamline chat completions with AI models, including streaming.
- **Usage Tracking**: Keep track of token usage for input, output and total tokens.
- **Tool Integration**: Easily integrate custom tools to extend functionality.

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

const response = await llaminate.complete("Hello, AI!");
console.log(response.message); // Outputs the AI's response
```

### Example 2: Streaming responses
```typescript
const response = await llaminate.stream("Stream this response.");
for await (const chunk of response) {
  console.log(chunk.message); // Outputs updates to the response as they arrive
}
```

### Example 3: Keeping a chat history

Llaminate keeps track of the message history, allowing you to maintain context across multiple interactions. You can clear the history as needed.

```typescript
// Prompt 1
const response1 = await llaminate.complete("What is your name?");
console.log(response1.message);

// Prompt 2 (builds on the context of Prompt 1)
const response2 = await llaminate.complete("How do you spell that?");
console.log(response2.message);

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

const response = await llaminate.complete(messages);
console.log(response.messages); // raw response messages from the LLM
```

### Example 4: Retrieving Token Usage

Llaminate provides token usage details for each interaction, including input, output, and total tokens.

```typescript
const response = await llaminate.complete("How much wood would a woodchuck chuck if a woodchuck could chuck wood?");
console.log(`${response.message} (${response.tokens.total} tokens)`);
```

---

## Using Tools

Llaminate allows you to integrate custom tools to extend its functionality. Tools can be used to handle specific tasks during interactions with the AI model.

### Example: Defining and using a tool
```typescript
const tools = [
  {
    schema: {
      function: {
        name: "make_a_decision",
        description: "Randomly selects one option from a list of choices.",
        parameters: {
          options: { type: "array", items: { type: "string" } }
        }
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

const response = await llaminate.complete("Should I keep working on this project or take the afternoon off?");
console.log(response.messages); // raw response showing tools calls and responses
```

### Alternative: Passing tools with the `complete` method
```typescript
const response = await llaminate.complete("Should I read a book or watch a movie?", tools);
console.log(response.messages);
```

---

## Advanced Configuration

The `Llaminate` constructor accepts a configuration object with the following options:

- **`endpoint`** (required): The endpoint URL for the AI service.
- **`key`** (required): The API key for authenticating requests.
- **`model`**: Specify the model to use (e.g., `"mistral-small-latest"`).
- **`system`**: An array of system messages to include in each interaction.
- **`window`**: The number of messages to retain in the context window (default: `12`).
- **`handler`**: A custom function to handle tool calls.
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
  handler: async (name, args) => {
    console.log(`Tool called: ${name}`);
    return { success: true };
  },
  options: {
    max_tokens: 100,
  }
});
```

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.