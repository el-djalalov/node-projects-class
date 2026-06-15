const fs = require("fs");
const http = require("http");

const CACHE_FILE = "cache.json";
const DEFAULT_TTL = 60;
const DEFAULT_MAX_SIZE = 100;

//hop-by-hop headres which are not copied directly from origin response to cache and client response
const SKIP_HEADERS = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
]);

const argv = process.argv.slice(2);

function clearCache() {
    if (fs.existsSync(CACHE_FILE)) {
        fs.unlinkSync(CACHE_FILE);
    }
}

function copyHeaders(headersFromOrigin) {
    const copiedHeaders = {};

    headersFromOrigin.forEach((value, key) => {
        const lowerKey = key.toLowerCase();

        if (!SKIP_HEADERS.has(lowerKey)) {
            copiedHeaders[key] = value;
        }
    });

    return copiedHeaders;
}

function loadCache() {
    if (!fs.existsSync(CACHE_FILE)) {
        return new Map();
    }

    try {
        const fileContent = fs.readFileSync(CACHE_FILE, "utf-8");

        if (fileContent.trim() === "") {
            return new Map();
        }

        const parsedCache = JSON.parse(fileContent);
        const cacheEntries = Object.entries(parsedCache);

        const validEntries = cacheEntries.filter(([key, value]) => {
            return (
                value.status >= 200 &&
                value.status < 300 &&
                value.createdAt &&
                value.ttlMilliseconds &&
                value.bodyBase64
            );
        });

        return new Map(validEntries);
    } catch (error) {
        console.error("Failed to load cache. Starting with an empty cache.");
        return new Map();
    }
}

function saveCache(cache) {
    const plainObject = Object.fromEntries(cache);

    fs.writeFileSync(
        CACHE_FILE,
        JSON.stringify(plainObject, null, 2)
    );
}

function getCacheTtlFromHeaders(headers, fallbackTtlMilliseconds) {
    const cacheControl = headers.get("cache-control");

    if (!cacheControl) {
        return fallbackTtlMilliseconds;
    }

    const directives = cacheControl
        .split(",")
        .map(directive => directive.trim().toLowerCase());

    if (
        directives.includes("no-store") ||
        directives.includes("no-cache") ||
        directives.includes("private")
    ) {
        return 0;
    }

    const maxAgeDirective = directives.find(directive => {
        return directive.startsWith("max-age=");
    });

    if (!maxAgeDirective) {
        return fallbackTtlMilliseconds;
    }

    const maxAge = Number(maxAgeDirective.split("=")[1]);

    if (!Number.isInteger(maxAge) || maxAge <= 0) {
        return 0;
    }

    return maxAge * 1000;
}

function parseFlags(args) {
    const flags = {};

    for (let i = 0; i < args.length; i++) {
        const currentArg = args[i];

        if (currentArg.startsWith("--")) {
            const flagName = currentArg.slice(2);
            const flagValue = args[i + 1];

            flags[flagName] = flagValue;
            i++;
        }
    }

    return flags;
}

function isValidTtl(ttl) {
    return Number.isInteger(ttl) && ttl > 0;
}

function isValidMaxSize(maxSize) {
    return Number.isInteger(maxSize) && maxSize > 0;
}

function isValidOrigin(origin) {
    try {
        const url = new URL(origin);

        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

// Normalize origin by removing trailing slash if present, to avoid cache duplication for URLs with and without trailing slash.
function normalizeOrigin(origin) {
    return origin.endsWith("/") ? origin.slice(0, -1) : origin;
}


if (argv.includes("--clear-cache")) {
    clearCache();
    console.log("Cache cleared.");
    process.exit(0);
}

const flags = parseFlags(argv);

const port = Number(flags.port);
const rawOrigin = flags.origin;
const ttlSeconds  = flags.ttl === undefined ? DEFAULT_TTL : Number(flags.ttl);
const maxSize = flags["max-size"] === undefined ? DEFAULT_MAX_SIZE : Number(flags["max-size"]);

if (!port || !rawOrigin || !isValidOrigin(rawOrigin) || !isValidTtl(ttlSeconds) || !isValidMaxSize(maxSize)) {
    console.error("Usage: node proxy.js --port <number> --origin <url> --ttl <seconds> --max-size <number>");
    console.error("Example: node proxy.js --port 3000 --origin https://dummyjson.com --ttl 60 --max-size 100");
    process.exit(1);
}

const origin = normalizeOrigin(rawOrigin);
const ttlMilliseconds = ttlSeconds * 1000;

function isFreshCacheEntry(entry) {
    if (!entry.createdAt || !entry.ttlMilliseconds) {
        return false;
    }

    return Date.now() - entry.createdAt <= entry.ttlMilliseconds;
}

function evictLeastRecentlyUsed(cache, maxSize) {
    while (cache.size > maxSize) {
        const oldestKey = cache.keys().next().value;

        cache.delete(oldestKey);

        console.log("EVICTED", oldestKey);
    }
}

const cache = loadCache();
evictLeastRecentlyUsed(cache, maxSize);
saveCache(cache);

const stats = {
    hits: 0,
    misses: 0,
};

const server = http.createServer(async (req, res) => {

    // in a real proxy, this cache key can be incomplete because responses may depend on request headers like Authorization,
    // Cookie, Accept, Accept-Language, or on the Vary response header.
    // Also, if the same cache file is reused with another origin, GET /products/1 could point to a different resource.
    // A safer simple key would be method + origin + url.
    // now key is not like  GET /products/1 but like GET https://dummyjson.com/products/1
    const key = `${req.method} ${origin}${req.url}`;
    const cacheable = req.method === "GET";

    if (cacheable && cache.has(key)) {
        const hit = cache.get(key);

        if (isFreshCacheEntry(hit)) {
            stats.hits++;

            console.log("HIT", key);

            cache.delete(key);
            cache.set(key, hit);
            saveCache(cache);

            const body = Buffer.from(hit.bodyBase64, "base64");

            res.writeHead(hit.status, {
                ...hit.headers,
                "X-Cache": "HIT",
            });

            return res.end(body);
        }

        console.log("EXPIRED", key);

        cache.delete(key);
        saveCache(cache);
    }

    stats.misses++;

    console.log("MISS", key);

    try {
        const target = origin + req.url;

        const originRes = await fetch(target);

        const arrayBuffer = await originRes.arrayBuffer();
        const body = Buffer.from(arrayBuffer);

        const proxyHeaders = copyHeaders(originRes.headers);

        // If the origin response doesn't have a Content-Type header, set it to application/octet-stream to ensure the client can handle the response body correctly.
        if (!proxyHeaders["content-type"] && !proxyHeaders["Content-Type"]) {
            proxyHeaders["Content-Type"] = "application/octet-stream";
        }

        const responseTtlMilliseconds = getCacheTtlFromHeaders(
            originRes.headers,
            ttlMilliseconds
        );

        const shouldCache =
            cacheable &&
            originRes.status >= 200 &&
            originRes.status < 300 &&
            responseTtlMilliseconds > 0;

        if (shouldCache) {
            cache.set(key, {
                status: originRes.status,
                headers: proxyHeaders,
                bodyBase64: body.toString("base64"),
                createdAt: Date.now(),
                ttlMilliseconds: responseTtlMilliseconds,
            });

            evictLeastRecentlyUsed(cache, maxSize);
            saveCache(cache);
        }

        res.writeHead(originRes.status, {
            ...proxyHeaders,
            "X-Cache": "MISS",
        });

        res.end(body);
    } catch (error) {
        res.writeHead(502, {
            "Content-Type": "text/plain",
            "X-Cache": "MISS",
        });

        res.end("Bad gateway: could not reach the origin server.");
    }
});

server.listen(port, () => {
    console.log(`Proxy on http://localhost:${port} -> ${origin}`);
    console.log(`Fallback TTL: ${ttlSeconds} seconds`);
    console.log(`Max cache size: ${maxSize} entries`);
});

process.on("SIGINT", () => {
    const total = stats.hits + stats.misses;
    const hitRate = total === 0
        ? 0
        : Math.round((stats.hits / total) * 100);

    console.log("\nProxy shutting down...");
    console.log("Cache summary:");
    console.log(`Hits: ${stats.hits}`);
    console.log(`Misses: ${stats.misses}`);
    console.log(`Total requests counted: ${total}`);
    console.log(`Hit rate: ${hitRate}%`);

    server.close(() => {
        process.exit(0);
    });
});


/*node proxy.js --port 3000 --origin https://dummyjson.com --ttl 60 --max-size 100*/
/*
curl.exe -i "http://localhost:3000/products?limit=1"
curl.exe -i "http://localhost:3000/products?limit=2"
curl.exe -i "http://localhost:3000/products?limit=3"*/
