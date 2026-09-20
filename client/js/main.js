// ==========================================
// UI ELEMENTS
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
const currentSpeakerDisplay = document.getElementById('current-speaker-display');
const micPermissionBox = document.getElementById('mic-permission-box');


// ==========================================
// STATE
// ==========================================

let currentChannelCode = '';
let currentUser = null;
let appMode = 'ptt';
let isSpeaking = false;
let isChannelBusy = false;
let usersList = [];


// ==========================================
// INIT ROUTING BASED ON URL
// ==========================================

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


// ==========================================
// VIEW MANAGEMENT
// ==========================================

function switchView(viewName) {

    Object.values(views).forEach(view => {
        view.classList.remove('active');
    });

    if (views[viewName]) {
        views[viewName].classList.add('active');
    }
}


// ==========================================
// NAVIGATION
// ==========================================

document
    .getElementById('btn-goto-join')
    .addEventListener('click', () => {

        switchView('join');

    });


document
    .getElementById('btn-back-landing')
    .addEventListener('click', () => {

        switchView('landing');

    });


// ==========================================
// CREATE CHANNEL
// ==========================================

document
    .getElementById('btn-create-channel')
    .addEventListener('click', () => {

        const chars =
            'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

        let code = '';

        for (let i = 0; i < 6; i++) {

            code += chars.charAt(
                Math.floor(Math.random() * chars.length)
            );

        }

        inputs.channel.value = code;

        switchView('join');

        showNotification(
            'Channel ' + code + ' dibuat!'
        );

    });


// ==========================================
// JOIN CHANNEL LOGIC
// ==========================================

document
    .getElementById('btn-join-channel')
    .addEventListener('click', async () => {

        const channel =
            inputs.channel.value
                .trim()
                .toUpperCase();

        const username =
            inputs.username.value.trim();


        // Validasi
        if (!channel || !username) {

            showNotification(
                'Kode Channel dan Nama harus diisi!'
            );

            return;
        }


        const btn =
            document.getElementById('btn-join-channel');


        btn.disabled = true;

        btn.textContent =
            'MENGHUBUNGKAN...';


        // ==========================================
        // REQUEST MICROPHONE
        // ==========================================

        const micGranted =
            await window.initLocalAudio();


        if (!micGranted) {

            micPermissionBox.style.display =
                'block';

            btn.disabled = false;

            btn.textContent =
                '🎙️ GABUNG CHANNEL';

            return;
        }


        micPermissionBox.style.display =
            'none';


        // ==========================================
        // CHECK SOCKET
        // ==========================================

        if (!window.socket) {

            console.error(
                'Socket.IO belum siap.'
            );

            showNotification(
                'Koneksi server belum siap. Silakan refresh halaman.'
            );

            btn.disabled = false;

            btn.textContent =
                '🎙️ GABUNG CHANNEL';

            return;
        }


        // ==========================================
        // CONNECT SOCKET
        // ==========================================

        if (!window.socket.connected) {

            window.socket.connect();

        }


        // ==========================================
        // JOIN CHANNEL
        // ==========================================

        const joinChannel = () => {

            window.socket.emit(
                'join-channel',
                {
                    channelCode: channel,
                    username: username
                },
                (res) => {

                    btn.disabled = false;

                    btn.textContent =
                        '🎙️ GABUNG CHANNEL';


                    // ==========================================
                    // SUCCESS
                    // ==========================================

                    if (res && res.success) {

                        currentChannelCode =
                            channel;

                        currentUser =
                            res.currentUser;


                        // Channel display
                        document
                            .getElementById(
                                'current-channel-display'
                            )
                            .textContent =
                            channel;


                        document
                            .getElementById(
                                'mobile-channel-display'
                            )
                            .textContent =
                            channel;


                        // Clear user list
                        document
                            .getElementById(
                                'user-list'
                            )
                            .innerHTML = '';


                        usersList = [];


                        // Add users
                        if (Array.isArray(res.users)) {

                            res.users.forEach(user => {

                                uiAddUser(user);

                            });

                        }


                        // Current speaker
                        if (res.currentSpeaker) {

                            const speakerUser =
                                res.users.find(
                                    user =>
                                        user.socketId ===
                                        res.currentSpeaker
                                );


                            if (speakerUser) {

                                uiSetSpeaker(
                                    speakerUser.socketId,
                                    speakerUser.username
                                );

                            }

                        }


                        // Switch to application
                        switchView('app');


                        showNotification(
                            'Berhasil bergabung ke ' +
                            channel
                        );


                        // Handsfree mode
                        if (
                            appMode ===
                            'handsfree'
                        ) {

                            window.unmuteMic();

                            window.socket.emit(
                                'request-speaking'
                            );

                        }

                    } else {

                        showNotification(
                            'Gagal bergabung ke channel.'
                        );

                    }

                }
            );

        };


        // ==========================================
        // WAIT FOR SOCKET CONNECTION
        // ==========================================

        if (window.socket.connected) {

            joinChannel();

        } else {

            window.socket.once(
                'connect',
                joinChannel
            );

        }

    });


// ==========================================
// LEAVE CHANNEL
// ==========================================

document
    .getElementById('btn-leave')
    .addEventListener('click', () => {

        if (window.socket) {

            window.socket.emit(
                'leave-channel'
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


        document
            .getElementById('user-list')
            .innerHTML = '';


        currentChannelCode = '';

        currentUser = null;

        isChannelBusy = false;

        isSpeaking = false;


        currentSpeakerDisplay.textContent =
            'READY';

        currentSpeakerDisplay.style.color =
            'var(--text-secondary)';


        history.pushState(
            null,
            '',
            '/'
        );


        switchView('landing');

    });


// ==========================================
// PUSH TO TALK
// ==========================================

function startSpeaking() {

    if (appMode === 'handsfree') {
        return;
    }


    if (isChannelBusy) {

        showNotification(
            'Channel Sedang Digunakan'
        );

        return;
    }


    if (!window.socket) {

        showNotification(
            'Socket belum terhubung.'
        );

        return;
    }


    window.socket.emit(
        'request-speaking',
        (res) => {

            if (res && res.success) {

                isSpeaking = true;

                window.unmuteMic();

                pttButton.classList.add(
                    'speaking'
                );

                currentSpeakerDisplay.textContent =
                    'SEDANG BERBICARA';

                currentSpeakerDisplay.style.color =
                    'var(--color-green)';

            } else {

                showNotification(
                    'Gagal menggunakan channel, sedang sibuk.'
                );

            }

        }
    );

}


function stopSpeaking() {

    if (appMode === 'handsfree') {
        return;
    }


    if (isSpeaking) {

        isSpeaking = false;

        window.muteMic();


        if (window.socket) {

            window.socket.emit(
                'release-speaking'
            );

        }


        pttButton.classList.remove(
            'speaking'
        );


        currentSpeakerDisplay.textContent =
            'SIAP MENDENGARKAN';

        currentSpeakerDisplay.style.color =
            'var(--text-secondary)';

    }

}


// ==========================================
// MOUSE / TOUCH EVENTS
// ==========================================

pttButton.addEventListener(
    'mousedown',
    (e) => {

        if (e.button !== 0) {
            return;
        }

        startSpeaking();

    }
);


pttButton.addEventListener(
    'touchstart',
    (e) => {

        e.preventDefault();

        startSpeaking();

    }
);


window.addEventListener(
    'mouseup',
    () => {

        if (isSpeaking) {

            stopSpeaking();

        }

    }
);


window.addEventListener(
    'touchend',
    () => {

        if (isSpeaking) {

            stopSpeaking();

        }

    }
);


// ==========================================
// KEYBOARD SPACEBAR
// ==========================================

window.addEventListener(
    'keydown',
    (e) => {

        if (
            e.code === 'Space' &&
            views.app.classList.contains('active')
        ) {

            if (
                document.activeElement.tagName ===
                'INPUT'
            ) {

                return;

            }


            e.preventDefault();


            if (!isSpeaking) {

                startSpeaking();

            }

        }

    }
);


window.addEventListener(
    'keyup',
    (e) => {

        if (
            e.code === 'Space' &&
            views.app.classList.contains('active')
        ) {

            if (
                document.activeElement.tagName ===
                'INPUT'
            ) {

                return;

            }


            e.preventDefault();


            if (isSpeaking) {

                stopSpeaking();

            }

        }

    }
);


// ==========================================
// UI METHODS CALLED BY SOCKET.JS
// ==========================================

window.updateUIConnectionStatus =
    function (text, colorClass) {

        const html =
            `<span class="dot ${colorClass}"></span> ${text}`;


        document
            .getElementById(
                'connection-status'
            )
            .innerHTML =
            html;


        document
            .getElementById(
                'mobile-connection-status'
            )
            .innerHTML =
            html;

    };


// ==========================================
// ADD USER
// ==========================================

window.uiAddUser =
    function (user) {

        if (
            usersList.find(
                u =>
                    u.socketId ===
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
            `<span class="icon">👤</span> ` +
            `<span class="name">${user.username}</span> ` +
            `<span class="status-indicator"></span>`;


        document
            .getElementById('user-list')
            .appendChild(li);


        updateUserCount();

    };


// ==========================================
// REMOVE USER
// ==========================================

window.uiRemoveUser =
    function (socketId) {

        usersList =
            usersList.filter(
                u =>
                    u.socketId !==
                    socketId
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
    function (
        socketId,
        username
    ) {

        isChannelBusy = true;


        currentSpeakerDisplay.textContent =
            `${username} SEDANG BERBICARA...`;


        currentSpeakerDisplay.style.color =
            'var(--color-red)';


        pttButton.classList.add(
            'active'
        );


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

                indicator.innerHTML =
                    '🎙️';

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

            currentSpeakerDisplay.textContent =
                'READY';

            currentSpeakerDisplay.style.color =
                'var(--text-secondary)';

            pttButton.classList.remove(
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

                indicator.innerHTML =
                    '';

            }

        }

    };


// ==========================================
// UPDATE USER COUNT
// ==========================================

function updateUserCount() {

    const count =
        usersList.length;


    document
        .getElementById(
            'user-count'
        )
        .textContent =
        count;


    document
        .getElementById(
            'mobile-user-count'
        )
        .textContent =
        count;

}


// ==========================================
// NOTIFICATION SYSTEM
// ==========================================

function showNotification(msg) {

    const container =
        document.getElementById(
            'notification-container'
        );


    const el =
        document.createElement('div');


    el.className =
        'notification';


    el.textContent =
        msg;


    container.appendChild(el);


    setTimeout(
        () => {

            el.remove();

        },
        3000
    );

}


// ==========================================
// SHARE CHANNEL
// ==========================================

document
    .getElementById('btn-share')
    .addEventListener(
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

                } catch (err) {

                    console.log(
                        'Share error',
                        err
                    );

                }

            } else {

                navigator.clipboard
                    .writeText(joinUrl);

                showNotification(
                    'Link channel disalin ke clipboard!'
                );

            }

        }
    );


// ==========================================
// QR CODE
// ==========================================

document
    .getElementById('btn-qr')
    .addEventListener(
        'click',
        () => {

            const joinUrl =
                `${window.location.origin}/join/${currentChannelCode}`;


            const qrContainer =
                document.getElementById(
                    'qrcode'
                );


            qrContainer.innerHTML =
                '';


            new QRCode(
                qrContainer,
                {

                    text:
                        joinUrl,

                    width:
                        200,

                    height:
                        200,

                    colorDark:
                        '#000000',

                    colorLight:
                        '#ffffff',

                    correctLevel:
                        QRCode.CorrectLevel.H

                }
            );


            document
                .getElementById(
                    'qr-link'
                )
                .textContent =
                joinUrl;


            document
                .getElementById(
                    'qr-modal'
                )
                .classList.add(
                    'active'
                );

        }
    );


// ==========================================
// SETTINGS
// ==========================================

const modeRadios =
    document.querySelectorAll(
        'input[name="mode"]'
    );


modeRadios.forEach(
    radio => {

        radio.addEventListener(
            'change',
            (e) => {

                appMode =
                    e.target.value;


                if (
                    appMode ===
                    'handsfree'
                ) {

                    window.unmuteMic();


                    if (window.socket) {

                        window.socket.emit(
                            'request-speaking'
                        );

                    }


                    pttButton.style.opacity =
                        '0.5';


                    document
                        .querySelector(
                            '.ptt-instruction'
                        )
                        .textContent =
                        'MIC SELALU AKTIF';

                } else {

                    window.muteMic();


                    if (window.socket) {

                        window.socket.emit(
                            'release-speaking'
                        );

                    }


                    pttButton.style.opacity =
                        '1';


                    document
                        .querySelector(
                            '.ptt-instruction'
                        )
                        .innerHTML =
                        'TEKAN & TAHAN<br>UNTUK BICARA';


                    isSpeaking =
                        false;

                }

            }
        );

    }
);


// ==========================================
// INITIALIZE APPLICATION
// ==========================================

checkUrlRouting();