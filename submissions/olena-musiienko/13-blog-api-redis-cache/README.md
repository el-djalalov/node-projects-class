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

// Invoke-RestMethod `
//   -Uri "http://localhost:3000/posts" `
// -Method POST `
//   -ContentType "application/json" `
// -Body '{"title":"First post","content":"Hello","category":"backend","tags":["node","redis"]}'


// Invoke-RestMethod http://localhost:3000/posts/1
// Invoke-RestMethod http://localhost:3000/posts/1
// MISS post:1
// SET post:1
// HIT post:1

//
// Invoke-RestMethod `
//   -Uri "http://localhost:3000/posts" `
// -Method POST `
//   -ContentType "application/json" `
// -Body '{"title":"Second post","content":"Something","category": "tech","tags":["js","server"]}'

// Invoke-RestMethod `
//   -Uri "http://localhost:3000/posts" `
// -Method POST `
//   -ContentType "application/json" `
// -Body '{"title":"Third post","content":"Something","category": "tech","tags":["js","server"]}'

// Invoke-RestMethod `
//   -Uri "http://localhost:3000/posts" `
// -Method POST `
//   -ContentType "application/json" `
// -Body '{"title":"Fourth post","content":"Something","category": "tech","tags":["js","server"]}'



//list
// Invoke-RestMethod http://localhost:3000/posts

// Invoke-RestMethod "http://localhost:3000/posts?search=tech"
// Invoke-RestMethod "http://localhost:3000/posts?search=backend"
// Invoke-RestMethod "http://localhost:3000/posts?sort=title&order=asc"
// Invoke-RestMethod "http://localhost:3000/posts?sort=title&order=desc"
// Invoke-RestMethod "http://localhost:3000/posts?search=node&page=1&limit=10&order=desc"
// Invoke-RestMethod "http://localhost:3000/posts?search=tech&page=1&limit=10"

// Invoke-RestMethod `
//   -Uri "http://localhost:3000/posts/1" `
// -Method PUT `
//   -ContentType "application/json" `
// -Body '{"title":"Updated post","content":"Updated text","category":"backend","tags":["node","redis"]}'
// INVALIDATED post:1
//
// Invoke-RestMethod http://localhost:3000/posts/1

// Invoke-WebRequest `
// -Uri "http://localhost:3000/posts/1" `
// -Method DELETE
// INVALIDATED post:1

// docker exec -it redis-cache redis-cli GET post:1
// (nil)

// checking SQLite that the post is deleted
// try {
//     Invoke-RestMethod http://localhost:3000/posts/1
// } catch {
//     $_.Exception.Response.StatusCode.value__
// }


//429
// try {
//     Invoke-RestMethod http://localhost:3000/posts
// } catch {
//     $_.Exception.Response.StatusCode.value__
// }


// docker exec -it redis-cache redis-cli GET post:1
// docker exec -it redis-cache redis-cli TTL post:1

// docker exec -it redis-cache redis-cli GET "ratelimit:::1"
// PS C:\Users\kraizkot> docker exec -it redis-cache redis-cli TTL "ratelimit:::1"
// (integer) 41

