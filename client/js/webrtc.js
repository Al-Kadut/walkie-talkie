const peerConnections = {};
let localStream = null;

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' },
        // Public TURN Server (OpenRelay) untuk menembus firewall / Symmetric NAT di jaringan seluler/kantor
        { 
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        { 
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        { 
            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ]
};

const audioContainer = document.getElementById('audio-container');

async function initLocalAudio() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1 // Mono
            },
            video: false
        });
        
        // Mute local stream initially
        muteMic();
        return true;
    } catch (err) {
        console.error('Error accessing microphone:', err);
        return false;
    }
}

function muteMic() {
    if (localStream) {
        localStream.getAudioTracks().forEach(track => {
            track.enabled = false;
        });
    }
}

function unmuteMic() {
    if (localStream) {
        localStream.getAudioTracks().forEach(track => {
            track.enabled = true;
        });
    }
}

function createPeerConnection(targetSocketId, isCaller) {
    if (peerConnections[targetSocketId]) {
        return peerConnections[targetSocketId];
    }

    const pc = new RTCPeerConnection(rtcConfig);
    peerConnections[targetSocketId] = pc;

    // Add local stream tracks to PC
    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            window.socket.emit('webrtc-ice-candidate', {
                target: targetSocketId,
                candidate: event.candidate
            });
        }
    };

    // Handle remote stream
    pc.ontrack = (event) => {
        let audioEl = document.getElementById(`audio-${targetSocketId}`);
        if (!audioEl) {
            audioEl = document.createElement('audio');
            audioEl.id = `audio-${targetSocketId}`;
            audioEl.autoplay = true;
            audioContainer.appendChild(audioEl);
        }
        audioEl.srcObject = event.streams[0];
    };

    if (isCaller) {
        pc.createOffer().then(offer => {
            return pc.setLocalDescription(offer);
        }).then(() => {
            window.socket.emit('webrtc-offer', {
                target: targetSocketId,
                sdp: pc.localDescription
            });
        }).catch(err => console.error('Error creating offer:', err));
    }

    return pc;
}

function handleWebRTCOffer(callerId, sdp) {
    const pc = createPeerConnection(callerId, false);
    pc.setRemoteDescription(new RTCSessionDescription(sdp)).then(() => {
        return pc.createAnswer();
    }).then(answer => {
        return pc.setLocalDescription(answer);
    }).then(() => {
        window.socket.emit('webrtc-answer', {
            target: callerId,
            sdp: pc.localDescription
        });
    }).catch(err => console.error('Error handling offer:', err));
}

function handleWebRTCAnswer(calleeId, sdp) {
    const pc = peerConnections[calleeId];
    if (pc) {
        pc.setRemoteDescription(new RTCSessionDescription(sdp))
            .catch(err => console.error('Error setting remote description:', err));
    }
}

function handleNewICECandidate(senderId, candidate) {
    const pc = peerConnections[senderId];
    if (pc) {
        pc.addIceCandidate(new RTCIceCandidate(candidate))
            .catch(err => console.error('Error adding ICE candidate:', err));
    }
}

function closePeerConnection(targetSocketId) {
    if (peerConnections[targetSocketId]) {
        peerConnections[targetSocketId].close();
        delete peerConnections[targetSocketId];
        
        const audioEl = document.getElementById(`audio-${targetSocketId}`);
        if (audioEl) {
            audioEl.remove();
        }
    }
}

function closeAllPeerConnections() {
    Object.keys(peerConnections).forEach(closePeerConnection);
}

// Export functions to window to be accessible
window.initLocalAudio = initLocalAudio;
window.muteMic = muteMic;
window.unmuteMic = unmuteMic;
window.createPeerConnection = createPeerConnection;
window.handleWebRTCOffer = handleWebRTCOffer;
window.handleWebRTCAnswer = handleWebRTCAnswer;
window.handleNewICECandidate = handleNewICECandidate;
window.closePeerConnection = closePeerConnection;
window.closeAllPeerConnections = closeAllPeerConnections;
