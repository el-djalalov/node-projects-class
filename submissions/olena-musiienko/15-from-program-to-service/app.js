const crypto = require("node:crypto");
const express = require("express");
const {
    JOBS_QUEUE,
    POSTS_NEW_CHANNEL,
} = require("./src/config/redisNames");

const {
    createPost,
    getPost,
    searchPosts,
    deletePost,
    patchPost,
    updatePost,
} = require("./src/stores/sqlitePostStore");

const SESSION_TTL_SECONDS = 60 * 30;

// Check if Redis is reachable by verifying that the cache object exists and is open
function isRedisReachable(cache) {
    return Boolean(cache && cache.isOpen !== false);
}

function isEmptySession(session) {
    return !session || Object.keys(session).length === 0;
}

function shapePopularPosts(results, getPostById) {
    const posts = [];

    for (const result of results) {
        const post = getPostById(Number(result.value));

        if (post) {
            posts.push({
                ...post,
                views: result.score,
            });
        }
    }

    return posts;
}

function createApp({ cache }) {
    const app = express();
    const livePostClients = new Set();

    app.use(express.json());

// Subscribe to the "posts:new" channel and broadcast events to connected clients
    function broadcastLivePostEvent(event) {
        // JSON string representation of the event object, which will be sent to clients.
        const payload = JSON.stringify(event);

        console.log(
            `Worker ${process.pid} broadcasting "${POSTS_NEW_CHANNEL}" to ${livePostClients.size} live clients`
        );
        for (const client of livePostClients) {
            client.write(`event: ${POSTS_NEW_CHANNEL}\n`);
            client.write(`data: ${payload}\n\n`);
        }
    }


// guard middleware that looks up the session
// here we check if the session exists in Redis and is valid, if not we return 401 Unauthorized
    async function requireSession(req, res, next) {
        try {
            // sessions fail closed: without Redis we cannot verify auth, so protected writes are blocked.
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
            // hGetAll() on a missing key returns {}, not null
            const session = await cache.hGetAll(sessionKey);

            if (isEmptySession(session)) {
                return res.status(401).json({
                    error: "Invalid or expired token",
                });
            }
            //refresh the session expiration time in Redis to keep the session alive as long as the user is active
            await cache.expire(sessionKey, SESSION_TTL_SECONDS);
            req.session = session;
            next();
        } catch (err) {
            // Sessions fail closed: Redis errors mean auth cannot be trusted.
            return res.status(503).json({
                error: "Redis unavailable",
            });
        }
    }

//guard middleware that reads the token
    async function createSession(username) {
        const token = crypto.randomUUID();
        const sessionKey = `session:${token}`;
        const now = new Date().toISOString();
        // here also can be stored userId, role
        await cache.hSet(sessionKey, {
            username,
            token,
            createdAt: now,
        });
        await cache.expire(sessionKey, SESSION_TTL_SECONDS);
        return token;
    }

    function readBearerToken(req) {
        // authorization is the standard HTTP header used for passing authentication credentials, and in this case,
        // we expect it to contain a Bearer token which is a common way to transmit access tokens.

        // Missing or garbled Authorization headers are treated as unauthenticated, not server errors.
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

//Redis sorted set
    async function bumpPostViews(postId) {
        if (!cache) {
            console.log("Views not counted: Redis unavailable");
            return;
        }
        try {
            const allTimeViewsKey = "post:views";
            const dailyViewsKey = getViewsKeyForToday();

            // zIncrBy is a Redis command that increments the score of a member in a sorted set.
            // In this case, we are incrementing the view count for a specific postId in the allTimeViewsKey and dailyViewsKey in sorted set by 1.

            const allTimeViews = await cache.zIncrBy(allTimeViewsKey, 1, String(postId));
            const dailyViews = await cache.zIncrBy(dailyViewsKey, 1, String(postId));

            console.log(
                `POST VIEW postId=${postId}, allTimeViews=${allTimeViews}, dailyViews=${dailyViews}`
            );

        } catch (err) {
            console.log(`Views not counted: Redis error: ${err.message}`);
        }
    }

//Per-post popularity over time - key the view counter by day
    function getViewsKeyForToday() {
        const today = new Date().toISOString().slice(0, 10);
        return `post:views:${today}`;
    }

// On POST /posts, push a “notify” job onto a list in Redis.
    async function enqueueNotifyJob(post) {
        if (!cache) {
            console.log("Job not queued: Redis unavailable");
            return;
        }

        const job = {
            type: "notify",
            postId: post.id,
            title: post.title,
            createdAt: new Date().toISOString(),
            // for Job retries
            attempts: 0,
        };
        //checking that rPush  will not throw an err
        try {
            // rPush is a Redis command that appends one or multiple values to the end of a list.
            // In this case, we are adding the job object (converted to a JSON string) to the "jobs" list in Redis.
            await cache.rPush(JOBS_QUEUE, JSON.stringify(job));
            console.log(`JOB queued queue=${JOBS_QUEUE} type=notify postId=${post.id}`);
        } catch (err) {
            console.log(`Job not queued: Redis error: ${err.message}`);
        }
    }

// On POST /posts, publish a “new post” message on a channel
    async function publishNewPostEvent(post) {
        if (!cache) {
            console.log("Live event not published: Redis unavailable");
            return;
        }

        const event = {
            type: POSTS_NEW_CHANNEL,
            postId: post.id,
            title: post.title,
            createdAt: new Date().toISOString(),
        };

        try {
            await cache.publish(POSTS_NEW_CHANNEL, JSON.stringify(event));
            console.log(`EVENT published type=${POSTS_NEW_CHANNEL} postId=${post.id}`);
        } catch (err) {
            console.log(`Live event not published: Redis error: ${err.message}`);
        }
    }

    // Log which worker handled each request
    app.use((req, res, next) => {
        console.log(`Web worker ${process.pid} handled ${req.method} ${req.url}`);
        res.setHeader("X-Worker-Pid", String(process.pid));
        next();
    });

    app.get("/health", (req, res) => {
        res.json({
            ok: true,
            pid: process.pid,
            redisReachable: isRedisReachable(cache),
        });
    });

    app.post("/admin/reload", (req, res) => {
        if (typeof process.send !== "function") {
            return res.status(503).json({
                error: "Reload is only available inside a clustered worker",
            });
        }

        process.send({
            type: "reload_request",
            pid: process.pid,
        });

        res.status(202).json({
            ok: true,
            message: "Rolling reload requested",
        });
    });


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

//SSE endpoint for live post events
    app.get("/events/posts", (req, res) => {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        res.write("event: connected\n");
        res.write(
            `data: ${JSON.stringify({
                message: "Connected to live post events",
                pid: process.pid,
            })}\n\n`
        );

        // Add the response object to the set of connected clients
        // in SSE endoint does not close response, keep it open to write down event in it
        livePostClients.add(res);

        console.log(
            `Worker ${process.pid}: live dashboard connected. clients=${livePostClients.size}`
        );

        // When the client disconnects, remove it from the set of connected clients
        req.on("close", () => {
            livePostClients.delete(res);

            console.log(
                `Worker ${process.pid}: live dashboard disconnected. clients=${livePostClients.size}`
            );
        });
    });

    app.get("/posts/popular", async (req, res, next) => {
        try {
            // Popular list fails open: it is optional ranking data, so if Redis is unavailable, we can still return an empty list instead of failing the request.
            if (!cache) {
                return res.json([]);
            }
            // limit is the maximum number of popular posts to retrieve, with a default of 10 and a maximum of 100.
            // safe 1 - if Number(req.query.limit)  is < 0
            const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);

            // zRangeWithScores is a Redis command that retrieves a range of members from a sorted set along with their scores.
            // In this case, we are retrieving the top 'limit' posts from the "post:views" sorted set, ordered by score in descending order (most viewed first).
            // start index - 0, end index - limit - 1,  REV: true - reverse order
            // the result is smth like that:
            //[
            //     { value: "3", score: 10 },
            //     { value: "1", score: 5 },
            //     { value: "2", score: 1 },
            // ]

            let results;

            try {
                results = await cache.zRangeWithScores("post:views", 0, limit - 1, {
                    REV: true,
                });
            } catch (err) {
                console.log(`Popular list skipped: Redis error: ${err.message}`);
                return res.json([]);
            }

            const posts = shapePopularPosts(results, getPost);

            res.json(posts);
        } catch (err) {
            next(err);
        }
    });

    app.get("/posts/popular/today", async (req, res, next) => {
        try {
            // Daily popular list fails open: daily rankings are optional analytics, so Redis problems return an empty list.
            if (!cache) {
                return res.json([]);
            }

            const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
            const viewsKey = getViewsKeyForToday();

            let results;

            try {
                results = await cache.zRangeWithScores(viewsKey, 0, limit - 1, {
                    REV: true,
                });
            } catch (err) {
                console.log(`Daily popular list skipped: Redis error: ${err.message}`);
                return res.json([]);
            }

            const posts = shapePopularPosts(results, getPost);

            res.json(posts);
        } catch (err) {
            next(err);
        }
    });


    app.post("/login", async (req, res) => {
        try {
            // Sessions fail closed: without Redis we cannot create a login session.
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
            // Sessions fail closed: login cannot succeed if session storage fails.
            return res.status(503).json({
                error: "Redis unavailable",
            });
        }
    });

    app.post("/posts", requireSession, async (req, res, next) => {
        try {
            const errors = validatePost(req.body);

            if (errors.length > 0) {
                return res.status(400).json({ errors });
            }

            // doing the important work sync
            const post = createPost(req.body);

            // this can be some async work, like sending email, push notification, generate summaries, log analytics,
            //call another API. so that we don't want to block the response
            //The route should not do slow work inline.
            await enqueueNotifyJob(post);
            await publishNewPostEvent(post);

            res.status(201).json(post);
        } catch (err) {
            next(err);
        }
    });


    app.get("/posts/:id", async (req, res, next) => {
        try {
            const id = Number(req.params.id);

            if (!Number.isInteger(id)) {
                return res.status(404).json({ error: "Post not found" });
            }

            const post = getPost(id);

            if (!post) {
                return res.status(404).json({ error: "Post not found" });
            }

            await bumpPostViews(id);

            res.json(post);
        } catch (err) {
            next(err);
        }
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

    app.delete("/posts/:id", requireSession, (req, res) => {
        const id = Number(req.params.id);

        if (!Number.isInteger(id)) {
            return res.status(404).json({ error: "Post not found" });
        }

        const success = deletePost(id);

        if (!success) {
            return res.status(404).json({ error: "Post not found" });
        }

        res.status(204).end();
    });


    app.use((req, res) => {
        res.status(404).json({ error: "Not found" });
    });

    app.use((err, req, res, next) => {
        console.error(err);

        if (err.type === "entity.parse.failed") {
            return res.status(400).json({ error: "Invalid JSON body" });
        }

        if (
            err.code === "SQLITE_BUSY" ||
            err.message?.includes("SQLITE_BUSY") ||
            err.message?.includes("database is locked")
        ) {
            return res.status(503).json({
                error: "Database is busy, retry later",
            });
        }

        res.status(500).json({ error: "Server error" });
    });

    return {
        app,
        broadcastLivePostEvent,
    };
}


function validatePost(body) {
    const errors = [];

    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return ["body must be a JSON object"];
    }

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

    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return ["body must be a JSON object"];
    }

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

module.exports = {
    createApp,
    POSTS_NEW_CHANNEL,
    validatePost,
    validatePatchPost,
    isEmptySession,
    shapePopularPosts,
};