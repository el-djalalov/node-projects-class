const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("blog.db");
const crypto = require("node:crypto");

db.exec("PRAGMA foreign_keys = ON");


//  short_code TEXT NOT NULL UNIQUE, - will not allow to save duplicate url
db.exec(`
    CREATE TABLE IF NOT EXISTS urls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        original_url TEXT NOT NULL,
        short_code TEXT NOT NULL UNIQUE,
        access_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT                         
    );

`);

function getURLByShortCode(shortCode) {
    const stmt = db.prepare(`
        SELECT
            id,
            original_url AS originalUrl,
            short_code AS shortCode,
            access_count AS accessCount,
            updated_at AS updatedAt,
            created_at AS createdAt,
            expires_at AS expiresAt
        FROM urls
        WHERE short_code = ?
    `);

    return stmt.get(shortCode);
}

function getURLById(id) {
    const stmt = db.prepare(`
        SELECT
            id,
            original_url AS originalUrl,
            short_code AS shortCode,
            access_count AS accessCount,
            created_at AS createdAt,
            updated_at AS updatedAt,
            expires_at AS expiresAt
        FROM urls
        WHERE id = ?
    `);

    return stmt.get(id);
}

function getURLsPaginated(page = 1, limit = 10) {
    const offset = (page - 1) * limit;

    const dataStmt = db.prepare(`
        SELECT
            id,
            original_url AS originalUrl,
            short_code AS shortCode,
            access_count AS accessCount,
            created_at AS createdAt,
            updated_at AS updatedAt,
            expires_at AS expiresAt
        FROM urls
        ORDER BY created_at DESC
        LIMIT ?
        OFFSET ?
    `);

    const countStmt = db.prepare(`
        SELECT COUNT(*) AS total
        FROM urls
    `);

    const data = dataStmt.all(limit, offset);
    const { total } = countStmt.get();

    return {
        data,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasNextPage: page * limit < total,
            hasPrevPage: page > 1,
        },
    };
}

function deleteURL(shortCode) {
    const info = db.prepare("DELETE FROM urls  WHERE short_code = ?").run(shortCode);
    return info.changes > 0;
}

function putURL(shortCode, newOriginalUrl) {
    const row = getURLByShortCode(shortCode);

    if (!row) {
        return null;
    }

    const stmt = db.prepare(`
        UPDATE urls
        SET
            original_url = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE short_code = ?
    `);

    const result = stmt.run(newOriginalUrl, shortCode);

    db.prepare(`
        UPDATE urls SET short_code = ?
        WHERE short_code = ?
    `).run(shortCode);

    if (result.changes === 0) {
        return null;
    }
    return getURLByShortCode(shortCode);

}

// function getURLStats() {
//     const stmt = db.prepare(`
//         SELECT
//             id,
//             original_url AS originalUrl,
//             short_code AS shortCode,
//             access_count AS accessCount,
//             created_at AS createdAt
//         FROM urls
//         ORDER BY access_count DESC
//     `);
//
//     return stmt.all();
// }

function incrementAccessCount(shortCode) {
    const stmt = db.prepare(`
        UPDATE urls
        SET access_count = access_count + 1
        WHERE short_code = ?
    `);

    stmt.run(shortCode);
}

function generateShortCode() {
    // 16^8 = 4 294 967 296 variants
    return crypto.randomBytes(4).toString("hex");
}

function getURLStatsByShortCode(shortCode) {
    const stmt = db.prepare(`
        SELECT 
            id,
            original_url AS originalUrl,
            short_code AS shortCode,
            access_count AS accessCount,
            created_at AS createdAt,
            updated_at AS updatedAt,
            expires_at AS expiresAt
        FROM urls
        WHERE short_code = ?
    `);

    return stmt.get(shortCode);
}

function createURL(originalUrl, ttlSeconds) {
    const maxAttempts = 5;
    const expiresAt = calculateExpiresAt(ttlSeconds);

    const stmt = db.prepare(`
        INSERT INTO urls (original_url, short_code, expires_at)
        VALUES (?, ?, ?)
    `);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const shortCode = generateShortCode();

        try {
            const result = stmt.run(originalUrl, shortCode, expiresAt);
            return getURLById(result.lastInsertRowid);
        } catch (error) {
            if (isShortCodeCollision(error)) {
                continue;
            }

            throw error;
        }
    }

    throw new Error("Failed to generate unique short code");
}

function isShortCodeCollision(error) {
    return (
        error.code === "SQLITE_CONSTRAINT_UNIQUE" ||
        error.code === "SQLITE_CONSTRAINT" ||
        error.message.includes("UNIQUE constraint failed") ||
        error.message.includes("urls.short_code")
    );
}

function calculateExpiresAt(ttlSeconds) {
    if (ttlSeconds === undefined) {
        return null;
    }

    return new Date(Date.now() + ttlSeconds * 1000).toISOString();
}

module.exports = {
    getURLByShortCode,
    createURL,
    incrementAccessCount,
    getURLsPaginated,
    getURLStatsByShortCode,
    deleteURL,
    putURL,
};