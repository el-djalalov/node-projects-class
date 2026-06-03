# Project 4 — GitHub User Activity

A CLI that fetches a GitHub user's recent public activity and prints it in plain English.

## Requirements
- Accept a username argument: `node github-activity.js <username>`
- Fetch from `https://api.github.com/users/<username>/events`
- Print readable lines (e.g. "Pushed 3 commits to owner/repo")
- Handle errors: unknown user (404), rate limits (403), network failures.

## Run it
```bash
node github-activity.js kamranahmedse
```

## Rules
- No external libraries — use Node's built-in `fetch` (Node 18+).
- Check `node --version` first; you need 18 or higher.

See the **Student Guide → Project 4** for documentation links and worked examples.
