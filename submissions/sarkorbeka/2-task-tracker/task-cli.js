#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const FILE = path.join(__dirname, 'tasks.json')

function loadTasks() {
	if (!fs.existsSync(FILE)) return []
	try {
		const raw = fs.readFileSync(FILE, 'utf-8')
		return raw.trim() === '' ? [] : JSON.parse(raw)
	} catch (err) {
		console.error('Warning: tasks.json is not valid JSON. Starting fresh.')
		return []
	}
}

function saveTasks(tasks) {
	fs.writeFileSync(FILE, JSON.stringify(tasks, null, 2))
}

function getNextId(tasks) {
	return tasks.length === 0 ? 1 : Math.max(...tasks.map(t => t.id)) + 1
}

function usage() {
	console.log('Usage:')
	console.log('  node task-cli.js add "Buy groceries"')
	console.log('  node task-cli.js list [todo|done|in-progress]')
	console.log('  node task-cli.js update <id> "New description"')
	console.log('  node task-cli.js delete <id>')
	console.log('  node task-cli.js mark-done <id>')
	console.log('  node task-cli.js mark-in-progress <id>')
}

function addTask(description) {
	if (!description || description.trim() === '') {
		return console.error('Error: provide a description. Example: add "Buy milk"')
	}
	const tasks = loadTasks()
	const now = new Date().toISOString()
	const task = { id: getNextId(tasks), description: description.trim(), status: 'todo', createdAt: now, updatedAt: now }
	tasks.push(task)
	saveTasks(tasks)
	console.log(`Task added successfully (ID: ${task.id})`)
}

function listTasks(filter) {
	const tasks = loadTasks()
	if (tasks.length === 0) return console.log('No tasks found.')
	if (!filter) {
		tasks.forEach(t => console.log(`[${t.id}] (${t.status}) ${t.description}`))
		return
	}
	const allowed = ['todo', 'done', 'in-progress']
	if (!allowed.includes(filter)) return console.error(`Unknown filter. Use: ${allowed.join(', ')}`)
	const filtered = tasks.filter(t => t.status === filter)
	if (filtered.length === 0) return console.log('No tasks found for that filter.')
	filtered.forEach(t => console.log(`[${t.id}] (${t.status}) ${t.description}`))
}

function updateTask(idArg, description) {
	const id = Number(idArg)
	if (Number.isNaN(id)) return console.error('Error: provide a numeric ID to update.')
	if (!description || description.trim() === '') return console.error('Error: provide a new description.')
	const tasks = loadTasks()
	const task = tasks.find(t => t.id === id)
	if (!task) return console.error(`Error: no task found with ID ${id}`)
	task.description = description.trim()
	task.updatedAt = new Date().toISOString()
	saveTasks(tasks)
	console.log(`Task ${id} updated.`)
}

function deleteTask(idArg) {
	const id = Number(idArg)
	if (Number.isNaN(id)) return console.error('Error: provide a numeric ID to delete.')
	const tasks = loadTasks()
	const exists = tasks.some(t => t.id === id)
	if (!exists) return console.error(`Error: no task found with ID ${id}`)
	const remaining = tasks.filter(t => t.id !== id)
	saveTasks(remaining)
	console.log(`Task ${id} deleted.`)
}

function markTask(idArg, newStatus) {
	const id = Number(idArg)
	if (Number.isNaN(id)) return console.error('Error: provide a numeric ID to mark.')
	const tasks = loadTasks()
	const task = tasks.find(t => t.id === id)
	if (!task) return console.error(`Error: no task found with ID ${id}`)
	task.status = newStatus
	task.updatedAt = new Date().toISOString()
	saveTasks(tasks)
	console.log(`Task ${id} marked as ${newStatus}`)
}

const args = process.argv.slice(2)
const command = args[0]
const commandArgs = args.slice(1)

switch (command) {
	case 'add':
		addTask(commandArgs.join(' '))
		break
	case 'list':
		listTasks(commandArgs[0])
		break
	case 'update':
		updateTask(commandArgs[0], commandArgs.slice(1).join(' '))
		break
	case 'delete':
		deleteTask(commandArgs[0])
		break
	case 'mark-done':
		markTask(commandArgs[0], 'done')
		break
	case 'mark-in-progress':
		markTask(commandArgs[0], 'in-progress')
		break
	case 'help':
	case undefined:
		usage()
		break
	default:
		console.log('Unknown command. Try: add, update, delete, list, mark-done, mark-in-progress')
		usage()
}
