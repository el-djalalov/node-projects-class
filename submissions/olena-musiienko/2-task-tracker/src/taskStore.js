const path = require("path");
const fs = require("fs");

const FILE = path.join(__dirname, "..", "tasks.json");
const allowedStatuses = ["todo", "done", "in-progress"];
const allowedPriorities = ["low", "medium", "high"];

function loadTasks() {
    if (!fs.existsSync(FILE)) return [];

    try {
        const raw = fs.readFileSync(FILE, "utf-8");

        if (raw.trim() === "") return [];

        const tasks = JSON.parse(raw);

        if (!Array.isArray(tasks)) {
            return [];
        }

        return tasks;
    } catch {
        return [];
    }
}

function saveTasks(tasks) {
    fs.writeFileSync(FILE, JSON.stringify(tasks, null, 2));
}

function getNextId(tasks) {
    return tasks.length === 0 ? 1 : Math.max(...tasks.map(task => task.id)) + 1;
}

function validateId(id) {
    if (!id) {
        return {
            valid: false,
            error: "Missing ID",
        };
    }

    const taskId = Number(id);

    if (Number.isNaN(taskId)) {
        return {
            valid: false,
            error: `ID must be a number. Received: "${id}"`,
        };
    }

    return {
        valid: true,
        taskId,
    };
}

function addTask(description, options = {}) {
    const { dueDate = null, priority = "medium" } = options;

    if (!description || description.trim() === "") {
        return {
            success: false,
            error: "Missing description",
        };
    }

    if (priority && !allowedPriorities.includes(priority)) {
        return {
            success: false,
            error: `Bad priority "${priority}". Use: low, medium, or high.`,
        };
    }

    const tasks = loadTasks();
    const now = new Date().toISOString();

    const task = {
        id: getNextId(tasks),
        description: description.trim(),
        status: "todo",
        priority,
        dueDate,
        createdAt: now,
        updatedAt: now,
    };

    tasks.push(task);
    saveTasks(tasks);

    return {
        success: true,
        task,
    };
}

function listTasks(options = {}) {
    const { statusFilter, search, sort } = options;

    if (statusFilter && !allowedStatuses.includes(statusFilter)) {
        return {
            success: false,
            error: `Bad filter "${statusFilter}". Use: todo, done, or in-progress.`,
        };
    }

    let tasks = loadTasks();

    if (statusFilter) {
        tasks = tasks.filter(task => task.status === statusFilter);
    }

    if (search && search.trim()) {
        const normalizedSearch = search.trim().toLowerCase();

        tasks = tasks.filter(task =>
            task.description.toLowerCase().includes(normalizedSearch)
        );
    }

    if (sort === "dueDate") {
        tasks.sort((a, b) => {
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;

            return new Date(a.dueDate) - new Date(b.dueDate);
        });
    }

    if (sort === "createdAt") {
        tasks.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    }

    if (sort === "updatedAt") {
        tasks.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    }

    if (sort === "priority") {
        const priorityOrder = {
            high: 1,
            medium: 2,
            low: 3,
        };

        tasks.sort((a, b) => {
            const aPriority = a.priority || "medium";
            const bPriority = b.priority || "medium";

            return priorityOrder[aPriority] - priorityOrder[bPriority];
        });
    }

    return {
        success: true,
        tasks,
    };
}

function updateTask(id, newDescription) {
    const idCheck = validateId(id);

    if (!idCheck.valid) {
        return {
            success: false,
            error: idCheck.error,
        };
    }

    if (!newDescription || newDescription.trim() === "") {
        return {
            success: false,
            error: "Missing new description",
        };
    }

    const tasks = loadTasks();
    const task = tasks.find(task => task.id === idCheck.taskId);

    if (!task) {
        return {
            success: false,
            error: `Task with ID ${id} does not exist.`,
        };
    }

    task.description = newDescription;
    task.updatedAt = new Date().toISOString();

    saveTasks(tasks);

    return {
        success: true,
        task,
    };
}

function deleteTask(id) {
    const idCheck = validateId(id);

    if (!idCheck.valid) {
        return {
            success: false,
            error: idCheck.error,
        };
    }

    const tasks = loadTasks();
    const task = tasks.find(task => task.id === idCheck.taskId);

    if (!task) {
        return {
            success: false,
            error: `Task with ID ${id} does not exist.`,
        };
    }

    const filteredTasks = tasks.filter(task => task.id !== idCheck.taskId);
    saveTasks(filteredTasks);

    return {
        success: true,
        task,
    };
}

function markTask(id, newStatus) {
    const idCheck = validateId(id);

    if (!idCheck.valid) {
        return {
            success: false,
            error: idCheck.error,
        };
    }

    if (!allowedStatuses.includes(newStatus)) {
        return {
            success: false,
            error: `Bad status "${newStatus}". Use: todo, done, or in-progress.`,
        };
    }

    const tasks = loadTasks();
    const task = tasks.find(task => task.id === idCheck.taskId);

    if (!task) {
        return {
            success: false,
            error: `Task with ID ${id} does not exist.`,
        };
    }

    task.status = newStatus;
    task.updatedAt = new Date().toISOString();

    saveTasks(tasks);

    return {
        success: true,
        task,
    };
}

function clearDoneTasks() {
    const tasks = loadTasks();

    const remainingTasks = tasks.filter(task => task.status !== "done");
    const deletedCount = tasks.length - remainingTasks.length;

    saveTasks(remainingTasks);

    return {
        success: true,
        deletedCount,
    };
}

module.exports = {
    addTask,
    listTasks,
    updateTask,
    deleteTask,
    markTask,
    clearDoneTasks,
};