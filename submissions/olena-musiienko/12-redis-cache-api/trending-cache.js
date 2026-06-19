const { createClient } = require("redis");

const DEFAULT_TTL_SECONDS = 300;

function parseFlags(args) {
    const flags = {};

    for (let i = 0; i < args.length; i++) {
        if (!args[i].startsWith("--")) {
            continue;
        }
        const key = args[i].slice(2);
        const next = args[i + 1];

        if (next === undefined || next.startsWith("--")) {
            flags[key] = true;
        } else {
            flags[key] = next;
            i++;
        }
    }
    return flags;
}

function parseTtl(value) {
    if (value === undefined) {
        return DEFAULT_TTL_SECONDS;
    }

    const ttl = Number(value);

    if (!Number.isInteger(ttl) || ttl <= 0) {
        throw new Error("Invalid --ttl. Use a positive whole number.");
    }
    return ttl;
}

function sinceDate(duration) {
    const d = new Date();

    switch (duration) {
        case "day":
            d.setDate(d.getDate() - 1);
            break;

        case "week":
            d.setDate(d.getDate() - 7);
            break;

        case "month":
            d.setMonth(d.getMonth() - 1);
            break;

        case "year":
            d.setFullYear(d.getFullYear() - 1);
            break;
    }

    return d.toISOString().slice(0, 10);
}

// Connect to Redis with a short timeout and no retries. If it fails, we'll just continue without caching.
async function connectRedis() {
    const client = createClient({
        url: "redis://localhost:6379",
        socket: {
            connectTimeout: 1000,
            reconnectStrategy: false,
        },
    });

    client.on("error", () => {
        console.warn("Redis unavailable — continuing without cache.");
        return null;
    });

    try {
        await client.connect();
        return client;
    } catch {
        console.warn("Redis unavailable — continuing without cache.");
        return null;
    }
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

        const entry = JSON.parse(cached);

        if (
            !entry ||
            entry.type !== "success" ||
            typeof entry.fetchedAt !== "number" ||
            !entry.data ||
            !Array.isArray(entry.data.items)
        ) {
            return null;
        }

        return entry;
    } catch {
        console.warn("Redis read failed — treating as cache MISS.");
        return null;
    }
}

async function setCachedEntry(client, key, data, ttlSeconds) {
    if (!client) {
        return;
    }

    try {
        const entry = {
            type: "success",
            fetchedAt: Date.now(),
            data,
        };

        await client.set(key, JSON.stringify(entry), {
            EX: ttlSeconds,
        });
    } catch {
        console.warn("Redis write failed — result was not cached.");
    }
}

function getCacheAgeSeconds(fetchedAt) {
    return Math.floor((Date.now() - fetchedAt) / 1000);
}

async function fetchTrendingRepos(url) {
    const headers = {
        "User-Agent": "trending-cli",
        "Accept": "application/vnd.github+json",
    };

    if (process.env.GITHUB_TOKEN) {
        headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const res = await fetch(url, { headers });

    if (res.status === 403 || res.status === 429) {
        throw new Error("Rate limit reached. The search API allows only a few requests per minute. Wait and retry.");
    }

    if (!res.ok) {
        throw new Error(`GitHub error: ${res.status}`);
    }

    return res.json();
}

function printReposTable(repos) {
    const headers = {
        index: "#",
        name: "Repository",
        stars: "Stars",
        language: "Language",
        url: "URL",
    };

    const rows = repos.map((repo, i) => ({
        index: String(i + 1),
        name: repo.full_name,
        stars: repo.stargazers_count.toLocaleString(),
        language: repo.language || "—",
        url: repo.html_url,
    }));

    const indexWidth = Math.max(
        headers.index.length,
        ...rows.map(row => row.index.length)
    );

    const nameWidth = Math.max(
        headers.name.length,
        ...rows.map(row => row.name.length)
    );

    const starsWidth = Math.max(
        headers.stars.length,
        ...rows.map(row => row.stars.length)
    );

    const languageWidth = Math.max(
        headers.language.length,
        ...rows.map(row => row.language.length)
    );

    console.log(
        headers.index.padEnd(indexWidth) + "  " +
        headers.name.padEnd(nameWidth) + "  " +
        headers.stars.padEnd(starsWidth) + "  " +
        headers.language.padEnd(languageWidth) + "  " +
        headers.url
    );

    console.log(
        "-".repeat(indexWidth) + "  " +
        "-".repeat(nameWidth) + "  " +
        "-".repeat(starsWidth) + "  " +
        "-".repeat(languageWidth) + "  " +
        "-".repeat(headers.url.length)
    );

    rows.forEach(row => {
        console.log(
            row.index.padEnd(indexWidth) + "  " +
            row.name.padEnd(nameWidth) + "  " +
            row.stars.padEnd(starsWidth) + "  " +
            row.language.padEnd(languageWidth) + "  " +
            row.url
        );
    });
}

function printRepos(data, limit, jsonFlag, cutoffDate) {
    const repos = data.items;

    if (!Array.isArray(repos)) {
        throw new Error("Unexpected response from GitHub.");
    }

    if (repos.length === 0) {
        if (jsonFlag) {
            console.log(JSON.stringify([], null, 2));
        } else {
            console.log("No repositories found for that range.");
        }

        return;
    }

    const selectedRepos = repos
        .sort((a, b) => b.stargazers_count - a.stargazers_count)
        .slice(0, limit);

    if (jsonFlag) {
        console.log(JSON.stringify(selectedRepos, null, 2));
        return;
    }

    console.log(`Top ${limit} GitHub repositories created after ${cutoffDate}\n`);
    printReposTable(selectedRepos);
}

async function main() {
    const flags = parseFlags(process.argv.slice(2));

    const duration = flags.duration || "week";
    const limit = flags.limit === undefined ? 10 : Number(flags.limit);
    const language = flags.language;
    const jsonFlag = flags.json === true;
    const noCache = flags["no-cache"] === true;

    const allowedDurations = ["day", "week", "month", "year"];

    if (language === true || language === "") {
        console.error("Invalid --language. Provide a language name, for example: javascript.");
        process.exit(1);
    }

    if (!allowedDurations.includes(duration)) {
        console.error(`Invalid --duration. Use one of: ${allowedDurations.join(", ")}`);
        process.exit(1);
    }

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        console.error("Invalid --limit. Use a whole number between 1 and 100.");
        process.exit(1);
    }

    let ttlSeconds;

    try {
        ttlSeconds = parseTtl(flags.ttl);
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }

    const cutoffDate = sinceDate(duration);

    let query = `created:>${cutoffDate}`;

    if (language) {
        query += ` language:${language}`;
    }

    const params = new URLSearchParams({
        q: query,
        sort: "stars",
        order: "desc",
        per_page: String(limit),
    });

    const url = `https://api.github.com/search/repositories?${params}`;

    const safeLanguage = language || "all";
    const key = `github:trending:${cutoffDate}:${limit}:${safeLanguage}`;

    const client = await connectRedis();

    try {
        let cachedEntry = null;

        if (!noCache) {
            cachedEntry = await getCachedEntry(client, key);
        }

        if (cachedEntry !== null) {
            const ageSeconds = getCacheAgeSeconds(cachedEntry.fetchedAt);

            if (!jsonFlag) {
                console.log(`HIT — loaded from Redis cache, cached ${ageSeconds}s ago\n`);
            }

            printRepos(cachedEntry.data, limit, jsonFlag, cutoffDate);
            return;
        }

        if (!jsonFlag) {
            console.log("MISS — fetched from GitHub\n");
        }

        const data = await fetchTrendingRepos(url);

        await setCachedEntry(client, key, data, ttlSeconds);

        printRepos(data, limit, jsonFlag, cutoffDate);
    } catch (err) {
        console.error(`Failed to get repositories from ${url}`);
        console.error(`Error message: ${err.message}`);
        process.exitCode = 1;
    } finally {
        if (client?.isOpen) {
            await client.close();
        }
    }
}

main();

