const { Llaminate, llaminate, config, tools, schema } = require("./common/setup.js");
const { matchReply, matchToolReply, matchSchemaReply } = require("./common/matches.js");

describe("Streaming", () => {
    beforeEach(() => { llaminate.clear(); });
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
                // The final chunk may contain special end characters, so we
                // remove those before comparing to the previous chunk.
                const clean = chunks[i - 1].message.replace(/[\x1E\x04]+$/, "");

                // Each chunk's message should contain the previous chunk's message
                expect(chunks[i].message).toContain(clean);
                // All chunks should have the same UUID
                expect(chunks[i].uuid).toBe(chunks[0].uuid);
            }

            if (i == chunks.length - 2) {
                // The second to last chunk should contain the final message
                // with special characters.
                expect(chunks[i].message).toMatch(/.+(\x1E\x04)$/);
            }

            if (i < chunks.length - 1) {
                expect(chunks[i].delta).not.toBeNull();
                expect(chunks[i].message.endsWith(chunks[i].delta)).toBeTruthy();
                expect(chunks[i].delta).toMatch(/.*/);
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

    test("given a schema, replies with a stream and uses that schema", async () => {
        llaminate.clear();
        const stream = await llaminate.stream("How many bicycles are there in Beijing?", { schema });

        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);

        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks[chunks.length - 1]).toMatchObject(matchSchemaReply(schema));
    });

    test("given a schema, a tool and a relevant question, uses the tool and replies with a stream adhering to the schema", async () => {
        const stream = await llaminate.stream("What time is it? Use the get_current_time to get the current time.", { schema, tools });

        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);

        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks[chunks.length - 1]).toMatchObject(matchToolReply(tools[0].function.name));
    });

});
