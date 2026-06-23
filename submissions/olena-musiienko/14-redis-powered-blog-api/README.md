docker start redis-cache
docker exec -it redis-cache redis-cli ping
--
node server.js
Redis connected.
Server listening on http://localhost:3000

--
$response = Invoke-RestMethod `
  -Uri "http://localhost:3000/login" `
-Method POST `
  -ContentType "application/json" `
-Body '{"username":"alice"}'

$response
Expect:
token
-----                               
a30295bb-36e4-4799-8647-60f08ab22e5f


save token:
$token = $response.token

--
docker exec -it redis-cache redis-cli
Expect:
127.0.0.1:6379> KEYS session:*
1) "session:a30295bb-36e4-4799-8647-60f08ab22e5f"

--
127.0.0.1:6379> HGETALL session:a30295bb-36e4-4799-8647-60f08ab22e5f
1) "username"
2) "alice"
3) "token"
4) "a30295bb-36e4-4799-8647-60f08ab22e5f"
5) "createdAt"
6) "2026-06-22T18:44:39.822Z"

127.0.0.1:6379> TTL session:a30295bb-36e4-4799-8647-60f08ab22e5f
(integer) 1568

--
Invoke-RestMethod `
  -Uri "http://localhost:3000/posts" `
-Method POST `
  -ContentType "application/json" `
-Body '{"title":"Private post","content":"Hello","category":"backend","tags":["redis","auth"]}'
Expect:
Invoke-RestMethod : {"error":"Missing token"}

--
$response = Invoke-RestMethod `
  -Uri "http://localhost:3000/login" `
-Method POST `
  -ContentType "application/json" `
-Body '{"username":"alice"}'

$token = $response.token
$token
Expect:
00675422-2a2a-4f29-b7cc-4976c28920bc

Redis-cli:
127.0.0.1:6379> TTL session:ead5cb95-e640-4b58-a878-40c2cae9c791
127.0.0.1:6379>  KEYS session:*
1) "session:f753c8d0-61b5-47a5-96e8-f30e58c43790"
2) "session:61026c5b-bc5e-43d7-89c4-74067113c60f"
3) "session:3aa3d7d1-114f-4212-b8f2-94a629cbccb8"
4) "session:ead5cb95-e640-4b58-a878-40c2cae9c791"
5) "session:00675422-2a2a-4f29-b7cc-4976c28920bc"

Invoke-RestMethod `
  -Uri "http://localhost:3000/posts" `
-Method POST `
  -Headers @{ Authorization = "Bearer 2c3387d4-92f7-4bbc-afcd-0b008f26b8e2" } `
-ContentType "application/json" `
-Body '{"title":"Private post","content":"Hello","category":"backend","tags":["redis","auth"]}'
Expect:
id        : 6
title     : Private post
content   : Hello
category  : backend
createdAt : 2026-06-22T19:19:52.076Z
updatedAt : 2026-06-22T19:19:52.076Z
tags      : {auth, redis}

--
$body = @{
title = "Private post valid"
content = "Hello"
category = "backend"
tags = @("redis", "auth")
} | ConvertTo-Json

$result = Invoke-WebRequest `
  -Uri "http://localhost:3000/posts" `
-Method POST `
  -Headers @{ Authorization = "Bearer $token" } `
-ContentType "application/json" `
-Body $body

$result.StatusCode
Expect:
201
$result.Content
Expect:
{"id":8,"title":"Private post valid","content":"Hello","category":"backend","createdAt":"2026-06-22T19:29:44.723Z",
"updatedAt":"2026-06-22T19:29:44.723Z","tags":["auth","redis"]}

--
$body = @{
title = "Should not be created no token"
content = "Hello"
category = "backend"
tags = @("redis", "auth")
} | ConvertTo-Json

try {
Invoke-WebRequest `
    -Uri "http://localhost:3000/posts" `
-Method POST `
    -ContentType "application/json" `
-Body $body
} catch {
$_.Exception.Response.StatusCode.value__
$_.ErrorDetails.Message
}
Expect:
401
{"error":"Missing token"}

--
try {
Invoke-WebRequest `
    -Uri "http://localhost:3000/posts" `
-Method POST `
    -Headers @{ Authorization = "Bearer fake-token-123" } `
-ContentType "application/json" `
-Body $body
} catch {
$_.Exception.Response.StatusCode.value__
$_.ErrorDetails.Message
}
Expect:
401
{"error":"Invalid or expired token"}

Expired token test:
127.0.0.1:6379> TTL session:a30295bb-36e4-4799-8647-60f08ab22e5f
(integer) -2

Invoke-RestMethod `
  -Uri "http://localhost:3000/posts" `
-Method POST `
  -Headers @{ Authorization = "Bearer a30295bb-36e4-4799-8647-60f08ab22e5f" } `
-ContentType "application/json" `
-Body '{"title":"Private post","content":"Hello","category":"backend","tags":["redis","auth"]}'
Expect:
Invoke-RestMethod : {"error":"Invalid or expired token"}

--
$body = @{
title = "Views test"
content = "Hello"
category = "backend"
tags = @("redis", "views")
} | ConvertTo-Json

$post = Invoke-RestMethod `
  -Uri "http://localhost:3000/posts" `
-Method POST `
  -Headers @{ Authorization = "Bearer 04ef21ca-67f6-45ed-8a7a-c04b7d4436ee" } `
-ContentType "application/json" `
-Body $body

$post.id
Expect:
1
Making views:
Invoke-RestMethod -Uri "http://localhost:3000/posts/1" -Method GET
Invoke-RestMethod -Uri "http://localhost:3000/posts/1" -Method GET
Invoke-RestMethod -Uri "http://localhost:3000/posts/1" -Method GET

docker exec -it redis-cache redis-cli
ZSCORE post:views 1
Expect:
127.0.0.1:6379> ZSCORE post:views 1
"2"
127.0.0.1:6379> ZSCORE post:views 1
"3"

--
Invoke-RestMethod -Uri "http://localhost:3000/posts/2" -Method GET
Invoke-RestMethod -Uri "http://localhost:3000/posts/5" -Method GET

PS C:\Users\kraizkot> docker exec redis-cache redis-cli ZREVRANGE post:views 0 10 WITHSCORES
5
4
1
3
2
2

Invoke-RestMethod `
  -Uri "http://localhost:3000/posts/popular" `
-Method GET
Expect:
id        : 5
title     : Private post
content   : Hello
category  : backend
createdAt : 2026-06-22T20:14:59.437Z
updatedAt : 2026-06-22T20:14:59.437Z
tags      : {auth, redis}
views     : 4

id        : 1
title     : Views test
content   : Hello
category  : backend
createdAt : 2026-06-22T19:56:39.951Z
updatedAt : 2026-06-22T19:56:39.951Z
tags      : {redis, views}
views     : 4

id        : 2
title     : Private post
content   : Hello
category  : backend
createdAt : 2026-06-22T20:14:53.779Z
updatedAt : 2026-06-22T20:14:53.779Z
tags      : {auth, redis}
views     : 2

--
$body = @{
title = "Never viewed post"
content = "This post should not appear in popular yet"
category = "backend"
tags = @("redis", "popular")
} | ConvertTo-Json

never-viewed post
$post = Invoke-RestMethod `
  -Uri "http://localhost:3000/posts" `
-Method POST `
  -Headers @{ Authorization = "Bearer $token" } `
-ContentType "application/json" `
-Body $body

$post.id
Expect:
 id of never-viewed post

Invoke-RestMethod `
  -Uri "http://localhost:3000/posts/popular" `
-Method GET
Expect:
id of never-viewed post is not in the list of popular posts

127.0.0.1:6379>  ZSCORE post:views 6
(nil)

Invoke-RestMethod -Uri "http://localhost:3000/posts/ id of never-viewed post" -Method GET

Invoke-RestMethod `
  -Uri "http://localhost:3000/posts/popular" `
-Method GET
(in my case it is id 6)
Expect:

id        : 6
title     : Never viewed post
content   : This post should not appear in popular yet
category  : backend
createdAt : 2026-06-22T20:26:29.580Z
updatedAt : 2026-06-22T20:26:29.580Z
tags      : {popular, redis}
views     : 4

id        : 5
title     : Private post
content   : Hello
category  : backend
createdAt : 2026-06-22T20:14:59.437Z
updatedAt : 2026-06-22T20:14:59.437Z
tags      : {auth, redis}
views     : 4

id        : 1
title     : Views test
content   : Hello
category  : backend
createdAt : 2026-06-22T19:56:39.951Z
updatedAt : 2026-06-22T19:56:39.951Z
tags      : {redis, views}
views     : 4

id        : 2
title     : Private post
content   : Hello
category  : backend
createdAt : 2026-06-22T20:14:53.779Z
updatedAt : 2026-06-22T20:14:53.779Z
tags      : {auth, redis}
views     : 2

--
$response = Invoke-RestMethod `
  -Uri "http://localhost:3000/login" `
-Method POST `
  -ContentType "application/json" `
-Body '{"username":"alice"}'

$token = $response.token
2c3387d4-92f7-4bbc-afcd-0b008f26b8e2


$body = @{
title = "Never viewed post"
content = "This post should not appear in popular yet"
category = "backend"
tags = @("redis", "popular")
} | ConvertTo-Json


Invoke-RestMethod `
  -Uri "http://localhost:3000/posts" `
-Method POST `
  -Headers @{ Authorization = "Bearer 2c3387d4-92f7-4bbc-afcd-0b008f26b8e2" } `
-ContentType "application/json" `
-Body $body
Expect:
127.0.0.1:6379> LRANGE jobs 0 -1
1) "{\"type\":\"notify\",\"postId\":10,\"title\":\"Queue test post\",\"createdAt\":\"2026-06-22T20:42:32.326Z\"}"



--
node server.js
node worker.js

127.0.0.1:6379> LRANGE jobs 0 -1
Expect:
(empty array)

--
in 3 terminal:
$response = Invoke-RestMethod `
  -Uri "http://localhost:3000/login" `
-Method POST `
  -ContentType "application/json" `
-Body '{"username":"alice"}'

$token = $response.token
2c3387d4-92f7-4bbc-afcd-0b008f26b8e2


$body = @{
title = "Never viewed post"
content = "This post should not appear in popular yet"
category = "backend"
tags = @("redis", "popular")
} | ConvertTo-Json


Invoke-RestMethod `
  -Uri "http://localhost:3000/posts" `
-Method POST `
  -Headers @{ Authorization = "Bearer 04ef21ca-67f6-45ed-8a7a-c04b7d4436ee" } `
-ContentType "application/json" `
-Body $body
Expect:

server.js -
JOB queued type=notify postId=11

worker.js -
Processing job: {
type: 'notify',
postId: 11,
title: 'Never viewed post',
createdAt: '2026-06-22T20:49:56.323Z'
}
Notify subscribers about post 11: "Never viewed post"
Job done: {"type":"notify","postId":11,"title":"Never viewed post","createdAt":"2026-06-22T20:49:56.323Z"}

--
Stop the worker, create three posts, start the worker again → all three get processed (they waited in the queue).
PS C:\Users\kraizkot\IdeaProjects\node-projects-class\submissions\olena-musiienko\14-redis-powered-blog-api> node worker.js
Worker connected to Redis.
Waiting for jobs from "jobs"...
Processing job: {
type: 'notify',
postId: 12,
title: 'Never viewed post',
createdAt: '2026-06-22T20:53:15.840Z'
}
Notify subscribers about post 12: "Never viewed post"
Job done: {"type":"notify","postId":12,"title":"Never viewed post","createdAt":"2026-06-22T20:53:15.840Z"}
Processing job: {
type: 'notify',
postId: 13,
title: 'Never viewed post',
createdAt: '2026-06-22T20:53:16.894Z'
}
Notify subscribers about post 13: "Never viewed post"
Job done: {"type":"notify","postId":13,"title":"Never viewed post","createdAt":"2026-06-22T20:53:16.894Z"}
Processing job: {
type: 'notify',
postId: 14,
title: 'Never viewed post',
createdAt: '2026-06-22T20:53:17.658Z'
}
Notify subscribers about post 14: "Never viewed post"
Job done: {"type":"notify","postId":14,"title":"Never viewed post","createdAt":"2026-06-22T20:53:17.658Z"}


--
node live-subscriber.js

in another  terminal :
$response = Invoke-RestMethod `
  -Uri "http://localhost:3000/login" `
-Method POST `
  -ContentType "application/json" `
-Body '{"username":"alice"}'

$token = $response.token
2c3387d4-92f7-4bbc-afcd-0b008f26b8e2


$body = @{
title = "Check live subscriber"
content = "Live event test"
category = "backend"
tags = @("redis", "popular")
} | ConvertTo-Json


Invoke-RestMethod `
  -Uri "http://localhost:3000/posts" `
-Method POST `
  -Headers @{ Authorization = "Bearer 04ef21ca-67f6-45ed-8a7a-c04b7d4436ee" } `
-ContentType "application/json" `
-Body $body
Expect:
PS C:\Users\kraizkot\IdeaProjects\node-projects-class\submissions\olena-musiienko\14-redis-powered-blog-api> node live-events-subscriber.js
Live subscriber connected.
Listening on channel "post:created"...
Live event received: {
type: 'post.created',
postId: 15,
title: 'Check live subscriber',
createdAt: '2026-06-23T16:30:37.588Z'
}

--
docker exec -it redis-cache redis-cli
127.0.0.1:6379>  KEYS post:views:*
Expect:
1) "post:views:2026-06-23"

--
ZRANGE post:views:2026-06-23 0 -1 WITHSCORES
Expect:
1) "18"
2) "1"
3) "5"
4) "4"

after get post  5:
ZRANGE post:views:2026-06-23 0 -1 WITHSCORES
1) "18"
2) "1"
3) "5"
4) "6"

--
Invoke-RestMethod `
  -Uri "http://localhost:3000/posts/popular/today" `
-Method GET

id        : 5
title     : Private post
content   : Hello
category  : backend
createdAt : 2026-06-22T20:14:59.437Z
updatedAt : 2026-06-22T20:14:59.437Z
tags      : {auth, redis}
views     : 6

id        : 1
title     : Views test
content   : Hello
category  : backend
createdAt : 2026-06-22T19:56:39.951Z
updatedAt : 2026-06-22T19:56:39.951Z
tags      : {redis, views}
views     : 4

id        : 18
title     : Check live subscriber
content   : Live event test
category  : backend
createdAt : 2026-06-23T17:15:22.818Z
updatedAt : 2026-06-23T17:15:22.818Z
tags      : {popular, redis}
views     : 2


--
Invoke-RestMethod `
  -Uri "http://localhost:3000/posts/popular" `
-Method GET

id        : 6
title     : Never viewed post
content   : This post should not appear in popular yet
category  : backend
createdAt : 2026-06-22T20:26:29.580Z
updatedAt : 2026-06-22T20:26:29.580Z
tags      : {popular, redis}
views     : 4

id        : 5
title     : Private post
content   : Hello
category  : backend
createdAt : 2026-06-22T20:14:59.437Z
updatedAt : 2026-06-22T20:14:59.437Z
tags      : {auth, redis}
views     : 4

id        : 1
title     : Views test
content   : Hello
category  : backend
createdAt : 2026-06-22T19:56:39.951Z
updatedAt : 2026-06-22T19:56:39.951Z
tags      : {redis, views}
views     : 4

id        : 2
title     : Private post
content   : Hello
category  : backend
createdAt : 2026-06-22T20:14:53.779Z
updatedAt : 2026-06-22T20:14:53.779Z
tags      : {auth, redis}
views     : 2


--
Invoke-WebRequest `
  -Uri "http://localhost:3000/posts/999999" `
-Method GET
Expect:
Invoke-WebRequest : {"error":"Post not found"}

ZRANGE post:views 0 -1 WITHSCORES

----------------------------------------------
FLUSHDB
----------------------------------------------
http://localhost:3000/dashboard.html

PUBLISH post:created "{\"type\":\"post.created\",\"postId\":999,\"title\":\"Manual Redis test\",\"createdAt\":\"2026-06-23T00:00:00.000Z\"}"
Expect:
Manual Redis test
postId: 999 · 2026-06-23T00:00:00.000Z


PUBLISH post:created "{\"type\":\"post.created\",\"postId\":999,\"title\":\"Vzlon chobaki\",\"createdAt\":\"2026-06-23T00:00:00.000Z\"}"
PUBLISH post:created "{\"type\":\"post.created\",\"postId\":999,\"title\":\"Krazha goosi-goosi\",\"createdAt\":\"2026-06-23T00:00:00.000Z\"}"


Client A1
↓
Broadcast Server A
↓ publish message to Redis channel "chat:messages"
Redis Pub/Sub
↓
Broadcast Server A receives message
Broadcast Server B receives message
↓
A sends to A1/A2
B sends to B1/B2