const path = require("path");
const fs = require("fs");

const FILE = path.join(__dirname, "..", "expenses.json");
const BUDGET_FILE = path.join(__dirname, "..", "budgets.json");

function loadExpenses() {
    if (!fs.existsSync(FILE)) return [];

    try {
        const raw = fs.readFileSync(FILE, "utf-8");

        if (raw.trim() === "") return [];

        const expenses = JSON.parse(raw);

        if (!Array.isArray(expenses)) {
            return [];
        }

        return expenses;
    } catch {
        return [];
    }
}

function loadBudgets() {
    if (!fs.existsSync(BUDGET_FILE)) return [];

    try {
        const raw = fs.readFileSync(BUDGET_FILE, "utf-8");

        if (raw.trim() === "") return [];

        const budgets = JSON.parse(raw);

        if (!Array.isArray(budgets)) {
            return [];
        }

        return budgets;
    } catch {
        return [];
    }
}

function setBudget(flags) {
    if (!flags.month) {
        return {
            success: false,
            error: "Missing month",
        };
    }

    const month = Number(flags.month);

    if (Number.isNaN(month) || month < 1 || month > 12) {
        return {
            success: false,
            error: `Month must be a number from 1 to 12. Received: "${flags.month}"`,
        };
    }

    const amountCheck = validateAmount(flags.amount);

    if (!amountCheck.valid) {
        return {
            success: false,
            error: amountCheck.error,
        };
    }

    const year = new Date().getFullYear();
    const budgets = loadBudgets();

    const existingBudget = budgets.find(budget => {
        return budget.month === month && budget.year === year;
    });

    if (existingBudget) {
        existingBudget.amount = amountCheck.amount;
    } else {
        budgets.push({
            month,
            year,
            amount: amountCheck.amount,
        });
    }

    saveBudgets(budgets);

    return {
        success: true,
        budget: {
            month,
            year,
            amount: amountCheck.amount,
        },
    };
}

function saveBudgets(budgets) {
    fs.writeFileSync(BUDGET_FILE, JSON.stringify(budgets, null, 2));
}

function saveExpenses(expenses) {
    fs.writeFileSync(FILE, JSON.stringify(expenses, null, 2));
}

function getNextId(expenses) {
    return expenses.length === 0
        ? 1
        : Math.max(...expenses.map(expense => expense.id)) + 1;
}

function validateId(id) {
    if (!id) {
        return {
            valid: false,
            error: "Missing ID",
        };
    }

    const expenseId = Number(id);

    if (Number.isNaN(expenseId)) {
        return {
            valid: false,
            error: `ID must be a number. Received: "${id}"`,
        };
    }

    return {
        valid: true,
        expenseId,
    };
}

function validateAmount(amountValue) {
    if (!amountValue || amountValue.trim() === "") {
        return {
            valid: false,
            error: "Missing amount",
        };
    }

    const amount = Number(amountValue);

    if (Number.isNaN(amount)) {
        return {
            valid: false,
            error: `Amount must be a number. Received: "${amountValue}"`,
        };
    }

    if (amount <= 0) {
        return {
            valid: false,
            error: "Amount must be greater than 0",
        };
    }

    return {
        valid: true,
        amount,
    };
}

function parseFlags(args) {
    const flags = {};

    for (let i = 0; i < args.length; i++) {
        const currentArg = args[i];

        if (currentArg.startsWith("--")) {
            const key = currentArg.slice(2);
            const value = args[i + 1];

            flags[key] = value;
            i++;
        }
    }

    return flags;
}

function addExpense(flags) {
    const description = flags.description;
    const amountCheck = validateAmount(flags.amount);

    if (!description || description.trim() === "") {
        return {
            success: false,
            error: "Missing description",
        };
    }

    if (!amountCheck.valid) {
        return {
            success: false,
            error: amountCheck.error,
        };
    }

    const expenses = loadExpenses();

    const expense = {
        id: getNextId(expenses),
        date: new Date().toISOString().slice(0, 10),
        description: description.trim(),
        amount: amountCheck.amount,
        category: flags.category ? flags.category.trim() : "general",
    };

    expenses.push(expense);
    saveExpenses(expenses);

    return {
        success: true,
        expense,
    };
}

function listExpenses(flags = {}) {
    let  expenses = loadExpenses();

    if (flags.category !== undefined) {
        if (!flags.category || flags.category.trim() === "") {
            return {
                success: false,
                error: "Category cannot be empty",
            };
        }

        const category = flags.category.trim().toLowerCase();

        expenses = expenses.filter(expense => {
            const expenseCategory = expense.category || "general";
            return expenseCategory.toLowerCase() === category;
        });
    }


    return {
        success: true,
        expenses,
    };
}

function deleteExpense(flags) {
    const idCheck = validateId(flags.id);

    if (!idCheck.valid) {
        return {
            success: false,
            error: idCheck.error,
        };
    }

    const expenses = loadExpenses();
    const expense = expenses.find(expense => expense.id === idCheck.expenseId);

    if (!expense) {
        return {
            success: false,
            error: `Expense with ID ${flags.id} does not exist.`,
        };
    }

    const filteredExpenses = expenses.filter(
        expense => expense.id !== idCheck.expenseId
    );

    saveExpenses(filteredExpenses);

    return {
        success: true,
        expense,
    };
}

function updateExpense(flags) {
    const idCheck = validateId(flags.id);

    if (!idCheck.valid) {
        return {
            success: false,
            error: idCheck.error,
        };
    }

    if (
        flags.description === undefined &&
        flags.amount === undefined &&
        flags.category === undefined
    ) {
        return {
            success: false,
            error: "Provide description, amount, or category to update",
        };
    }

    const expenses = loadExpenses();
    const expense = expenses.find(expense => expense.id === idCheck.expenseId);

    if (!expense) {
        return {
            success: false,
            error: `Expense with ID ${flags.id} does not exist.`,
        };
    }

    if (flags.description !== undefined) {
        if (!flags.description || flags.description.trim() === "") {
            return {
                success: false,
                error: "Description cannot be empty",
            };
        }

        expense.description = flags.description.trim();
    }

    if (flags.amount !== undefined) {
        const amountCheck = validateAmount(flags.amount);

        if (!amountCheck.valid) {
            return {
                success: false,
                error: amountCheck.error,
            };
        }

        expense.amount = amountCheck.amount;
    }

    if (flags.category !== undefined) {
        if (!flags.category || flags.category.trim() === "") {
            return {
                success: false,
                error: "Category cannot be empty",
            };
        }

        expense.category = flags.category.trim();
    }

    saveExpenses(expenses);

    return {
        success: true,
        expense,
    };
}

function summaryExpense(flags = {}) {
    let expenses = loadExpenses();
    let budget = null;
    let isOverBudget = false;

    if (flags.month !== undefined) {
        const month = Number(flags.month);

        if (Number.isNaN(month) || month < 1 || month > 12) {
            return {
                success: false,
                error: `Month must be a number from 1 to 12. Received: "${flags.month}"`,
            };
        }

        const currentYear = new Date().getFullYear();

        expenses = expenses.filter(expense => {
            const expenseDate = new Date(expense.date);

            return (
                expenseDate.getFullYear() === currentYear &&
                expenseDate.getMonth() === month - 1
            );
        });
    }

    const total = expenses.reduce((sum, expense) => {
        return sum + expense.amount;
    }, 0);

    if (flags.month !== undefined) {
        const month = Number(flags.month);
        const year = new Date().getFullYear();

        const budgets = loadBudgets();

        budget = budgets.find(budget => {
            return budget.month === month && budget.year === year;
        });

        if (budget && total > budget.amount) {
            isOverBudget = true;
        }
    }

    return {
        success: true,
        total,
        budget,
        isOverBudget,
    };
}

function formatCsvValue(value) {
    const stringValue = String(value);

    if (
        stringValue.includes(",") ||
        stringValue.includes('"') ||
        stringValue.includes("\n")
    ) {
        return `"${stringValue.replaceAll('"', '""')}"`;
    }

    return stringValue;
}

function exportExpenses(flags = {}) {
    const expenses = loadExpenses();

    const fileName = flags.file || "expenses.csv";
    const outputPath = path.join(__dirname, "..", fileName);

    const header = "id,date,description,category,amount";

    const rows = expenses.map(expense => {
        return [
            expense.id,
            expense.date,
            formatCsvValue(expense.description),
            formatCsvValue(expense.category || "general"),
            expense.amount,
        ].join(",");
    });

    const csv = [header, ...rows].join("\n");

    fs.writeFileSync(outputPath, csv);

    return {
        success: true,
        fileName,
        count: expenses.length,
    };
}

module.exports = {
    addExpense,
    listExpenses,
    deleteExpense,
    updateExpense,
    summaryExpense,
    setBudget,
    exportExpenses,
    parseFlags,
};

/*
node src/expense-cli.js add --description "Lunch" --amount 20
node src/expense-cli.js add --description "Lunch" --amount 20 --category food
node src/expense-cli.js list
node src/expense-cli.js list --category food
node src/expense-cli.js summary
node src/expense-cli.js summary --month 8
node src/expense-cli.js budget --month 8 --amount 500
node src/expense-cli.js update --id 1 --description "Dinner"
node src/expense-cli.js delete --id 1
node src/expense-cli.js export
node src/expense-cli.js export --file expenses.csv*/
