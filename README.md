![Llamina, the Llaminate mascot](https://oliver-moran.github.io/llaminate/assets/llaminate-256.webp)

Llaminate is a simple but powerful library designed to abstract-away differences
between chat completion APIs across LLM providers.

It's robust at managing prompts, message histories, token usage and integrating
tools. Ideal for quickly building applications to interact with LLM services,
that may need to switch between them.

```bash
npm -i llaminate
```

```typescript
import { Llaminate } from "llaminate";
```

## Basic usage

```typescript
const llaminate = new Llaminate({
  endpoint: Llaminate.MISTRAL,
  key: "12345-abcde-67890-fghij-klm",
  model: "mistral-small-latest",
  rpm: 720 // requests per minute (rater limiter)
});

const completion = await llaminate.complete("Hello, AI!");
console.log(completion.message);
```

Streaming is made easy:

```typescript
const stream = await llaminate.stream(
  "How much wood would a woodchuck chuck if a woodchuck could chuck wood?"
);

for await (const sum of stream) {
  console.log(sum);
}
```

Llaminate is current an alpha release, but it is tested against:

* `Llaminate.ANTHROPIC`
* `Llaminate.DEEPSEEK`
* `Llaminate.GOOGLE`
* `Llaminate.MISTRAL`
* `Llaminate.OPENAI`

(Or you can use the URL to your provider.)

## More features

Llaminate can handle tools, chat history, structured output, images and documents,
tracking your usage, and more:

```typescript
const system = ["You are a sarcastic assistant who answers very briefly and bluntly."];

const attachments = [{
  type: Llaminate.JPEG,
  url: "https://live.staticflickr.com/7194/6964010157_9af8648f53.jpg"
}];

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

const snarky = await mistral.complete("What do you see in this image?", {
  system, attachments, schema
});

console.log(snarky.message.reply);
console.log(snarky.message.thoughts);
console.log(snarky.tokens.total);
```

## Documentation

Full [documentation is available](https://oliver-moran.github.io/llaminate/) on
the GitHub pages website for the probject.

---

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file
for details.