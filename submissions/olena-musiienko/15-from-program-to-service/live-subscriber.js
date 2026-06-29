const {
    POSTS_NEW_CHANNEL,
} = require("./src/config/redisNames");


async function startLiveSubscriber(cache, broadcastLivePostEvent) {
    if (!cache) {
        console.log("Live dashboard subscriber not started: Redis unavailable");
        return null;
    }

    // create a duplicate Redis client for subscribing to the channel
    const subscriber = cache.duplicate();

    subscriber.on("error", (err) => {
        console.error("Redis dashboard subscriber error:", err);
    });

    // open a connection to the Redis server
    await subscriber.connect();

    // subscribe to the channel and handle incoming messages
    await subscriber.subscribe(POSTS_NEW_CHANNEL, (message) => {
        try {
            const event = JSON.parse(message);

            console.log(
                `Worker ${process.pid} received "${POSTS_NEW_CHANNEL}" event from Redis: ${message}`
            );

            // broadcast the event to all connected clients
            broadcastLivePostEvent(event);
        } catch {
            console.log("Invalid live post event:", message);
        }
    });

    console.log(
        `Worker ${process.pid} subscribed to "${POSTS_NEW_CHANNEL}".`
    );

    return subscriber;
}

module.exports = {
    startLiveSubscriber,
};