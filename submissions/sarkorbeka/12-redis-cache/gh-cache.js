const { createClient } = require('redis')
const argv = require('argv')

const username = process.argv[2]

if (!username) {
    console.error('Usage: node gh-cache.js <username> [--ttl=<seconds>] [--no-cache]')
    process.exit(1)
}

const args = argv.option([
    {
        name: 'ttl',
        type: 'int'
    },
    {
        name: 'no-cache',
        type: 'boolean'
    }
]).run(process.argv.slice(3))

const ttl = args.options.ttl !== undefined ? args.options.ttl : 60
const noCache = args.options['no-cache'] === true

async function main() {
    let client = null

    try {
        try {
            client = createClient()
            client.on('error', () => { })
            await client.connect()
        } catch {
            client = null
        }

        const cacheEnabled = client && !noCache
        const key = `github:events:${username}`

        let events = null
        let fetchedAt

        if (cacheEnabled) {
            const cached = await safeGet(client, key)

            if (cached) {
                const entry = JSON.parse(cached)
                events = entry.data
                fetchedAt = entry.fetchedAt
            }
        }

        if (events === null) {
            if (noCache) {
                console.log('NO-CACHE')
            }

            events = await fetchGithubEvents(username)

            if (cacheEnabled) {
                await safeSet(
                    client,
                    key,
                    JSON.stringify({
                        data: events,
                        fetchedAt: Date.now()
                    }),
                    { EX: ttl }
                )
            }

            if (!noCache) {
                console.log('MISS')
            }
        } else {
            const age = Math.round((Date.now() - fetchedAt) / 1000)
            console.log(`HIT (cached ${age}s ago)`)
        }

        if (events.length === 0) {
            console.log(`No recent public activity found for "${username}".`)
            return
        }

        events.slice(0, 20).forEach((event) => {
            console.log('- ' + describe(event))
        })
    } catch (err) {
        console.error(err.message)
        process.exitCode = 1
    } finally {
        if (client) {
            await client.
                quit().
                catch(() => {
                    console.log('Failed to close Redis connection.');
                })
        }
    }
}

async function connectRedis() {
    try {
        const client = createClient()
        client.on('error', () => { })
        await client.connect()
        return client
    } catch {
        return null
    }
}

async function fetchGithubEvents(username) {
    const res = await fetch(
        'https://api.github.com/users/' + encodeURIComponent(username) + '/events',
        {
            headers: {
                'User-Agent': 'gh-cache',
                Accept: 'application/vnd.github+json'
            }
        }
    )

    if (res.status === 404) {
        throw new Error(`User "${username}" not found.`)
    }

    if (res.status === 403) {
        throw new Error('Rate limit reached. Try again later.')
    }

    if (!res.ok) {
        throw new Error(`GitHub error: ${res.status}`)
    }

    return await res.json()
}

function describe(event) {
    const repo = event.repo.name

    switch (event.type) {
        case 'PushEvent':
            return 'Pushed ' + (event.payload.commits?.length ?? event.payload.size ?? 0) + ' commits to ' + repo

        case 'WatchEvent':
            return 'Starred ' + repo

        case 'IssuesEvent':
            return event.payload.action + ' issue "' + event.payload.issue.title + '" in ' + repo

        case 'IssueCommentEvent':
            return event.payload.action + ' a comment on issue "' + event.payload.issue.title + '" in ' + repo

        case 'PullRequestEvent':
            return event.payload.action + ' a pull request in ' + repo

        case 'CreateEvent': {
            const ref = event.payload.ref ? ' ' + event.payload.ref : ''
            return 'Created ' + event.payload.ref_type + ref + ' in ' + repo
        }

        case 'DeleteEvent':
            return 'Deleted ' + event.payload.ref_type + ' ' + event.payload.ref + ' in ' + repo

        case 'ForkEvent': {
            const name = event.payload.forkee?.full_name ?? 'unknown'
            return 'Forked ' + repo + ' to ' + name
        }

        default:
            return event.type + ' on ' + repo
    }
}

async function safeGet(client, key) {
    try {
        return await client.get(key)
    } catch (err) {
        console.error('Redis error:', err.message)
        return null
    }
}

async function safeSet(client, key, value, opts) {
    try {
        await client.set(key, value, opts)
    } catch (err) {
        console.error('Redis error:', err.message)
    }
}

main()