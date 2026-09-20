const rooms = require('./rooms');

function setupSignaling(io) {
    io.on('connection', (socket) => {
        console.log(`Socket connected: ${socket.id}`);
        
        let currentChannel = null;
        let currentUser = null;

        socket.on('join-channel', (data, callback) => {
            const { channelCode, username } = data;
            
            if (!channelCode || !username) {
                return callback({ success: false, message: 'Invalid data' });
            }

            // Leave current channel if any
            if (currentChannel) {
                socket.leave(currentChannel);
                rooms.removeUser(currentChannel, socket.id);
                socket.to(currentChannel).emit('user-left', { socketId: socket.id });
            }

            currentChannel = channelCode;
            currentUser = {
                id: Math.random().toString(36).substring(2, 9),
                username: username,
                socketId: socket.id
            };

            socket.join(channelCode);
            rooms.addUser(channelCode, currentUser);

            // Notify others in channel
            socket.to(channelCode).emit('user-joined', currentUser);

            // Send current state to joining user
            const usersInChannel = rooms.getUsersInChannel(channelCode);
            const currentSpeaker = rooms.getCurrentSpeaker(channelCode);
            
            callback({
                success: true,
                users: usersInChannel,
                currentSpeaker: currentSpeaker,
                currentUser: currentUser
            });
            
            console.log(`${username} joined channel ${channelCode}`);
        });

        // Speaking lock mechanism
        socket.on('request-speaking', (callback) => {
            if (!currentChannel) return;
            
            const success = rooms.requestSpeaking(currentChannel, socket.id);
            if (success) {
                io.to(currentChannel).emit('speaking-start', { socketId: socket.id, username: currentUser.username });
                if(callback) callback({ success: true });
            } else {
                const currentSpeaker = rooms.getCurrentSpeaker(currentChannel);
                if(callback) callback({ success: false, currentSpeaker });
            }
        });

        socket.on('release-speaking', () => {
            if (!currentChannel) return;
            
            const success = rooms.releaseSpeaking(currentChannel, socket.id);
            if (success) {
                io.to(currentChannel).emit('speaking-stop', { socketId: socket.id });
            }
        });

        // WebRTC Signaling
        socket.on('webrtc-offer', (data) => {
            socket.to(data.target).emit('webrtc-offer', {
                sdp: data.sdp,
                caller: socket.id
            });
        });

        socket.on('webrtc-answer', (data) => {
            socket.to(data.target).emit('webrtc-answer', {
                sdp: data.sdp,
                callee: socket.id
            });
        });

        socket.on('webrtc-ice-candidate', (data) => {
            socket.to(data.target).emit('webrtc-ice-candidate', {
                candidate: data.candidate,
                sender: socket.id
            });
        });

        socket.on('leave-channel', () => {
            handleLeave();
        });

        socket.on('disconnect', () => {
            console.log(`Socket disconnected: ${socket.id}`);
            handleLeave();
        });
        
        function handleLeave() {
            if (currentChannel) {
                socket.leave(currentChannel);
                rooms.removeUser(currentChannel, socket.id);
                socket.to(currentChannel).emit('user-left', { socketId: socket.id });
                
                // If they were speaking, notify stop
                if (rooms.getCurrentSpeaker(currentChannel) === socket.id) {
                    rooms.releaseSpeaking(currentChannel, socket.id);
                    io.to(currentChannel).emit('speaking-stop', { socketId: socket.id });
                }
                currentChannel = null;
                currentUser = null;
            }
        }
    });
}

module.exports = setupSignaling;
