#!/usr/bin/env node
const username = process.argv[2]
if (!username) {
	console.error('Usage: node github-activity.js <username>')
	process.exit(1)
}

async function main() {
	const url = `https://api.github.com/users/${username}/events`
	try {
		const res = await fetch(url, { headers: { 'User-Agent': 'github-activity-cli', 'Accept': 'application/vnd.github+json' } })
		if (res.status === 404) return console.error(`User "${username}" not found.`)
		if (res.status === 403) return console.error('Rate limit reached. Try again later.')
		if (!res.ok) return console.error(`GitHub error: ${res.status}`)
		const events = await res.json()
		if (!Array.isArray(events) || events.length === 0) return console.log('No recent public activity.')
		events.forEach(e => console.log('- ' + describe(e)))
	} catch (err) {
		console.error('Could not reach GitHub. Check your internet connection.')
	}
}

function describe(event) {
	const repo = event.repo && event.repo.name ? event.repo.name : 'unknown'
	switch (event.type) {
		case 'PushEvent':
			return `Pushed ${event.payload.commits ? event.payload.commits.length : 0} commits to ${repo}`
		case 'WatchEvent':
			return `Starred ${repo}`
		case 'IssuesEvent':
			return `${event.payload.action} an issue in ${repo}`
		case 'IssueCommentEvent':
			return `${event.payload.action} a comment on issue in ${repo}`
		case 'PullRequestEvent':
			return `${event.payload.action} a pull request in ${repo}`
		case 'CreateEvent':
			return `Created ${event.payload.ref_type || 'resource'} in ${repo}`
		case 'ForkEvent':
			return `Forked ${repo}`
		default:
			return `${event.type} on ${repo}`
	}
}

main()
