const postsEl = document.querySelector("#posts");
const form = document.querySelector("#post-form");

const titleInput = document.querySelector("#title");
const contentInput = document.querySelector("#content");
const categoryInput = document.querySelector("#category");
const tagsInput = document.querySelector("#tags");

const searchInput = document.querySelector("#search");
const searchButton = document.querySelector("#search-button");
const resetButton = document.querySelector("#reset-button");

async function loadPosts(term = "") {
    const url = term
        ? `/posts?term=${encodeURIComponent(term)}`
        : "/posts";

    const res = await fetch(url);
    const posts = await res.json();

    renderPosts(posts);
}

function renderPosts(posts) {
    postsEl.innerHTML = "";

    if (posts.length === 0) {
        postsEl.innerHTML = "<p>No posts found.</p>";
        return;
    }

    for (const post of posts) {
        const article = document.createElement("article");
        article.className = "post";

        article.innerHTML = `
            <h2>${post.title}</h2>
            <p>${post.content}</p>
            <p class="meta">Category: ${post.category}</p>
            <p class="tags">Tags: ${post.tags.join(", ")}</p>
            <button data-id="${post.id}">Delete</button>
        `;

        postsEl.appendChild(article);
    }
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const tags = tagsInput.value
        .split(",")
        .map(tag => tag.trim())
        .filter(Boolean);

    const newPost = {
        title: titleInput.value,
        content: contentInput.value,
        category: categoryInput.value,
        tags,
    };

    const res = await fetch("/posts", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(newPost),
    });

    if (!res.ok) {
        const error = await res.json();
        alert(error.errors?.join("\n") || error.error || "Failed to create post");
        return;
    }

    form.reset();
    await loadPosts();
});

postsEl.addEventListener("click", async (event) => {
    if (event.target.tagName !== "BUTTON") {
        return;
    }

    const id = event.target.dataset.id;

    await fetch(`/posts/${id}`, {
        method: "DELETE",
    });

    await loadPosts(searchInput.value.trim());
});

searchButton.addEventListener("click", async () => {
    await loadPosts(searchInput.value.trim());
});

resetButton.addEventListener("click", async () => {
    searchInput.value = "";
    await loadPosts();
});

loadPosts();