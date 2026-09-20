require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const setupSignaling = require('../server/signaling');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    path: '/api/socket.io',
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

app.use(express.static(path.join(__dirname, '../client')));

setupSignaling(io);

app.get(['/', '/join/:id'], (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

module.exports = server;