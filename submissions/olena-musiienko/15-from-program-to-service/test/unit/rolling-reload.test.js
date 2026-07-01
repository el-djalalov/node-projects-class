const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const {
    createRollingReloadCoordinator,
} = require("../../src/config/rollingReload");

class FakeWorker extends EventEmitter {
    constructor(id, pid) {
        super();
        this.id = id;
        this.process = { pid };
        this.kills = [];
    }

    kill(signal) {
        this.kills.push(signal);
    }
}

function createFakeCluster() {
    let nextId = 3;
    let nextPid = 1000;
    const workers = {
        1: new FakeWorker(1, 2001),
        2: new FakeWorker(2, 2002),
    };
    const forkedWorkers = [];

    return {
        workers,
        forkedWorkers,
        fork() {
            const worker = new FakeWorker(nextId, nextPid);
            nextId += 1;
            nextPid += 1;
            workers[worker.id] = worker;
            forkedWorkers.push(worker);
            return worker;
        },
    };
}

async function waitForCondition(predicate) {
    for (let i = 0; i < 50; i += 1) {
        if (predicate()) {
            return;
        }

        await new Promise((resolve) => setImmediate(resolve));
    }

    throw new Error("Timed out waiting for condition");
}

test("reloadWorkersOneAtATime replaces workers sequentially", async () => {
    const cluster = createFakeCluster();
    const logs = [];
    const coordinator = createRollingReloadCoordinator({
        cluster,
        logger: {
            log: (...args) => logs.push(args.join(" ")),
            warn: (...args) => logs.push(args.join(" ")),
            error: (...args) => logs.push(args.join(" ")),
        },
        listeningTimeoutMs: 1000,
        exitTimeoutMs: 1000,
    });

    const reloadPromise = coordinator.reloadWorkersOneAtATime();

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(cluster.forkedWorkers.length, 1);

    cluster.forkedWorkers[0].emit("listening");

    await new Promise((resolve) => setImmediate(resolve));
    cluster.workers[1].emit("exit", 0, "SIGTERM");

    await waitForCondition(() => cluster.forkedWorkers.length === 2);

    cluster.forkedWorkers[1].emit("listening");

    await new Promise((resolve) => setImmediate(resolve));
    cluster.workers[2].emit("exit", 0, "SIGTERM");

    await reloadPromise;

    assert.deepStrictEqual(cluster.workers[1].kills, ["SIGTERM"]);
    assert.deepStrictEqual(cluster.workers[2].kills, ["SIGTERM"]);
    assert.equal(coordinator.isReloading(), false);
    assert.ok(logs.some((line) => line.includes("Rolling reload complete.")));
});

test("reloadWorkersOneAtATime cleans up a replacement that never starts", async () => {
    const cluster = createFakeCluster();
    const coordinator = createRollingReloadCoordinator({
        cluster,
        logger: {
            log: () => {},
            warn: () => {},
            error: () => {},
        },
        listeningTimeoutMs: 20,
        exitTimeoutMs: 1000,
    });

    const reloadPromise = coordinator.reloadWorkersOneAtATime();

    await assert.rejects(reloadPromise, /did not start within 20ms/);

    assert.equal(coordinator.isReloading(), false);
    assert.deepStrictEqual(cluster.forkedWorkers[0].kills, ["SIGTERM"]);
    assert.deepStrictEqual(cluster.workers[1].kills, []);
});
