const test = require("node:test");
const assert = require("node:assert/strict");

const {
    parseWorkersFlag,
} = require("../../src/config/workerCount");

test("parseWorkersFlag returns null when the flag is absent", () => {
    assert.equal(parseWorkersFlag([]), null);
});

test("parseWorkersFlag reads --workers with a separate value", () => {
    assert.equal(parseWorkersFlag(["--workers", "4"]), 4);
});

test("parseWorkersFlag reads --workers=value", () => {
    assert.equal(parseWorkersFlag(["--workers=8"]), 8);
});

test("parseWorkersFlag rejects invalid values", () => {
    assert.throws(() => parseWorkersFlag(["--workers", "0"]), /positive integer/);
});
