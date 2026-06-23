const { createClient } = require("redis");

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const JOBS_QUEUE = "jobs";
const MAX_RETRIES = 3;

// Worker process that listens for jobs in the Redis queue and processes them.
// The producer and consumer do not have to be online at the same time.
//The API can produce jobs now. The worker can process them later.
async function startWorker() {
    const redis = createClient({
        url: REDIS_URL,
        socket: {
            connectTimeout: 1000,
            reconnectStrategy: false,
        },
    });

    redis.on("error", (err) => {
        console.error("Redis worker error:", err);
    });

    await redis.connect();

    console.log("Worker connected to Redis.");
    console.log(`Waiting for jobs from "${JOBS_QUEUE}"...`);

    while (true) {
        // LEFT  [ job3, job2, job1 ]  RIGHT
        // rPush + lPop or lPush + rPop
        // blPop with timeout 0 blocks until a job arrives, so the worker waits instead of busy-spinning.
        const result = await redis.blPop(JOBS_QUEUE, 0);

        if (!result) {
            continue;
        }

        //result.element is the job data (string) that was pushed to the queue
        const rawJob = result.element;

        try {
            const job = JSON.parse(rawJob);

            console.log("Processing job:", job);

            if (job.type === "notify") {
                console.log(`Notify subscribers about post ${job.postId}: "${job.title}"`);
            } else {
                console.log(`Unknown job type: ${job.type}`);
            }

            console.log(`Job done: ${rawJob}`);


        }  catch (err) {
            console.error("Failed to process job:", rawJob);
            console.error(err.message);

            // Stretch goals: Failed jobs are retried a limited number of times so one bad job cannot loop forever.
            let failedJob;

            try {
                failedJob = JSON.parse(rawJob);
            } catch {
                console.error("Job is invalid JSON. Dropping it instead of retrying forever.");
                continue;
            }

            const attempts = Number(failedJob.attempts) || 0;
            const nextAttempts = attempts + 1;

            if (nextAttempts > MAX_RETRIES) {
                console.error(`Job dropped after ${MAX_RETRIES} retries:`, failedJob);
                continue;
            }

            failedJob.attempts = nextAttempts;

            //if processing a job fails, push it back to the queue for retrying later
            await redis.rPush(JOBS_QUEUE, JSON.stringify(failedJob));

            console.log(`Job requeued. attempt=${nextAttempts}/${MAX_RETRIES}`);
        }
    }
}

startWorker().catch((err) => {
    console.error(err);
    process.exit(1);
});