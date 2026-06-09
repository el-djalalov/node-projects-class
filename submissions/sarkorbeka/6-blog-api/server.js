const express = require('express');
const app = express();
app.use(express.json());

let posts = [];
let nextId = 1;

function validatePost(body) {
  const errors = [];
  if (typeof body.title !== 'string' || body.title.trim() === '') errors.push('title is required');
  if (typeof body.content !== 'string' || body.content.trim() === '') errors.push('content is required');
  if (typeof body.category !== 'string' || body.category.trim() === '') errors.push('category is required');
  if (!Array.isArray(body.tags) || !body.tags.every(t => typeof t === 'string')) errors.push('tags must be an array of strings');
  return errors;
}

app.get('/', (req, res) => res.send('Blog API is running'));

app.post('/posts', (req, res) => {
  const errors = validatePost(req.body);
  if (errors.length > 0) return res.status(400).json({ errors });
  const now = new Date().toISOString();
  const post = {
    id: nextId++,
    title: req.body.title,
    content: req.body.content,
    category: req.body.category,
    tags: req.body.tags,
    createdAt: now,
    updatedAt: now,
  };
  posts.push(post);
  res.status(201).json(post);
});

app.get('/posts', (req, res) => {
  const term = req.query.term;
  if (!term) return res.json(posts);
  const t = term.toLowerCase();
  const matches = posts.filter(p =>
    p.title.toLowerCase().includes(t) ||
    p.content.toLowerCase().includes(t) ||
    p.category.toLowerCase().includes(t)
  );
  res.json(matches);
});

app.get('/posts/:id', (req, res) => {
  const id = Number(req.params.id);
  const post = posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  res.json(post);
});

app.put('/posts/:id', (req, res) => {
  const id = Number(req.params.id);
  const index = posts.findIndex(p => p.id === id);
  if (index === -1) return res.status(404).json({ error: 'Post not found' });
  const errors = validatePost(req.body);
  if (errors.length > 0) return res.status(400).json({ errors });
  const now = new Date().toISOString();
  const existing = posts[index];
  const updated = {
    id: existing.id,
    title: req.body.title,
    content: req.body.content,
    category: req.body.category,
    tags: req.body.tags,
    createdAt: existing.createdAt,
    updatedAt: now,
  };
  posts[index] = updated;
  res.json(updated);
});

app.delete('/posts/:id', (req, res) => {
  const id = Number(req.params.id);
  const index = posts.findIndex(p => p.id === id);
  if (index === -1) return res.status(404).json({ error: 'Post not found' });
  posts.splice(index, 1);
  res.status(204).end();
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Blog API listening on http://localhost:${port}`));
