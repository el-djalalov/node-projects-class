const { DatabaseSync } = require("node:sqlite");

const DB_PATH = process.env.SQLITE_DB_PATH || "blog.db";
const IS_TEST_RUN =
    process.env.NODE_ENV === "test" ||
    process.argv.includes("--test");

const db = new DatabaseSync(IS_TEST_RUN ? ":memory:" : DB_PATH);

// Per-connection PRAGMAs.
// WAL improves read/write concurrency.
// busy_timeout makes SQLite wait before throwing SQLITE_BUSY.
// Enable foreign key support so that cascade deletes work.
db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = NORMAL;
`);

if (!IS_TEST_RUN) {
    db.exec("PRAGMA journal_mode = WAL;");
}

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
    return withWriteTransaction(() => {
        const now = new Date().toISOString();

        const info = db.prepare(
            `INSERT INTO posts (title, content, category, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?)`
        ).run(title, content, category, now, now);

        const postId = Number(info.lastInsertRowid);

        setTagsForPost(postId, tags);

        return getPost(postId);
    });
}

function getPost(id) {
    const row = db.prepare("SELECT * FROM posts WHERE id = ?").get(id);

    if (!row) {
        return null;
    }

    return formatPost(row);
}

function withWriteTransaction(fn) {
    try {
        db.exec("BEGIN IMMEDIATE");

        const result = fn();

        db.exec("COMMIT");

        return result;
    } catch (err) {
        try {
            db.exec("ROLLBACK");
        } catch {
            // Ignore rollback errors, for example if BEGIN failed before transaction started.
        }

        throw err;
    }
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
    return withWriteTransaction(() => {
        const info = db.prepare("DELETE FROM posts WHERE id = ?").run(id);
        return info.changes > 0;
    });
}


function patchPost(id, updates) {
    return withWriteTransaction(() => {
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
    });
}

function updatePost(id, { title, content, category, tags }) {
    return withWriteTransaction(() => {
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
    });
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