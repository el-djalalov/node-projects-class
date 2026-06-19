#!/usr/bin/env node
const express = require('express')
const crypto = require('crypto')
const { DatabaseSync } = require('node:sqlite')

const app = express()
app.use(express.json())

const db = new DatabaseSync('urls.db');
db.exec(`CREATE TABLE IF NOT EXISTS urls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shortCode TEXT UNIQUE NOT NULL,
  url TEXT NOT NULL,
  accessCount INTEGER DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
)`)

function generateShortCode() {
  return crypto.randomBytes(4).toString('base64url')
}

function isValidUrl(str) {
  try {
    new URL(str);
    return true
  } catch {
    return false
  }
}

const insertStmt = db.prepare('INSERT INTO urls (shortCode, url, createdAt, updatedAt) VALUES (?, ?, ?, ?)')
const findByShortCode = db.prepare('SELECT * FROM urls WHERE shortCode = ?')
const incrementAccess = db.prepare('UPDATE urls SET accessCount = accessCount + 1 WHERE shortCode = ?')
const updateUrl = db.prepare('UPDATE urls SET url = ?, updatedAt = ? WHERE shortCode = ?')
const deleteByShortCode = db.prepare('DELETE FROM urls WHERE shortCode = ?')
const checkShortCode = db.prepare('SELECT id FROM urls WHERE shortCode = ?')

app.post('/shorten', (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') return res.status(400).json({
    error: 'url is required'
  });

  if (!isValidUrl(url)) return res.status(400).json({
    error:
      'Invalid URL'
  });

  let shortCode;
  let attempts = 0;
  while (attempts < 10) {
    shortCode = generateShortCode()

    if (!checkShortCode.get(shortCode)) break

    attempts++
  }

  if (attempts >= 10) return res.status(500).json({
    error: 'Could not generate unique short code'
  });

  const now = new Date().toISOString()

  insertStmt.run(shortCode, url, now, now)

  res.status(201).json({
    shortCode,
    url,
    createdAt: now,
    updatedAt: now
  });
});

app.get('/shorten/:shortCode', (req, res) => {
  const record = findByShortCode.get(req.params.shortCode)

  if (!record) return res.status(404).json({
    error: 'Not found'
  });

  incrementAccess.run(req.params.shortCode);
  res.json(record);
});

app.put('/shorten/:shortCode', (req, res) => {
  const record = findByShortCode.get(req.params.shortCode);
  if (!record) return res.status(404).json({
    error: 'Not found'
  });

  const { url } = req.body;
  if (!url || typeof url !== 'string') return res.status(400).json({
    error: 'url is required'
  });

  if (!isValidUrl(url)) return res.status(400).json({
    error: 'Invalid URL'
  });

  const now = new Date().toISOString()

  updateUrl.run(url, now, req.params.shortCode)

  const updated = findByShortCode.get(req.params.shortCode)

  res.json(updated);
});

app.delete('/shorten/:shortCode', (req, res) => {
  const record = findByShortCode.get(req.params.shortCode)

  if (!record) return res.status(404).json({
    error: 'Not found'
  })

  deleteByShortCode.run(req.params.shortCode)
  res.status(204).end()
});

app.get('/shorten/:shortCode/stats', (req, res) => {
  const record = findByShortCode.get(req.params.shortCode)

  if (!record) return res.status(404).json({
    error: 'Not found'
  });

  res.json(record);
});

app.get('/:shortCode', (req, res) => {
  const record = findByShortCode.get(req.params.shortCode)
  if (!record) return res.status(404).json({
    error: 'Not found'
  })

  incrementAccess.run(req.params.shortCode)

  res.redirect(302, record.url)
})

app.use((req, res) => res.status(404).json({
  error: 'Not found'
}))

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`URL Shortener listening on http://localhost:${port}`))
