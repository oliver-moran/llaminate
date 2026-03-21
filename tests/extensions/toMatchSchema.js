const Ajv = require("ajv");

function toMatchSchema(json, schema) {
    const obj = JSON.parse(json);
    const ajv = new Ajv();
    const validate = ajv.compile(schema);

    return {
        message: () => `expected ${this.utils.printReceived(json)} to match schema ${this.utils.printExpected(schema)}`,
        pass: validate(obj),
    };
}

function toBeGreaterThan(received, floor) {
    return {
        message: () => `expected ${this.utils.printReceived(received)} to be greater than ${floor}`,
        pass: received > floor,
    };
}

expect.extend({ toMatchSchema, toBeGreaterThan });