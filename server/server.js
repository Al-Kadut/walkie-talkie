require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const setupSignaling = require('./signaling');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Serve static files from the client directory
app.use(express.static(path.join(__dirname, '../client')));

// Setup Socket.IO signaling
setupSignaling(io);

// Catch-all route to serve the SPA
app.get(['/', '/join/:id'], (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Walkie Talkie Web server running on port ${PORT}`);
    console.log(`Local Access: http://localhost:${PORT}`);
    // Show network access if possible, or just remind about it
    console.log(`Network Access: http://<YOUR_LOCAL_IP>:${PORT}`);
});
