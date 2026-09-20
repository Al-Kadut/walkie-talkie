// Initialize socket connection
window.socket = io({
    autoConnect: false // We will connect manually when joining
});

// Event listeners for socket connection status
window.socket.on('connect', () => {
    updateConnectionStatus('Connected', 'green');
});

window.socket.on('disconnect', () => {
    updateConnectionStatus('Disconnected', 'red');
    window.closeAllPeerConnections();
});

window.socket.on('connect_error', () => {
    updateConnectionStatus('Connection Error', 'red');
});

// User events
window.socket.on('user-joined', (user) => {
    addUserToList(user);
    // When a new user joins, caller creates the offer
    window.createPeerConnection(user.socketId, true);
});

window.socket.on('user-left', (data) => {
    removeUserFromList(data.socketId);
    window.closePeerConnection(data.socketId);
});

// WebRTC Signaling Events
window.socket.on('webrtc-offer', (data) => {
    window.handleWebRTCOffer(data.caller, data.sdp);
});

window.socket.on('webrtc-answer', (data) => {
    window.handleWebRTCAnswer(data.callee, data.sdp);
});

window.socket.on('webrtc-ice-candidate', (data) => {
    window.handleNewICECandidate(data.sender, data.candidate);
});

// Speaking Lock Events
window.socket.on('speaking-start', (data) => {
    if (data.socketId !== window.socket.id) {
        setSpeaker(data.socketId, data.username);
    }
});

window.socket.on('speaking-stop', (data) => {
    clearSpeaker(data.socketId);
});

// Helper functions to be defined in main.js but called here
function updateConnectionStatus(text, color) {
    if (window.updateUIConnectionStatus) {
        window.updateUIConnectionStatus(text, color);
    }
}

function addUserToList(user) {
    if (window.uiAddUser) {
        window.uiAddUser(user);
    }
}

function removeUserFromList(socketId) {
    if (window.uiRemoveUser) {
        window.uiRemoveUser(socketId);
    }
}

function setSpeaker(socketId, username) {
    if (window.uiSetSpeaker) {
        window.uiSetSpeaker(socketId, username);
    }
}

function clearSpeaker(socketId) {
    if (window.uiClearSpeaker) {
        window.uiClearSpeaker(socketId);
    }
}
