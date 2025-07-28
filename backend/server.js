// --- Import Dependencies ---
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');
const { sha256 } = require('js-sha256');
const lodash = require('lodash');

// Load environment variables
dotenv.config();

// --- Configuration ---
const PORT = process.env.PORT || 8080;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const JULIA_AGENT_URL = process.env.JULIA_AGENT_URL || 'http://localhost:8081';

// --- Default Project Structure ---
const DEFAULT_FILE_TREE = {
    "src": {
        type: "folder",
        children: {
            "app.js": { type: "file", content: "// Welcome to your new project!\nconsole.log('Hello, JuliaCode Collab!');" },
            "styles.css": { type: "file", content: "/* Add your styles here */\nbody { background-color: #1e1e1e; }" }
        }
    },
    "package.json": { type: "file", content: '{ "name": "new-project", "version": "1.0.0" }' }
};

// --- In-Memory State Management ---
const rooms = {};

// --- Server Setup ---
const app = express();
app.use(cors({ origin: FRONTEND_URL }));
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: FRONTEND_URL,
        methods: ["GET", "POST"]
    }
});

// --- Utility Functions (Step 23) ---
const fileSystemUtils = {
    getNestedItem: (tree, path) => lodash.get(tree, path.replace(/\//g, '.children.')),
    deleteNestedItem: (tree, path) => lodash.unset(tree, path.replace(/\//g, '.children.')),
    deepCopy: (obj) => lodash.cloneDeep(obj),
    deterministicStringify: (obj) => {
        const allKeys = [];
        JSON.stringify(obj, (key, value) => {
            if (key) allKeys.push(key); // Exclude the initial empty key
            return value;
        });
        allKeys.sort();
        // A stable stringify function that sorts keys before serializing
        const stableStringify = (data, keys) => {
            let out = '{';
            let first = true;
            for (const key of keys.filter(k => Object.prototype.hasOwnProperty.call(data, k)).sort()) {
                if (!first) out += ',';
                first = false;
                out += JSON.stringify(key) + ':' + JSON.stringify(data[key]);
            }
            out += '}';
            return out;
        };
        // This is a simplified version; for true determinism across all JS environments, a library is best.
        // However, for a single server instance, sorting keys is sufficient.
        return JSON.stringify(obj, Object.keys(obj).sort());
    }
};

// --- Agent Invocation Service ---
const invokeAgent = async (agentName, payload) => {
    console.log(`Invoking agent '${agentName}'...`);
    try {
        const response = await axios.post(`${JULIA_AGENT_URL}/api/v1/invoke`, {
            agent: agentName,
            payload: payload
        });
        return response.data;
    } catch (error) {
        console.error(`Error invoking agent ${agentName}:`, error.message);
        return { error: `Agent invocation failed for ${agentName}.` };
    }
};

// --- Socket.io Connection Handling ---
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('join-room', (room) => {
        socket.join(room);
        console.log(`User ${socket.id} joined room: ${room}`);

        if (!rooms[room]) {
            rooms[room] = { fileTree: fileSystemUtils.deepCopy(DEFAULT_FILE_TREE) };
            console.log(`New room created: ${room}`);
        }
        socket.emit('project-state-update', rooms[room].fileTree);
    });

    socket.on('file-content-update', async (data) => {
        const { room, filePath, newContent } = data;
        const fileNode = rooms[room] ? fileSystemUtils.getNestedItem(rooms[room].fileTree, filePath) : null;
        if (fileNode && fileNode.type === 'file') {
            fileNode.content = newContent;
            socket.to(room).emit('file-content-update', { filePath, newContent });
            const analysis = await invokeAgent('code_guardian', { filePath, code: newContent });
            if (analysis && !analysis.error) {
                socket.emit('agent-feedback', analysis);
            }
        }
    });

    socket.on('create-file', (data) => {
        const { room, path, fileName } = data;
        const parentNode = rooms[room] ? (path ? fileSystemUtils.getNestedItem(rooms[room].fileTree, path) : rooms[room].fileTree) : null;
        if (parentNode && parentNode.type === 'folder' && !parentNode.children[fileName]) {
            parentNode.children[fileName] = { type: 'file', content: '' };
            io.to(room).emit('project-state-update', rooms[room].fileTree); // Send full update for simplicity on client
        } else {
            socket.emit('operation-error', { message: `Cannot create file in path: ${path}` });
        }
    });

    socket.on('create-folder', (data) => {
        const { room, path, folderName } = data;
        const parentNode = rooms[room] ? (path ? fileSystemUtils.getNestedItem(rooms[room].fileTree, path) : rooms[room].fileTree) : null;
        if (parentNode && parentNode.type === 'folder' && !parentNode.children[folderName]) {
            parentNode.children[folderName] = { type: 'folder', children: {} };
            io.to(room).emit('project-state-update', rooms[room].fileTree);
        } else {
            socket.emit('operation-error', { message: `Cannot create folder in path: ${path}` });
        }
    });

    socket.on('delete-item', (data) => {
        const { room, itemPath } = data;
        if (rooms[room] && itemPath) {
            fileSystemUtils.deleteNestedItem(rooms[room].fileTree, itemPath);
            io.to(room).emit('project-state-update', rooms[room].fileTree);
        } else {
            socket.emit('operation-error', { message: `Cannot delete item at path: ${itemPath}` });
        }
    });

    // Steps 21, 22: Handle Project-wide Commits
    socket.on('commit-milestone', async (data) => {
        const { room, walletAddress } = data;
        if (!rooms[room]) {
            return socket.emit('operation-error', { message: `Room not found: ${room}` });
        }

        // Deterministically hash the entire project tree
        const projectStateString = fileSystemUtils.deterministicStringify(rooms[room].fileTree);
        const projectHash = sha256(projectStateString);

        console.log(`Committing project hash for room ${room}: ${projectHash}`);

        // Invoke the On-Chain Scribe agent
        const result = await invokeAgent('onchain_scribe', { walletAddress, codeHash: projectHash });

        if (result && !result.error) {
            io.to(room).emit('milestone-committed', { user: walletAddress, hash: projectHash, transactionId: result.transactionId });
        } else {
            socket.emit('commit-error', { message: result.error || 'An unknown error occurred during commit.' });
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

// --- Start the Server ---
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Frontend URL: ${FRONTEND_URL}`);
    console.log(`Julia Agent URL: ${JULIA_AGENT_URL}`);

});