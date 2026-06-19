#!/usr/bin/env node
const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { marked } = require('marked')
const writeGood = require('write-good')

const app = express()
app.use(express.json())

const NOTES_DIR = path.join(__dirname, 'notes')
const INDEX_FILE = path.join(NOTES_DIR, 'index.json')

if (!fs.existsSync(NOTES_DIR)) fs.mkdirSync(NOTES_DIR);

function loadIndex() {
  try {
    if (fs.existsSync(INDEX_FILE)) return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
  } catch { }
  return [];
}

function saveIndex(index) {
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
}

function nextId(index) {
  return index.length === 0 ? 1 : Math.max(...index.map(n => n.id)) + 1;
}

const upload = multer({
  dest: NOTES_DIR,
  fileFilter: (req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith('.md')) {
      return cb(new Error('Only .md files are allowed'));
    }
    cb(null, true);
  }
});

function saveNoteFrom(writeContent, userFilename) {
  const index = loadIndex()
  const id = nextId(index)
  const now = new Date().toISOString()
  const filePath = path.join(NOTES_DIR, `${id}.md`)

  writeContent(filePath)

  const note = {
    id,
    filename: userFilename || `${id}.md`,
    createdAt: now,
    updatedAt: now
  };

  index.push(note)
  saveIndex(index)

  return note
}

app.post('/notes', (req, res) => {
  const ct = req.headers['content-type'] || '';

  if (ct.includes('multipart/form-data')) {
    return upload.single('file')(req, res, (err) => {
      if (err) return res.status(400).json({
        error: err.message
      });

      if (!req.file) return res.status(400).json({
        error: 'No file uploaded'
      });

      const note = saveNoteFrom(
        (fp) => fs.renameSync(req.file.path, fp),
        req.file.originalname
      )

      res.status(201).json(note)
    });
  }

  const { content } = req.body;
  if (!content || typeof content !== 'string' || content.trim() === '') {
    return res.status(400).json({ error: 'content is required' });
  }

  const note = saveNoteFrom(
    (fp) => fs.writeFileSync(fp, content)
  )

  res.status(201).json(note)
});

app.get('/notes', (req, res) => {
  const index = loadIndex();
  const query = (req.query.search || '').toLowerCase()

  if (!query) {
    return res.json(index.map(n => ({
      id: n.id,
      filename: n.filename,
      createdAt: n.createdAt,
    })));
  }

  const matches = index.filter(n => {
    if (n.filename.toLowerCase().includes(query)) return true

    const filePath = path.join(NOTES_DIR, `${n.id}.md`);

    if (!fs.existsSync(filePath)) return false

    const content = fs.readFileSync(filePath, 'utf-8').toLowerCase()

    return content.includes(query);
  });

  res.json(matches.map(n => ({
    id: n.id,
    filename: n.filename,
    createdAt: n.createdAt,
  })))
});

app.get('/notes/:id', (req, res) => {
  const id = Number(req.params.id)
  const index = loadIndex()
  const note = index.find(n => n.id === id)

  if (!note) return res.status(404).json({
    error: 'Note not found',
  })

  const filePath = path.join(NOTES_DIR, `${id}.md`)

  if (!fs.existsSync(filePath)) return res.status(404).json({
    error: 'Note file missing',
  })

  const content = fs.readFileSync(filePath, 'utf-8')

  res.type('text/plain').send(content)
});

app.get('/notes/:id/render', (req, res) => {
  const id = Number(req.params.id)

  const index = loadIndex()

  const note = index.find(n => n.id === id)

  if (!note) return res.status(404).json({
    error: 'Note not found',
  })

  const filePath = path.join(NOTES_DIR, `${id}.md`)
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Note file missing' })

  const content = fs.readFileSync(filePath, 'utf-8')
  const html = marked(content)
  res.type('text/html').send(html)
});

app.post('/notes/:id/check', (req, res) => {
  const id = Number(req.params.id)
  const index = loadIndex()
  const note = index.find(n => n.id === id)

  if (!note) return res.status(404).json({
    error: 'Note not found'
  });

  const filePath = path.join(NOTES_DIR, `${id}.md`);

  if (!fs.existsSync(filePath)) return res.status(404).json({
    error: 'Note file missing'
  })

  const content = fs.readFileSync(filePath, 'utf-8');
  const suggestions = writeGood(content);
  res.json(suggestions);
});

app.put('/notes/:id', (req, res) => {
  const id = Number(req.params.id)
  const index = loadIndex()
  const noteIndex = index.findIndex(n => n.id === id)

  if (noteIndex === -1) return res.status(404).json({
    error: 'Note not found'
  })

  const filePath = path.join(NOTES_DIR, `${id}.md`)

  if (!fs.existsSync(filePath)) return res.status(404).json({
    error: 'Note file missing'
  })

  const { content } = req.body
  if (!content || typeof content !== 'string' || content.trim() === '') {
    return res.status(400).json({ error: 'content is required' })
  }

  fs.writeFileSync(filePath, content)
  index[noteIndex].updatedAt = new Date().toISOString()
  saveIndex(index)

  res.json(index[noteIndex])
});

app.delete('/notes/:id', (req, res) => {
  const id = +req.params.id
  const index = loadIndex()
  const noteIndex = index.findIndex(n => n.id === id)
  if (noteIndex === -1) return res.status(404).json({
    error: 'Note not found'
  })

  const filePath = path.join(NOTES_DIR, `${id}.md`)
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)

  index.splice(noteIndex, 1)
  saveIndex(index)
  res.status(204).end()
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Markdown Notes API listening on http://localhost:${port}`));
