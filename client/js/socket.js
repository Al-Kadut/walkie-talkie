// ==========================================
// SOCKET.IO CONNECTION
// ==========================================

if (typeof io === 'undefined') {
    console.error('Socket.IO belum berhasil dimuat.');
} else {

    window.socket = io({
        path: '/api',
        autoConnect: false
    });

    // ==========================================
    // CONNECTION EVENTS
    // ==========================================

    window.socket.on('connect', () => {
        updateConnectionStatus('Connected', 'green');
        console.log('Socket connected:', window.socket.id);
    });

    window.socket.on('disconnect', () => {
        updateConnectionStatus('Disconnected', 'red');

        if (typeof window.closeAllPeerConnections === 'function') {
            window.closeAllPeerConnections();
        }
    });

    window.socket.on('connect_error', (error) => {
        updateConnectionStatus('Connection Error', 'red');
        console.error('Socket connection error:', error);
    });

    // ==========================================
    // USER EVENTS
    // ==========================================

    window.socket.on('user-joined', (user) => {
        addUserToList(user);

        if (typeof window.createPeerConnection === 'function') {
            window.createPeerConnection(user.socketId, true);
        }
    });

    window.socket.on('user-left', (data) => {
        removeUserFromList(data.socketId);

        if (typeof window.closePeerConnection === 'function') {
            window.closePeerConnection(data.socketId);
        }
    });

    // ==========================================
    // WEBRTC SIGNALING
    // ==========================================

    window.socket.on('webrtc-offer', (data) => {
        if (typeof window.handleWebRTCOffer === 'function') {
            window.handleWebRTCOffer(data.caller, data.sdp);
        }
    });

    window.socket.on('webrtc-answer', (data) => {
        if (typeof window.handleWebRTCAnswer === 'function') {
            window.handleWebRTCAnswer(data.callee, data.sdp);
        }
    });

    window.socket.on('webrtc-ice-candidate', (data) => {
        if (typeof window.handleNewICECandidate === 'function') {
            window.handleNewICECandidate(data.sender, data.candidate);
        }
    });

    // ==========================================
    // SPEAKING LOCK
    // ==========================================

    window.socket.on('speaking-start', (data) => {
        if (data.socketId !== window.socket.id) {
            setSpeaker(data.socketId, data.username);
        }
    });

    window.socket.on('speaking-stop', (data) => {
        clearSpeaker(data.socketId);
    });
}


// ==========================================
// UI HELPER FUNCTIONS
// ==========================================

function updateConnectionStatus(text, color) {
    if (typeof window.updateUIConnectionStatus === 'function') {
        window.updateUIConnectionStatus(text, color);
    }
}

function addUserToList(user) {
    if (typeof window.uiAddUser === 'function') {
        window.uiAddUser(user);
    }
}

function removeUserFromList(socketId) {
    if (typeof window.uiRemoveUser === 'function') {
        window.uiRemoveUser(socketId);
    }
}

function setSpeaker(socketId, username) {
    if (typeof window.uiSetSpeaker === 'function') {
        window.uiSetSpeaker(socketId, username);
    }
}

function clearSpeaker(socketId) {
    if (typeof window.uiClearSpeaker === 'function') {
        window.uiClearSpeaker(socketId);
    }
}