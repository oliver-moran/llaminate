const { Llaminate, llaminate, config, tools, schema } = require("./common/setup.js");
const { matchReply, matchToolReply, matchSchemaReply } = require("./common/matches.js");

describe("Completion", () => {

    beforeAll(() => { llaminate.clear(); });
    afterAll(() => { llaminate.clear(); });

    test("given a question, replies with an answer", async () => {
        await expect(llaminate.complete("What's the capital of France?"))
            .resolves.toMatchObject(matchReply());
    });

    test("given a tool and a relevant question, replies using the tool", async () => {
        await expect(llaminate.complete("What time is it?", { tools } ))
            .resolves.toMatchObject(matchToolReply(tools[0].function.name));
    });

    test("given a schema, replies using that schema", async () => {
        await expect(llaminate.complete("How many bicycles are there in Beijing?", { schema }))
            .resolves.toMatchObject(matchSchemaReply(schema));
    });

    beforeAll(() => { llaminate.clear(); });
    afterAll(() => { llaminate.clear(); });

});