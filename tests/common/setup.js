require('../extensions/toMatchSchema.js');

const Llaminate = require("../../dist/Llaminate.min.js").Llaminate;

const config = {
    endpoint: process.env.LLM_ENDPOINT,
    key: process.env.LLM_API_KEY,
    model: process.env.LLM_MODEL,
    system: ["You are a sarcastic assistant who answers very briefly and bluntly."],
};

const tools = [
  {
    function: {
      name: "get_current_time",
      description: "Returns the current time in ISO format.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    },
    execute: async () => {
      return new Date().toISOString();
    }
  }
];

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

const llaminate = new Llaminate({ ...config, tools, fetch });

module.exports = { llaminate, config, tools, schema };