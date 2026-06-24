const { DatabaseSync } = require("node:sqlite");

const db = new DatabaseSync("blog.db"); // данные сохраняются в файле blog.db, который будет создан в текущей папке, если его нет
// const db = new DatabaseSync(":memory:"); // для тестов, данные не сохраняются на диске

db.exec("PRAGMA foreign_keys = ON"); // Enable foreign key support so that cascade deletes work.

// define db schema
db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
                                         id INTEGER PRIMARY KEY AUTOINCREMENT,
                                         title TEXT NOT NULL,
                                         content TEXT NOT NULL,
                                         category TEXT NOT NULL,
                                         createdAt TEXT NOT NULL,
                                         updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tags (
                                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                                        name TEXT NOT NULL UNIQUE
    );


    CREATE TABLE IF NOT EXISTS post_tags (
                                             postId INTEGER NOT NULL,
                                             tagId INTEGER NOT NULL,
                                             PRIMARY KEY (postId, tagId),
        FOREIGN KEY (postId) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY (tagId) REFERENCES tags(id) ON DELETE CASCADE
        );
`);

function createPost({ title, content, category, tags }) {
    const now = new Date().toISOString();

    const info = db.prepare(
        `INSERT INTO posts (title, content, category, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?)`
    ).run(title, content, category, now, now);

    const postId = info.lastInsertRowid;

    setTagsForPost(postId, tags);

    return getPost(postId);
}

function getPost(id) {
    const row = db.prepare(`
        SELECT * FROM posts WHERE id = ?
    `).get(id);

    if (!row) {
        return null;
    }

    return formatPost(row);
}

function searchPosts(term, page = 1, limit = 10, sort = "createdAt", order = "desc") {
    const offset = (page - 1) * limit;

    const allowedSortFields = ["id", "title", "category", "createdAt", "updatedAt"];
    const allowedOrders = ["asc", "desc"];

    const sortField = allowedSortFields.includes(sort) ? sort : "createdAt";
    const sortOrder = allowedOrders.includes(String(order).toLowerCase())
        ? String(order).toUpperCase()
        : "DESC";

    const rows = term
        ? db.prepare(`
                SELECT * FROM posts
                WHERE title LIKE ? OR content LIKE ? OR category LIKE ?
                ORDER BY ${sortField} ${sortOrder}
            LIMIT ? OFFSET ?
        `).all(
            `%${term}%`,
            `%${term}%`,
            `%${term}%`,
            limit,
            offset
        )
        : db.prepare(`
                SELECT * FROM posts
                ORDER BY ${sortField} ${sortOrder}
            LIMIT ? OFFSET ?
        `).all(limit, offset);


    return rows.map(formatPost);
}

function deletePost(id) {
    const info = db.prepare("DELETE FROM posts WHERE id = ?").run(id);
    return info.changes > 0; // returns true if a row was deleted
}

function patchPost(id, updates) {
    const currentPost = getPost(id);

    if (!currentPost) {
        return null;
    }

    const updatedPost = {
        ...currentPost,
        ...updates,
        updatedAt: new Date().toISOString(),
    };

    db.prepare(`
        UPDATE posts
        SET title = ?, content = ?, category = ?, updatedAt = ?
        WHERE id = ?
    `).run(
        updatedPost.title,
        updatedPost.content,
        updatedPost.category,
        updatedPost.updatedAt,
        id
    );

    if ("tags" in updates) {
        setTagsForPost(id, updates.tags);
    }

    return getPost(id);
}

function updatePost(id, { title, content, category, tags }) {
    const row = db.prepare(`
        SELECT * FROM posts WHERE id = ?
    `).get(id);

    if (!row) {
        return null;
    }

    const now = new Date().toISOString();

    db.prepare(`
        UPDATE posts
        SET title = ?, content = ?, category = ?, updatedAt = ?
        WHERE id = ?
    `).run(title, content, category, now, id);

    setTagsForPost(id, tags);

    return getPost(id);
}

function getTagsForPost(postId) {
    const rows = db.prepare(`
        SELECT tags.name
        FROM tags
                 JOIN post_tags ON tags.id = post_tags.tagId
        WHERE post_tags.postId = ?
        ORDER BY tags.name ASC
    `).all(postId);

    return rows.map(row => row.name); // return an array of tag names
}

// Helper function to create a tag if it doesn't exist and return its id
function formatPost(row) {
    return {
        ...row,
        tags: getTagsForPost(row.id),
    };
}


function setTagsForPost(postId, tags) {
    db.prepare("DELETE FROM post_tags WHERE postId = ?").run(postId);

    for (const tag of tags) {
        const normalizedTag = tag.trim();

        if (normalizedTag === "") {
            continue;
        }

        db.prepare(`
            INSERT INTO tags (name)
            VALUES (?)
            ON CONFLICT(name) DO NOTHING
        `).run(normalizedTag);

        const tagRow = db.prepare(`
            SELECT id FROM tags WHERE name = ?
        `).get(normalizedTag);

        db.prepare(`
            INSERT INTO post_tags (postId, tagId)
            VALUES (?, ?)
                ON CONFLICT(postId, tagId) DO NOTHING
        `).run(postId, tagRow.id);
    }
}

module.exports = {
    createPost,
    getPost,
    searchPosts,
    deletePost,
    patchPost,
    updatePost,
}