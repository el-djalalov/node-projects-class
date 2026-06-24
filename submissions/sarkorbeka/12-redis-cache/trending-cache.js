const { createClient } = require('redis')
const argv = require('argv')

const args = argv.option([
    { name: 'duration', type: 'string' },
    { name: 'limit', type: 'int' },
    { name: 'language', type: 'string' },
    { name: 'ttl', type: 'int' },
    { name: 'no-cache', type: 'boolean' }
]).run(process.argv.slice(2))

const duration = args.options.duration || 'week'
const limit = args.options.limit !== undefined ? args.options.limit : 10
const language = args.options.language || null
const ttl = args.options.ttl !== undefined ? args.options.ttl : 300
const noCache = args.options['no-cache'] === true

const allowed = ['day', 'week', 'month', 'year']

if (args.options.language !== undefined && language === '') {
    console.error('Invalid --language. Provide a language name, for example: javascript.')
    process.exit(1)
}

if (!allowed.includes(duration)) {
    console.error('Invalid --duration. Use one of: ' + allowed.join(', '))
    process.exit(1)
}

if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    console.error('Invalid --limit. Use a whole number between 1 and 100.')
    process.exit(1)
}

function sinceDate(duration) {
    const d = new Date()

    switch (duration) {
        case 'day':
            d.setDate(d.getDate() - 1)
            break
        case 'week':
            d.setDate(d.getDate() - 7)
            break
        case 'month':
            d.setMonth(d.getMonth() - 1)
            break
        case 'year':
            d.setFullYear(d.getFullYear() - 1)
            break
    }

    return d.toISOString().slice(0, 10)
}

function makeCacheKey(duration, limit, language) {
    return `github:trending:${duration}:${limit}:${language || 'all'}`
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

        const cutoffDate = sinceDate(duration)

        let query = 'created:>' + cutoffDate
        if (language) {
            query += ' language:' + language
        }

        const params = new URLSearchParams({
            q: query,
            sort: 'stars',
            order: 'desc',
            per_page: String(limit)
        })

        const url = 'https://api.github.com/search/repositories?' + params
        const cacheKey = makeCacheKey(duration, limit, language)

        let data = null
        let fetchedAt

        if (client && !noCache) {
            const cached = await safeGet(client, cacheKey)

            if (cached !== null) {
                const entry = JSON.parse(cached)
                data = entry.data
                fetchedAt = entry.fetchedAt
            }
        }

        if (data === null) {
            const headers = {
                'User-Agent': 'trending-cli',
                Accept: 'application/vnd.github+json'
            }
            
            const res = await fetch(url, { headers })

            if (res.status === 403 || res.status === 429) {
                throw new Error(
                    'Rate limit reached. The search API allows only a few requests per minute.'
                )
            }

            if (!res.ok) {
                throw new Error('GitHub error: ' + res.status)
            }

            data = await res.json()

            if (client && !noCache) {
                await safeSet(
                    client,
                    cacheKey,
                    JSON.stringify({
                        data,
                        fetchedAt: Date.now()
                    }),
                    { EX: ttl }
                )
            }
        }

        if (fetchedAt !== undefined) {
            const age = Math.round((Date.now() - fetchedAt) / 1000)
            console.log(`Using cached GitHub data. (HIT, cached ${age}s ago)\n`)
        } else if (!noCache) {
            console.log('MISS (fetched from GitHub)\n')
        }

        if (noCache) {
            console.log('NO-CACHE (bypassing Redis)\n')
        }

        const repos = data.items

        if (!Array.isArray(repos)) {
            throw new Error('Unexpected response from GitHub.')
        }

        if (repos.length === 0) {
            console.log('No repositories found for that range.')
            return
        }

        const selected = repos
            .sort((a, b) => b.stargazers_count - a.stargazers_count)
            .slice(0, limit)

        console.log(`Top ${limit} GitHub repositories created after ${cutoffDate}\n`)

        selected.forEach((repo, i) => {
            const stars = repo.stargazers_count.toLocaleString()
            const lang = repo.language || '—'

            console.log(`${i + 1}. ${repo.full_name}  ★ ${stars}  [${lang}]`)

            if (repo.description) {
                console.log(`   ${repo.description}`)
            }

            console.log(`   ${repo.html_url}\n`)
        })
    } catch (err) {
        console.error(err.message)
        process.exitCode = 1
    } finally {
        if (client) {
            await client.
                quit().
                catch(() => { })
        }
    }
}

main()