// UI Elements
const views = {
    landing: document.getElementById('landing-page'),
    join: document.getElementById('join-page'),
    app: document.getElementById('app-page')
};

const inputs = {
    channel: document.getElementById('channel-input'),
    username: document.getElementById('username-input')
};

const pttButton = document.getElementById('ptt-button');
const currentSpeakerDisplay = document.getElementById('current-speaker-display');
const micPermissionBox = document.getElementById('mic-permission-box');

// State
let currentChannelCode = '';
let currentUser = null;
let appMode = 'ptt'; // ptt or handsfree
let isSpeaking = false;
let isChannelBusy = false;
let usersList = [];

// Init Routing based on URL
function checkUrlRouting() {
    const path = window.location.pathname;
    if (path.startsWith('/join/')) {
        const code = path.split('/join/')[1];
        if (code) {
            inputs.channel.value = code.toUpperCase();
            switchView('join');
        }
    }
}

// View Management
function switchView(viewName) {
    Object.values(views).forEach(view => view.classList.remove('active'));
    views[viewName].classList.add('active');
}

// Event Listeners for Navigation
document.getElementById('btn-goto-join').addEventListener('click', () => switchView('join'));
document.getElementById('btn-back-landing').addEventListener('click', () => switchView('landing'));

document.getElementById('btn-create-channel').addEventListener('click', () => {
    // Generate random 6 character code
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for(let i=0; i<6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    inputs.channel.value = code;
    switchView('join');
    showNotification('Channel ' + code + ' dibuat!');
});

// Join Channel Logic
document.getElementById('btn-join-channel').addEventListener('click', async () => {
    const channel = inputs.channel.value.trim().toUpperCase();
    const username = inputs.username.value.trim();

    if (!channel || !username) {
        showNotification('Kode Channel dan Nama harus diisi!');
        return;
    }

    const btn = document.getElementById('btn-join-channel');
    btn.disabled = true;
    btn.textContent = 'MENGHUBUNGKAN...';

    // Request Mic permission
    const micGranted = await window.initLocalAudio();
    if (!micGranted) {
        micPermissionBox.style.display = 'block';
        btn.disabled = false;
        btn.textContent = '🎙️ GABUNG CHANNEL';
        return;
    }
    micPermissionBox.style.display = 'none';

    // Connect socket if not connected
    if (!window.socket.connected) {
        window.socket.connect();
    }

    window.socket.emit('join-channel', { channelCode: channel, username }, (res) => {
        btn.disabled = false;
        btn.textContent = '🎙️ GABUNG CHANNEL';

        if (res.success) {
            currentChannelCode = channel;
            currentUser = res.currentUser;
            
            // Set UI
            document.getElementById('current-channel-display').textContent = channel;
            document.getElementById('mobile-channel-display').textContent = channel;
            
            // Clear and add users
            document.getElementById('user-list').innerHTML = '';
            usersList = [];
            res.users.forEach(u => uiAddUser(u));

            if (res.currentSpeaker) {
                const speakerUser = res.users.find(u => u.socketId === res.currentSpeaker);
                if (speakerUser) uiSetSpeaker(speakerUser.socketId, speakerUser.username);
            }

            switchView('app');
            showNotification('Berhasil bergabung ke ' + channel);
            
            // If handsfree mode is checked, unmute immediately
            if (appMode === 'handsfree') {
                window.unmuteMic();
                window.socket.emit('request-speaking');
            }
        } else {
            showNotification('Gagal bergabung ke channel.');
        }
    });
});

// Leave Channel Logic
document.getElementById('btn-leave').addEventListener('click', () => {
    window.socket.emit('leave-channel');
    window.closeAllPeerConnections();
    if(window.localStream) {
        window.localStream.getTracks().forEach(track => track.stop());
        window.localStream = null;
    }
    document.getElementById('user-list').innerHTML = '';
    currentChannelCode = '';
    currentUser = null;
    isChannelBusy = false;
    currentSpeakerDisplay.textContent = 'READY';
    currentSpeakerDisplay.style.color = 'var(--text-secondary)';
    
    // reset url if it was /join/...
    history.pushState(null, '', '/');
    switchView('landing');
});


// Push to talk logic
function startSpeaking() {
    if (appMode === 'handsfree') return;
    if (isChannelBusy) {
        showNotification('Channel Sedang Digunakan');
        return;
    }
    
    window.socket.emit('request-speaking', (res) => {
        if (res.success) {
            isSpeaking = true;
            window.unmuteMic();
            pttButton.classList.add('speaking');
            currentSpeakerDisplay.textContent = 'SEDANG BERBICARA';
            currentSpeakerDisplay.style.color = 'var(--color-green)';
        } else {
            showNotification('Gagal menggunakan channel, sedang sibuk.');
        }
    });
}

function stopSpeaking() {
    if (appMode === 'handsfree') return;
    if (isSpeaking) {
        isSpeaking = false;
        window.muteMic();
        window.socket.emit('release-speaking');
        pttButton.classList.remove('speaking');
        currentSpeakerDisplay.textContent = 'SIAP MENDENGARKAN';
        currentSpeakerDisplay.style.color = 'var(--text-secondary)';
    }
}

// Mouse / Touch events for PTT
pttButton.addEventListener('mousedown', (e) => {
    if(e.button !== 0) return; // Only left click
    startSpeaking();
});
pttButton.addEventListener('touchstart', (e) => {
    e.preventDefault(); // Prevent double trigger
    startSpeaking();
});

window.addEventListener('mouseup', () => {
    if(isSpeaking) stopSpeaking();
});
window.addEventListener('touchend', () => {
    if(isSpeaking) stopSpeaking();
});

// Keyboard event for Spacebar
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && views.app.classList.contains('active')) {
        // Prevent if typing in an input
        if(document.activeElement.tagName === 'INPUT') return;
        e.preventDefault();
        if(!isSpeaking) startSpeaking();
    }
});
window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' && views.app.classList.contains('active')) {
        if(document.activeElement.tagName === 'INPUT') return;
        e.preventDefault();
        if(isSpeaking) stopSpeaking();
    }
});


// UI Methods called by socket.js
window.updateUIConnectionStatus = function(text, colorClass) {
    const html = `<span class="dot ${colorClass}"></span> ${text}`;
    document.getElementById('connection-status').innerHTML = html;
    document.getElementById('mobile-connection-status').innerHTML = html;
};

window.uiAddUser = function(user) {
    if (usersList.find(u => u.socketId === user.socketId)) return; // prevent duplicate
    usersList.push(user);
    
    const li = document.createElement('li');
    li.id = `user-${user.socketId}`;
    li.innerHTML = `<span class="icon">👤</span> <span class="name">${user.username}</span> <span class="status-indicator"></span>`;
    document.getElementById('user-list').appendChild(li);
    
    updateUserCount();
};

window.uiRemoveUser = function(socketId) {
    usersList = usersList.filter(u => u.socketId !== socketId);
    const li = document.getElementById(`user-${socketId}`);
    if (li) li.remove();
    updateUserCount();
};

window.uiSetSpeaker = function(socketId, username) {
    isChannelBusy = true;
    currentSpeakerDisplay.textContent = `${username} SEDANG BERBICARA...`;
    currentSpeakerDisplay.style.color = 'var(--color-red)';
    pttButton.classList.add('active'); // show busy state visually without being green
    
    // Add speaking icon to user list
    const li = document.getElementById(`user-${socketId}`);
    if (li) {
        const indicator = li.querySelector('.status-indicator');
        if(indicator) indicator.innerHTML = '🎙️';
    }
};

window.uiClearSpeaker = function(socketId) {
    isChannelBusy = false;
    if (!isSpeaking) {
        currentSpeakerDisplay.textContent = 'READY';
        currentSpeakerDisplay.style.color = 'var(--text-secondary)';
        pttButton.classList.remove('active');
    }
    
    const li = document.getElementById(`user-${socketId}`);
    if (li) {
        const indicator = li.querySelector('.status-indicator');
        if(indicator) indicator.innerHTML = '';
    }
};

function updateUserCount() {
    const count = usersList.length;
    document.getElementById('user-count').textContent = count;
    document.getElementById('mobile-user-count').textContent = count;
}


// Notification System
function showNotification(msg) {
    const container = document.getElementById('notification-container');
    const el = document.createElement('div');
    el.className = 'notification';
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => {
        el.remove();
    }, 3000);
}

// Share & QR
document.getElementById('btn-share').addEventListener('click', async () => {
    const joinUrl = `${window.location.origin}/join/${currentChannelCode}`;
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'Walkie Talkie Web',
                text: `Join my channel ${currentChannelCode} on Walkie Talkie!`,
                url: joinUrl
            });
        } catch (err) {
            console.log('Share error', err);
        }
    } else {
        // Fallback copy to clipboard
        navigator.clipboard.writeText(joinUrl);
        showNotification('Link channel disalin ke clipboard!');
    }
});

document.getElementById('btn-qr').addEventListener('click', () => {
    const joinUrl = `${window.location.origin}/join/${currentChannelCode}`;
    const qrContainer = document.getElementById('qrcode');
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
        text: joinUrl,
        width: 200,
        height: 200,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });
    document.getElementById('qr-link').textContent = joinUrl;
    document.getElementById('qr-modal').classList.add('active');
});

// Settings
document.getElementById('btn-settings').addEventListener('click', () => {
    document.getElementById('settings-modal').classList.add('active');
});

const modeRadios = document.querySelectorAll('input[name="mode"]');
modeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        appMode = e.target.value;
        if (appMode === 'handsfree') {
            window.unmuteMic();
            window.socket.emit('request-speaking');
            pttButton.style.opacity = '0.5';
            document.querySelector('.ptt-instruction').textContent = "MIC SELALU AKTIF";
        } else {
            window.muteMic();
            window.socket.emit('release-speaking');
            pttButton.style.opacity = '1';
            document.querySelector('.ptt-instruction').innerHTML = "TEKAN & TAHAN<br>UNTUK BICARA";
            isSpeaking = false;
        }
    });
});

// Init
checkUrlRouting();
