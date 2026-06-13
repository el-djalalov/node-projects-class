import { useEffect, useState } from "react";
import "./App.modules.css";

const API_URL = "http://localhost:3000";

function App() {
    const [url, setUrl] = useState("");
    const [shortUrl, setShortUrl] = useState("");
    const [stats, setStats] = useState([]);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        loadStats();
    }, []);

    async function handleSubmit(event) {
        event.preventDefault();

        setMessage("");
        setError("");
        setShortUrl("");

        try {
            const response = await fetch(`${API_URL}/shorten`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    url: url.trim(),
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                const errorText = data.errors
                    ? data.errors.join(", ")
                    : data.error || "Failed to shorten URL";

                setError(errorText);
                return;
            }

            const createdShortUrl = `${API_URL}/shorten/${data.data.shortCode}`;

            setShortUrl(createdShortUrl);
            setMessage("Short URL created");
            setUrl("");

            await loadStats();
        } catch {
            setError("Network error");
        }
    }

    async function loadStats() {
        try {
            const response = await fetch(`${API_URL}/stats`);
            const data = await response.json();

            if (!response.ok) {
                setError(data.error || "Failed to load stats");
                return;
            }

            setStats(data.data);
        } catch {
            setError("Failed to connect to API");
        }
    }

    return (
        <main className="page">
            <section className="card">
                <h1>URL Shortener</h1>

                <form className="form" onSubmit={handleSubmit}>
                    <label htmlFor="url">Long URL</label>

                    <input
                        id="url"
                        type="url"
                        value={url}
                        placeholder="https://example.com"
                        onChange={(event) => setUrl(event.target.value)}
                        required
                    />

                    <button type="submit">Shorten</button>
                </form>

                {message && <p className="message success">{message}</p>}
                {error && <p className="message error">{error}</p>}

                {shortUrl && (
                    <div className="result">
                        <p>Short URL:</p>
                        <a href={shortUrl} target="_blank" rel="noreferrer">
                            {shortUrl}
                        </a>
                    </div>
                )}
            </section>

            <section className="card">
                <div className="statsHeader">
                    <h2>Stats</h2>
                    <button type="button" onClick={loadStats}>
                        Refresh
                    </button>
                </div>

                {stats.length === 0 ? (
                    <p>No shortened URLs yet.</p>
                ) : (
                    <div className="statsList">
                        {stats.map((item) => {
                            const itemShortUrl = `${API_URL}/shorten/${item.shortCode}`;

                            return (
                                <article className="statItem" key={item.id}>
                                    <a
                                        href={itemShortUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        {itemShortUrl}
                                    </a>

                                    <p className="originalUrl">
                                        {item.originalUrl}
                                    </p>

                                    <p>
                                        Access count:{" "}
                                        <strong>{item.accessCount}</strong>
                                    </p>

                                    <p className="createdAt">
                                        Created: {item.createdAt}
                                    </p>
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>
        </main>
    );
}

export default App;