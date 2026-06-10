const express = require("express");
const {
    createPost,
    getPost,
    searchPosts,
    deletePost,
    patchPost,
    updatePost,
} = require("./src/stores/sqlitePostStore")

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static("public"));

app.get("/posts", (req, res) => {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);

    // term is a search term that should be matched against the title and content of the post
    // sort is the field to sort by (title, createdAt, etc.)
    // order is the sort order (asc or desc)
    const posts = searchPosts(
        req.query.term,
        page,
        limit,
        req.query.sort,
        req.query.order
    );

    res.json(posts);
});


app.post("/posts", (req, res) => {
    const errors = validatePost(req.body);

    if (errors.length > 0) {
        return res.status(400).json({ errors });
    }

    const post = createPost(req.body);

    res.status(201).json(post);
});



app.get("/posts/:id", (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(404).json({ error: "Post not found" });
    }

    const post = getPost(id);

    if (!post) {
        return res.status(404).json({ error: "Post not found" });
    }

    res.json(post);
});

app.delete("/posts/:id", (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(404).json({ error: "Post not found" });
    }

    const success = deletePost(id);

    if (!success)  {
        return res.status(404).json({ error: "Post not found" });
    }

    res.status(204).end();
});

app.patch("/posts/:id", (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(404).json({ error: "Post not found" });
    }

    const errors = validatePatchPost(req.body);

    if (errors.length > 0) {
        return res.status(400).json({ errors });
    }

    const post = patchPost(id, req.body);

    if (!post) {
        return res.status(404).json({ error: "Post not found" });
    }

    res.json(post);
});

app.put("/posts/:id", (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
        return res.status(404).json({ error: "Post not found" });
    }

    const errors = validatePost(req.body);

    if (errors.length > 0) {
        return res.status(400).json({ errors });
    }

    const post = updatePost(id, req.body);

    if (!post) {
        return res.status(404).json({ error: "Post not found" });
    }

    res.json(post);
});

app.use((req, res) => {
    res.status(404).json({ error: "Not found" });
});

// app.use((err, req, res, next) => {
//     if (err.type === "entity.parse.failed") {
//         return res.status(400).json({ error: "Invalid JSON body" });
//     }
//
//     res.status(500).json({ error: "Server error" });
// });

app.use((err, req, res, next) => {
    console.error(err);

    if (err.type === "entity.parse.failed") {
        return res.status(400).json({ error: "Invalid JSON body" });
    }

    res.status(500).json({ error: "Server error" });
});

function validatePost(body) {
    const errors = [];

    if (typeof body.title !== "string" || body.title.trim() === "") {
        errors.push("title is required");
    }

    if (typeof body.content !== "string" || body.content.trim() === "") {
        errors.push("content is required");
    }

    if (typeof body.category !== "string" || body.category.trim() === "") {
        errors.push("category is required");
    }

    if (!Array.isArray(body.tags) || !body.tags.every(tag => typeof tag === "string")) {
        errors.push("tags must be an array of strings");
    }

    return errors;
}

function validatePatchPost(body) {
    const errors = [];

    if (Object.keys(body).length === 0) {
        errors.push("at least one field is required");
    }

    if ("title" in body && (typeof body.title !== "string" || body.title.trim() === "")) {
        errors.push("title must be a non-empty string");
    }

    if ("content" in body && (typeof body.content !== "string" || body.content.trim() === "")) {
        errors.push("content must be a non-empty string");
    }

    if ("category" in body && (typeof body.category !== "string" || body.category.trim() === "")) {
        errors.push("category must be a non-empty string");
    }

    if ("tags" in body && (!Array.isArray(body.tags) || !body.tags.every(tag => typeof tag === "string"))) {
        errors.push("tags must be an array of strings");
    }

    return errors;
}

app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});


