#!/usr/bin/env node
const http = require('http');
const fs = require('fs');

const argv = process.argv.slice(2);

if (argv.includes('--clear-cache')) {
  const file = 'cache.json'

  if (fs.existsSync(file)) fs.unlinkSync(file)

  console.log('Cache cleared.')
  process.exit(0)
}

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) { flags[args[i].slice(2)] = args[i + 1]; i++; }
  }

  return flags;
}

const flags = parseFlags(argv);
const port = Number(flags.port);
let origin = flags.origin;

if (!port || !origin) {
  console.error('Usage: node proxy.js --port <number> --origin <url>');
  process.exit(1);
}

if (origin.endsWith('/')) origin = origin.slice(0, -1);

const CACHE_FILE = 'cache.json';

function loadCache() {
  if (!fs.existsSync(CACHE_FILE)) return new Map();

  try {
    const obj = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));

    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(Object.fromEntries(cache), null, 2));
}

const cache = loadCache();

const server = http.createServer(async (req, res) => {
  const key = req.method + ' ' + req.url;
  const cacheable = req.method === 'GET';

  if (cacheable && cache.has(key)) {
    const hit = cache.get(key);
    const headers = JSON.parse(hit.headers);

    res.writeHead(hit.status, { ...headers, 'X-Cache': 'HIT' });

    return res.end(Buffer.from(hit.body, 'base64'));
  }

  try {
    const target = origin + req.url;
    const originRes = await fetch(target);
    const buffer = Buffer.from(await originRes.arrayBuffer());
    const headers = { 'Content-Type': originRes.headers.get('content-type') || 'application/octet-stream' };

    if (cacheable && originRes.ok) {
      cache.set(key, { status: originRes.status, headers: JSON.stringify(headers), body: buffer.toString('base64') });
      saveCache(cache);
    }

    res.writeHead(originRes.status, { ...headers, 'X-Cache': 'MISS' });
    res.end(buffer);
  } catch (err) {
    res.writeHead(502,
      {
        'Content-Type': 'text/plain'
      }
    );

    res.end('Bad gateway: could not reach the origin server.');
  }
});

server.listen(port, () => console.log(`Proxy on http://localhost:${port} → ${origin}`));
