// Import necessary packages
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');

// Load environment variables from .env file
dotenv.config();

// --- Configuration ---
const PORT = process.env.PORT || 8080;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const JULIA_AGENT_URL = process.env.JULIA_AGENT_URL || 'http://localhost:8081'; // Default port for Julia service

// --- Server Setup ---
const app = express();
app.use(cors({ origin: FRONTEND_URL }));
const server = http.createServer(app);

// --- Socket.io Setup ---
const io = new Server(server, {
    cors: {
        origin: FRONTEND_URL,
        methods: ["GET", "POST"]
    }
});

// --- Agent Service Helper ---
const invokeAgent = async (agentName, payload) => {
    console.log(`Invoking agent '${agentName}'...`);
    try {
        const response = await axios.post(`${JULIA_AGENT_URL}/api/v1/invoke`, {
            agent: agentName,
            payload: payload
        });
        return response.data;
    } catch (error) {
        // --- IMPROVED ERROR LOGGING ---
        // This will now print the full error object, giving you more details.
        console.error(`Error invoking agent ${agentName}:`);
        console.error(error); // Log the entire error object
        return { error: `Failed to invoke agent: ${agentName}. Is the Julia service running?` };
    }
};


// --- Real-Time Connection Handling ---
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('join-room', (room) => {
        socket.join(room);
        console.log(`User ${socket.id} joined room: ${room}`);
    });

    socket.on('code-change', async (data) => {
        socket.to(data.room).emit('code-update', data.code);
        const analysisResult = await invokeAgent('code_guardian', { code: data.code });
        if (analysisResult && !analysisResult.error) {
            socket.emit('agent-feedback', analysisResult);
        }
    });

    socket.on('commit-milestone', async (data) => {
        console.log('Received commit-milestone event:', data);
        const result = await invokeAgent('onchain_scribe', {
            walletAddress: data.walletAddress,
            codeHash: data.codeHash
        });

        if (result && !result.error) {
            io.to(data.room).emit('milestone-committed', {
                user: data.walletAddress,
                hash: data.codeHash,
                transactionId: result.transactionId
            });
        } else {
            socket.emit('commit-error', { message: result.error || 'An unknown error occurred.' });
        }
    });

    // Listener for the Task Master agent
    socket.on('invoke-task-master', async (data) => {
        const result = await invokeAgent('task_master', { question: data.question });
        if (result && !result.error) {
            socket.emit('task-master-response', result);
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

// --- Basic API Endpoint for Health Check ---
app.get('/', (req, res) => {
    res.send('Backend server is running!');
});

// --- Start the Server ---
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
