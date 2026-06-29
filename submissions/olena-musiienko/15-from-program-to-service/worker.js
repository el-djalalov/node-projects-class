const { createClient } = require("redis");
const { JOBS_QUEUE } = require("./src/config/redisNames");

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const MAX_RETRIES = 3;
const BLMOVE_TIMEOUT_SECONDS = 2;

const PROCESSING_QUEUE = `${JOBS_QUEUE}:processing`;

/**
 * @typedef {{
 *     type: "ready";
 * }} QueueWorkerReadyPayload
 *
 * @typedef {{
 *     type: "job_processed";
 *     processedJobCount: number;
 *     jobType: string;
 *     postId: number;
 * }} QueueWorkerJobProcessedPayload
 *
 * @typedef {{
 *     type: "final_count";
 *     processedJobCount: number;
 * }} QueueWorkerFinalCountPayload
 *
 * @typedef {QueueWorkerReadyPayload | QueueWorkerJobProcessedPayload | QueueWorkerFinalCountPayload} QueueWorkerPayload
 */

async function startQueueWorker() {
    let processedJobCount = 0;
    let shuttingDown = false;

    /**
     * @param {QueueWorkerPayload} message
     */
    // monitor a queue worker by sending messages to the primary process (the one that spawned this worker)
    // IPC is enabled and process.send is available only when the worker is spawned with child_process.fork()
    function sendToPrimary(message) {
        if (process.send) {
            process.send({
                pid: process.pid,
                ...message,
            });
        }
    }

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

    console.log(`Queue worker ${process.pid} connected to Redis.`);
    console.log(`Main queue: ${JOBS_QUEUE}`);
    console.log(`Processing queue: ${PROCESSING_QUEUE}`);

    /**
     * If the previous queue worker crashed after taking a job,
     * that job is still in PROCESSING_QUEUE.
     *
     * Since this project intentionally runs only one queue worker,
     * it is safe to move all processing jobs back to the main queue on startup.
     */
    await recoverProcessingJobs(redis);

    sendToPrimary({
        type: "ready",
    });

    console.log(`Waiting for jobs from "${JOBS_QUEUE}"...`);

    function requestShutdown(signal) {
        if (shuttingDown) {
            return;
        }

        shuttingDown = true;

        console.log(
            `Queue worker ${process.pid} received ${signal}. ` +
            `Stopping after current wait/job.`
        );
    }

    process.on("SIGINT", () => requestShutdown("SIGINT"));
    process.on("SIGTERM", () => requestShutdown("SIGTERM"));

    while (!shuttingDown) {
        let rawJob;

        try {
            /**
             * If the worker crashes after this line, the job is not lost.
             * It remains in PROCESSING_QUEUE and will be recovered on next start.
             */
            rawJob = await redis.blMove(
                JOBS_QUEUE,
                PROCESSING_QUEUE,
                "LEFT",
                "RIGHT",
                BLMOVE_TIMEOUT_SECONDS
            );
        } catch (err) {
            if (shuttingDown) {
                break;
            }

            throw err;
        }

        if (!rawJob) {
            continue;
        }

        try {
            const job = JSON.parse(rawJob);

            console.log("Processing job:", job);

            if (job.type !== "notify") {
                throw new Error(`Unknown job type: ${job.type}`);
            }
            console.log(`Notify subscribers about post ${job.postId}: "${job.title}"`);

            // A job leaves the processing queue only after it has been fully handled.
            await redis.lRem(PROCESSING_QUEUE, 1, rawJob);

            processedJobCount++;

            console.log(`Job done: ${rawJob}`);

            sendToPrimary({
                type: "job_processed",
                processedJobCount,
                jobType: job.type,
                postId: job.postId,
            });
        } catch (err) {
            console.error("Failed to process job:", rawJob);
            console.error(err.message);

            await handleFailedJob(redis, rawJob);
        }
    }

    sendToPrimary({
        type: "final_count",
        processedJobCount,
    });

    await closeRedis(redis);

    console.log(`Queue worker ${process.pid} stopped gracefully.`);
}

async function handleFailedJob(redis, rawJob) {
    /**
     * The job is currently inside PROCESSING_QUEUE.
     * Remove it from there first.
     */
    await redis.lRem(PROCESSING_QUEUE, 1, rawJob);

    await retryAndRequeueJob(redis, rawJob, {
        invalidJsonMessage: "Job is invalid JSON. Dropping it instead of retrying forever.",
        droppedMessage: (job) => `Job dropped after ${MAX_RETRIES} retries:`,
        requeuedMessage: (job, nextAttempts) => `Job requeued after failure. attempt=${nextAttempts}/${MAX_RETRIES}`,
        restoreOnRequeueFailure: true,
        setRetryMetadata: (job) => {
            job.lastError = "Job failed during processing.";
            job.requeuedAt = new Date().toISOString();
        },
    });
}

/**
 * Recover jobs left in the processing queue after an unexpected worker exit.
 */
async function recoverProcessingJobs(redis) {
    let recoveredCount = 0;

    while (true) {
        const rawJob = await redis.lPop(PROCESSING_QUEUE);

        if (!rawJob) {
            break;
        }

        const result = await retryAndRequeueJob(redis, rawJob, {
            invalidJsonMessage: "Invalid job found in processing queue. Dropping:",
            droppedMessage: (job) => `Recovered job dropped after ${MAX_RETRIES} retries:`,
            requeuedMessage: null,
            restoreOnRequeueFailure: true,
            setRetryMetadata: (job) => {
                job.lastError = "Worker crashed before ACK.";
                job.recoveredAt = new Date().toISOString();
            },
        });

        if (result.status === "requeued") {
            recoveredCount++;
            continue;
        }
    }

    if (recoveredCount > 0) {
        console.log(
            `Recovered ${recoveredCount} job(s) from "${PROCESSING_QUEUE}" back to "${JOBS_QUEUE}".`
        );
    }
}

async function retryAndRequeueJob(redis, rawJob, options) {
    let job;

    try {
        job = JSON.parse(rawJob);
    } catch {
        console.error(options.invalidJsonMessage, rawJob);
        return {
            status: "invalid_json",
        };
    }

    const attempts = Number(job.attempts) || 0;
    const nextAttempts = attempts + 1;

    if (nextAttempts > MAX_RETRIES) {
        console.error(options.droppedMessage(job), job);
        return {
            status: "dropped",
        };
    }

    job.attempts = nextAttempts;

    if (typeof options.setRetryMetadata === "function") {
        options.setRetryMetadata(job, nextAttempts);
    }

    try {
        await redis.rPush(JOBS_QUEUE, JSON.stringify(job));
    } catch (err) {
        console.error("Failed to requeue job:", err.message);

        if (options.restoreOnRequeueFailure) {
            try {
                await redis.rPush(PROCESSING_QUEUE, rawJob);
                console.error("Restored job back to processing queue after requeue failure.");
            } catch (restoreErr) {
                console.error("Failed to restore job back to processing queue:", restoreErr.message);
            }
        }

        return {
            status: "requeue_failed",
        };
    }

    if (typeof options.requeuedMessage === "function") {
        console.log(options.requeuedMessage(job, nextAttempts));
    }

    return {
        status: "requeued",
        job,
        nextAttempts,
    };
}

async function closeRedis(redis) {
    try {
        // node-redis v5 prefers close()
        if (typeof redis.close === "function") {
            await redis.close();
            return;
        }

        // node-redis v4 uses quit()
        await redis.quit();
    } catch (err) {
        console.error("Failed to close Redis cleanly:", err.message);

        if (typeof redis.disconnect === "function") {
            redis.disconnect();
        }
    }
}

startQueueWorker().catch((err) => {
    console.error(err);
    process.exit(1);
});