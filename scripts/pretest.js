const fs = require("fs");
const dotenvx = require('@dotenvx/dotenvx');
dotenvx.config();

const jestConfig = {
    displayName: process.env.TEST_ENDPOINT,
    "silent": true,
    "setupFiles": ["@dotenvx/dotenvx/config"],
    "testTimeout": 3600000,
    "openHandlesTimeout": 3600000,
    "passWithNoTests": true
};

fs.writeFileSync("./tests/jest.config.json", JSON.stringify(jestConfig, null, 2));