const { createClient } = require("redis");
const express = require("express");
const {
    createPost,
    getPost,
    searchPosts,
    deletePost,
    patchPost,
    updatePost,
} = require("./src/stores/sqlitePostStore")

const POST_CACHE_TTL_SECONDS = 300;
// we need ttl for serach coz  some reason may happen like:
// 1. SQLite was updated
// 2. The application dropped to Redis DEL
// 3. The search cache remained outdated
const SEARCH_CACHE_TTL_SECONDS = 30;
const RATE_LIMIT_MAX_REQUESTS = 5;
const RATE_LIMIT_WINDOW_SECONDS = 60;

const app = express();

app.use(express.json());
app.use(rateLimiter);

let cache = null;
let cacheHits = 0;
let cacheMisses = 0;

async function rateLimiter(req, res, next) {
    if (!cache) {
        // redis is not a source of truth
        return next();
    }

    const ip = req.ip;
    const key = `ratelimit:${ip}`;

    try {
        const count = await cache.incr(key);

        if (count === 1) {
            await cache.expire(key, RATE_LIMIT_WINDOW_SECONDS);
        }

        if (count > RATE_LIMIT_MAX_REQUESTS) {
            return res.status(429).json({ error: "Too many requests" });
        }

        return next();
    } catch {
        console.warn("Redis rate limiter failed — allowing request.");
        return next();
    }
}

// simulation that our db is slow
function sleep(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function recordCacheHit(key) {
    cacheHits += 1;
    console.log(`HIT ${key}`);
}

function recordCacheMiss(key) {
    cacheMisses += 1;
    console.log(`MISS ${key}`);
}

function printCacheStats() {
    const total = cacheHits + cacheMisses;
    const hitRate = total === 0 ? 0 : (cacheHits / total) * 100;

    console.log("\nCache stats:");
    console.log(`Hits: ${cacheHits}`);
    console.log(`Misses: ${cacheMisses}`);
    console.log(`Hit rate: ${hitRate.toFixed(2)}%`);
}

async function connectRedis() {
    const client = createClient({
        url: "redis://localhost:6379",
        //  to check with redis disconnect
        socket: {
            connectTimeout: 1000,
            reconnectStrategy: false,
        },
    });

    client.on("error", (err) => {
        console.warn("Redis error:", err.message);
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

async function getCachedPost(cache, key) {
    if (!cache) {
        console.warn("Redis unavailable — cache disabled.");
        return null;
    }

    try {
        const cached = await cache.get(key);

        if (cached === null) {
            return null;
        }

        return JSON.parse(cached);
    } catch (err) {
        //fallback to SQLite
        console.warn(`Redis read failed for ${key} — treating as cache MISS.`);
        console.error(err);
        return null;
    }
}

async function setCachedPost(cache, key, post, ttlSeconds = POST_CACHE_TTL_SECONDS) {
    if (!cache) {
        console.warn("Redis unavailable — skip cache SET.");
        return;
    }

    try {
        await cache.set(key, JSON.stringify(post), { EX: ttlSeconds  });
        console.log(`SET ${key}`);
    } catch (err) {
        console.warn(`Redis write failed for ${key} — response still served from SQLite.`);
        console.error(err);
    }
}

async function deleteCacheKey(cache, key) {
    if (!cache) {
        return;
    }

    try {
        // 0 - the key didnt exist , 1 - key existed
        const deletedCount = await cache.del(key);
        console.log(`INVALIDATED ${key}, deleted: ${deletedCount}`);
    } catch {
        console.warn("Redis delete failed — cache may be stale.");
    }
}

// invalidating the search results on writes
// A single post change can affect many list keys, so we clear them by pattern.
async function deleteCacheByPattern(cache, pattern) {
    if (!cache) {
        return;
    }

    try {
        for await (const key of cache.scanIterator({ MATCH: pattern })) {
            await cache.del(key);
            console.log(`INVALIDATED ${key}`);
        }
    } catch {
        console.warn(`Redis pattern invalidation failed for ${pattern}.`);
    }
}

//stampede protection - to avoid multiple requests to SQLite when cache is missed
// acquireCacheLock uses Redis SET command with NX option to create a lock key that expires after a short TTL,
// preventing other requests from querying SQLite until the lock is released or expires.
async function acquireCacheLock(cache, key, ttlSeconds = 5) {
    if (!cache) {
        return false;
    }

    const lockKey = `lock:${key}`;

    try {
        const result = await cache.set(lockKey, "1", {
            // NX is a value that means "only set the key if it does not already exist". This ensures that only one
            // request can acquire the lock at a time.
            NX: true,
            EX: ttlSeconds,
        });

        return result === "OK";
    } catch {
        return false;
    }
}

// Release the lock after rebuilding the cache.
// If this fails or the app crashes, the lock still expires by TTL.
async function releaseCacheLock(cache, key) {
    if (!cache) {
        return;
    }

    const lockKey = `lock:${key}`;

    try {
        await cache.del(lockKey);
    } catch {
        // If deleting the lock fails, it will expire by TTL anyway.
    }
}

app.get("/posts", async (req, res) => {
    const search = req.query.search || "";
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
    const sort = req.query.sort || "createdAt";
    const order = req.query.order || "desc";

    const searchKey = search || "all";
    const key = `posts:search:${searchKey}:page:${page}:limit:${limit}:sort:${sort}:order:${order}`;

    const cachedPosts = await getCachedPost(cache, key);

    if (cachedPosts !== null) {
        recordCacheHit(key);
        return res.json(cachedPosts);
    }

    recordCacheMiss(key);

    const hasLock = await acquireCacheLock(cache, key);

    if (hasLock) {
        try {
            await sleep(50);

            const posts = searchPosts(search, page, limit, sort, order);

            await setCachedPost(cache, key, posts, SEARCH_CACHE_TTL_SECONDS);

            return res.json(posts);

        } finally {
            await releaseCacheLock(cache, key);
        }
    }
    // Another request may already be rebuilding this list cache.
    await sleep(50);

    const cachedAfterWait = await getCachedPost(cache, key);

    if (cachedAfterWait !== null) {
        recordCacheHit(key);
        return res.json(cachedAfterWait);
    }
    // Fallback: cache still was not rebuilt, so read SQLite ourselves.
    await sleep(50);

    const posts = searchPosts(search, page, limit, sort, order);

    await setCachedPost(cache, key, posts, SEARCH_CACHE_TTL_SECONDS);

    return res.json(posts);
});

app.post("/posts", async(req, res) => {
    const errors = validatePost(req.body);

    if (errors.length > 0) {
        return res.status(400).json({ errors });
    }

    const post = createPost(req.body);

    if (!post) {
        return res.status(500).json({ error: "Failed to create post" });
    }
    await deleteCacheByPattern(cache, "posts:search:*");

    return res.status(201).json(post);
});

app.get("/posts/:id", async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(400).json({ error: "Invalid post id" });
    }

    const key = `post:${id}`;

    const cachedPost = await getCachedPost(cache, key);

    if (cachedPost !== null) {
        recordCacheHit(key);

        return res.json(cachedPost);
    }

    recordCacheMiss(key);

    const hasLock = await acquireCacheLock(cache, key);

    if (hasLock) {
        try {
            await sleep(50);

            const post = getPost(id);

            if (!post) {
                return res.status(404).json({ error: "Post not found" });
            }

            await setCachedPost(cache, key, post, POST_CACHE_TTL_SECONDS);

            return res.json(post);
        } finally {
            await releaseCacheLock(cache, key);
        }
    }

    // Another request may already be rebuilding this cache key.
    await sleep(50);

    const cachedAfterWait = await getCachedPost(cache, key);

    if (cachedAfterWait !== null) {
        recordCacheHit(key);
        return res.json(cachedAfterWait);
    }

    // Fallback: cache still was not rebuilt, so read SQLite ourselves.
    await sleep(50);

    const post = getPost(id);

    if (!post) {
        return res.status(404).json({ error: "Post not found" });
    }

    await setCachedPost(cache, key, post, POST_CACHE_TTL_SECONDS);

    return res.json(post);
});

app.put("/posts/:id",  async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(404).json({ error: "Post not found" });
    }

    const errors = validatePost(req.body);

    if (errors.length > 0) {
        return res.status(400).json({ errors });
    }

    const updatedPost  = updatePost(id, req.body);

    if (!updatedPost ) {
        return res.status(404).json({ error: "Post not found" });
    }

    const key = `post:${id}`;
    //write-through cache -  save the updated post into Redis instead of deleting the key
    // instead of deleting on update - the next read is a HIT, not a MISS
    // instead of deleteCacheKey(cache, key); we use setCachedPost
    await setCachedPost(cache, key, updatedPost);
    await deleteCacheByPattern(cache, "posts:search:*");

    return res.json(updatedPost);
});

app.delete("/posts/:id", async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(404).json({ error: "Post not found" });
    }

    const success = deletePost(id);

    if (!success)  {
        return res.status(404).json({ error: "Post not found" });
    }

    const key = `post:${id}`;

    await deleteCacheKey(cache, key);
    await deleteCacheByPattern(cache, "posts:search:*");

    return res.status(204).end();
});

app.patch("/posts/:id", async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(404).json({ error: "Post not found" });
    }

    const errors = validatePatchPost(req.body);

    if (errors.length > 0) {
        return res.status(400).json({ errors });
    }

    const updatedPost = patchPost(id, req.body);

    if (!updatedPost) {
        return res.status(404).json({ error: "Post not found" });
    }

    const key = `post:${id}`;
    //write-through cache -  after updating sqlite, store the fresh post in redis
    // instead of deleting on partial update - the next read is a HIT, not a MISS
    // await deleteCacheKey(cache, key);
    await setCachedPost(cache, key, updatedPost);
    await deleteCacheByPattern(cache, "posts:search:*");

    return res.json(updatedPost);
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


process.on("SIGINT", async () => {
    printCacheStats();

    if (cache) {
        await cache.quit();
    }

    process.exit(0);
});

async function startServer() {
    cache = await connectRedis();

    app.listen(3000, () => {
        console.log("Blog API running on http://localhost:3000");
    });
}



startServer();
