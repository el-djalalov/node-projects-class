#!/usr/bin/env node
const { WebSocketServer, WebSocket } = require('ws')
const readline = require('readline')
const argv = require('argv')

const cmd = process.argv[2]
const args = argv.option([{
  name: 'port',
  type: 'int'
}, {
  name: 'username',
  type: 'string'
}]).run(process.argv.slice(3))
const PORT = args.options.port || 8080

function broadcast(clients, message, sender) {
  clients.forEach(client => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  })
}

if (cmd === 'start') {
  const wss = new WebSocketServer({ port: PORT })
  const clients = new Set()
  let nextClientId = 1

  wss.on('connection', (ws) => {
    const clientId = nextClientId++
    ws.clientId = clientId
    clients.add(ws)
    console.log('Client', clientId, 'connected. Total:', clients.size)
    broadcast(clients, 'Client ' + clientId + ' has joined', ws)

    ws.on('message', (data) => {
      const message = data.toString()
      console.log('Received from', clientId + ':', message)
      let count = 0
      clients.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(message)
          count++
        }
      })
      console.log('Broadcasted to', count, 'clients')
    })

    ws.on('close', () => {
      clients.delete(ws)
      console.log('Client', clientId, 'disconnected. Total:', clients.size)
      broadcast(clients, 'Client ' + clientId + ' has left', ws)
    })

    ws.on('error', () => {
      clients.delete(ws)
    })
  })

  console.log('Broadcast server on ws://localhost:' + PORT)

  process.on('SIGINT', () => {
    wss.clients.forEach(client => client.close())
    wss.close(() => process.exit(0))
  })

} else if (cmd === 'connect') {
  const ws = new WebSocket('ws://localhost:' + PORT)

  ws.on('open', () => {
    console.log('Connected to broadcast server on port', PORT + '. Type messages:')
  })

  ws.on('message', (data) => {
    console.log('Received:', data.toString())
  })

  ws.on('error', (err) => {
    console.error('Connection error:', err.message)
    process.exit(1)
  })

  ws.on('close', () => {
    console.log('Disconnected.')
    process.exit(0)
  })

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  const username = args.options.username
  rl.on('line', (line) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(username ? `[${username}] ${line}` : line)
    }
  })

  process.on('SIGINT', () => {
    rl.close()
    ws.close()
    process.exit(0)
  })
} else {
  console.log('Usage: node broadcast-server.js start|connect [--port <number>] [--username <name>]')
  process.exit(1)
}
