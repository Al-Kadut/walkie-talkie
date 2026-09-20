require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const setupSignaling = require('./server/signaling');

const app = express();

// Buat HTTP server untuk Express + Socket.IO
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Serve frontend
app.use(express.static(path.join(__dirname, 'client')));

// Setup Socket.IO signaling
setupSignaling(io);

// Route utama
app.get(['/', '/join/:id'], (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'index.html'));
});

// Penting untuk Vercel:
// JANGAN menggunakan server.listen() di sini.
module.exports = server;