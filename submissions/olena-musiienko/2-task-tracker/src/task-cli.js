const {
    addTask,
    listTasks,
    updateTask,
    deleteTask,
    markTask,
    clearDoneTasks,
} = require("./taskStore");

let args = process.argv.slice(2);
const command = args[0];
const commandArgs = args.slice(1);

function printHelpMessage() {
    console.log(`
Usage:
  node task-cli.js add "Buy milk"
  node task-cli.js update 2 "Buy bread"
  node task-cli.js delete 2
  node task-cli.js mark-done 2
  node task-cli.js mark-in-progress 2
  node task-cli.js mark-todo 2
  node task-cli.js list
  node task-cli.js list todo
  node task-cli.js list done
  node task-cli.js list in-progress
`);
}

function printError(result, example) {
    console.error(`Error: ${result.error}. Example: ${example}`);
}

if (!command) {
    console.error("Error: no command provided.");
    printHelpMessage();
    process.exit(1);
}

switch (command) {
    case "add": {
        const result = addTask(commandArgs[0]);

        if (!result.success) {
            printError(result, 'node task-cli.js add "Buy milk"');
            break;
        }

        console.log(`Task added successfully (ID: ${result.task.id})`);
        break;
    }

    case "list": {
        const result = listTasks({
            statusFilter: commandArgs[0],
        });

        if (!result.success) {
            console.error(`Error: ${result.error}`);
            break;
        }

        if (result.tasks.length === 0) {
            console.log(commandArgs[0] ? `No tasks with status "${commandArgs[0]}" found.` : "No tasks found.");
            break;
        }
        result.tasks.forEach(task => {
            console.log(
                `ID: ${task.id} | ${task.description} [${task.status}] ` +
                `(created: ${task.createdAt}, updated: ${task.updatedAt})`
            );
        });

        break;
    }

    case "update": {
        const result = updateTask(commandArgs[0], commandArgs[1]);

        if (!result.success) {
            printError(result, 'node task-cli.js update 2 "Buy bread"');
            break;
        }

        console.log(`Task updated successfully (ID: ${result.task.id})`);
        break;
    }

    case "delete": {
        const result = deleteTask(commandArgs[0]);

        if (!result.success) {
            printError(result, "node task-cli.js delete 2");
            break;
        }

        console.log(`Task deleted successfully (ID: ${result.task.id})`);
        break;
    }

    case "mark-done": {
        const result = markTask(commandArgs[0], "done");

        if (!result.success) {
            printError(result, "node task-cli.js mark-done 2");
            break;
        }

        console.log(`Task marked as done successfully (ID: ${result.task.id})`);
        break;
    }

    case "mark-in-progress": {
        const result = markTask(commandArgs[0], "in-progress");

        if (!result.success) {
            printError(result, "node task-cli.js mark-in-progress 2");
            break;
        }

        console.log(`Task marked as in-progress successfully (ID: ${result.task.id})`);
        break;
    }

    case "mark-todo": {
        const result = markTask(commandArgs[0], "todo");

        if (!result.success) {
            printError(result, "node task-cli.js mark-todo 2");
            break;
        }

        console.log(`Task marked as todo successfully (ID: ${result.task.id})`);
        break;
    }

    case "clear-done": {
        const result = clearDoneTasks();

        if (!result.success) {
            console.error(`Error: ${result.error}`);
            break;
        }

        console.log(`Deleted done tasks: ${result.deletedCount}`);
        break;
    }

    default:
        console.error(`Error: unknown command "${command}".`);
        printHelpMessage();
        process.exit(1);
}
