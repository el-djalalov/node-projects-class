**gh-cache**
//node gh-cache.js el-djalalov - first go
// MISS — fetched from GitHub
//node gh-cache.js el-djalalov  - second go
// HIT — loaded from Redis cache
// node gh-cache.js el-djalalov --ttl 5

// node gh-cache.js el-djalalov --ttl 55
// docker exec -it redis-cache redis-cli TTL github:events:el-djalalov
// (integer) 51
// docker exec -it redis-cache redis-cli GET github:events:octocat


// node gh-cache.js el-djalalov  --ttl abc
// node gh-cache.js el-djalalov  --ttl -5
// node gh-cache.js el-djalalov  --ttl 1.5
// --ttl must be a positive integer.


// docker exec -it redis-cache redis-cli DEL github:events:el-djalalov
// (integer) 0

// node gh-cache.js no-user-exists-123456789
// MISS — fetched from GitHub
// User "no-user-exists-123456789" not found.
// node gh-cache.js no-user-exists-123456789
// HIT — cached negative result, cached 12s ago
// User "no-user-exists-123456789" not found.
// docker exec -it redis-cache redis-cli GET github:events:no-user-exists-123456789


**trending-cache**
// node gh-cache.js el-djalalov --no-cache
// MISS — fetched from GitHub

// Redis down: app не падает
// docker stop redis-cache
// docker stop valkey
//node gh-cache.js el-djalalov
// Redis unavailable — continuing without cache.
//MISS — fetched from GitHub

// node gh-cache.js torvalds --no-cache
// node gh-cache.js sindresorhus --no-cache
// node gh-cache.js gaearon --no-cache



// node trending-cache.js --duration week --limit 10
// node trending-cache.js --duration month --limit 5 --language javascript
// node trending-cache.js --duration week --limit 10 --ttl 30
// node trending-cache.js --duration week --limit 10 --no-cache
// node trending-cache.js --duration week --limit 10 --json
// node trending-cache.js --duration month --limit 5 --language Swift --ttl 3

// node trending-cache.js --duration week --limit 10 --ttl 600
// node trending-cache.js --duration week --limit 10 --ttl 600


// docker exec -it redis-cache redis-cli KEYS "github:trending:*"
// docker exec -it redis-cache redis-cli TTL github:trending:2026-06-09:10:all
