const {
    addExpense,
    listExpenses,
    updateExpense,
    deleteExpense,
    summaryExpense,
    setBudget,
    exportExpenses,
    parseFlags,
} = require("./expenseStore");

const args = process.argv.slice(2);
const command = args[0];
const commandArgs = args.slice(1);

function printHelpMessage() {
    console.log(`
Usage:
  node expense-cli.js add --description "Lunch" --amount 20
  node expense-cli.js add --description "Lunch" --amount 20 --category food
  node expense-cli.js list
  node expense-cli.js list --category food
  node expense-cli.js summary
  node expense-cli.js summary --month 8
  node expense-cli.js budget --month 8 --amount 500
  node expense-cli.js update --id 1 --description "Dinner"
  node expense-cli.js update --id 1 --amount 35
  node expense-cli.js update --id 1 --description "Dinner" --amount 35
  node expense-cli.js delete --id 1
  node expense-cli.js export
  node expense-cli.js export --file expenses.csv
  node expense-cli.js update --id 1 --category transport
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

const flags = parseFlags(commandArgs);

switch (command) {
    case "add": {
        const result = addExpense(flags);

        if (!result.success) {
            printError(
                result,
                'node expense-cli.js add --description "Lunch" --amount 20'
            );
            break;
        }

        console.log(`Expense added successfully (ID: ${result.expense.id})`);
        break;
    }

    case "list": {
        const result = listExpenses(flags);

        if (!result.success) {
            console.error(`Error: ${result.error}`);
            break;
        }

        if (result.expenses.length === 0) {
            console.log("No expenses found.");
            break;
        }
        console.log("ID  Date        Description   Category      Amount");

        result.expenses.forEach(expense => {
            console.log(
                `${String(expense.id).padEnd(4)}` +
                `${expense.date}  ` +
                `${expense.description.padEnd(14)}` +
                `${String(expense.category || "general").padEnd(14)}` +
                `$${expense.amount}`
            );
        });


        break;
    }

    case "delete": {
        const result = deleteExpense(flags);

        if (!result.success) {
            printError(result, "node expense-cli.js delete --id 1");
            break;
        }

        console.log(`Expense deleted successfully (ID: ${result.expense.id})`);
        break;
    }

    case "update": {
        const result = updateExpense(flags);

        if (!result.success) {
            printError(
                result,
                'node expense-cli.js update --id 1 --description "Dinner" --amount 35'
            );
            break;
        }

        console.log(`Expense updated successfully (ID: ${result.expense.id})`);
        break;
    }

    case "summary": {
        const result = summaryExpense(flags);

        if (!result.success) {
            printError(result, "node expense-cli.js summary --month 8");
            break;
        }

        console.log(`Total expenses: $${result.total}`);

        if (result.budget) {
            console.log(`Monthly budget: $${result.budget.amount}`);

            if (result.isOverBudget) {
                console.log("Warning: monthly total exceeds the budget.");
            }
        }

        break;
    }

    case "budget": {
        const result = setBudget(flags);

        if (!result.success) {
            printError(result, "node expense-cli.js budget --month 6 --amount 500");
            break;
        }

        console.log(
            `Budget set for ${result.budget.month}/${result.budget.year}: $${result.budget.amount}`
        );
        break;
    }

    case "export": {
        const result = exportExpenses(flags);

        if (!result.success) {
            console.error(`Error: ${result.error}`);
            break;
        }

        console.log(`Exported ${result.count} expenses to ${result.fileName}`);
        break;
    }

    default:
        console.error(`Error: unknown command "${command}".`);
        printHelpMessage();
        process.exit(1);
}