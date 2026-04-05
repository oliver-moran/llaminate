const { Llaminate, llaminate, config, tools, schema } = require("./common/setup.js");
const { matchReply, matchToolReply, matchSchemaReply } = require("./common/matches.js");
const { zx, cc } = require("./common/base64.js");

// NASA
// Blue Marble image from Apollo 17, taken by the crew on December 7, 1972
// https://www.nasa.gov/image-article/earth-full-view-from-apollo-17/
const images = [{
    mime: Llaminate.JPEG,
    url: "https://www.nasa.gov/wp-content/uploads/2023/03/115334main_image_feature_329_ys_full.jpg"
}];

// United Nations
// The UN Charter, signed on June 26, 1945
// https://treaties.un.org/doc/publication/ctc/uncharter.pdf
const documents = [{
    mime: Llaminate.PDF,
    url: "https://treaties.un.org/doc/publication/ctc/uncharter.pdf"
}];

const base64_images = [{
    mime: Llaminate.JPEG,
    url: `data:${Llaminate.JPEG};base64,${zx}`
}];

const base64_documents = [{
    mime: Llaminate.PDF,
    url: `data:${Llaminate.PDF};base64,${cc}`,
}];

const attachment_tools = [{
    function: {
        name: "get_an_image",
        description: "Returns an image.",
        parameters: {
            type: "object",
            properties: {},
            required: [],
        }
    },
    handler: async () => {
      return {
        "title": "Blue Marble",
        "@attachments": images,
      };
    }
}];

describe.maybe = (title, fn) => {
    // DeepSeek API doesn't support images or documents
    if (llaminate.config.endpoint.startsWith(Llaminate.DEEPSEEK)) return describe.skip(title, fn);
    // Anthropic's rate limits are too limited to allow automated file testing
    if (llaminate.config.endpoint.startsWith(Llaminate.ANTHROPIC)) return describe.skip(title, fn);

    else return describe(title, fn);
}

describe.maybe("Attachments", () => {

    beforeEach(() => { llaminate.clear(); });
    afterAll(() => { llaminate.clear(); });

    test("given an image, replies with a description", async () => {
        await expect(llaminate.complete("What is in this image?", { attachments: images }))
            .resolves.toMatchObject(matchReply());
    });

    test("given a document, replies with a summary", async () => {
        await expect(llaminate.complete("What is in this document?", { attachments: documents }))
            .resolves.toMatchObject(matchReply());
    });

    test("given a base64 image, replies with a description", async () => {
        await expect(llaminate.complete("What is in this image?", { attachments: base64_images }))
            .resolves.toMatchObject(matchReply());
    });

    test("given a base64 document, replies with a summary", async () => {
        await expect(llaminate.complete("What is in this document?", { attachments: base64_documents }))
            .resolves.toMatchObject(matchReply());
    });

    test("given a tool that returns an image, includes the image in the tool response", async () => {
        await llaminate.complete("Get an image and describe it.", { tools: attachment_tools });

        // The tool response should be the fourth message in the history:
        // 0: system,
        // 1: user,
        // 2: assistant,
        // 3: tool
        const history = await llaminate.export();
        const tool = history[3];

        expect(tool).toBeDefined();
        expect(tool.role).toBe(Llaminate.TOOL);
        expect(tool.content[1].type).toBe(Llaminate.ATTACHMENT);
        expect(tool.content[1].attachment).toMatchObject({
            mime: Llaminate.JPEG,
            url: expect.any(String),
        });
    });

});