Task Tracker CLI

A small command-line task tracker built with Node.js.
This app lets you manage tasks directly from the terminal. You can add tasks, update them, delete them, mark them as done or in progress, and list tasks by status.
Tasks are saved locally in a tasks.json file, so the data stays on your machine.

Features
Add a new task
Update an existing task
Delete a task
Mark a task as todo
Mark a task as in-progress
Mark a task as done
List all tasks
Filter tasks by status
Handle common errors without crashing

Requirements
You need Node.js installed.
Check that Node.js is available:
node --version

How to run the app
Run commands from the project folder.

Basic format:
node task-cli.js <command>

Example:
node task-cli.js add "Buy milk"
When you add your first task, the app will automatically create a tasks.json file.

Commands
Add a task
Creates a new task with the default status todo.
node task-cli.js add "Buy milk"
Example output:
Task added successfully (ID: 1)

List all tasks
Shows every task saved in tasks.json.
node task-cli.js list
Example output:
ID: 1 | Buy milk [todo] (created: 2026-06-04T10:00:00.000Z, updated: 2026-06-04T10:00:00.000Z)
If there are no tasks yet, the app prints:
No tasks found.

List tasks by status
You can filter the list by task status.
Available filters:
todo
in-progress
done
Show only todo tasks:
node task-cli.js list todo
Show only in-progress tasks:
node task-cli.js list in-progress
Show only done tasks:
node task-cli.js list done

Update a task
Changes the description of an existing task.
node task-cli.js update 1 "Buy bread"
Example output:
Task updated successfully (ID: 1)

Delete a task
Deletes a task by its ID.
node task-cli.js delete 1
Example output:
Task deleted successfully (ID: 1)

Mark a task as in progress
Changes the task status to in-progress.
node task-cli.js mark-in-progress 1
Example output:
Task marked as in-progress successfully (ID: 1)

Mark a task as done
Changes the task status to done.
node task-cli.js mark-done 1
Example output:
Task marked as done successfully (ID: 1)

Mark a task as todo
Changes the task status back to todo.
node task-cli.js mark-todo 1
Example output:
Task marked as todo successfully (ID: 1)

Error handling
The app is designed to show helpful messages instead of crashing.

No command
node task-cli.js
Example output:
Error: no command provided.

Unknown command
node task-cli.js remove 1
Example output:
Error: unknown command "remove".

Missing description
node task-cli.js add
Example output:
Error: missing description. Example: node task-cli.js add "Buy milk"

Missing ID
node task-cli.js delete
Example output:
Error: missing ID. Example: node task-cli.js delete 2

Non-numeric ID
node task-cli.js delete abc
Example output:
Error: ID must be a number. Received: "abc". Example: node task-cli.js delete 2

Non-existent ID
node task-cli.js delete 999
Example output:
Error: task with ID 999 does not exist.

Invalid status filter
node task-cli.js list finished
Example output:
Error: bad filter "finished". Use: todo, done, or in-progress.

Corrupt tasks file
If tasks.json contains invalid JSON, the app shows a warning and starts with an empty task list instead of crashing.
Example broken tasks.json:
{ bad json
Example output:
Warning: tasks.json is corrupt or not valid JSON. Starting fresh.

Data storage
Tasks are stored in a local file:
tasks.json
Example task:
{
"id": 1,
"description": "Buy milk",
"status": "todo",
"createdAt": "2026-06-04T10:00:00.000Z",
"updatedAt": "2026-06-04T10:00:00.000Z"
}