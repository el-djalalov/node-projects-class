function createRollingReloadCoordinator({
    cluster,
    logger = console,
    listeningTimeoutMs = 5000,
    exitTimeoutMs = 5000,
    forkWorker = () => cluster.fork(),
}) {
    const intentionalExitIds = new Set();
    let reloading = false;

    function consumeIntentionalExit(worker) {
        if (!worker || intentionalExitIds.has(worker.id) === false) {
            return false;
        }

        intentionalExitIds.delete(worker.id);
        return true;
    }

    function waitForWorkerListening(worker) {
        return new Promise((resolve, reject) => {
            let settled = false;

            function cleanup() {
                worker.off("listening", onListening);
                worker.off("exit", onExit);
                clearTimeout(timer);
            }

            function onListening() {
                if (settled) {
                    return;
                }

                settled = true;
                cleanup();
                resolve(worker);
            }

            function onExit(code, signal) {
                if (settled) {
                    return;
                }

                settled = true;
                cleanup();
                reject(
                    new Error(
                        `Replacement worker ${worker.process.pid} exited before listening. ` +
                        `code=${code}, signal=${signal}`
                    )
                );
            }

            const timer = setTimeout(() => {
                if (settled) {
                    return;
                }

                settled = true;
                cleanup();
                reject(
                    new Error(
                        `Replacement worker ${worker.process.pid} did not start within ${listeningTimeoutMs}ms`
                    )
                );
            }, listeningTimeoutMs);

            worker.once("listening", onListening);
            worker.once("exit", onExit);
        });
    }

    function waitForWorkerExit(worker) {
        return new Promise((resolve) => {
            let exited = false;

            function cleanup() {
                worker.off("exit", onExit);
                clearTimeout(forceKillTimer);
            }

            function onExit(code, signal) {
                if (exited) {
                    return;
                }

                exited = true;
                cleanup();
                resolve({ code, signal });
            }

            worker.once("exit", onExit);

            const forceKillTimer = setTimeout(() => {
                if (exited) {
                    return;
                }

                logger.warn(
                    `Web worker ${worker.process.pid} did not exit within ${exitTimeoutMs}ms; forcing SIGKILL.`
                );

                worker.kill("SIGKILL");
            }, exitTimeoutMs);
        });
    }

    async function startReplacementWorker() {
        const replacement = await forkWorker();

        try {
            await waitForWorkerListening(replacement);
            return replacement;
        } catch (err) {
            replacement.kill("SIGTERM");
            throw err;
        }
    }

    async function reloadWorkersOneAtATime() {
        if (reloading) {
            logger.log("Rolling reload already in progress.");
            return;
        }

        const workers = Object.values(cluster.workers || {})
            .filter(Boolean)
            .sort((left, right) => left.id - right.id);

        if (workers.length === 0) {
            logger.log("No workers available for rolling reload.");
            return;
        }

        reloading = true;

        try {
            logger.log(`Starting rolling reload for ${workers.length} web worker(s).`);

            for (const oldWorker of workers) {
                logger.log(`Starting replacement for worker ${oldWorker.process.pid}.`);

                const replacement = await startReplacementWorker();

                intentionalExitIds.add(oldWorker.id);
                const exitPromise = waitForWorkerExit(oldWorker);

                oldWorker.kill("SIGTERM");
                await exitPromise;

                logger.log(
                    `Replaced worker ${oldWorker.process.pid} with ${replacement.process.pid}.`
                );
            }

            logger.log("Rolling reload complete.");
        } finally {
            reloading = false;
        }
    }

    return {
        consumeIntentionalExit,
        reloadWorkersOneAtATime,
        isReloading: () => reloading,
    };
}

module.exports = {
    createRollingReloadCoordinator,
};
