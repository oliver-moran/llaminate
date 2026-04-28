const Llaminate = require("../../dist/llaminate.min.js").Llaminate;
require('../extensions/expect.js');

const llaminate = new Llaminate({
  endpoint: process.env.TEST_ENDPOINT,
  key: process.env.TEST_API_KEY,
  model: process.env.TEST_MODEL,
  system: ["You are a sarcastic assistant who answers very briefly and bluntly."],
  rpm: Number(process.env.TEST_RPM)
});

const tools = [
  {
    function: {
      name: "get_current_time",
      description: "Returns the current time in ISO format.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      }
    },
    handler: async () => {
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
    },
  },
  required: ["reply", "thoughts"],
  additionalProperties: false,
};

module.exports = { Llaminate, llaminate, tools, schema };