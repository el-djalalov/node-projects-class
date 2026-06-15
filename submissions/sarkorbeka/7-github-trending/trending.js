#!/usr/bin/env node
const { URLSearchParams } = require('url');

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) { flags[args[i].slice(2)] = args[i + 1]; i++; }
  }

  return flags;
}

const flags = parseFlags(process.argv.slice(2));
const duration = flags.duration || 'week';
const limit = Number(flags.limit) || 10;
const allowed = ['day', 'week', 'month', 'year'];

if (!allowed.includes(duration)) {
  console.error(`Invalid --duration. Use one of: ${allowed.join(', ')}`);
  process.exit(1);
}

if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
  console.error('--limit must be an integer between 1 and 100');
  process.exit(1);
}

function sinceDate(duration) {
  const d = new Date();
  switch (duration) {
    case 'day': d.setDate(d.getDate() - 1); break;
    case 'week': d.setDate(d.getDate() - 7); break;
    case 'month': d.setMonth(d.getMonth() - 1); break;
    case 'year': d.setFullYear(d.getFullYear() - 1); break;
  }

  return d.toISOString().slice(0, 10);
}

const params = new URLSearchParams({
  q: `created:>${sinceDate(duration)}`,
  sort: 'stars',
  order: 'desc',
  per_page: String(Math.min(limit, 100)),
});

const url = `https://api.github.com/search/repositories?${params}`;

async function main() {
  try {
    const res = await fetch(url,
      {
        headers: {
          'User-Agent': 'trending-cli',
          'Accept': 'application/vnd.github+json'
        }
      })

    if (res.status === 403 || res.status === 429) return console.error('Rate limit reached. Try again later.')
    if (!res.ok) return console.error(`GitHub error: ${res.status}`)

    const data = await res.json()
    const repos = data.items || []
    if (repos.length === 0) return console.log('No repositories found for that range.')

    repos
      .sort((a, b) => b.stargazers_count - a.stargazers_count)
      .slice(0, limit)
      .forEach((repo, i) => {
        const stars = repo.stargazers_count.toLocaleString();
        const lang = repo.language || '—';

        console.log(`${i + 1}. ${repo.full_name}  ★ ${stars}  [${lang}]`);

        if (repo.description) console.log(`   ${repo.description}`);

        console.log(`   ${repo.html_url}\n`);
      });
  } catch (err) {
    console.error('Could not reach GitHub. Check your internet connection.');
  }
}

main();
