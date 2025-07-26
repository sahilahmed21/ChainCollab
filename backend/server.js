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
/**
 * A centralized function to call any Julia agent.
 * @param {string} agentName - The name of the agent to invoke (e.g., 'onchain_scribe').
 * @param {object} payload - The data to send to the agent.
 * @returns {Promise<object>} - The response data from the agent or an error object.
 */
const invokeAgent = async (agentName, payload) => {
    console.log(`Invoking agent '${agentName}'...`);
    try {
        // The Julia agent service is expected to have an endpoint like this.
        const response = await axios.post(`${JULIA_AGENT_URL}/api/v1/invoke`, {
            agent: agentName,
            payload: payload
        });
        return response.data;
    } catch (error) {
        console.error(`Error invoking agent ${agentName}:`, error.message);
        return { error: `Failed to invoke agent: ${agentName}. Is the Julia service running?` };
    }
};


// --- Real-Time Connection Handling ---
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // --- Room Management ---
    socket.on('join-room', (room) => {
        socket.join(room);
        console.log(`User ${socket.id} joined room: ${room}`);
    });

    // --- Code Syncing & Real-time Analysis ---
    socket.on('code-change', async (data) => {
        // Broadcast the change to other users in the room for collaboration.
        socket.to(data.room).emit('code-update', data.code);

        // Asynchronously invoke the Code Guardian agent for analysis.
        const analysisResult = await invokeAgent('code_guardian', { code: data.code });

        // Send the feedback directly back to the user who made the change.
        if (analysisResult && !analysisResult.error) {
            socket.emit('agent-feedback', analysisResult);
        }
    });

    // --- Agent Invocation for On-Chain Commit ---
    socket.on('commit-milestone', async (data) => {
        console.log('Received commit-milestone event:', data);

        // Call the On-Chain Scribe agent to execute the transaction.
        const result = await invokeAgent('onchain_scribe', {
            walletAddress: data.walletAddress,
            codeHash: data.codeHash
        });

        if (result && !result.error) {
            // Notify the entire room that a milestone was successfully committed.
            io.to(data.room).emit('milestone-committed', {
                user: data.walletAddress,
                hash: data.codeHash,
                // The agent should return the transaction ID upon success.
                transactionId: result.transactionId
            });
        } else {
            // If the agent call fails, notify the original user.
            socket.emit('commit-error', { message: result.error || 'An unknown error occurred.' });
        }
    });

    // --- Disconnect Handling ---
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
