# Project 3 — Expense Tracker

A CLI to track spending, stored in an `expenses.json` file.

## Requirements
- `add --description "Lunch" --amount 20`
- `update --id <id> ...`, `delete --id <id>`
- `list` (with aligned columns)
- `summary` (total) and `summary --month <N>` (current-year month)

## Run it
```bash
node expense.js add --description "Lunch" --amount 20
node expense.js list
node expense.js summary --month 8
```

## Rules
- No external npm packages.
- Reject invalid amounts (negative or non-numeric) and non-existent IDs.

See the **Student Guide → Project 3** for documentation links and worked examples.
