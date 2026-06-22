const express = require("express");
const crypto = require("node:crypto");
const { createClient } = require("redis");
const {
    createPost,
    getPost,
    searchPosts,
    deletePost,
    patchPost,
    updatePost,
} = require("./src/stores/sqlitePostStore")

const app = express();
const PORT = 3000;
const SESSION_TTL_SECONDS = 60 * 30;
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
let cache = null;

app.use(express.json());
app.use(express.static("public"));

async function connectRedis() {
    const client = createClient({
        url: REDIS_URL,
        socket: {
            connectTimeout: 1000,
            reconnectStrategy: false,
        },
    });

    client.on("error", (err) => {
        console.error("Redis client error:", err);
    });

    try {
        await client.connect();
        console.log("Redis connected.");
        return client;
    } catch (err) {
        console.warn("Redis unavailable — continuing without cache.");
        console.warn(err.message);
        return null;
    }
}

// guard middleware that looks up the session
async function requireSession(req, res, next) {
    try {
        if (!cache) {
            return res.status(503).json({
                error: "Redis unavailable",
            });
        }

        const token = readBearerToken(req);

        // 401 status means "Unauthorized" and is used when authentication is required and has failed or has not yet been provided.
        if (!token) {
            return res.status(401).json({
                error: "Missing token",
            });
        }

        const sessionKey = `session:${token}`;
        const session = await cache.hGetAll(sessionKey);

        if (Object.keys(session).length === 0) {
            return res.status(401).json({
                error: "Invalid or expired token",
            });
        }

        await cache.expire(sessionKey, SESSION_TTL_SECONDS);
        req.session = session;

        next();
    } catch (err) {
        next(err);
    }
}
//guard middleware that reads the token
async function createSession(username) {
    const token = crypto.randomUUID();
    const sessionKey = `session:${token}`;
    const now = new Date().toISOString();

    await cache.hSet(sessionKey, {
        username,
        token,
        createdAt: now,
    });

    await cache.expire(sessionKey, SESSION_TTL_SECONDS);

    return token;
}

function readBearerToken(req) {
    const authorization = req.headers.authorization;

    if (typeof authorization !== "string") {
        return null;
    }

    if (!authorization.startsWith("Bearer ")) {
        return null;
    }

    const token = authorization.slice("Bearer ".length).trim();

    if (token === "") {
        return null;
    }

    return token;
}


app.get("/posts", (req, res) => {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);

    // term is a search term that should be matched against the title and content of the post
    // sort is the field to sort by (title, createdAt, etc.)
    // order is the sort order (asc or desc)
    const posts = searchPosts(
        req.query.term,
        page,
        limit,
        req.query.sort,
        req.query.order
    );

    res.json(posts);
});

app.post("/login", async (req, res, next) => {
    try {
        if (!cache) {
            return res.status(503).json({
                error: "Redis unavailable",
            });
        }

        const username = req.body.username;

        if (typeof username !== "string" || username.trim() === "") {
            return res.status(400).json({
                error: "username is required",
            });
        }

        const token = await createSession(username.trim());

        res.status(201).json({
            token,
        });
    } catch (err) {
        next(err);
    }
});

app.post("/posts", requireSession, (req, res) => {
    const errors = validatePost(req.body);

    if (errors.length > 0) {
        return res.status(400).json({ errors });
    }

    const post = createPost(req.body);

    res.status(201).json(post);
});



app.get("/posts/:id", (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(404).json({ error: "Post not found" });
    }

    const post = getPost(id);

    if (!post) {
        return res.status(404).json({ error: "Post not found" });
    }

    res.json(post);
});

app.delete("/posts/:id", requireSession,(req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(404).json({ error: "Post not found" });
    }

    const success = deletePost(id);

    if (!success)  {
        return res.status(404).json({ error: "Post not found" });
    }

    res.status(204).end();
});

app.patch("/posts/:id", requireSession, (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(404).json({ error: "Post not found" });
    }

    const errors = validatePatchPost(req.body);

    if (errors.length > 0) {
        return res.status(400).json({ errors });
    }

    const post = patchPost(id, req.body);

    if (!post) {
        return res.status(404).json({ error: "Post not found" });
    }

    res.json(post);
});

app.put("/posts/:id", requireSession, (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(404).json({ error: "Post not found" });
    }

    const errors = validatePost(req.body);

    if (errors.length > 0) {
        return res.status(400).json({ errors });
    }

    const post = updatePost(id, req.body);

    if (!post) {
        return res.status(404).json({ error: "Post not found" });
    }

    res.json(post);
});

app.use((req, res) => {
    res.status(404).json({ error: "Not found" });
});

app.use((err, req, res, next) => {
    console.error(err);

    if (err.type === "entity.parse.failed") {
        return res.status(400).json({ error: "Invalid JSON body" });
    }

    res.status(500).json({ error: "Server error" });
});

function validatePost(body) {
    const errors = [];

    if (typeof body.title !== "string" || body.title.trim() === "") {
        errors.push("title is required");
    }

    if (typeof body.content !== "string" || body.content.trim() === "") {
        errors.push("content is required");
    }

    if (typeof body.category !== "string" || body.category.trim() === "") {
        errors.push("category is required");
    }

    if (!Array.isArray(body.tags) || !body.tags.every(tag => typeof tag === "string")) {
        errors.push("tags must be an array of strings");
    }

    return errors;
}

function validatePatchPost(body) {
    const errors = [];

    if (Object.keys(body).length === 0) {
        errors.push("at least one field is required");
    }

    if ("title" in body && (typeof body.title !== "string" || body.title.trim() === "")) {
        errors.push("title must be a non-empty string");
    }

    if ("content" in body && (typeof body.content !== "string" || body.content.trim() === "")) {
        errors.push("content must be a non-empty string");
    }

    if ("category" in body && (typeof body.category !== "string" || body.category.trim() === "")) {
        errors.push("category must be a non-empty string");
    }

    if ("tags" in body && (!Array.isArray(body.tags) || !body.tags.every(tag => typeof tag === "string"))) {
        errors.push("tags must be an array of strings");
    }

    return errors;
}

async function startServer() {
    cache = await connectRedis();

    app.listen(3000, () => {
        console.log("Blog API running on http://localhost:3000");
    });
}

startServer();