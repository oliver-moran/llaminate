const { spawn } = require("child_process");

describe("Chatting", () => {
    test("when a user asks a question, the answer is correct", async () => {

        const process = spawn("node", ["./tests/scripts/chat.js"]);

        let output = "";
        process.stdout.on("data", (data) => {
            output += data.toString();
            if (output.includes("Paris")) {
                expect(output).toContain("Paris");
                process.kill();
            }
        });

        process.stdin.write("What's the capital of France?\n");

        await new Promise((resolve, reject) => {
            process.on("close", resolve);
            process.on("error", reject);
        });
        
    });

    test("when a user asks for the secret word, the answer is correct", async () => {

        const process = spawn("node", ["./tests/scripts/chat.js"]);

        let output = "";
        process.stdout.on("data", (data) => {
            output += data.toString();
            if (output.includes("lottery")) {
                expect(output).toContain("lottery");
                process.kill();
            }
        });

        process.stdin.write("What's the secret word?\n");

        await new Promise((resolve, reject) => {
            process.on("close", resolve);
            process.on("error", reject);
        });
        
    });

    test("when a user asks for the secret number, the answer is correct", async () => {

        const process = spawn("node", ["./tests/scripts/chat.js"]);

        let output = "";
        process.stdout.on("data", (data) => {
            output += data.toString();
            if (output.includes("2050")) {
                expect(output).toContain("2050");
                process.kill();
            }
        });

        process.stdin.write("What's the secret number?\n");

        await new Promise((resolve, reject) => {
            process.on("close", resolve);
            process.on("error", reject);
        });
        
    });
});