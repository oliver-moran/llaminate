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

expect.extend({toMatchSchema});