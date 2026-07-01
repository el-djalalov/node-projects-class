const test = require("node:test");
const assert = require("node:assert/strict");

const {
    installMockPostStore,
} = require("../helpers/mockPostStore");

installMockPostStore();

const {
    shapePopularPosts,
} = require("../../app");

test("shapePopularPosts attaches views to existing posts", () => {
    const redisResults = [
        { value: "2", score: 10 },
        { value: "1", score: 5 },
    ];

    function fakeGetPost(id) {
        const posts = {
            1: {
                id: 1,
                title: "First",
                content: "Hello",
                category: "backend",
                tags: ["node"],
            },
            2: {
                id: 2,
                title: "Second",
                content: "World",
                category: "redis",
                tags: ["cache"],
            },
        };

        return posts[id] || null;
    }

    const shaped = shapePopularPosts(redisResults, fakeGetPost);

    assert.deepStrictEqual(shaped, [
        {
            id: 2,
            title: "Second",
            content: "World",
            category: "redis",
            tags: ["cache"],
            views: 10,
        },
        {
            id: 1,
            title: "First",
            content: "Hello",
            category: "backend",
            tags: ["node"],
            views: 5,
        },
    ]);
});

test("shapePopularPosts skips deleted/missing posts", () => {
    const redisResults = [
        { value: "999", score: 100 },
        { value: "1", score: 3 },
    ];

    function fakeGetPost(id) {
        if (id === 1) {
            return {
                id: 1,
                title: "Existing",
                content: "Still here",
                category: "backend",
                tags: [],
            };
        }

        return null;
    }

    const shaped = shapePopularPosts(redisResults, fakeGetPost);

    assert.deepStrictEqual(shaped, [
        {
            id: 1,
            title: "Existing",
            content: "Still here",
            category: "backend",
            tags: [],
            views: 3,
        },
    ]);
});
