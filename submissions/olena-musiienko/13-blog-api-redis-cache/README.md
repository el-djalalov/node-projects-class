Step 3
I cache list/search results but only for a short time.
I invalidate all posts:search:* keys on any create, update, or delete.
This avoids serving deleted posts in the list after writes.
The short TTL is still a safety net if invalidation fails.

EX → How many seconds a key lasts
NX → Install a key only if it doesn't already exist
DEL → Deletes a key and returns 1 or 0
SCAN → It's safer to search for multiple keys using a pattern than KEYS

Stampede protection -
acquireCacheLock and releaseCacheLock are used to prevent cache stampedes.
Small Redis lock to reduce cache stampede.
If many requests miss the same key at the same time,
only one request should rebuild the cache from SQLite.
Other requests wait a little and try Redis again.
The lock has a TTL, so it will not stay forever if the app crashes.

Before commit:
- GET /posts/:id: MISS → SET → HIT
- PUT /posts/:id: cache gets fresh value or old key is removed
- DELETE /posts/:id: post:{id} is deleted from Redis
- GET /posts: list/search cache has short TTL
- POST/PUT/PATCH/DELETE: posts:search:* keys are invalidated
- Redis down: API still reads from SQLite
- Rate limit: returns 429 after the limit
- Ctrl+C: prints cache hit-rate
