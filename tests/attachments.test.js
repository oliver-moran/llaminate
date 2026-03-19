const { Llaminate, llaminate, config, tools, schema } = require("./common/setup.js");
const { matchReply, matchToolReply, matchSchemaReply } = require("./common/matches.js");
const { zx } = require("./common/base64.js");

const images = [{
    type: Llaminate.IMAGE,
    url: "https://upload.wikimedia.org/wikipedia/commons/a/ae/Alan_Turing_%281912-1954%29_at_Princeton_University_in_1936.jpg"
}];

const documents = [{
    type: Llaminate.DOCUMENT,
    url: "https://treaties.un.org/doc/publication/ctc/uncharter.pdf"
}];

const base64 = [{
    type: Llaminate.IMAGE,
    url: "data:image/jpeg;base64," + zx
}];

describe("Attachments", () => {

    beforeAll(() => { llaminate.clear(); });
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
        await expect(llaminate.complete("What is in this image?", { attachments: base64 }))
            .resolves.toMatchObject(matchReply());
    });

});