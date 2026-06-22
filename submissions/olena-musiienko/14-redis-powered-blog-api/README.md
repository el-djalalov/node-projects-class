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
  -Headers @{ Authorization = "Bearer a30295bb-36e4-4799-8647-60f08ab22e5f" } `
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
