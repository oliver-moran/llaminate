const { Llaminate, llaminate, config, tools, schema } = require("./common/setup.js");

const system = ["Reply in a traditional haiku format."];

const messages = [
    { role: "user", content: "If clouds were made of candy, what flavor would they be?" },
    { role: "assistant", content: "Cotton candy. Obviously." },
    { role: "user", content: "What about rain?" },
    { role: "assistant", content: "Lemon. Duh." },
    { role: "user", content: "And snowflakes?" },
    { role: "assistant", content: "Vanilla. What else?" },
    { role: "user", content: "What if the moon was made of cheese?" },
    { role: "assistant", content: "Cheddar. Maybe brie. Happy?" },
    { role: "user", content: "Would stars be edible too?" },
    { role: "assistant", content: "Popping candy. Next." },
    { role: "user", content: "What would the sun taste like?" },
    { role: "assistant", content: "Cinnamon. Spicy." },
    { role: "user", content: "If the ocean was a drink, what would it be?" },
    { role: "assistant", content: "Blue slushie. Salty." },
    { role: "user", content: "What about the wind?" },
    { role: "assistant", content: "Mint. Refreshing." },
    { role: "user", content: "If mountains were desserts, what would they be?" },
    { role: "assistant", content: "Chocolate cake. Tall." },
    { role: "user", content: "What about the stars again?" }
];

describe("History", () => {

    beforeAll(() => { llaminate.clear(); });
    afterAll(() => { llaminate.clear(); });

    test("given an initial state, the history is correct", async () => {
        const history = await llaminate.export();
        await expect(history.length).toBe(1);
        await expect(history[0]).toMatchObject({
            role: "system",
            content: llaminate.config.system[0]
        });
    });

    test("given a prompt, the history expands", async () => {
        const message = "What does the fox say?";
        await llaminate.complete(message);
        const history = await llaminate.export();
        await expect(history.length).toBe(3);
        await expect(history[0]).toMatchObject({
            role: "system",
            content: llaminate.config.system[0]
        });
        await expect(history[1]).toMatchObject({
            role: "user",
            content: message
        });
        await expect(history[2]).toMatchObject({
            role: "assistant",
            content: expect.stringMatching(/.+/)
        });
    });

    test("given a series of messages, the history is correct", async () => {
        await llaminate.complete(messages, { system });

        const history = await llaminate.export();
        await expect(history.length).toBe(messages.length + 2); // + 2 for system message and assistant's final reply

        await expect(history[0]).toMatchObject({ role: "system", content: llaminate.config.system[0] });
        for (let i = 1; i < messages.length; i++) {
            await expect(history[i + 1]).toMatchObject(messages[i]);
        }
        await expect(history[history.length - 1]).toMatchObject({
            role: "assistant",
            content: expect.stringMatching(/.+/)
        });
    });

    test("when history is cleared, the history is correct", async () => {
        await llaminate.clear();
        const history = await llaminate.export();
        await expect(history.length).toBe(1);
        await expect(history[0]).toMatchObject({
            role: "system",
            content: llaminate.config.system[0]
        });
    });

});
