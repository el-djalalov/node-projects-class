Step 3
I cache list/search results but only for a short time.
I invalidate all posts:search:* keys on any create, update, or delete.
This avoids serving deleted posts in the list after writes.
The short TTL is still a safety net if invalidation fails.

