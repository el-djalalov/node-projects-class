const test = require("node:test");
const assert = require("node:assert/strict");

const {
    installMockPostStore,
} = require("../helpers/mockPostStore");

installMockPostStore();

const {
    validatePost,
    validatePatchPost,
} = require("../../app");

test("validatePost accepts a valid post", () => {
    const errors = validatePost({
        title: "Hello",
        content: "Post body",
        category: "backend",
        tags: ["node", "redis"],
    });

    assert.deepStrictEqual(errors, []);
});

test("validatePost rejects missing required fields", () => {
    const errors = validatePost({});

    assert.deepStrictEqual(errors, [
        "title is required",
        "content is required",
        "category is required",
        "tags must be an array of strings",
    ]);
});

test("validatePost rejects empty title/content/category", () => {
    const errors = validatePost({
        title: "",
        content: "   ",
        category: "",
        tags: [],
    });

    assert.deepStrictEqual(errors, [
        "title is required",
        "content is required",
        "category is required",
    ]);
});

test("validatePost rejects tags that are not an array of strings", () => {
    const errors = validatePost({
        title: "Hello",
        content: "Body",
        category: "backend",
        tags: ["node", 123],
    });

    assert.deepStrictEqual(errors, [
        "tags must be an array of strings",
    ]);
});

test("validatePatchPost rejects empty patch body", () => {
    const errors = validatePatchPost({});

    assert.deepStrictEqual(errors, [
        "at least one field is required",
    ]);
});

test("validatePatchPost accepts partial valid update", () => {
    const errors = validatePatchPost({
        title: "Updated title",
    });

    assert.deepStrictEqual(errors, []);
});
