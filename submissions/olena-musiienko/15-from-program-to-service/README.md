# Manual checks

## Start the app

```powershell
node server.js
```

Override the core count with a fixed worker count:

```powershell
node server.js --workers 4
```

Zero-downtime reload one worker at a time:

```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:3000/admin/reload"
```

This works on Windows and Unix alike because the request is handled by a web worker and forwarded to the primary process.

Expected logs:

- `Primary <pid> is running`
- `Starting <N> web workers`
- `Queue worker <pid> started`
- `Web worker <pid> listening on port 3000`

## Request routing

```powershell
Invoke-RestMethod "http://localhost:3000/posts"
```

Expected: the response works, and the log shows which worker handled it, for example:

- `Web worker <pid> handled GET /posts`

## Login and shared session

```powershell
$login = Invoke-RestMethod `
  -Uri "http://localhost:3000/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"username":"olena"}'

$token = $login.token
$token
```

Then use the token on the next request:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/posts" `
  -Method POST `
  -Headers @{ Authorization = "Bearer d1a988ea-f7e7-4f55-a76b-5c106f1afe1b" } `
  -ContentType "application/json" `
  -Body '{"title":"Cluster test","content":"Session works across workers","category":"backend","tags":["node","cluster","redis"]}'
```

Expected:

- `201` response
- the post is created even if a different worker handles the request
- the session works across workers because the session hash is stored in Redis

## Live SSE clients

Open two PowerShell windows and connect both clients:

```powershell
Invoke-RestMethod "http://localhost:3000/events/posts"
```

Expected:

- each worker keeps its own connected clients
- the connection stays open
- the log shows `live dashboard connected`

Then create a post again. Both clients should receive the event.

## Redis pub/sub and queue draining

Create a few posts:

```powershell
1..3 | ForEach-Object {
  Invoke-RestMethod `
    -Uri "http://localhost:3000/posts" `
    -Method POST `
    -Headers @{ Authorization = "Bearer $token" } `
    -ContentType "application/json" `
    -Body (@{
      title = "Cluster test $_"
      content = "Session works across workers"
      category = "backend"
      tags = @("node","cluster","redis")
    } | ConvertTo-Json)
}
```

Expected:

- `POST /posts` publishes to `posts:new`
- every worker logs the Redis event it receives
- the queue worker processes jobs without needing a second terminal


## Redis checks in a separate PowerShell window

Start Redis with Docker:

```powershell
docker run -d --name node-projects-class-redis -p 6379:6379 redis:7-alpine
```

If `redis-cli` is available:

```powershell
redis-cli LLEN jobs  - (integer) 0
redis-cli LRANGE jobs 0 -1  - (empty array)
redis-cli SUBSCRIBE posts:new - 1) "subscribe"
                                2) "posts:new"
                                3) (integer) 1

```

If `redis-cli` is not installed, use Node instead:

```powershell
node -e "const {createClient}=require('redis');(async()=>{const c=createClient({url:'redis://localhost:6379'});await c.connect();console.log('LLEN jobs =', await c.lLen('jobs'));console.log('LRANGE jobs =', await c.lRange('jobs',0,-1));await c.quit();})().catch(err=>{console.error(err);process.exit(1)})"
```

Expected:

- `LLEN jobs` goes down as the worker drains the queue
- `LRANGE jobs 0 -1` becomes empty

Stop Redis when you are done:

```powershell
docker rm -f node-projects-class-redis
```

## Worker restart

Find a web worker pid from the logs and kill it:

```powershell
Stop-Process -Id 14528 -Force
```

Expected:

- the primary forks a replacement worker
- the queue keeps draining

## Clean shutdown summary

Stop the app with `Ctrl+C`.

Expected:

- the primary prints the shutdown summary it received from the worker
- the queue worker logs its final processed count

# Tests

## Unit tests

Pure functions, no I/O:

- `validatePost`
- `isEmptySession`
- `shapePopularPosts`

Run:

```powershell
node --test test\unit\*.test.js
```

## Integration tests

Boot one app instance and hit real endpoints with `fetch`:

- `GET /health`
- `POST /login`
- `POST /posts`
- invalid post validation

Run:

```powershell
node --test test\integration\posts.test.js

node -e "fetch('http://127.0.0.1:3000/health').then(r => r.json()).then(console.log)"
{ ok: true, pid: 39972, redisReachable: true }
```

## Full suite

```powershell
node --test
```

From the project root, you can also run everything under `test` directly:

```powershell
node --test test\health.test.js
```


## Post views and popular posts

Every `GET /posts/:id` increments two Redis sorted sets:

- `post:views` for all-time views
- `post:views:YYYY-MM-DD` for daily views

To inspect a post's view count, read its score from the sorted set:

```powershell
redis-cli ZSCORE post:views 1
```

To list the most viewed posts, ask Redis directly:

```powershell
redis-cli ZREVRANGE post:views 0 9 WITHSCORES
redis-cli ZREVRANGE post:views:2026-06-30 0 9 WITHSCORES
```

Or use the HTTP endpoints:

```powershell
Invoke-RestMethod "http://localhost:3000/posts/popular?limit=10"
Invoke-RestMethod "http://localhost:3000/posts/popular/today?limit=10"
```

Expected:

- the Redis score is the view count for that post id
- `/posts/popular` returns the most viewed posts overall
- `/posts/popular/today` returns the most viewed posts for the current day