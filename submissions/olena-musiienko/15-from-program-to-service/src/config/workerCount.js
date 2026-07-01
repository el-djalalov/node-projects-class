const os = require("node:os");
const { parseArgs } = require("node:util");

function parseWorkersFlag(argv = process.argv.slice(2), maxWorkers = getAvailableWorkerCount()) {
    const parsed = parseArgs({
        args: argv,
        options: {
            workers: {
                type: "string",
            },
        },
        strict: false,
    });

    // If the --workers flag is not present, return null to indicate no override.
    if (parsed.values.workers == null) {
        return null;
    }

    const workerCount = Number(parsed.values.workers);

    if (!Number.isInteger(workerCount) || workerCount < 1) {
        throw new Error("--workers must be a positive integer");
    }

    if (workerCount > maxWorkers) {
        throw new Error(`--workers must not be greater than available CPU count (${maxWorkers})`);
    }

    return workerCount;
}

function getAvailableWorkerCount() {
    if (typeof os.availableParallelism === "function") {
        return os.availableParallelism();
    }

    return os.cpus().length;
}

function getWorkerCount(argv = process.argv.slice(2)) {
    const maxWorkers = getAvailableWorkerCount();
    const override = parseWorkersFlag(argv, maxWorkers);

    if (override != null) {
        return override;
    }

    return maxWorkers;
}

module.exports = {
    getWorkerCount,
    parseWorkersFlag,
};