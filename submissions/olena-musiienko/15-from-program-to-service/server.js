const cluster = require("node:cluster");
const path = require("node:path");
const { fork } = require("node:child_process");
const { createClient } = require("redis");

const { createApp } = require("./app");
const { startLiveSubscriber } = require("./live-subscriber");
const { getWorkerCount } = require("./src/config/workerCount");
const { createRollingReloadCoordinator } = require("./src/config/rollingReload");

const PORT = Number(process.env.PORT) || 3000;
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const WEB_WORKER_SHUTDOWN_TIMEOUT_MS = 5000;
const QUEUE_WORKER_SHUTDOWN_TIMEOUT_MS = 5000;
const RESTART_WINDOW_MS = 60000;
const WEB_WORKER_MAX_RESTARTS = 12;
const QUEUE_WORKER_MAX_RESTARTS = 12;
const RESTART_BASE_DELAY_MS = 500;
const RESTART_MAX_DELAY_MS = 10000;

let queueWorker = null;
let shuttingDown = false;
let queueWorkerRestartController = null;

let currentQueueWorkerProcessedCount = 0;
let totalProcessedJobCount = 0;

function createRestartController({
    label,
    maxRestarts,
    windowMs,
    baseDelayMs,
    maxDelayMs,
}) {
    const timestamps = [];

    function prune(now) {
        while (timestamps.length > 0 && now - timestamps[0] > windowMs) {
            timestamps.shift();
        }
    }

    function scheduleAttempt(action, reason, resolve, reject) {
        if (shuttingDown) {
            if (typeof reject === "function") {
                reject(new Error(`${label} restart aborted: shutting down`));
            }
            return;
        }

        const now = Date.now();
        prune(now);

        if (timestamps.length >= maxRestarts) {
            console.error(
                `${label} restart budget exceeded: ${timestamps.length} restarts in ${windowMs}ms. ` +
                `Last reason: ${reason}`
            );
            shuttingDown = true;
            if (typeof reject === "function") {
                reject(new Error(`${label} restart budget exceeded`));
            }
            process.exit(1);
            return;
        }

        timestamps.push(now);

        const attempt = timestamps.length;
        const baseDelay = Math.min(baseDelayMs * (2 ** (attempt - 1)), maxDelayMs);
        const jitter = Math.floor(Math.random() * 200);
        const delay = baseDelay + jitter;

        console.warn(
            `${label} restart attempt ${attempt}/${maxRestarts} scheduled in ${delay}ms. ` +
            `Reason: ${reason}`
        );

        const timer = setTimeout(() => {
            if (shuttingDown) {
                if (typeof reject === "function") {
                    reject(new Error(`${label} restart aborted: shutting down`));
                }
                return;
            }

            try {
                const result = action();
                if (typeof resolve === "function") {
                    resolve(result);
                }
            } catch (err) {
                scheduleAttempt(action, err.message, resolve, reject);
            }
        }, delay);

        timer.unref();
    }

    function run(action, reason) {
        return new Promise((resolve, reject) => {
            scheduleAttempt(action, reason, resolve, reject);
        });
    }

    function schedule(action, reason) {
        run(action, reason).catch(() => {});
    }

    return {
        run,
        schedule,
    };
}

async function connectRedis() {
    const client = createClient({
        url: REDIS_URL,
        socket: {
            connectTimeout: 1000,
            reconnectStrategy: false,
        },
    });

    client.on("error", (err) => {
        console.error("Redis client error:", err);
    });

    try {
        await client.connect();
        console.log(`Redis connected in process ${process.pid}.`);
        return client;
    } catch (err) {
        console.warn("Redis unavailable — continuing without cache.");
        console.warn(err.message);
        return null;
    }
}

async function closeRedisClient(client) {
    if (!client || client.isOpen === false) {
        return;
    }

    try {
        // node-redis v5 prefers close()
        if (typeof client.close === "function") {
            await client.close();
            return;
        }

        // node-redis v4 uses quit()
        if (typeof client.quit === "function") {
            await client.quit();
            return;
        }
    } catch (err) {
        console.error("Failed to close Redis cleanly:", err.message);
    }

    if (typeof client.disconnect === "function") {
        client.disconnect();
    }
}

// Spawn the queue worker process and wire its lifecycle events.
function startQueueWorker() {
    const worker = fork(path.join(__dirname, "worker.js"), [], {
        stdio: ["inherit", "inherit", "inherit", "ipc"],
    });

    console.log(`Queue worker ${worker.pid} started`);

    worker.on("message", (message) => {
        if (!message || typeof message !== "object") {
            console.log("Queue worker says:", message);
            return;
        }

        if (message.type === "ready") {
            currentQueueWorkerProcessedCount = 0;

            console.log(
                `Queue worker ${message.pid} is ready. Total processed jobs=${totalProcessedJobCount}`
            );

            return;
        }

        if (message.type === "job_processed") {
            currentQueueWorkerProcessedCount = message.processedJobCount;
            totalProcessedJobCount++;

            console.log(
                `Queue worker ${message.pid} processed job #${message.processedJobCount} in this worker. ` +
                `Total processed jobs=${totalProcessedJobCount}. ` +
                `type=${message.jobType}, postId=${message.postId}`
            );

            return;
        }

        if (message.type === "final_count") {
            currentQueueWorkerProcessedCount = message.processedJobCount;

            console.log(
                `Clean shutdown summary from queue worker ${message.pid}: ` +
                `worker processed ${message.processedJobCount} jobs; ` +
                `primary total processed jobs=${totalProcessedJobCount}`
            );
            return;
        }

        console.log("Queue worker says:", message);
    });

    worker.on("error", (err) => {
        console.error("Queue worker process error:", err);
    });

    // Restart the queue worker only when the exit was not part of shutdown.
    worker.on("exit", (code, signal) => {
        console.log(
            `Queue worker ${worker.pid} exited. code=${code}, signal=${signal}. ` +
            `Last worker count=${currentQueueWorkerProcessedCount}. ` +
            `Total processed jobs=${totalProcessedJobCount}`
        );

        if (shuttingDown) {
            return;
        }

        if (!queueWorkerRestartController) {
            console.log("Restarting queue worker...");
            currentQueueWorkerProcessedCount = 0;
            queueWorker = startQueueWorker();
            return;
        }

        queueWorkerRestartController.schedule(() => {
            currentQueueWorkerProcessedCount = 0;
            queueWorker = startQueueWorker();
        }, `queue worker exited code=${code} signal=${signal}`);
    });

    return worker;
}

// Start the HTTP worker, Redis subscriber, and graceful shutdown hooks.
async function startWebWorker() {
    const cache = await connectRedis();

    const { app, broadcastLivePostEvent } = createApp({ cache });

    const subscriber = await startLiveSubscriber(cache, broadcastLivePostEvent);

    const server = app.listen(PORT, () => {
        console.log(`Web worker ${process.pid} listening on port ${PORT}`);
    });

    const sockets = new Set();
    let workerShuttingDown = false;
    let cleanupStarted = false;

    server.on("connection", (socket) => {
        sockets.add(socket);

        socket.on("close", () => {
            sockets.delete(socket);
        });
    });

    async function cleanupAndExit(exitCode) {
       if (cleanupStarted) {
           return;
       }

       cleanupStarted = true;

       if (subscriber) {
           await closeRedisClient(subscriber);
       }

       if (cache) {
           await closeRedisClient(cache);
       }

        console.log(`Web worker ${process.pid} stopped.`);
        process.exit(exitCode);
    }

    function destroyOpenSockets() {
        if (sockets.size > 0) {
            console.log(
                `Web worker ${process.pid} destroying ${sockets.size} open socket(s).`
            );
        }

        for (const socket of sockets) {
            socket.destroy();
        }
    }

    function shutdown(signal) {
        if (workerShuttingDown) {
            return;
        }

        workerShuttingDown = true;
        console.log(`Web worker ${process.pid} received ${signal}. Shutting down...`);

        const forceShutdownTimer = setTimeout(() => {
            console.log(
                `Web worker ${process.pid} forced shutdown after ` +
                `${WEB_WORKER_SHUTDOWN_TIMEOUT_MS}ms.`
            );

            if (typeof server.closeAllConnections === "function") {
                server.closeAllConnections();
            }

            destroyOpenSockets();

            cleanupAndExit(0).catch((err) => {
                console.error("Forced cleanup failed:", err);
                process.exit(1);
            });
        }, WEB_WORKER_SHUTDOWN_TIMEOUT_MS);
        forceShutdownTimer.unref();

        server.close((err) => {
            clearTimeout(forceShutdownTimer);

            if (err) {
                console.error(`Web worker ${process.pid} server.close error:`, err);
            }

            cleanupAndExit(err ? 1 : 0).catch((cleanupErr) => {
                console.error("Cleanup failed:", cleanupErr);
                process.exit(1);
            });
        });

        if (typeof server.closeIdleConnections === "function") {
            server.closeIdleConnections();
        }
    }

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
}

if (cluster.isPrimary) {
    // primary process handles incoming connections and distributes them to workers in a round-robin manner.
    cluster.schedulingPolicy = cluster.SCHED_RR;
    let workerCount;
    try {
        workerCount = getWorkerCount();
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }

    console.log(`WORKER COUNT ${workerCount}`);
    console.log(`Primary ${process.pid} is running`);
    console.log(`Starting ${workerCount} web workers`);

    const webWorkerRestartController = createRestartController({
        label: "Web worker",
        maxRestarts: WEB_WORKER_MAX_RESTARTS,
        windowMs: RESTART_WINDOW_MS,
        baseDelayMs: RESTART_BASE_DELAY_MS,
        maxDelayMs: RESTART_MAX_DELAY_MS,
    });

    queueWorkerRestartController = createRestartController({
        label: "Queue worker",
        maxRestarts: QUEUE_WORKER_MAX_RESTARTS,
        windowMs: RESTART_WINDOW_MS,
        baseDelayMs: RESTART_BASE_DELAY_MS,
        maxDelayMs: RESTART_MAX_DELAY_MS,
    });

    function forkWebWorkerOrSchedule(reason) {
        try {
            cluster.fork();
        } catch (err) {
            webWorkerRestartController.schedule(() => {
                cluster.fork();
            }, `${reason}; fork failed: ${err.message}`);
        }
    }

    for (let i = 0; i < workerCount; i++) {
        forkWebWorkerOrSchedule("initial startup");
    }

    try {
        queueWorker = startQueueWorker();
    } catch (err) {
        queueWorkerRestartController.schedule(() => {
            queueWorker = startQueueWorker();
        }, `initial startup; queue fork failed: ${err.message}`);
    }

    // Lazy singleton that coordinates rolling reloads without dropping all web workers at once.
    const rollingReload = createRollingReloadCoordinator({
        cluster,
        logger: console,
        forkWorker: () =>
            webWorkerRestartController.run(
                () => cluster.fork(),
                "rolling reload replacement"
            ),
    });

    function handleRollingReloadSignal(signal) {
        console.log(`Primary received ${signal}; starting rolling reload.`);

        rollingReload.reloadWorkersOneAtATime().catch((err) => {
            console.error("Rolling reload failed:", err);
        });
    }

    function registerRollingReloadSignal(signal) {
        process.on(signal, () => handleRollingReloadSignal(signal));
    }

    cluster.on("exit", (worker, code, signal) => {
        console.log(
            `Web worker ${worker.process.pid} exited. code=${code}, signal=${signal}`
        );

        if (rollingReload.consumeIntentionalExit(worker)) {
            return;
        }

        if (shuttingDown) {
            return;
        }

        webWorkerRestartController.schedule(() => {
            cluster.fork();
        }, `web worker exited code=${code} signal=${signal}`);
    });

    cluster.on("message", (worker, message) => {
        if (!message || typeof message !== "object") {
            return;
        }

        if (message.type !== "reload_request") {
            return;
        }

        console.log(`Primary received reload request from worker ${worker.process.pid}.`);

        rollingReload.reloadWorkersOneAtATime().catch((err) => {
            console.error("Rolling reload failed:", err);
        });
    });

    function shutdown() {
        shuttingDown = true;

        console.log("Primary shutting down...");

        for (const id in cluster.workers) {
            cluster.workers[id].kill("SIGTERM");
        }

        if (queueWorker) {
            queueWorker.once("exit", () => {
                process.exit(0);
            });

            queueWorker.kill("SIGTERM");

            setTimeout(() => {
                console.log(
                    `Primary forced exit after waiting for queue worker. ` +
                    `Last worker count=${currentQueueWorkerProcessedCount}. ` +
                    `Total processed jobs=${totalProcessedJobCount}`
                );

                process.exit(0);
            }, QUEUE_WORKER_SHUTDOWN_TIMEOUT_MS);

            return;
        }

        process.exit(0);
    }

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    registerRollingReloadSignal("SIGUSR2");
    registerRollingReloadSignal("SIGHUP");
    if (process.platform === "win32") {
        registerRollingReloadSignal("SIGBREAK");
    }

} else {
    startWebWorker().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
