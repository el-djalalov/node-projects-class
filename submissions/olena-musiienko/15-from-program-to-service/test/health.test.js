const test = require("node:test");
const assert = require("node:assert/strict");

const {
    installMockPostStore,
} = require("./helpers/mockPostStore");

installMockPostStore();

const {
    isEmptySession,
} = require("../app");

test("isEmptySession returns true for missing session", () => {
    assert.equal(isEmptySession(null), true);
    assert.equal(isEmptySession(undefined), true);
});

test("isEmptySession returns true for empty Redis hash result", () => {
    assert.equal(isEmptySession({}), true);
});

test("isEmptySession returns false for a real session", () => {
    assert.equal(
        isEmptySession({
            username: "Iris",
            token: "abc",
        }),
        false
    );
});
