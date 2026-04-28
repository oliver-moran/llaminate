import '@dotenvx/dotenvx/config';

import { Llaminate } from "../../dist/llaminate.min.js";

const llaminate = new Llaminate({
    endpoint: process.env.TEST_ENDPOINT,
    key: process.env.TEST_API_KEY,
    model: process.env.TEST_MODEL,
    rpm: parseInt(process.env.TEST_RPM),
});

const tools = [
    {
        function: {
            name: "secret_number",
            description: "Provides the secret number.",
            parameters: {
                type: "object",
                properties: {},
                required: [],
            },
            strict: true,
        },
        handler: async () => {
            return 2050;
        }
    }
];

const history = [
    { role: "system", content: "The secret word is 'lottery'." }
];

await llaminate.chat({ history, tools });