// ==========================================
// WALKIE TALKIE - MAIN.JS
// Firebase + WebRTC
// ==========================================

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
const currentSpeakerDisplay =
    document.getElementById('current-speaker-display');

const micPermissionBox =
    document.getElementById('mic-permission-box');

let currentChannelCode = '';
let currentUser = null;

let appMode = 'ptt';
let isSpeaking = false;
let isChannelBusy = false;

let usersList = [];


// ==========================================
// VIEW
// ==========================================

function switchView(viewName) {

    Object.values(views).forEach(view => {

        if (view) {
            view.classList.remove('active');
        }

    });

    if (views[viewName]) {
        views[viewName].classList.add('active');
    }
}


// ==========================================
// URL ROUTING
// ==========================================

function checkUrlRouting() {

    const path = window.location.pathname;

    if (path.startsWith('/join/')) {

        const code = path
            .split('/join/')[1]
            ?.split('/')[0];

        if (code && inputs.channel) {

            inputs.channel.value =
                decodeURIComponent(code).toUpperCase();

            switchView('join');
        }
    }
}


// ==========================================
// NAVIGATION
// ==========================================

const btnGotoJoin =
    document.getElementById('btn-goto-join');

if (btnGotoJoin) {

    btnGotoJoin.addEventListener('click', () => {

        switchView('join');

    });

}


const btnBackLanding =
    document.getElementById('btn-back-landing');

if (btnBackLanding) {

    btnBackLanding.addEventListener('click', () => {

        switchView('landing');

    });

}


// ==========================================
// CREATE CHANNEL
// ==========================================

const btnCreateChannel =
    document.getElementById('btn-create-channel');

if (btnCreateChannel) {

    btnCreateChannel.addEventListener('click', () => {

        const chars =
            'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

        let code = '';

        for (let i = 0; i < 6; i++) {

            code += chars.charAt(
                Math.floor(
                    Math.random() * chars.length
                )
            );

        }

        inputs.channel.value = code;

        switchView('join');

        showNotification(
            `Channel ${code} dibuat!`
        );

    });

}


// ==========================================
// JOIN CHANNEL
// ==========================================

const btnJoinChannel =
    document.getElementById('btn-join-channel');

if (btnJoinChannel) {

    btnJoinChannel.addEventListener(
        'click',
        async () => {

            const channel =
                inputs.channel.value
                    .trim()
                    .toUpperCase();

            const username =
                inputs.username.value.trim();


            if (!channel || !username) {

                showNotification(
                    'Kode Channel dan Nama harus diisi!'
                );

                return;
            }


            btnJoinChannel.disabled = true;

            btnJoinChannel.textContent =
                'MENGHUBUNGKAN...';


            // ==========================================
            // MICROPHONE
            // ==========================================

            try {

                const micGranted =
                    await window.initLocalAudio();

                if (!micGranted) {

                    if (micPermissionBox) {
                        micPermissionBox.style.display =
                            'block';
                    }

                    btnJoinChannel.disabled = false;

                    btnJoinChannel.textContent =
                        '🎙️ GABUNG CHANNEL';

                    return;
                }

            } catch (error) {

                console.error(
                    'Microphone error:',
                    error
                );

                showNotification(
                    'Microphone tidak dapat digunakan.'
                );

                btnJoinChannel.disabled = false;

                btnJoinChannel.textContent =
                    '🎙️ GABUNG CHANNEL';

                return;
            }


            if (micPermissionBox) {
                micPermissionBox.style.display =
                    'none';
            }


            // ==========================================
            // FIREBASE SOCKET
            // ==========================================

            if (!window.socket) {

                console.error(
                    'Firebase socket belum siap.'
                );

                showNotification(
                    'Koneksi belum siap. Refresh halaman.'
                );

                btnJoinChannel.disabled = false;

                btnJoinChannel.textContent =
                    '🎙️ GABUNG CHANNEL';

                return;
            }


            if (!window.socket.connected) {
                window.socket.connect();
            }


            const joinChannel = () => {

                window.socket.emit(
                    'join-channel',
                    {
                        channelCode: channel,
                        username: username
                    },
                    (res) => {

                        btnJoinChannel.disabled = false;

                        btnJoinChannel.textContent =
                            '🎙️ GABUNG CHANNEL';


                        if (!res || !res.success) {

                            showNotification(
                                res?.message ||
                                'Gagal bergabung ke channel.'
                            );

                            return;
                        }


                        // ==========================================
                        // SAVE USER
                        // ==========================================

                        currentChannelCode =
                            channel;

                        currentUser =
                            res.currentUser;


                        // ==========================================
                        // CHANNEL DISPLAY
                        // ==========================================

                        const channelDisplay =
                            document.getElementById(
                                'current-channel-display'
                            );

                        if (channelDisplay) {
                            channelDisplay.textContent =
                                channel;
                        }


                        const mobileChannelDisplay =
                            document.getElementById(
                                'mobile-channel-display'
                            );

                        if (mobileChannelDisplay) {
                            mobileChannelDisplay.textContent =
                                channel;
                        }


                        // ==========================================
                        // RESET USERS
                        // ==========================================

                        const userList =
                            document.getElementById(
                                'user-list'
                            );

                        if (userList) {
                            userList.innerHTML = '';
                        }

                        usersList = [];


                        // ==========================================
                        // USERS
                        // ==========================================

                        if (Array.isArray(res.users)) {

                            res.users.forEach(user => {

                                uiAddUser(user);

                            });

                        }


                        // ==========================================
                        // SWITCH APP
                        // ==========================================

                        switchView('app');

                        showNotification(
                            `Berhasil bergabung ke ${channel}`
                        );


                        // ==========================================
                        // HANDSFREE
                        // ==========================================

                        if (appMode === 'handsfree') {

                            window.unmuteMic();

                            window.socket.emit(
                                'request-speaking'
                            );

                        }

                    }
                );

            };


            if (window.socket.connected) {

                joinChannel();

            } else {

                window.socket.once(
                    'connect',
                    joinChannel
                );

            }

        }
    );

}


// ==========================================
// LEAVE CHANNEL
// ==========================================

const btnLeave =
    document.getElementById('btn-leave');

if (btnLeave) {

    btnLeave.addEventListener(
        'click',
        async () => {

            try {

                if (isSpeaking) {
                    stopSpeaking();
                }

                if (window.socket) {

                    window.socket.emit(
                        'leave-channel'
                    );

                }

            } catch (error) {

                console.error(
                    'Leave error:',
                    error
                );

            }


            if (
                typeof window.closeAllPeerConnections ===
                'function'
            ) {

                window.closeAllPeerConnections();

            }


            if (window.localStream) {

                window.localStream
                    .getTracks()
                    .forEach(track => {
                        track.stop();
                    });

                window.localStream = null;

            }


            const userList =
                document.getElementById('user-list');

            if (userList) {
                userList.innerHTML = '';
            }


            usersList = [];

            currentChannelCode = '';

            currentUser = null;

            isChannelBusy = false;

            isSpeaking = false;


            if (currentSpeakerDisplay) {

                currentSpeakerDisplay.textContent =
                    'READY';

                currentSpeakerDisplay.style.color =
                    'var(--text-secondary)';

            }


            if (pttButton) {

                pttButton.classList.remove(
                    'speaking',
                    'active'
                );

            }


            history.pushState(
                null,
                '',
                '/'
            );

            switchView('landing');

        }
    );

}


// ==========================================
// PUSH TO TALK
// ==========================================

async function startSpeaking() {

    if (isSpeaking) {
        return;
    }


    if (appMode === 'handsfree') {
        return;
    }


    if (!window.socket) {

        showNotification(
            'Koneksi belum tersedia.'
        );

        return;
    }


    // ==========================================
    // REQUEST SPEAKER
    // ==========================================

    window.socket.emit(
        'request-speaking',
        (res) => {

            if (res && res.success) {

                isSpeaking = true;

                isChannelBusy = true;


                if (
                    typeof window.unmuteMic ===
                    'function'
                ) {

                    window.unmuteMic();

                }


                if (pttButton) {

                    pttButton.classList.add(
                        'speaking'
                    );

                }


                if (currentSpeakerDisplay) {

                    currentSpeakerDisplay.textContent =
                        'SEDANG BERBICARA';

                    currentSpeakerDisplay.style.color =
                        'var(--color-green)';

                }

            } else {

                showNotification(
                    'Channel sedang digunakan orang lain.'
                );

            }

        }
    );

}


// ==========================================
// STOP TALKING
// ==========================================

function stopSpeaking() {

    if (!isSpeaking) {
        return;
    }


    isSpeaking = false;


    if (
        typeof window.muteMic ===
        'function'
    ) {

        window.muteMic();

    }


    if (window.socket) {

        window.socket.emit(
            'release-speaking'
        );

    }


    if (pttButton) {

        pttButton.classList.remove(
            'speaking'
        );

    }


    if (currentSpeakerDisplay) {

        currentSpeakerDisplay.textContent =
            'SIAP MENDENGARKAN';

        currentSpeakerDisplay.style.color =
            'var(--text-secondary)';

    }

}


// ==========================================
// PTT - POINTER EVENTS
// SUPPORT HP + LAPTOP
// ==========================================

if (pttButton) {

    pttButton.style.touchAction = 'none';

    pttButton.addEventListener(
        'pointerdown',
        async (event) => {

            event.preventDefault();

            try {

                pttButton.setPointerCapture(
                    event.pointerId
                );

            } catch (error) {
                console.warn(
                    'Pointer capture gagal:',
                    error
                );
            }


            await startSpeaking();

        }
    );


    pttButton.addEventListener(
        'pointerup',
        (event) => {

            event.preventDefault();

            try {

                pttButton.releasePointerCapture(
                    event.pointerId
                );

            } catch (error) {
                // Ignore
            }

            stopSpeaking();

        }
    );


    pttButton.addEventListener(
        'pointercancel',
        () => {

            stopSpeaking();

        }
    );


    pttButton.addEventListener(
        'pointerleave',
        (event) => {

            if (
                event.pointerType === 'mouse' &&
                isSpeaking
            ) {

                stopSpeaking();

            }

        }
    );

}


// ==========================================
// KEYBOARD SPACE
// ==========================================

window.addEventListener(
    'keydown',
    event => {

        if (
            event.code !== 'Space' ||
            !views.app.classList.contains('active')
        ) {
            return;
        }


        if (
            document.activeElement &&
            document.activeElement.tagName ===
            'INPUT'
        ) {
            return;
        }


        event.preventDefault();


        if (!isSpeaking) {
            startSpeaking();
        }

    }
);


window.addEventListener(
    'keyup',
    event => {

        if (
            event.code !== 'Space' ||
            !views.app.classList.contains('active')
        ) {
            return;
        }


        event.preventDefault();


        if (isSpeaking) {
            stopSpeaking();
        }

    }
);


// ==========================================
// CONNECTION STATUS
// ==========================================

window.updateUIConnectionStatus =
    function (text, colorClass) {

        const html =
            `<span class="dot ${colorClass}"></span> ${text}`;


        const connectionStatus =
            document.getElementById(
                'connection-status'
            );

        if (connectionStatus) {
            connectionStatus.innerHTML = html;
        }


        const mobileConnectionStatus =
            document.getElementById(
                'mobile-connection-status'
            );

        if (mobileConnectionStatus) {
            mobileConnectionStatus.innerHTML = html;
        }

    };


// ==========================================
// ADD USER
// ==========================================

window.uiAddUser =
    function (user) {

        if (!user || !user.socketId) {
            return;
        }


        if (
            usersList.some(
                existing =>
                    existing.socketId ===
                    user.socketId
            )
        ) {
            return;
        }


        usersList.push(user);


        const li =
            document.createElement('li');

        li.id =
            `user-${user.socketId}`;


        li.innerHTML =
            `<span class="icon">👤</span>` +
            `<span class="name">${escapeHtml(user.username || 'User')}</span>` +
            `<span class="status-indicator"></span>`;


        const userList =
            document.getElementById('user-list');

        if (userList) {
            userList.appendChild(li);
        }


        updateUserCount();

    };


// ==========================================
// REMOVE USER
// ==========================================

window.uiRemoveUser =
    function (socketId) {

        usersList =
            usersList.filter(
                user =>
                    user.socketId !== socketId
            );


        const li =
            document.getElementById(
                `user-${socketId}`
            );

        if (li) {
            li.remove();
        }


        updateUserCount();

    };


// ==========================================
// SET SPEAKER
// ==========================================

window.uiSetSpeaker =
    function (socketId, username) {

        if (
            socketId &&
            currentUser &&
            socketId === currentUser.socketId
        ) {
            return;
        }


        isChannelBusy = true;


        if (currentSpeakerDisplay) {

            currentSpeakerDisplay.textContent =
                `${username} SEDANG BERBICARA...`;

            currentSpeakerDisplay.style.color =
                'var(--color-red)';

        }


        if (pttButton) {

            pttButton.classList.add(
                'active'
            );

        }


        const li =
            document.getElementById(
                `user-${socketId}`
            );

        if (li) {

            const indicator =
                li.querySelector(
                    '.status-indicator'
                );

            if (indicator) {
                indicator.innerHTML = '🎙️';
            }

        }

    };


// ==========================================
// CLEAR SPEAKER
// ==========================================

window.uiClearSpeaker =
    function (socketId) {

        isChannelBusy = false;


        if (!isSpeaking) {

            if (currentSpeakerDisplay) {

                currentSpeakerDisplay.textContent =
                    'READY';

                currentSpeakerDisplay.style.color =
                    'var(--text-secondary)';

            }


            if (pttButton) {

                pttButton.classList.remove(
                    'active'
                );

            }

        }


        if (socketId) {

            const li =
                document.getElementById(
                    `user-${socketId}`
                );

            if (li) {

                const indicator =
                    li.querySelector(
                        '.status-indicator'
                    );

                if (indicator) {
                    indicator.innerHTML = '';
                }

            }

        }

    };


// ==========================================
// USER COUNT
// ==========================================

function updateUserCount() {

    const count =
        usersList.length;


    const userCount =
        document.getElementById(
            'user-count'
        );

    if (userCount) {
        userCount.textContent = count;
    }


    const mobileUserCount =
        document.getElementById(
            'mobile-user-count'
        );

    if (mobileUserCount) {
        mobileUserCount.textContent =
            count;
    }

}


// ==========================================
// NOTIFICATION
// ==========================================

function showNotification(message) {

    const container =
        document.getElementById(
            'notification-container'
        );

    if (!container) {
        console.log(message);
        return;
    }


    const el =
        document.createElement('div');

    el.className =
        'notification';

    el.textContent =
        message;


    container.appendChild(el);


    setTimeout(
        () => {

            el.remove();

        },
        3000
    );

}


// ==========================================
// SHARE
// ==========================================

const btnShare =
    document.getElementById('btn-share');

if (btnShare) {

    btnShare.addEventListener(
        'click',
        async () => {

            const joinUrl =
                `${window.location.origin}/join/${currentChannelCode}`;


            if (navigator.share) {

                try {

                    await navigator.share({

                        title:
                            'Walkie Talkie Web',

                        text:
                            `Join my channel ${currentChannelCode} on Walkie Talkie!`,

                        url:
                            joinUrl

                    });

                } catch (error) {

                    console.log(
                        'Share cancelled:',
                        error
                    );

                }

            } else {

                try {

                    await navigator.clipboard
                        .writeText(joinUrl);

                    showNotification(
                        'Link channel disalin ke clipboard!'
                    );

                } catch (error) {

                    console.error(
                        'Clipboard error:',
                        error
                    );

                }

            }

        }
    );

}


// ==========================================
// QR CODE
// ==========================================

const btnQr =
    document.getElementById('btn-qr');

if (btnQr) {

    btnQr.addEventListener(
        'click',
        () => {

            const joinUrl =
                `${window.location.origin}/join/${currentChannelCode}`;


            const qrContainer =
                document.getElementById('qrcode');

            if (!qrContainer) {
                return;
            }


            qrContainer.innerHTML = '';


            if (typeof QRCode !== 'undefined') {

                new QRCode(
                    qrContainer,
                    {
                        text: joinUrl,
                        width: 200,
                        height: 200,
                        colorDark: '#000000',
                        colorLight: '#ffffff',
                        correctLevel:
                            QRCode.CorrectLevel.H
                    }
                );

            }


            const qrLink =
                document.getElementById('qr-link');

            if (qrLink) {
                qrLink.textContent = joinUrl;
            }


            const qrModal =
                document.getElementById('qr-modal');

            if (qrModal) {
                qrModal.classList.add('active');
            }

        }
    );

}


// ==========================================
// SETTINGS / MODE
// ==========================================

const modeRadios =
    document.querySelectorAll(
        'input[name="mode"]'
    );


modeRadios.forEach(
    radio => {

        radio.addEventListener(
            'change',
            event => {

                appMode =
                    event.target.value;


                if (
                    appMode ===
                    'handsfree'
                ) {

                    if (
                        typeof window.unmuteMic ===
                        'function'
                    ) {
                        window.unmuteMic();
                    }


                    if (window.socket) {

                        window.socket.emit(
                            'request-speaking'
                        );

                    }


                    if (pttButton) {
                        pttButton.style.opacity =
                            '0.5';
                    }


                    const instruction =
                        document.querySelector(
                            '.ptt-instruction'
                        );

                    if (instruction) {

                        instruction.textContent =
                            'MIC SELALU AKTIF';

                    }

                } else {

                    if (
                        typeof window.muteMic ===
                        'function'
                    ) {
                        window.muteMic();
                    }


                    if (window.socket) {

                        window.socket.emit(
                            'release-speaking'
                        );

                    }


                    if (pttButton) {
                        pttButton.style.opacity =
                            '1';
                    }


                    const instruction =
                        document.querySelector(
                            '.ptt-instruction'
                        );

                    if (instruction) {

                        instruction.innerHTML =
                            'TEKAN & TAHAN<br>UNTUK BICARA';

                    }


                    isSpeaking = false;

                }

            }
        );

    }
);


// ==========================================
// HTML ESCAPE
// ==========================================

function escapeHtml(value) {

    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');

}


// ==========================================
// INITIALIZE
// ==========================================

checkUrlRouting();


// ==========================================
// DEBUG
// ==========================================

console.log(
    'Walkie Talkie main.js loaded'
);