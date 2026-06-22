Common sorted-set methods in node-redis
zAdd                  → save this request
zRemRangeByScore      → delete expired old requests
zCard                 → count active requests
zRangeWithScores      → inspect oldest/newest request with timestamp
zCount                → count requests in a score range
zRem                  → remove one exact request
zRank / zRevRank      → ranking, mostly for leaderboards
zPopMin / zPopMax     → remove lowest/highest score item


cache.zAdd(key, item)
Redis command: ZADD
Use it when you want to add a new request timestamp to the sorted set.
  await cache.zAdd(key, {
    score: Date.now(),
    value: `${Date.now()}:${Math.random()}`,
  });


cache.zCard(key)
Redis command: ZCARD
Use it when you want to count how many items are currently in the sorted set.
  const count = await cache.zCard(key);

limit = 5
zCard = 3
remaining = 2

cache.zRemRangeByScore(key, min, max)
Redis command: ZREMRANGEBYSCORE
Use it when you want to remove old items by score range.
  await cache.zRemRangeByScore(key, 0, windowStart);

cache.zRange(key, start, stop)
Redis command: ZRANGE
Use it when you want to read members by their position in the sorted set.
  const oldestMembers = await cache.zRange(key, 0, 0);

cache.zRangeWithScores(key, start, stop)
Use it when you need both:  member + score
  const oldest = await cache.zRangeWithScores(key, 0, 0);
[
  {
    value: "1710000000000:0.123",
    score: 1710000000000
  }
]

cache.zRem(key, member)
Redis command: ZREM
Use it when you want to remove a specific member.
  await cache.zRem(key, requestId);

request was added → later validation failed → remove that request from the limiter

cache.zCount(key, min, max)
Redis command: ZCOUNT
Use it when you want to get the score of one specific member.
  const score = await cache.zScore(key, member);

cache.zPopMax(key)
Redis command: ZPOPMAX
Use it when you want to remove and return the highest-score item.
    const mostRecent = await cache.zPopMax(key);

leaderboards
priority queues
highest-priority job first

const clients = new Map();

const LIMIT = 5;
const WINDOW_MS = 60 * 1000;

When I'll have a user authentication system, I can use the user ID as the client identifier.
Until then, I'll use the IP address of the request as a fallback.

const clientId = `ip:${req.ip}`;

const clientId = req.user?.id
    ? `user:${req.user.id}`
    : `ip:${req.ip}`;


function checkSlidingWindow(clientId) {
const now = Date.now();
const windowStart = now - WINDOW_MS;

    const requests = clients.get(clientId) || [];

    // Keep only requests inside the current sliding window
    const recentRequests = requests.filter(timestamp => timestamp > windowStart);

    if (recentRequests.length >= LIMIT) {
        clients.set(clientId, recentRequests);

        return {
            allowed: false,
            count: recentRequests.length,
            remaining: 0,
        };
    }

    recentRequests.push(now);
    clients.set(clientId, recentRequests);

    return {
        allowed: true,
        count: recentRequests.length,
        remaining: LIMIT - recentRequests.length,
    };
}



**fixed window rate limiter**

async function rateLimiter(req, res, next) {
if (!cache) {
// Fail open: Redis is an optimization, so the API should still work if Redis is down.
return next();
}

    const ip = req.ip;
    const key = `ratelimit:${ip}`;

    try {
        // INCR creates the key with value 1 if it does not exist yet,
        // so a brand-new client is counted and allowed through.
        const count = await cache.incr(key);

        if (count === 1) {
            // The first request starts the window and is included in the count.
            await cache.expire(key, RATE_LIMIT_WINDOW_SECONDS);
        }

        const ttl = await cache.ttl(key);
        const remaining = Math.max(RATE_LIMIT_MAX_REQUESTS - count, 0);
        const retryAfter = ttl > 0 ? ttl : RATE_LIMIT_WINDOW_SECONDS;

        res.set({
            "RateLimit-Limit": String(RATE_LIMIT_MAX_REQUESTS),
            "RateLimit-Remaining": String(remaining),
            "RateLimit-Reset": String(retryAfter),
        });

        console.log(`${key} count=${count}, ttl=${ttl}, remaining=${remaining}`);

        if (count > RATE_LIMIT_MAX_REQUESTS) {
            res.set("Retry-After", String(retryAfter));
            console.log(`${key} blocked with 429`);

            return res.status(429).json({ error: "Too many requests" });
        }

        return next();
    } catch {
        // Fail open: do not take the whole API down just because Redis failed.
        console.warn("Redis rate limiter failed — allowing request.");
        return next();
    }
}




# API Rate Limiter Smoke Tests

## 1. Start server

```powershell
node server.js
```

Expect:

```txt
Redis connected.
Blog API running on http://localhost:3000
```

With custom limits:

```powershell
node server.js --limit 3 --window 10
```

Expect:

```txt
Redis connected.
Blog API running on http://localhost:3000
```

---

# 2. POST `/posts` creates a rate-limit key

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/posts" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"title":"First post","content":"Hello","category":"backend","tags":["node","redis"]}'
```

Expect server console:

```txt
POST /posts
RATE LIMIT key=ratelimit:ip:::1:posts:create, count=1, remaining=2, retryAfter=60s
```

---

# 3. `X-Forwarded-For` creates a separate IP key

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/posts" `
  -Method POST `
  -Headers @{ "X-Forwarded-For" = "1.1.1.1" } `
  -ContentType "application/json" `
  -Body '{"title":"First post","content":"Hello","category":"backend","tags":["node","redis"]}'
```

Expect Redis key:

```txt
ratelimit:ip:1.1.1.1:posts:create
```

---

# 4. Middleware fires before route

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/posts" `
  -Method GET
```

Expect server console:

```txt
GET /posts
ratelimit:ip:::1:posts:list count=1, remaining=19
HIT posts:search:all:page:1:limit:10:sort:createdAt:order:desc
```

Request again:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/posts" `
  -Method GET
```

Expect server console:

```txt
GET /posts
ratelimit:ip:::1:posts:list count=2, remaining=18
HIT posts:search:all:page:1:limit:10:sort:createdAt:order:desc
```

Several requests:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/posts" `
  -Method GET

Invoke-RestMethod `
  -Uri "http://localhost:3000/posts" `
  -Method GET

Invoke-RestMethod `
  -Uri "http://localhost:3000/posts" `
  -Method GET
```

Expect server console:

```txt
ratelimit:ip:::1:posts:list count=1, remaining=19
ratelimit:ip:::1:posts:list count=2, remaining=18
ratelimit:ip:::1:posts:list count=3, remaining=17
```

---

# 5. Redis CLI checks

Open Redis CLI:

```powershell
docker exec -it redis-cache redis-cli
```

Or, if this is the active Redis container:

```powershell
docker exec -it redis-rate-limiter redis-cli
```

Inside Redis CLI:

```redis
KEYS ratelimit:*
```

Expect:

```txt
127.0.0.1:6379> KEYS ratelimit:*
1) "ratelimit:ip:1.1.1.1:posts:create"
```

Check list bucket count:

```redis
ZCARD ratelimit:ip:::1:posts:list
```

Expect:

```txt
(integer) 3
```

Check TTL:

```redis
TTL ratelimit:ip:::1:posts:list
```

Expect:

```txt
(integer) 55
```

---

# 6. Sliding window expires after window time

Start server with short window:

```powershell
node server.js --limit 3 --window 10
```

Send two read-one requests:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/posts/1" `
  -Method GET

Invoke-RestMethod `
  -Uri "http://localhost:3000/posts/1" `
  -Method GET
```

Redis checks:

```redis
ZCARD ratelimit:ip:::1:posts:read-one
TTL ratelimit:ip:::1:posts:read-one
```

Expect:

```txt
(integer) 2
(integer) 8
```

After 10 seconds:

```redis
ZCARD ratelimit:ip:::1:posts:read-one
TTL ratelimit:ip:::1:posts:read-one
```

Expect:

```txt
(integer) 0
(integer) -2
```

Request again:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/posts/1" `
  -Method GET
```

Expect server console:

```txt
ratelimit:ip:::1:posts:read-one count=1, remaining=29
```

---

# 7. `429 Too Many Requests`

Start server with strict default limit:

```powershell
node server.js --limit 3 --window 10
```

Use `curl.exe -i` here because it shows the HTTP status line:

```powershell
curl.exe -i http://localhost:3000/unknown
curl.exe -i http://localhost:3000/unknown
curl.exe -i http://localhost:3000/unknown
curl.exe -i http://localhost:3000/unknown
```

Expect fourth request:

```http
HTTP/1.1 429 Too Many Requests
```

Expect server console:

```txt
ratelimit:ip:::1:default count=4, remaining=0
ratelimit:ip:::1:default blocked with 429
```

---

# 8. POST create limit: 3 allowed, 4th blocked

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/posts" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"title":"Post 1","content":"Hello","category":"backend","tags":["node"]}'

Invoke-RestMethod `
  -Uri "http://localhost:3000/posts" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"title":"Post 2","content":"Hello","category":"backend","tags":["node"]}'

Invoke-RestMethod `
  -Uri "http://localhost:3000/posts" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"title":"Post 3","content":"Hello","category":"backend","tags":["node"]}'
```

Fourth request should be blocked.

Use `curl.exe -i` if you need to show `429` and headers:

```powershell
curl.exe -i `
  -X POST `
  -H "Content-Type: application/json" `
  --data '{"title":"Post 4","content":"Hello","category":"backend","tags":["node"]}' `
  http://localhost:3000/posts
```

Expect:

```http
HTTP/1.1 429 Too Many Requests
RateLimit-Limit: 3
RateLimit-Remaining: 0
Retry-After: 40
```

---

# 9. GET `/posts` has separate limit

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/posts" `
  -Method GET
```

Expect:

```http
HTTP/1.1 200 OK
RateLimit-Limit: 20
RateLimit-Remaining: 19
RateLimit-Reset: 60
```

Request again:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/posts" `
  -Method GET
```

Expect:

```http
RateLimit-Limit: 20
RateLimit-Remaining: 18
RateLimit-Reset: 60
```

To actually display headers, use:

```powershell
curl.exe -i http://localhost:3000/posts
```

Expect:

```http
HTTP/1.1 200 OK
RateLimit-Limit: 20
RateLimit-Remaining: 19
RateLimit-Reset: 60
```

---

# 10. Blocked POST shows `Retry-After`

Send POST several times until blocked:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/posts" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"title":"Blocked post","content":"Hello","category":"backend","tags":["node"]}'
```

For visible headers, use:

```powershell
curl.exe -i `
  -X POST `
  -H "Content-Type: application/json" `
  --data '{"title":"Blocked post","content":"Hello","category":"backend","tags":["node"]}' `
  http://localhost:3000/posts
```

Expect:

```http
HTTP/1.1 429 Too Many Requests
RateLimit-Limit: 3
RateLimit-Remaining: 0
RateLimit-Reset: 40
Retry-After: 40
```

---

# 11. Fresh client is not punished for old client’s traffic

Client 1:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/posts" `
  -Method GET `
  -Headers @{ "X-Forwarded-For" = "1.1.1.1" }

Invoke-RestMethod `
  -Uri "http://localhost:3000/posts" `
  -Method GET `
  -Headers @{ "X-Forwarded-For" = "1.1.1.1" }

Invoke-RestMethod `
  -Uri "http://localhost:3000/posts" `
  -Method GET `
  -Headers @{ "X-Forwarded-For" = "1.1.1.1" }
```

Expect Redis key:

```txt
ratelimit:ip:1.1.1.1:posts:list
```

Client 2:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/posts" `
  -Method GET `
  -Headers @{ "X-Forwarded-For" = "2.2.2.2" }
```

Expect:

```http
HTTP/1.1 200 OK
```

Redis:

```redis
KEYS ratelimit:*
```

Expect:

```txt
ratelimit:ip:1.1.1.1:posts:list
ratelimit:ip:2.2.2.2:posts:list
```

---

# 12. Per-route limits

GET list route:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/posts" `
  -Method GET
```

Expect Redis key:

```txt
ratelimit:ip:::1:posts:list
```

POST create route:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/posts" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"title":"Write test","content":"Hello","category":"backend","tags":["redis"]}'
```

Expect server console:

```txt
RATE LIMIT key=ratelimit:ip:::1:posts:create, count=1, remaining=2, retryAfter=60s
```

Expect header:

```http
RateLimit-Limit: 3
```

Read-one route:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/posts/1" `
  -Method GET

Invoke-RestMethod `
  -Uri "http://localhost:3000/posts/2" `
  -Method GET

Invoke-RestMethod `
  -Uri "http://localhost:3000/posts/999" `
  -Method GET
```

Expect bucket:

```txt
posts:read-one
```

Expect Redis key:

```txt
ratelimit:ip:::1:posts:read-one
```

---

# 13. Rate-limit status endpoint

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/rate-limit-status?bucket=default" `
  -Method GET
```

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/rate-limit-status?bucket=posts:list" `
  -Method GET
```

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/rate-limit-status?bucket=posts:create" `
  -Method GET
```

Expect:

```txt
key              : ratelimit:ip:::1:posts:list
algorithm        : sliding-window
bucket           : posts:list
count            : 0
limit            : 20
remaining        : 20
secondsRemaining : 0
```

---

# 14. Redis down: fail open

Stop Redis containers:

```powershell
docker stop redis-cache
docker stop valkey
```

Start server:

```powershell
node server.js
```

Expect:

```txt
Redis unavailable — continuing without cache.
Blog API running on http://localhost:3000
```

Request should still work:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/posts" `
  -Method GET
```

Expected result:

```txt
API still responds even when Redis is unavailable.
```

---

# 15. Redis keys cleanup

Inside Redis CLI:

```redis
KEYS ratelimit:*
```

Delete specific keys:

```redis
DEL ratelimit:ip:::1:posts:list
DEL ratelimit:ip:::1:posts:create
DEL ratelimit:ip:::1:posts:read-one
```

Development cleanup:

```redis
FLUSHDB
```
