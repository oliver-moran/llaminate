const { Llaminate, llaminate, config, tools, schema } = require("./common/setup.js");
const { matchReply, matchToolReply, matchSchemaReply } = require("./common/matches.js");

describe("Streaming", () => {
    beforeAll(() => { llaminate.clear(); });
    afterAll(() => { llaminate.clear(); });

    test("given a question, replies with a stream", async () => {
        const stream = await llaminate.stream("What's the capital of France?");

        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);

        for (let i = 0; i < chunks.length; i++) {
            expect(chunks[i]).toMatchObject({
                message: expect.anything(String),
                uuid: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
            });

            if (i > 0) {
                // Each chunk's message should contain the previous chunk's message
                expect(chunks[i].message).toContain(chunks[i - 1].message);
                // All chunks should have the same UUID
                expect(chunks[i].uuid).toBe(chunks[0].uuid);
            }

            if (i < chunks.length - 1) {
                expect(chunks[i].result).toBeNull();
                expect(chunks[i].tokens).toBeNull();
            } else {
                expect(chunks[i]).toMatchObject(matchReply());
            }
        }
    });

    test("given a tool and a relevant question, replies with a stream and uses the tool", async () => {
        const stream = await llaminate.stream("What time is it?", { tools });

        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);

        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks[chunks.length - 1]).toMatchObject(matchToolReply(tools[0].function.name));
    });

    test("given a schema, replies with a stream and use that schema", async () => {
        const stream = await llaminate.stream("How many bicycles are there in Beijing?", { schema });

        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);

        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks[chunks.length - 1]).toMatchObject(matchSchemaReply(schema));
    });

});
