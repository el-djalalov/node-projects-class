const fs = require("node:fs");

const flags = parseFlags(process.argv.slice(2));
const duration = flags.duration || "week";   // default
const limit = flags.limit === undefined ? 10 : Number(flags.limit);   // default
const language = flags.language;
const jsonFlag = flags.json === true;
// console.log({ duration, limit , language, jsonFlag });

const allowed = ["day", "week", "month", "year"];

if (flags.language === true || flags.language === "") {
    console.error("Invalid --language. Provide a language name, for example: javascript.");
    process.exit(1);
}

if (!allowed.includes(duration)) {
    console.error(`Invalid --duration. Use one of: ${allowed.join(", ")}`);
    process.exit(1);
}

const cutoffDate = sinceDate(duration);
let query = `created:>${cutoffDate}`;

if (language) {
    query += ` language:${language}`;
}


if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    console.error("Invalid --limit. Use a whole number between 1 and 100.");
    process.exit(1);
}

const safeLanguage = language || "all";
const CACHE_FILE = `./github-trending-${duration}-${limit}-${safeLanguage}.json`;
const CACHE_TTL = 60 * 60 * 1000;

// use params for proper URL encoding of the query
const params = new URLSearchParams({
    q: query,
    sort: "stars",
    order: "desc",
    per_page: String(limit),
});
const url = `https://api.github.com/search/repositories?${params}`;

// console.log(url);

function loadCache() {
    if (!fs.existsSync(CACHE_FILE)) {
        return null;
    }

    try {
        const raw = fs.readFileSync(CACHE_FILE, "utf8");
        const cache = JSON.parse(raw);

        const age = Date.now() - cache.timestamp;

        if (age > CACHE_TTL) {
            return null;
        }

        return cache.data;
    } catch (err) {
        return null;
    }
}

function saveCache(data) {
    const cache = {
        timestamp: Date.now(),
        data,
    };

    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

async function main() {
    try {
        let data = loadCache();

        // If we have valid cached data and the user didn't explicitly ask for JSON output, use the cache.
        if (data && !jsonFlag) {
            console.log("Using cached GitHub data.\n");
        } else {

        const headers = {
            "User-Agent": "trending-cli",
            "Accept": "application/vnd.github+json",
        };

        // If the user has set a GITHUB_TOKEN environment variable, use it to authenticate and get a higher rate limit.
        if (process.env.GITHUB_TOKEN) {
            headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
        }
        const res = await fetch(url, { headers });


        if (res.status === 403 || res.status === 429) {
            console.error("Rate limit reached. The search API allows only a few requests per minute. Wait and retry.");
            process.exit(1);
        }

        if (!res.ok) {
            console.error(`GitHub error: ${res.status}`);
            process.exit(1);
        }

        data = await res.json();
        saveCache(data);
        }

        const repos = data.items;

        if (!Array.isArray(repos)) {
            console.error("Unexpected response from GitHub.");
            process.exit(1);
        }

        if (repos.length === 0) {
            if (jsonFlag) {
                console.log(JSON.stringify([], null, 2));
            } else {
                console.log("No repositories found for that range.");
            }
            return;
        }

        const selectedRepos  = repos
            .sort((a, b) => b.stargazers_count - a.stargazers_count)
            .slice(0, limit);

        if (jsonFlag) {
            console.log(JSON.stringify(selectedRepos, null, 2));
            return;
        }

        if (!jsonFlag) {
            console.log(`Top ${limit} GitHub repositories created after ${cutoffDate}\n`);
        }

        printReposTable(selectedRepos);

    } catch (err) {
        console.error(`Failed to get repositories from ${url}`);
        console.error(`Error message: ${err.message}`);
        process.exit(1);
    }
}

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

// Returns an ISO date string for the cutoff date based on the given duration.
function sinceDate(duration) {
    const d = new Date();
    switch (duration) {
        case "day":   d.setDate(d.getDate() - 1);          break;
        case "week":  d.setDate(d.getDate() - 7);          break;
        case "month": d.setMonth(d.getMonth() - 1);        break;
        case "year":  d.setFullYear(d.getFullYear() - 1);  break;
    }
    return d.toISOString().slice(0, 10); // "2024-05-01"  (just the date part)
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

// console.log(sinceDate("day"));
// console.log(sinceDate("week"));
// console.log(sinceDate("month"));
// console.log(sinceDate("year"));

main();

/*npm start -- --duration week --limit 10
npm start -- --duration week --limit 10 --json
npm run dev -- --duration month --limit 5 --language javascript --json*/
