const cors = require("cors");
const express = require("express");

const {
    addTask,
    listTasks,
    updateTask,
    deleteTask,
    markTask,
    clearDoneTasks,
} = require("./taskStore");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// GET /tasks
// GET /tasks?status=todo
// GET /tasks?status=in-progress
// GET /tasks?status=done
app.get("/tasks", (req, res) => {
    const result = listTasks({
        statusFilter: req.query.status,
        search: req.query.search,
        sort: req.query.sort,
    });

    if (!result.success) {
        return res.status(400).json(result);
    }

    res.json(result);
});

// POST /tasks
// body: { "description": "Buy milk" }
app.post("/tasks", (req, res) => {
    const result = addTask(req.body.description, {
        dueDate: req.body.dueDate,
        priority: req.body.priority,
    });

    if (!result.success) {
        return res.status(400).json(result);
    }

    res.status(201).json(result);
});
// PATCH /tasks/:id
// body: { "description": "Buy bread" }
// or
// body: { "status": "done" }
app.patch("/tasks/:id", (req, res) => {
    const { id } = req.params;
    const { description, status } = req.body;

    let result;

    if (description !== undefined) {
        result = updateTask(id, description);
    } else if (status !== undefined) {
        result = markTask(id, status);
    } else {
        return res.status(400).json({
            success: false,
            error: "Provide description or status to update.",
        });
    }

    if (!result.success) {
        const statusCode = result.error.includes("does not exist") ? 404 : 400;
        return res.status(statusCode).json(result);
    }

    res.json(result);
});

app.delete("/tasks/done", (req, res) => {
    const result = clearDoneTasks();

    res.json(result);
});

app.delete("/tasks/:id", (req, res) => {
    const result = deleteTask(req.params.id);

    if (!result.success) {
        const statusCode = result.error.includes("does not exist") ? 404 : 400;
        return res.status(statusCode).json(result);
    }

    res.json(result);
});


app.listen(PORT, () => {
    console.log(`Task Tracker API is running on http://localhost:${PORT}`);
});