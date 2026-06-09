#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const FILE = path.join(__dirname, 'expenses.json')

function loadExpenses() {
	if (!fs.existsSync(FILE)) return []
	try {
		const raw = fs.readFileSync(FILE, 'utf-8')
		return raw.trim() === '' ? [] : JSON.parse(raw)
	} catch {
		console.error('Warning: expenses.json is not valid JSON. Starting fresh.')
		return []
	}
}

function saveExpenses(expenses) {
	fs.writeFileSync(FILE, JSON.stringify(expenses, null, 2))
}

function getNextId(expenses) {
	return expenses.length === 0 ? 1 : Math.max(...expenses.map(e => e.id)) + 1
}

function parseFlags(args) {
	const flags = {}
	for (let i = 0; i < args.length; i++) {
		if (args[i].startsWith('--')) { flags[args[i].slice(2)] = args[i+1]; i++; }
	}
	return flags
}

function usage() {
	console.log('Usage:')
	console.log('  node expense.js add --description "Lunch" --amount 20')
	console.log('  node expense.js list')
	console.log('  node expense.js delete --id 1')
	console.log('  node expense.js summary [--month 8]')
}

function addExpense(flags) {
	const desc = flags.description
	const amount = Number(flags.amount)
	if (!desc) return console.error('Error: --description is required.')
	if (Number.isNaN(amount) || amount <= 0) return console.error('Error: --amount must be a positive number.')
	const expenses = loadExpenses()
	const expense = { id: getNextId(expenses), description: desc, amount, date: new Date().toISOString().slice(0,10) }
	expenses.push(expense)
	saveExpenses(expenses)
	console.log(`Expense added successfully (ID: ${expense.id})`)
}

function listExpenses() {
	const expenses = loadExpenses()
	if (expenses.length === 0) return console.log('No expenses found.')
	console.log('ID  Date        Description               Amount')
	expenses.forEach(e => {
		console.log(`${String(e.id).padEnd(4)}${e.date}  ${e.description.padEnd(22)}$${e.amount}`)
	})
}

function deleteExpense(flags) {
	const id = Number(flags.id)
	if (Number.isNaN(id)) return console.error('Error: --id is required and must be a number.')
	const expenses = loadExpenses()
	if (!expenses.some(e => e.id === id)) return console.error(`Error: no expense with ID ${id}`)
	const remaining = expenses.filter(e => e.id !== id)
	saveExpenses(remaining)
	console.log(`Expense ${id} deleted.`)
}

function summary(flags) {
	const month = flags.month ? Number(flags.month) : null
	if (flags.month && (Number.isNaN(month) || month < 1 || month > 12)) return console.error('Error: --month must be 1-12')
	const expenses = loadExpenses()
	const filtered = month ? expenses.filter(e => new Date(e.date).getMonth() + 1 === month && new Date(e.date).getFullYear() === new Date().getFullYear()) : expenses
	const total = filtered.reduce((s, e) => s + e.amount, 0)
	console.log(`Total expenses: $${total}`)
}

const args = process.argv.slice(2)
const cmd = args[0]
const flags = parseFlags(args.slice(1))

switch (cmd) {
	case 'add': addExpense(flags); break
	case 'list': listExpenses(); break
	case 'delete': deleteExpense(flags); break
	case 'summary': summary(flags); break
	default: usage(); break
}
