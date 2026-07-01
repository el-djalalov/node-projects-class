const path = require("node:path");

function createMockPostStore() {
    let nextId = 1;
    let posts = new Map();

    function clonePost(post) {
        if (!post) {
            return null;
        }

        return {
            ...post,
            tags: Array.isArray(post.tags) ? [...post.tags] : [],
        };
    }

    function reset() {
        nextId = 1;
        posts = new Map();
    }

    function createPost(body) {
        const now = new Date().toISOString();
        const post = {
            id: nextId,
            title: body.title,
            content: body.content,
            category: body.category,
            tags: Array.isArray(body.tags) ? [...body.tags] : [],
            createdAt: now,
            updatedAt: now,
        };

        posts.set(nextId, post);
        nextId += 1;

        return clonePost(post);
    }

    function getPost(id) {
        return clonePost(posts.get(Number(id)) || null);
    }

    function searchPosts(term, page, limit, sort, order) {
        let results = Array.from(posts.values()).map(clonePost);

        if (typeof term === "string" && term.trim() !== "") {
            const needle = term.trim().toLowerCase();
            results = results.filter((post) => {
                return (
                    post.title.toLowerCase().includes(needle) ||
                    post.content.toLowerCase().includes(needle) ||
                    post.category.toLowerCase().includes(needle)
                );
            });
        }

        if (sort === "createdAt" || sort === "updatedAt" || sort === "title") {
            results.sort((left, right) => {
                const leftValue = String(left[sort]);
                const rightValue = String(right[sort]);

                if (leftValue === rightValue) {
                    return 0;
                }

                const direction = order === "desc" ? -1 : 1;
                return leftValue < rightValue ? -1 * direction : direction;
            });
        }

        const start = Math.max((page - 1) * limit, 0);
        return results.slice(start, start + limit);
    }

    function deletePost(id) {
        const numericId = Number(id);
        if (!posts.has(numericId)) {
            return false;
        }

        posts.delete(numericId);
        return true;
    }

    function patchPost(id, data) {
        const numericId = Number(id);
        const current = posts.get(numericId);

        if (!current) {
            return null;
        }

        const updated = {
            ...current,
            ...data,
            tags: "tags" in data ? [...data.tags] : [...current.tags],
            updatedAt: new Date().toISOString(),
        };

        posts.set(numericId, updated);
        return clonePost(updated);
    }

    function updatePost(id, data) {
        const numericId = Number(id);
        const current = posts.get(numericId);

        if (!current) {
            return null;
        }

        const updated = {
            id: numericId,
            title: data.title,
            content: data.content,
            category: data.category,
            tags: Array.isArray(data.tags) ? [...data.tags] : [],
            createdAt: current.createdAt,
            updatedAt: new Date().toISOString(),
        };

        posts.set(numericId, updated);
        return clonePost(updated);
    }

    return {
        createPost,
        getPost,
        searchPosts,
        deletePost,
        patchPost,
        updatePost,
        reset,
    };
}

function installMockPostStore() {
    const storePath = require.resolve(path.join(__dirname, "..", "..", "src", "stores", "sqlitePostStore.js"));
    const store = createMockPostStore();

    delete require.cache[storePath];
    require.cache[storePath] = {
        id: storePath,
        filename: storePath,
        loaded: true,
        exports: store,
    };

    return store;
}

module.exports = {
    installMockPostStore,
};
