const test = require("node:test");
const assert = require("node:assert/strict");

const {
    installMockPostStore,
} = require("../helpers/mockPostStore");

const postStore = installMockPostStore();

const { createApp } = require("../../app");

function createFakeCache() {
    const hashes = new Map();
    const lists = new Map();
    const published = [];

    return {
        async hSet(key, value) {
            hashes.set(key, { ...value });
        },

        async hGetAll(key) {
            return hashes.get(key) || {};
        },

        async expire() {
            return true;
        },

        async rPush(key, value) {
            const list = lists.get(key) || [];
            list.push(value);
            lists.set(key, list);
            return list.length;
        },

        async publish(channel, message) {
            published.push({ channel, message });
            return 1;
        },

        async zIncrBy() {
            return 1;
        },

        async zRangeWithScores() {
            return [];
        },

        _lists: lists,
        _published: published,
    };
}

async function startTestServer() {
    postStore.reset();

    const cache = createFakeCache();
    const { app } = createApp({ cache });

    const server = app.listen(0);

    await new Promise((resolve) => {
        server.once("listening", resolve);
    });

    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    return {
        cache,
        baseUrl,
        async close() {
            await new Promise((resolve, reject) => {
                server.close((err) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    resolve();
                });
            });
        },
    };
}

test("GET /health returns ok and pid", async (t) => {
    const server = await startTestServer();

    t.after(async () => {
        await server.close();
    });

    const response = await fetch(`${server.baseUrl}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(typeof body.pid, "number");
});

test("POST /posts returns 401 when token is missing", async (t) => {
    const server = await startTestServer();

    t.after(async () => {
        await server.close();
    });

    const response = await fetch(`${server.baseUrl}/posts`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            title: "No token",
            content: "Should fail",
            category: "backend",
            tags: ["auth"],
        }),
    });

    const body = await response.json();

    assert.equal(response.status, 401);
    assert.deepStrictEqual(body, {
        error: "Missing token",
    });
});

test("POST /login returns a token", async (t) => {
    const server = await startTestServer();

    t.after(async () => {
        await server.close();
    });

    const response = await fetch(`${server.baseUrl}/login`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            username: "Iris",
        }),
    });

    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(typeof body.token, "string");
    assert.ok(body.token.length > 0);
});

test("POST /posts with token creates a post and queues a job", async (t) => {
    const server = await startTestServer();

    t.after(async () => {
        await server.close();
    });

    const loginResponse = await fetch(`${server.baseUrl}/login`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            username: "Iris",
        }),
    });

    const loginBody = await loginResponse.json();

    const postResponse = await fetch(`${server.baseUrl}/posts`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${loginBody.token}`,
        },
        body: JSON.stringify({
            title: "Integration test post",
            content: "Hello from node:test",
            category: "backend",
            tags: ["node", "test"],
        }),
    });

    const postBody = await postResponse.json();

    assert.equal(postResponse.status, 201);
    assert.equal(postBody.title, "Integration test post");

    const jobs = server.cache._lists.get("jobs");

    assert.equal(jobs.length, 1);

    const job = JSON.parse(jobs[0]);

    assert.equal(job.type, "notify");
    assert.equal(job.postId, postBody.id);
    assert.equal(job.title, "Integration test post");
});

test("POST /posts rejects invalid post body", async (t) => {
    const server = await startTestServer();

    t.after(async () => {
        await server.close();
    });

    const loginResponse = await fetch(`${server.baseUrl}/login`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            username: "Iris",
        }),
    });

    const loginBody = await loginResponse.json();

    const response = await fetch(`${server.baseUrl}/posts`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${loginBody.token}`,
        },
        body: JSON.stringify({
            title: "",
            content: "",
            category: "",
            tags: "not-array",
        }),
    });

    const body = await response.json();

    assert.equal(response.status, 400);
    assert.deepStrictEqual(body.errors, [
        "title is required",
        "content is required",
        "category is required",
        "tags must be an array of strings",
    ]);
});

test("POST /admin/reload returns 503 outside a clustered worker", async (t) => {
    const server = await startTestServer();

    t.after(async () => {
        await server.close();
    });

    const response = await fetch(`${server.baseUrl}/admin/reload`, {
        method: "POST",
    });

    const body = await response.json();

    assert.equal(response.status, 503);
    assert.deepStrictEqual(body, {
        error: "Reload is only available inside a clustered worker",
    });
});
