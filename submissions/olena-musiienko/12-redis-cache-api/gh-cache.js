const { createClient } = require("redis");

const DEFAULT_TTL_SECONDS = 60; // seconds — GitHub activity doesn't change second-to-second
const NEGATIVE_TTL_SECONDS = 5; // seconds — cache negative results for a short time to avoid hammering GitHub

function parseFlags(argv) {
    const args = [];
    const flags = {};

    for (let i = 0; i < argv.length; i++) {
        const value = argv[i];

        if (value === "--ttl") {
            flags.ttl = argv[i + 1];
            i++;
        } else if (value === "--no-cache") {
            flags.noCache = true;
        } else {
            args.push(value);
        }
    }

    return { args, flags };
}

function parseTtl(value) {
    if (value === undefined) {
        return DEFAULT_TTL_SECONDS;
    }

    const ttl = Number(value);

    if (!Number.isInteger(ttl) || ttl <= 0) {
        throw new Error("--ttl must be a positive integer.");
    }

    return ttl;
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

    client.on("error", () => {

    });

    try {
        await client.connect();
        return client;
    } catch {
        console.warn("Redis unavailable — continuing without cache.");
        return null;
    }
}

async function getEvents(username) {
    const res = await fetch(`https://api.github.com/users/${username}/events`, {
        headers: {
            "User-Agent": "gh-cache",
            "Accept": "application/vnd.github+json",
        },
    });

    if (res.status === 404) {
        throw createNotFoundError(username);
    }

    if (!res.ok) {
        throw new Error(`GitHub error: ${res.status}`);
    }

    return res.json();
}

async function getCachedEntry(client, key) {
    if (!client) {
        return null;
    }
    try {
        const cached = await client.get(key);

        if (cached === null) {
            return null;
        }

        // Basic validation to ensure the cached data has the expected structure
        // it should contain an object with an "events" array and a "fetchedAt" timestamp
        const entry = JSON.parse(cached);

        if (!entry || typeof entry.fetchedAt !== "number") {
            return null;
        }

        if (entry.type === "success" && Array.isArray(entry.events)) {
            return entry;
        }

        if (entry.type === "not_found" && typeof entry.message === "string") {
            return entry;
        }

        return null;

    } catch {
        console.warn("Redis read failed — treating as cache MISS.");
        return null;
    }
}

async function setCachedEvents(client, key, events, ttlSeconds) {
    if (!client) {
        return;
    }
    try {
        //
        const entry = {
            type: "success",
            fetchedAt: Date.now(),
            events,
        };

        await client.set(key, JSON.stringify(entry), {
            EX: ttlSeconds,
        });
    } catch {
        console.warn("Redis write failed — result was not cached.");
    }
}

async function setCachedNotFound(client, key, username) {
    if (!client) {
        return;
    }

    try {
        const entry = {
            type: "not_found",
            fetchedAt: Date.now(),
            message: `User "${username}" not found.`,
        };

        await client.set(key, JSON.stringify(entry), {
            EX: NEGATIVE_TTL_SECONDS,
        });
    } catch {
        console.warn("Redis write failed — negative result was not cached.");
    }
}

function getCacheAgeSeconds(fetchedAt) {
    return Math.floor((Date.now() - fetchedAt) / 1000);
}

function createNotFoundError(username) {
    const error = new Error(`User "${username}" not found.`);
    error.status = 404;
    return error;
}

function printEvents(events) {
    if (events.length === 0) {
        console.log("No recent public events.");
        return;
    }

    for (const event of events.slice(0, 10)) {
        const repoName = event.repo?.name || "unknown repo";

        switch (event.type) {
            case "PushEvent":
                console.log(`Pushed to ${repoName}`);
                break;

            case "WatchEvent":
                console.log(`Starred ${repoName}`);
                break;

            case "IssuesEvent":
                console.log(`${event.payload.action} issue in ${repoName}`);
                break;

            case "CreateEvent":
                console.log(`Created ${event.payload.ref_type} in ${repoName}`);
                break;

            case "PullRequestEvent":
                console.log(`${event.payload.action} pull request in ${repoName}`);
                break;

            case "ForkEvent":
                console.log(`Forked ${repoName}`);
                break;

            default:
                console.log(`${event.type} in ${repoName}`);
        }
    }
}


async function main() {
    const { args, flags } = parseFlags(process.argv.slice(2));
    const username = args[0];

    if (!username) {
        console.error("Usage: node gh-cache.js <username> [--ttl seconds] [--no-cache]");
        process.exit(1);
    }

    let ttlSeconds;

    try {
        ttlSeconds = parseTtl(flags.ttl);
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }

    const noCache = flags.noCache === true;
    const key = `github:events:${username}`;
    const client = await connectRedis();

    try {
        let cachedEntry = null;

        if (!noCache) {
            cachedEntry = await getCachedEntry(client, key);
        }

        if (cachedEntry !== null) {
            const ageSeconds = getCacheAgeSeconds(cachedEntry.fetchedAt);

            if (cachedEntry.type === "success") {
                console.log(`HIT — loaded from Redis cache, cached ${ageSeconds}s ago`);
                printEvents(cachedEntry.events);
                return;
            }

            if (cachedEntry.type === "not_found") {
                console.log(`HIT — cached negative result, cached ${ageSeconds}s ago`);
                console.error(cachedEntry.message);
                process.exitCode = 1;
                return;
            }
        }

        console.log("MISS — fetched from GitHub");

        try {
            const events = await getEvents(username);
            await setCachedEvents(client, key, events, ttlSeconds);
            printEvents(events);
        } catch (err) {
            if (err.status === 404) {
                await setCachedNotFound(client, key, username);
            }
            throw err;
        }
    } catch (err) {
        console.error(err.message);
        process.exitCode = 1;
    } finally {
        if (client?.isOpen) {
            await client.close();
        }
    }
}

main();


//node gh-cache.js el-djalalov - first go
// MISS — fetched from GitHub
//node gh-cache.js el-djalalov  - second go
// HIT — loaded from Redis cache
// node gh-cache.js el-djalalov --ttl 5

// node gh-cache.js el-djalalov --ttl 55
// docker exec -it redis-cache redis-cli TTL github:events:el-djalalov
// (integer) 51
// docker exec -it redis-cache redis-cli GET github:events:octocat




// node gh-cache.js el-djalalov  --ttl abc
// node gh-cache.js el-djalalov  --ttl -5
// node gh-cache.js el-djalalov  --ttl 1.5
// --ttl must be a positive integer.


// docker exec -it redis-cache redis-cli DEL github:events:el-djalalov
// (integer) 0

// node gh-cache.js no-user-exists-123456789
// MISS — fetched from GitHub
// User "no-user-exists-123456789" not found.
// node gh-cache.js no-user-exists-123456789
// HIT — cached negative result, cached 12s ago
// User "no-user-exists-123456789" not found.
// docker exec -it redis-cache redis-cli GET github:events:no-user-exists-123456789



// node gh-cache.js el-djalalov --no-cache
// MISS — fetched from GitHub

// Redis down: app не падает
// docker stop redis-cache
// docker stop valkey
//node gh-cache.js el-djalalov
// Redis unavailable — continuing without cache.
//MISS — fetched from GitHub

// node gh-cache.js torvalds --no-cache
// node gh-cache.js sindresorhus --no-cache
// node gh-cache.js gaearon --no-cache