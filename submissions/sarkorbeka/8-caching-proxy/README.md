Caching Proxy (submission).

Run examples:

```bash
node proxy.js --port 3000 --origin https://dummyjson.com
curl -i localhost:3000/products
node proxy.js --clear-cache
```