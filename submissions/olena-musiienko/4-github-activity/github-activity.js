const fs = require("node:fs");
const path = require("node:path");

const username = process.argv[2];
const typeFilter = process.argv[3];

if (!username) {
    console.error("Usage: node github-activity.js <username> [type]");
    process.exit(1);
}

const CACHE_TTL = 5 * 60 * 1000;
const CACHE_DIR = path.join(__dirname, ".cache");
const cacheUsername = username.toLowerCase();
const CACHE_FILE = path.join(CACHE_DIR, `${cacheUsername}.json`);

const eventTypes = {
    push: "PushEvent",
    star: "WatchEvent",
    issue: "IssuesEvent",
    pr: "PullRequestEvent",
    pullRequest: "PullRequestEvent",
    create: "CreateEvent",
    fork: "ForkEvent",
};

function exitWithError(message, code = 1) {
    console.error(message);
    process.exit(code);
}

function loadCache() {
    if (!fs.existsSync(CACHE_FILE)) {
        return null;
    }

    try {
        const raw = fs.readFileSync(CACHE_FILE, "utf-8");

        if (raw.trim() === "") {
            return null;
        }

        const cached = JSON.parse(raw);

        if (!cached.timestamp || !Array.isArray(cached.data)) {
            return null;
        }

        const cacheAge = Date.now() - cached.timestamp;

        if (cacheAge < CACHE_TTL) {
            return cached.data;
        }

        return null;
    } catch {
        console.error("Warning: cache file is not valid JSON. Fetching from GitHub.");
        return null;
    }
}

function saveCache(events) {
    const cache = {
        timestamp: Date.now(),
        data: events,
    };

    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

async function fetchEvents(username) {
    const url = `https://api.github.com/users/${username}/events`;

    const res = await fetch(url, {
        headers: {
            "User-Agent": "my-cli-app",
            "Accept": "application/vnd.github+json",
        },
    });

    if (res.status === 404) {
        exitWithError(`User "${username}" not found.`, 2);
    }

    if (res.status === 403) {
        exitWithError("Rate limit reached. Try again later.", 3);
    }

    if (!res.ok) {
        exitWithError(`GitHub error: ${res.status}`, 4);
    }

    return await res.json();
}

async function getEvents(username) {
    const cachedEvents = loadCache();

    if (cachedEvents !== null) {
        console.log("Using cache");
        return cachedEvents;
    }

    console.log("Fetching from GitHub");

    const events = await fetchEvents(username);
    saveCache(events);

    return events;
}

function describe(event) {
    const repo = event.repo.name;

    switch (event.type) {
        case "PushEvent": {
            const commitsCount = event.payload.commits?.length ?? event.payload.size ?? 0;

            if (commitsCount === 0) {
                return `Pushed to ${repo}`;
            }

            return `Pushed ${commitsCount} commits to ${repo}`;
        }

        case "WatchEvent":
            return `Starred ${repo}`;

        case "IssuesEvent":
            return `${event.payload.action} issue "${event.payload.issue.title}" in ${repo}`;

        case "IssueCommentEvent":
            return `${event.payload.action} a comment on issue "${event.payload.issue.title}" in ${repo}`;

        case "PullRequestEvent":
            return `${event.payload.action} a pull request in ${repo}`;

        case "CreateEvent": {
            const ref = event.payload.ref ? ` ${event.payload.ref}` : "";
            return `Created ${event.payload.ref_type}${ref} in ${repo}`;
        }

        case "DeleteEvent":
            return `Deleted ${event.payload.ref_type} ${event.payload.ref} in ${repo}`;

        case "ForkEvent": {
            const forkName = event.payload.forkee?.full_name ?? "unknown repository";
            return `Forked ${repo} to ${forkName}`;
        }

        default:
            return `${event.type} on ${repo}`;
    }
}

async function main() {
    try {
        const events = await getEvents(username);

        if (events.length === 0) {
            console.log(`No recent public activity found for "${username}".`);
            return;
        }

        let filteredEvents = events;

        if (typeFilter) {
            const eventType = eventTypes[typeFilter];

            if (!eventType) {
                console.error(`Unknown filter "${typeFilter}".`);
                console.error("Available filters: push, star, issue, pr, pullRequest, create, fork");
                process.exit(6);
            }

            filteredEvents = events.filter(event => event.type === eventType);
        }

        if (filteredEvents.length === 0) {
            console.log(`No recent ${typeFilter} activity found for "${username}".`);
            return;
        }

        filteredEvents.forEach(event => {
            console.log(`- ${describe(event)}`);
        });
    } catch (err) {
        console.error("Could not reach GitHub. Check your internet connection.");
        console.error(`Details: ${err.message}`);
        process.exitCode = 5;
    }
}

main();