Exercises & Questions 

**Part 1 — Command drills**
_1.1_  SET course node, then GET course. Now GET missing for a key you never set. What value comes back for the key that
doesn’t exist, and why does that matter for cache-aside?

Commands:
docker exec -it redis-cache redis-cli

SET course node -- OK
GET course
GET missing 

Result:
GET course → "node" 
GET missing → (nil) / null.

const cached = await client.get("missing");
console.log(cached); // null

If the key doesn't exist, Redis returns nil (or null in some clients). 
This is important for cache-aside because it indicates a cache miss. The value is not in cache, so now I should read it 
from the database.

_1.2_  Set a key with a 10-second expiry. Run TTL key twice, a few seconds apart, then once more after it expires. 
What does TTL return for a live key, a key with no expiry, and a key that’s gone?

Command:
SET temp value EX 10
TTL temp

For a live key with expiry, TTL returns how many seconds are left:
(integer) 10
(integer) 7
(integer) 3

After it expires:
(integer) -2

TTL > 0 → key exists and has expiry
TTL -1 → key exists but has no expiry 
TTL -2 → key does not exist anymore

_1.3_  Run INCR hits three times without ever setting hits first. What is its value, and what is its type when you read it back?

Commands:
INCR hits
INCR hits
INCR hits
GET hits

Result:
127.0.0.1:6379> INCR hits
(integer) 1
127.0.0.1:6379> INCR hits
(integer) 2
127.0.0.1:6379> INCR hits
(integer) 3
127.0.0.1:6379> GET hits
"3"
Redis creates the key automatically if it does not exist.
When I read it back with GET, it comes back as a string: "3".
Redis stores values as strings, even if the command treats them like numbers.

_1.4_  Store the array ["a","b","c"] under one key from Node, then read it back so it’s usable as a real array. 
Which two functions do you need, and where in Project 6 did you do the identical thing?

const arr = ["a", "b", "c"];
await client.set("letters", JSON.stringify(arr));

const cached = await client.get("letters");
const arr = JSON.parse(cached);

The two functions I need are:
- JSON.stringify() to convert the array to a string before storing it in Redis.
- JSON.parse() to convert the string back to an array after retrieving it from Redis.
  I did the same kind of thing in the earlier project when saving JavaScript data into a JSON file and reading it back 
- again. For example, saving tasks/expenses/cache data to a file and then loading it with JSON.parse().
- 
_1.5_  Delete a key with DEL, then GET it. Compare that result with a key that expired via TTL. From your code’s point of 
view, can it tell the two cases apart? 

Commands:
SET course node EX 5
GET course → "node"
TTL course → (integer) 5

DEL course
GET course

Result:
GET course → nil / null
If a key expired by TTL, GET also returns: nil (null)
TTL course  if expired → (integer) -2
TTL course if deleted → (integer) -2

So from my Node code’s point of view, both cases look the same:

const cached = await client.get(key);
if (cached === null) {
// cache miss
}
The code cannot tell if the key was deleted manually or expired by TTL. It only knows the key is not in cache anymore.


**Part 2 — Build exercises**
These are the pieces the lesson marked “yours to write,” plus two extensions. Commit after each one works.

_Exercise A —_ Project 12: flags, reporting, and surviving an outage
*Add a --ttl flag (default 60) using the Expense Tracker’s parseFlags. Prove it: --ttl 3, wait 4s, run again — it must MISS.
*Print HIT or MISS on every run (your Project 8 X-Cache header, on the CLI).
Make the tool work even when Redis itself is down: it should fetch from GitHub directly and say so, not crash. (A cache is an optimization, not a source of truth.)

I added a --ttl flag so the user can control how long Redis keeps the cached GitHub response. The default TTL is 60 seconds,
but it can be changed from the CLI, for example:
  node gh-cache.js octocat --ttl 3
To prove it works, I tested this sequence:
node gh-cache.js octocat --ttl 3
The first run prints: MISS — fetched from GitHub
Then I ran it again immediately: node gh-cache.js octocat --ttl 3
The second run prints: HIT — loaded from Redis cache
Then I waited more than 3 seconds and ran it again: node gh-cache.js octocat --ttl 3
This time it prints: MISS — fetched from GitHub
That proves Redis expired the key after the TTL.

I also print HIT or MISS on every run so it is clear whether the result came from Redis or from GitHub. This is similar 
to the X-Cache idea from the caching proxy project, but now it is shown in the CLI output. I made Redis optional. If Redis
is down, the tool does not crash. It prints a warning like:
  Redis unavailable — continuing without cache. MISS — fetched from GitHub
Then it fetches the data directly from GitHub. This is important because the cache is only an optimization. 
GitHub is still the source of truth.

_Exercise B_ — Project 12: negative caching
Cache a 404 (unknown user) so a repeat lookup is instant — but give it a much shorter TTL than a success. In one sentence: why shorter?
I added negative caching for 404 responses. If a GitHub user does not exist, the tool stores that negative result in Redis 
for a short TTL, for example 15 seconds. 

The first lookup for a missing user goes to GitHub:
  node gh-cache.js not-real-user-123456
Output:
  MISS — fetched from GitHub 
  User "not-real-user-123456" not found.

The second lookup is served from Redis:
  node gh-cache.js not-real-user-123456
Output:
  HIT — cached negative result
  User "not-real-user-123456" not found.
The negative TTL should be shorter than the success TTL because a missing user probably will not appear immediately,
but it is still possible that the username could be created later, so we should not cache the 404 for too long.

_Exercise C_ — Project 13: invalidation
Write the cache invalidation for PUT and DELETE. Prove it with a curl sequence: GET (HIT) → PUT a change → GET again must show the new data as a MISS.
I implemented invalidation for writes.

--For DELETE, I delete the single-post cache key post:{id}, because the post no longer exists.
  await deleteCacheKey(cache, key);
--For PUT and PATCH, I used write-through instead of delete-on-write: after SQLite updates the post, I overwrite post:{id}
in Redis with the fresh value. This means the next GET can be a HIT, but it still returns the new data, not stale data.
  await setCachedPost(cache, key, updatedPost);

_Exercise D_ — Project 13: the list cache (design + build)
Choose a strategy for caching GET /posts: invalidate broadly on writes, use a short TTL, or don’t cache the list at all.

Implement it, and write 2–3 sentences defending your choice. The defense is graded as much as the code.
I use cache GET /posts with short TTL + invalidate broadly on writes.
const SEARCH_CACHE_TTL_SECONDS = 30;
List cache is more risky than single-post cache because one write can affect many cached results: all posts, search results, pages, and sorted lists.
The key is like -  posts:search:all:page:1:limit:10:sort:title:order:asc;
So I cache list/search results for only 30 seconds and after any write (POST/PUT/PATCH/DELETE), I delete all keys 
matching posts:search:* using SCAN and DEL:
  await deleteCacheByPattern(cache, "posts:search:*");
This avoids serving deleted or outdated posts in the list, and the TTL is a backup if invalidation is missed.

_Exercise E_ — a rate limiter
Build middleware that limits each client to N requests/minute using INCR + EXPIRE, and rejects extras. Which status code do you return, and what does it signal that 403 or 404 would not? 

I would build middleware using Redis INCR and EXPIRE.

async function rateLimiter(req, res, next) { 
  const ip = req.ip; const key = `ratelimit:${ip}`; 
  const count = await cache.incr(key); if (count === 1) { 
    await cache.expire(key, 60); 
  } 
    if (count > 60) { 
      return res.status(429).json({ error: "Too many requests" }); } next(); 
}
INCR is good here because it is atomic. Redis safely increments the counter even if many requests arrive at the same time.

The correct status code is: 429 Too Many Requests.
It means the client is not forbidden forever, and the route does exist. They are just sending too many requests too quickly.
403 would mean forbidden.
404 would mean not found.
429 clearly means rate limit.

**Part 3 — Conceptual questions**
Answer in your own words. We’re testing understanding, not memorized code.

_Group A — Foundations_

A1.  Your Project 8 cache was a Map mirrored to a file. Name two distinct problems a separate cache server solves that 
the file approach cannot. (“It’s faster” doesn’t count — be specific.)

A separate cache server solves problems that a file cache cannot solve well.
1. First, many app processes can share the same Redis cache. A local Map or file belongs to one process or one machine.
2. Second, Redis has built-in TTL and eviction policies. A file cache would require custom code to manage expiry and cleanup.
3. Third, Redis supports atomic operations like INCR, which are essential for things like rate limiting. 
   A file cache would have to implement its own locking and atomicity, which is complex and error-prone.
4. Fourth, Redis can handle high concurrency and large data volumes efficiently, while a file cache might struggle with 
   performance and consistency under load.

A2.  In node-redis, a cache miss “looks like” one specific value. What is it, and why does the entire cache-aside 
pattern hinge on that value?
In node-redis, a cache miss comes back as:
  null (or nil in Redis CLI)
This matters because the cache-aside pattern depends on that check. If Redis returns null, my code knows:
There is no cached value, so read from the real source, like SQLite or GitHub.  Then after reading from the real source,
I can save the value into Redis for the next request.

A3.  Redis stores only strings. What must you do to cache a JavaScript object, and where in an earlier project did you 
do the exact same thing?

Redis stores strings, so I need to convert a JavaScript object to a string before caching it. I use:
  JSON.stringify(object)
Then when I read it back, I use:
  JSON.parse(cachedValue)
I did the same idea in earlier projects when saving JavaScript data into JSON files and reading it back, for example
with tasks, expenses, or file-based cache.

A4.  Why is a cache called an optimization rather than a source of truth? Concretely, what should your code do if the 
cache server is unreachable?

A cache is only an optimization because it is not the real data. It is only a faster copy. The real source of truth is 
SQLite, GitHub, or whatever the main data source is.  If Redis is unreachable, my code should not crash or return 500 
just because the cache failed. It should treat it like a cache miss and read from the real source instead.

A5.  What is the relationship between “Redis” and “Valkey,” and why can you point your code at either without changing 
a line?

Valkey is a fork of Redis. They are separate projects, but they speak the same Redis protocol.  That means my code can 
use the same Redis commands like:
GET 
SET 
DEL 
INCR 
EXPIRE
So I can point my client at Redis or Valkey without changing my application code.

_Group B — TTL and invalidation_

B1.  You’re caching two things: a list of ISO country codes, and the current price of a stock. How should their TTLs 
compare, and why?

The ISO country codes should have a long TTL because they almost never change (for example 24 hours or more). The stock 
price should have a short TTL because it changes very often (for example 1 minute or even less). So stable data can stay 
cached longer, and fast-changing data should expire quickly.

B2.  State, in one sentence, the tradeoff a TTL encodes — what you gain and what you give up as it gets longer.

A TTL trades freshness for fewer database reads: a longer TTL gives more cache hits, but it also increases the chance of 
serving old data.

B3.  After a successful PUT /posts/1, why must your code touch the cache at all? What does a reader see if you skip it?

After PUT /posts/1, the post in SQLite changed, so the old cached value may now be wrong. If I skip the cache update or
invalidation, the next reader may get the old post from Redis instead of the new post from SQLite.

B4.  Caching GET /posts (the whole list) is harder than caching GET /posts/1. Explain why, in terms of what a single 
write affects.
Caching GET /posts/1 is easier because it has one clear key: post:1 (post{id}).
But GET /posts is a list. One write can affect many cached results. For example, one new or updated post can change:
/posts 
/posts?search=tech 
/posts?page=1 
/posts?sort=title
So list cache is harder because one write can make many list keys stale.

B5.  Compare “delete the key on write” with “write-through” (overwrite the cache with the new value). Give one advantage
of each.

*Delete-on-write means I update SQLite and then delete the Redis key.
One advantage is that it is simple and safe. The next read will rebuild the cache from SQLite.
*Write-through means I update SQLite and then overwrite Redis with the new value.
One advantage is that the next read can be a cache HIT immediately.

B6.  Even with correct invalidation, the lesson tells you to put a TTL on every key anyway. What failure is that TTL 
protecting you from?

TTL protects against missed invalidation. For example, the app could update SQLite and then crash before deleting or 
updating the Redis key. Without TTL, the old cached value could stay forever. With TTL, it eventually expires by itself.


_Group C — Beyond caching, and the gotchas_

C1.  Why is INCR the right tool for a rate-limit counter, where a GET-then-SET would be wrong? Use the word atomic.

INCR is the right tool because it is atomic. That means Redis increments the counter safely in one operation. 
With GET then SET, two requests could both read the same value and both write the same next value, so one request would be lost.

C2.  What is a cache stampede, and why does a TTL by itself not prevent it?
A cache stampede happens when a popular cache key expires and many requests miss at the same time. TTL does not prevent
it because TTL only removes the key. After the key expires, all requests can still go to the database together.

C3.  A teammate caches user sessions with no expiry and no size limit. Predict what happens to the server over several
weeks, and name the two safeguards that are missing.

If user sessions have no expiry and no size limit, Redis will keep growing over time. After several weeks, it can use 
too much memory and the server can slow down or fail. The missing safeguards are:

TTL
max size / eviction policy

C4.  Your rate limiter rejects a caller. Which 4xx status code fits, and what does it communicate that 403 or 404 would not?
The correct status code is:
  429 Too Many Requests
It means the client is allowed to use the API, and the route exists, but they made too many requests too quickly.
403 means forbidden.
404 means not found.
429 means rate limited.

**Part 4 — Spot the bug**

Each snippet has one defect. State what’s wrong and the symptom a user or operator would notice.
D1.  (Caching a value, then reading it back on the next request.)

const cached = await client.get(key);
if (cached !== null) return cached;          // line in question
const value = await getThing();
await client.set(key, value, { EX: 60 });    // line in question
return value;

Bug
The cached value comes back from Redis as a string. 
Redis cannot store the object directly as an object. We have to serialize it.

const cached = await client.get(key);
if (cached !== null) {
  return JSON.parse(cached);  ; // converts a JSON string into a usable JavaScript object or value
}
const value = await getThing();
await client.set(key, JSON.stringify(value), { EX: 60 }); // converts a JavaScript object or value into a JSON string for storage in Redis
return value;

Symptom
"[object Object]" or JSON text instead of a real object.
A user/operator may notice broken API response shape, wrong headers/body, or frontend code failing because it expected 
an object but got a string.

D2.  (Read handler and write handler for the same resource.)

// read handler
const post = ...;
await cache.set(`post:${id}`, JSON.stringify(post), { EX: 300 });
// write handler (PUT)
updatePostInDb(id, body);
await cache.del(`posts:${id}`);              // line in question

Bug
The read handler caches the post under the key `post:${id}`, but the write handler deletes `posts:${id}`. 
The keys do not match, so the cache is not invalidated correctly

Symptom
After PUT /posts/1, the database is updated, but the old cache entry remains. A user calls:
  GET /posts/1
and still sees the old version until the cache TTL expires

D3.  (A rate limiter using a Redis counter.)

const count = await client.incr(`ratelimit:${ip}`);
if (count > 60)  {
  return res.status(429).json({ error: "Too many requests" });
  next();
}

Bug

The counter has no expiry. The code increments the counter, but never sets a TTL on the key.

Symptom
Once an IP makes more than 60 requests total, it may be blocked forever because the counter never resets.
The user sees:
429 Too Many Requests

Correct example:

        const key = `ratelimit:${ip}`;
        const count = await cache.incr(key);
        if (count === 1) {
            await client.expire(key, 60); // set TTL of 60 seconds on first increment
        }

        if (count > 60) {
            return res.status(429).json({ error: "Too many requests" });
        }

        next();
That means: max 60 requests per 60 seconds.

D4.  (Handling a not-found post.)

const post = getPost(id);
if (!post) {
await cache.set(`post:${id}`, "__missing__", { EX: 3600 }); // line in question
return res.status(404).json({ error: "Post not found" });
}

Bug
The code caches a 404 result for too long:
  await cache.set(`post:${id}`, "__missing__", { EX: 3600 });
This is negative caching. It can be valid, but here the TTL is very long.

Symptom
Suppose GET /posts/5 returns 404, so the app caches:
  post:5 = "__missing__"
Then someone creates post 5 shortly after. 
Users may still receive 404 Post not found for up to one hour, even though the post now exists.

Solution
Either do not cache not-found results, or use a much shorter TTL:
  await cache.set(`post:${id}`, "__missing__", { EX: 30 });
Also, if a post is later created/updated, delete the negative-cache key.

D5.  (A single request handler on a busy server.)

app.get("/posts/:id", async (req, res) => {
const client = createClient();
await client.connect();                    // line in question
const cached = await client.get(`post:${req.params.id}`);
// ...
}); 

Bug
The handler creates and connects a new Redis client on every request:
  const client = createClient();
  await client.connect();
That should not happen inside a busy route handler.

Symptom
On a busy server, this creates too many Redis connections. Operators may notice:
too many clients
connection refused
high latency
memory growth
Redis overloaded

Users may notice slow responses or random request failures.

Solution
Create and connect the Redis client once when the app starts:

  const client = createClient();
  await client.connect();
  app.get("/posts/:id", async (req, res) => {
    const cached = await client.get(`post:${req.params.id}`);
  // ...
  });

The route should reuse the existing connection.