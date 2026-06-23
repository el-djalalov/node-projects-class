const { createClient } = require("redis");

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const CHANNEL = "post:created";

async function startSubscriber() {
    const subscriber = createClient({
        url: REDIS_URL,
        socket: {
            connectTimeout: 1000,
            reconnectStrategy: false,
        },
    });

    subscriber.on("error", (err) => {
        console.error("Redis subscriber error:", err);
    });

    await subscriber.connect();

    console.log("Live subscriber connected.");
    console.log(`Listening on channel "${CHANNEL}"...`);

    // A separate subscriber that prints events as they arrive
    await subscriber.subscribe(CHANNEL, (message) => {
        try {
            const event = JSON.parse(message);

            console.log("Live event received:", event);
        } catch (err) {
            console.log("Raw live event received:", message);
        }
    });
}

startSubscriber().catch((err) => {
    console.error(err);
    process.exit(1);
});