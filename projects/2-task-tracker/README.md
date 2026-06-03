# Project 2 — Task Tracker

A CLI to-do app that stores tasks in a `tasks.json` file. (Phase 2 adds a web front-end.)

## Requirements
- `add`, `update`, `delete` tasks
- `mark-in-progress`, `mark-done`
- `list`, `list done`, `list todo`, `list in-progress`
- Each task: `id`, `description`, `status`, `createdAt`, `updatedAt`

## Run it
```bash
node task-cli.js add "Buy groceries"
node task-cli.js list
node task-cli.js mark-done 1
```

## Rules
- No external npm packages for the CLI (Phase 1). Express is allowed in Phase 2 only.
- The JSON file is created if it doesn't exist; handle a corrupt/empty file without crashing.
- `createdAt` must never change on update; IDs must stay unique after deletes.

See the **Student Guide → Project 2** for documentation links and worked examples.
