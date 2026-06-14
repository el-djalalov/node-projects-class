const { WebSocketServer, WebSocket } = require("ws");
const readline = require("readline");

const DEFAULT_PORT = 3000;
const HISTORY_LIMIT = 10;

const command = process.argv[2];
const flags = parseArgs(process.argv.slice(3));

switch (command) {
    case "start":
        startServer();
        break;

    case "connect":
        connectClient();
        break;

    default:
        printUsage();
        break;
}

function printUsage() {
    console.log(`
Usage:
  node broadcast-server.js start [--port <port>]
  node broadcast-server.js connect [--port <port>] [--username <name>]

Examples:
  node broadcast-server.js start --port 3001
  node broadcast-server.js connect --port 3001 --username Meow
`);
}

function startServer() {
    const port = flags.port;
    const wss = new WebSocketServer({ port });
    const clients = new Set();
    const messageHistory = [];
    let nextClientId = 1;

    function broadcast(sender, message, includeSender = false) {
        let sentCount = 0;

        for (const client of clients) {
            if (!includeSender && client === sender) {
                continue;
            }

            if (client.readyState === WebSocket.OPEN) {
                client.send(message.toString());
                sentCount++;
            }
        }

        console.log(`Broadcasted to ${sentCount} client(s)`);
    }

    function removeClient(ws) {
        if (clients.has(ws)) {
            clients.delete(ws);

            const name = ws.username || `Client ${ws.clientId}`;
            const notice = `${name} has left`;

            console.log(`${name} disconnected`);
            addToHistory(notice);
            broadcast(ws, notice, true);
        }
    }

    // for private messages, we can find the client by username and send the message directly to them instead of broadcasting to everyone.
    function findClientByUsername(username) {
        for (const client of clients) {
            if (
                client.readyState === WebSocket.OPEN &&
                client.username &&
                client.username.toLowerCase() === username.toLowerCase()
            ) {
                return client;
            }
        }

        return null;
    }

    // We can use a simple syntax for private messages, for example: "@username message text".
    // The parsePrivateMessage function will extract the recipient's username and the message text.
    function parsePrivateMessage(text) {
        const match = text.match(/^@(\S+)\s+(.+)$/);

        if (!match) {
            return null;
        }

        return {
            recipientName: match[1],
            privateText: match[2],
        };
    }

    function addToHistory(message) {
        messageHistory.push(message);

        if (messageHistory.length > HISTORY_LIMIT) {
            messageHistory.shift();
        }
    }

    function sendHistory(ws) {
        if (messageHistory.length === 0) {
            return;
        }

        ws.send("--- Recent messages ---");

        for (const message of messageHistory) {
            ws.send(message);
        }

        ws.send("--- End of history ---");
    }

    wss.on("connection", (ws) => {
        ws.clientId = nextClientId++;
        clients.add(ws);

        console.log(`Client ${ws.clientId} connected`);

        sendHistory(ws);

        ws.on("message", (message) => {
            let data;

            try {
                data = JSON.parse(message.toString());
            } catch {
                ws.send("Invalid message format");
                return;
            }

            // We expect the client to send a JSON string with a "type" field that indicates the type of message
            // (e.g., "join" for joining the chat, "message" for sending a chat message).
            if (data.type === "join") {
                ws.username = data.username || `Client${ws.clientId}`;

                const notice = `${ws.username} has joined`;

                addToHistory(notice);
                broadcast(ws, notice, true);
                return;
            }


            if (data.type === "join") {
                ws.username = data.username || `Client ${ws.clientId}`;

                const notice = `${ws.username} has joined`;

                addToHistory(notice);
                broadcast(ws, notice, true);
                return;
            }

            if (data.type !== "message") {
                ws.send("Unknown message type");
                return;
            }

            const senderName = ws.username || data.username || `Client ${ws.clientId}`;
            const text = data.text;

            if (!text || text.trim() === "") {
                return;
            }

            const privateMessage = parsePrivateMessage(text);

            if (privateMessage) {
                const recipient = findClientByUsername(privateMessage.recipientName);

                if (!recipient) {
                    ws.send(`User "${privateMessage.recipientName}" is not connected`);
                    return;
                }

                const formattedPrivateMessage = `[private] ${senderName}: ${privateMessage.privateText}`;

                recipient.send(formattedPrivateMessage);
                ws.send(`[private to ${privateMessage.recipientName}] ${privateMessage.privateText}`);

                return;
            }

            const formattedMessage = `${senderName}: ${text}`;

            addToHistory(formattedMessage);
            broadcast(ws, formattedMessage);
        });

        ws.on("close", () => {
            removeClient(ws);
        });

        ws.on("error", () => {
            removeClient(ws);
        });
    });


    // The close event is emitted when the WebSocket connection is closed. We can use this event to clean up resources
    // and notify other clients that a client has disconnected.
    process.on("SIGINT", () => {
        console.log("\nShutting down server...");

        for (const client of clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.close();
            }
        }

        wss.close(() => {
            console.log("Server closed");
            process.exit(0);
        });
    });

    console.log(`WebSocket server is running on ws://localhost:${port}`);
}

// A simple client that connects to the server and allows sending messages from the command line
function connectClient() {
    const port = flags.port;
    const username = flags.username;
    console.log(`connecting to ws://localhost:${port} as ${username}...`);

    const ws = new WebSocket(`ws://localhost:${port}`);

    // readline is a built-in Node.js module that provides an interface for reading data from a Readable stream
    // (such as process.stdin) one line at a time.
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    ws.on("open", () => {
        console.log("Connected to server");
        console.log("Type /exit to disconnect");
        // We send a JSON string with the message type and username to let the server know who we are.
        // The server can use this information for system messages and to identify the sender of messages.
        ws.send(JSON.stringify({
            type: "join",
            username,
        }));

        // The setPrompt() method is used to set the prompt string that will be displayed to the user when they are prompted for input.
        rl.setPrompt("> ");
        // The prompt() method is used to display the prompt to the user and wait for their input.
        rl.prompt();
    });

    ws.on("message", (message) => {
        console.log(`\n${message.toString()}`);
        rl.prompt();
    });

    ws.on("close", () => {
        console.log("\nDisconnected from server");
        rl.close();
    });

    // The error event is emitted when an error occurs on the WebSocket connection.
    ws.on("error", () => {
        console.log(`Could not connect to ws://localhost:${port}`);
        console.log("Make sure the server is running:");
        console.log(`  node broadcast-server.js start --port ${port}`);

        rl.close();
    });

    // The line event is emitted whenever the input stream receives an end-of-line input (e.g., when the user presses Enter).
    rl.on("line", (input) => {
        const text = input.trim();

        if (text === "/exit") {
            ws.close();
            return;
        }

        if (text === "") {
            rl.prompt();
            return;
        }

        if (ws.readyState === WebSocket.OPEN) {
            // We send a JSON string with the message type, username, and text. The server can parse this and handle it accordingly.
            ws.send(JSON.stringify({
                type: "message",
                username,
                text,
            }));
        } else {
            console.log("Not connected to server");
        }

        rl.prompt();
    });
}



function parseArgs(args) {
    const flags = {
        port: DEFAULT_PORT,
        username: "Anonymous",
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        switch (arg) {
            case "--port": {
                const value = args[i + 1];

                if (!value) {
                    console.error("Missing value for --port");
                    process.exit(1);
                }

                const port = Number(value);

                if (!Number.isInteger(port) || port <= 0 || port > 65535) {
                    console.error("Port must be a number between 1 and 65535");
                    process.exit(1);
                }

                flags.port = port;
                i++;
                break;
            }

            case "--username": {
                const value = args[i + 1];

                if (!value) {
                    console.error("Missing value for --username");
                    process.exit(1);
                }

                flags.username = value;
                i++;
                break;
            }

            default:
                console.error(`Unknown flag: ${arg}`);
                printUsage();
                process.exit(1);
        }
    }

    return flags;
}




// node broadcast-server.js start --port 3001
//several terminals for node broadcast-server.js connect --port 3001 --username Iris/Caramelka/Zephir
// /exit
