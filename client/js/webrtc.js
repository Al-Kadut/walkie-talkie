// ==========================================
// WEBRTC AUDIO ENGINE
// Firebase Signaling Compatible
// ==========================================

const peerConnections = {};
const pendingIceCandidates = {};

let localStream = null;


// ==========================================
// RTC CONFIG
// ==========================================

const rtcConfig = {

    iceServers: [

        // Google STUN
        {
            urls: 'stun:stun.l.google.com:19302'
        },

        // Twilio STUN
        {
            urls: 'stun:global.stun.twilio.com:3478'
        },

        // OpenRelay TURN
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

    ],

    bundlePolicy: 'max-bundle',

    rtcpMuxPolicy: 'require'
};


// ==========================================
// AUDIO CONTAINER
// ==========================================

const audioContainer =
    document.getElementById('audio-container');


// ==========================================
// INIT MICROPHONE
// ==========================================

async function initLocalAudio() {

    try {

        if (!navigator.mediaDevices ||
            !navigator.mediaDevices.getUserMedia) {

            console.error(
                'Browser tidak mendukung getUserMedia.'
            );

            return false;
        }


        console.log(
            'Meminta izin microphone...'
        );


        localStream =
            await navigator.mediaDevices.getUserMedia({

                audio: {

                    echoCancellation: true,

                    noiseSuppression: true,

                    autoGainControl: true,

                    channelCount: 1

                },

                video: false

            });


        console.log(
            'Microphone berhasil aktif.'
        );


        // ======================================
        // MUTE AWAL
        // ======================================

        muteMic();


        // ======================================
        // INFO TRACK
        // ======================================

        localStream
            .getAudioTracks()
            .forEach(track => {

                console.log(
                    'Local audio track:',
                    {
                        id: track.id,
                        enabled: track.enabled,
                        muted: track.muted,
                        readyState: track.readyState
                    }
                );

            });


        return true;

    } catch (error) {

        console.error(
            'Error mengakses microphone:',
            error
        );


        if (error.name === 'NotAllowedError') {

            alert(
                'Izin microphone ditolak. Silakan izinkan microphone pada browser.'
            );

        }


        if (error.name === 'NotFoundError') {

            alert(
                'Microphone tidak ditemukan.'
            );

        }


        return false;

    }

}


// ==========================================
// MUTE MICROPHONE
// ==========================================

function muteMic() {

    if (!localStream) {
        return;
    }


    localStream
        .getAudioTracks()
        .forEach(track => {

            track.enabled = false;

        });


    console.log(
        'Microphone: MUTED'
    );

}


// ==========================================
// UNMUTE MICROPHONE
// ==========================================

function unmuteMic() {

    if (!localStream) {

        console.warn(
            'Tidak ada localStream.'
        );

        return;
    }


    localStream
        .getAudioTracks()
        .forEach(track => {

            track.enabled = true;

        });


    console.log(
        'Microphone: UNMUTED'
    );


    localStream
        .getAudioTracks()
        .forEach(track => {

            console.log(
                'Audio track aktif:',
                track.enabled,
                track.readyState
            );

        });

}


// ==========================================
// CREATE PEER CONNECTION
// ==========================================

function createPeerConnection(
    targetSocketId,
    isCaller
) {

    console.log(
        'Create PeerConnection:',
        targetSocketId,
        'caller:',
        isCaller
    );


    // ==========================================
    // CEK EXISTING CONNECTION
    // ==========================================

    if (
        peerConnections[targetSocketId]
    ) {

        return peerConnections[targetSocketId];

    }


    // ==========================================
    // CREATE PC
    // ==========================================

    const pc =
        new RTCPeerConnection(
            rtcConfig
        );


    peerConnections[targetSocketId] =
        pc;


    pendingIceCandidates[targetSocketId] =
        [];


    // ==========================================
    // ADD LOCAL AUDIO
    // ==========================================

    if (localStream) {

        const audioTracks =
            localStream.getAudioTracks();


        audioTracks.forEach(
            track => {

                try {

                    pc.addTrack(
                        track,
                        localStream
                    );


                    console.log(
                        'Local audio track ditambahkan ke PeerConnection:',
                        targetSocketId
                    );

                } catch (error) {

                    console.error(
                        'Gagal addTrack:',
                        error
                    );

                }

            }
        );

    } else {

        console.warn(
            'localStream belum tersedia saat PeerConnection dibuat.'
        );

    }


    // ==========================================
    // ICE CANDIDATE
    // ==========================================

    pc.onicecandidate =
        event => {

            if (!event.candidate) {
                return;
            }


            console.log(
                'Mengirim ICE candidate:',
                targetSocketId
            );


            if (
                window.socket &&
                window.socket.connected
            ) {

                window.socket.emit(
                    'webrtc-ice-candidate',
                    {

                        target:
                            targetSocketId,

                        candidate:
                            event.candidate

                    }
                );

            }

        };


    // ==========================================
    // REMOTE AUDIO
    // ==========================================

    pc.ontrack =
        event => {

            console.log(
                'REMOTE AUDIO TRACK DITERIMA:',
                targetSocketId
            );


            let stream =
                event.streams &&
                event.streams[0];


            // ======================================
            // FALLBACK STREAM
            // ======================================

            if (!stream) {

                stream =
                    new MediaStream();

                stream.addTrack(
                    event.track
                );

            }


            // ======================================
            // FIND / CREATE AUDIO
            // ======================================

            let audioEl =
                document.getElementById(
                    `audio-${targetSocketId}`
                );


            if (!audioEl) {

                audioEl =
                    document.createElement(
                        'audio'
                    );


                audioEl.id =
                    `audio-${targetSocketId}`;


                // Mobile compatibility
                audioEl.autoplay = true;

                audioEl.playsInline = true;

                audioEl.controls = false;

                audioEl.muted = false;

                audioEl.volume = 1.0;


                audioEl.setAttribute(
                    'autoplay',
                    ''
                );

                audioEl.setAttribute(
                    'playsinline',
                    ''
                );


                if (audioContainer) {

                    audioContainer.appendChild(
                        audioEl
                    );

                } else {

                    document.body.appendChild(
                        audioEl
                    );

                }

            }


            // ======================================
            // SET STREAM
            // ======================================

            audioEl.srcObject =
                stream;


            audioEl.muted =
                false;

            audioEl.volume =
                1.0;


            // ======================================
            // TRY PLAY
            // ======================================

            const playAudio =
                async () => {

                    try {

                        await audioEl.play();

                        console.log(
                            'Remote audio PLAYING:',
                            targetSocketId
                        );

                    } catch (error) {

                        console.warn(
                            'Autoplay audio ditolak browser:',
                            error
                        );


                        // Simpan fungsi untuk
                        // dipanggil lagi saat user
                        // menyentuh layar.

                    }

                };


            playAudio();


            // ======================================
            // AUDIO EVENTS
            // ======================================

            audioEl.onloadedmetadata =
                () => {

                    console.log(
                        'Audio metadata siap:',
                        targetSocketId
                    );

                    playAudio();

                };


            audioEl.oncanplay =
                () => {

                    console.log(
                        'Audio siap dimainkan:',
                        targetSocketId
                    );

                    playAudio();

                };


            // ======================================
            // TRACK EVENTS
            // ======================================

            event.track.onunmute =
                () => {

                    console.log(
                        'Remote audio track UNMUTED:',
                        targetSocketId
                    );

                    playAudio();

                };


            event.track.onmute =
                () => {

                    console.log(
                        'Remote audio track MUTED:',
                        targetSocketId
                    );

                };

        };


    // ==========================================
    // CONNECTION STATE
    // ==========================================

    pc.onconnectionstatechange =
        () => {

            console.log(
                'WebRTC connection:',
                targetSocketId,
                pc.connectionState
            );


            if (
                pc.connectionState ===
                'connected'
            ) {

                console.log(
                    '🎙️ AUDIO CONNECTION BERHASIL:',
                    targetSocketId
                );

            }


            if (
                pc.connectionState ===
                'failed'
            ) {

                console.error(
                    'WebRTC connection FAILED:',
                    targetSocketId
                );

            }


            if (
                pc.connectionState ===
                'disconnected'
            ) {

                console.warn(
                    'WebRTC disconnected:',
                    targetSocketId
                );

            }

        };


    // ==========================================
    // ICE CONNECTION STATE
    // ==========================================

    pc.oniceconnectionstatechange =
        () => {

            console.log(
                'ICE state:',
                targetSocketId,
                pc.iceConnectionState
            );

        };


    // ==========================================
    // ICE GATHERING
    // ==========================================

    pc.onicegatheringstatechange =
        () => {

            console.log(
                'ICE gathering:',
                targetSocketId,
                pc.iceGatheringState
            );

        };


    // ==========================================
    // SIGNALING STATE
    // ==========================================

    pc.onsignalingstatechange =
        () => {

            console.log(
                'Signaling state:',
                targetSocketId,
                pc.signalingState
            );

        };


    // ==========================================
    // CALLER
    // ==========================================

    if (isCaller) {

        createOffer(
            pc,
            targetSocketId
        );

    }


    return pc;

}


// ==========================================
// CREATE OFFER
// ==========================================

async function createOffer(
    pc,
    targetSocketId
) {

    try {

        console.log(
            'Membuat WebRTC offer:',
            targetSocketId
        );


        const offer =
            await pc.createOffer({

                offerToReceiveAudio: true

            });


        await pc.setLocalDescription(
            offer
        );


        console.log(
            'Mengirim WebRTC offer:',
            targetSocketId
        );


        window.socket.emit(
            'webrtc-offer',
            {

                target:
                    targetSocketId,

                sdp:
                    pc.localDescription

            }
        );


    } catch (error) {

        console.error(
            'Error membuat offer:',
            error
        );

    }

}


// ==========================================
// HANDLE WEBRTC OFFER
// ==========================================

async function handleWebRTCOffer(callerId, sdp) {

    try {

        console.log(
            'WebRTC offer diterima dari:',
            callerId
        );

        console.log(
            'SDP OFFER mentah:',
            sdp
        );

        const pc =
            createPeerConnection(
                callerId,
                false
            );


        // ======================================
        // NORMALISASI SDP OFFER
        // ======================================

        let remoteOffer;

        if (typeof sdp === 'string') {

            remoteOffer = {
                type: 'offer',
                sdp: sdp
            };

        } else {

            remoteOffer = {
                type: sdp?.type || 'offer',
                sdp: sdp?.sdp || ''
            };

        }


        console.log(
            'SDP OFFER setelah normalisasi:',
            remoteOffer
        );


        // ======================================
        // VALIDASI
        // ======================================

        if (
            !remoteOffer.sdp ||
            typeof remoteOffer.sdp !== 'string'
        ) {

            console.error(
                '❌ SDP OFFER KOSONG / TIDAK VALID:',
                remoteOffer
            );

            return;
        }


        // ======================================
        // SET REMOTE DESCRIPTION
        // ======================================

        await pc.setRemoteDescription(
            remoteOffer
        );


        console.log(
            '✅ Remote description berhasil:',
            callerId
        );


        // ======================================
        // ADD PENDING ICE
        // ======================================

        await flushPendingIceCandidates(
            callerId
        );


        // ======================================
        // CREATE ANSWER
        // ======================================

        const answer =
            await pc.createAnswer();


        await pc.setLocalDescription(
            answer
        );


        console.log(
            'Mengirim WebRTC answer:',
            callerId
        );


        // ======================================
        // KIRIM SDP DALAM OBJECT BIASA
        // ======================================

        window.socket.emit(
            'webrtc-answer',
            {

                target:
                    callerId,

                sdp: {

                    type:
                        pc.localDescription.type,

                    sdp:
                        pc.localDescription.sdp

                }

            }
        );


    } catch (error) {

        console.error(
            '❌ Error handling WebRTC offer:',
            error
        );

    }

}


// ==========================================
// HANDLE WEBRTC ANSWER
// ==========================================

async function handleWebRTCAnswer(
    calleeId,
    sdp
) {

    try {

        console.log(
            'WebRTC answer diterima dari:',
            calleeId
        );


        const pc =
            peerConnections[calleeId];


        if (!pc) {

            console.warn(
                'PeerConnection tidak ditemukan untuk answer:',
                calleeId
            );

            return;

        }


        await pc.setRemoteDescription(
            new RTCSessionDescription(
                sdp
            )
        );


        console.log(
            'Remote answer berhasil:',
            calleeId
        );


        await flushPendingIceCandidates(
            calleeId
        );


    } catch (error) {

        console.error(
            'Error setting remote answer:',
            error
        );

    }

}


// ==========================================
// HANDLE ICE CANDIDATE
// ==========================================

async function handleNewICECandidate(
    senderId,
    candidate
) {

    try {

        if (!candidate) {
            return;
        }


        const pc =
            peerConnections[senderId];


        // ======================================
        // PC BELUM SIAP
        // ======================================

        if (!pc) {

            console.log(
                'ICE datang sebelum PeerConnection siap. Disimpan:',
                senderId
            );


            if (
                !pendingIceCandidates[senderId]
            ) {

                pendingIceCandidates[senderId] =
                    [];

            }


            pendingIceCandidates[senderId]
                .push(candidate);


            return;

        }


        // ======================================
        // REMOTE DESCRIPTION BELUM SIAP
        // ======================================

        if (
            !pc.remoteDescription ||
            !pc.remoteDescription.type
        ) {

            console.log(
                'Remote description belum siap. ICE disimpan:',
                senderId
            );


            if (
                !pendingIceCandidates[senderId]
            ) {

                pendingIceCandidates[senderId] =
                    [];

            }


            pendingIceCandidates[senderId]
                .push(candidate);


            return;

        }


        // ======================================
        // ADD ICE
        // ======================================

        await pc.addIceCandidate(
            new RTCIceCandidate(
                candidate
            )
        );


        console.log(
            'ICE candidate berhasil ditambahkan:',
            senderId
        );


    } catch (error) {

        console.error(
            'Error adding ICE candidate:',
            error
        );

    }

}


// ==========================================
// FLUSH PENDING ICE
// ==========================================

async function flushPendingIceCandidates(
    socketId
) {

    const pc =
        peerConnections[socketId];


    if (!pc) {
        return;
    }


    if (
        !pc.remoteDescription ||
        !pc.remoteDescription.type
    ) {
        return;
    }


    const candidates =
        pendingIceCandidates[socketId] || [];


    if (!candidates.length) {
        return;
    }


    console.log(
        `Menambahkan ${candidates.length} ICE candidate tertunda untuk ${socketId}`
    );


    pendingIceCandidates[socketId] =
        [];


    for (
        const candidate of candidates
    ) {

        try {

            await pc.addIceCandidate(
                new RTCIceCandidate(
                    candidate
                )
            );

        } catch (error) {

            console.error(
                'Gagal menambahkan pending ICE:',
                error
            );

        }

    }

}


// ==========================================
// CLOSE PEER
// ==========================================

function closePeerConnection(
    targetSocketId
) {

    const pc =
        peerConnections[targetSocketId];


    if (pc) {

        try {

            pc.ontrack = null;

            pc.onicecandidate = null;

            pc.close();

        } catch (error) {

            console.warn(
                'Error closing PeerConnection:',
                error
            );

        }


        delete peerConnections[
            targetSocketId
        ];

    }


    delete pendingIceCandidates[
        targetSocketId
    ];


    // ==========================================
    // REMOVE AUDIO
    // ==========================================

    const audioEl =
        document.getElementById(
            `audio-${targetSocketId}`
        );


    if (audioEl) {

        try {

            audioEl.pause();

        } catch (error) {
            // Ignore
        }


        audioEl.srcObject = null;

        audioEl.remove();

    }

}


// ==========================================
// CLOSE ALL PEERS
// ==========================================

function closeAllPeerConnections() {

    Object.keys(
        peerConnections
    ).forEach(
        socketId => {

            closePeerConnection(
                socketId
            );

        }
    );

}


// ==========================================
// UNLOCK REMOTE AUDIO
// ==========================================
//
// Browser HP terkadang membutuhkan interaksi
// pengguna sebelum audio remote boleh dimainkan.
//

async function unlockRemoteAudio() {

    const audioElements =
        document.querySelectorAll(
            'audio[id^="audio-"]'
        );


    for (
        const audioEl of audioElements
    ) {

        try {

            audioEl.muted = false;

            audioEl.volume = 1.0;

            await audioEl.play();

            console.log(
                'Remote audio unlocked:',
                audioEl.id
            );

        } catch (error) {

            console.warn(
                'Tidak dapat unlock audio:',
                audioEl.id,
                error
            );

        }

    }

}


// ==========================================
// UNLOCK AUDIO SAAT USER MENYENTUH LAYAR
// ==========================================

document.addEventListener(
    'pointerdown',
    () => {

        unlockRemoteAudio();

    },
    {
        passive: true
    }
);


// ==========================================
// DEBUG GLOBAL
// ==========================================

window.getWebRTCDebug =
    function () {

        const result = {};


        Object.keys(
            peerConnections
        ).forEach(
            id => {

                const pc =
                    peerConnections[id];


                result[id] = {

                    connectionState:
                        pc.connectionState,

                    iceConnectionState:
                        pc.iceConnectionState,

                    iceGatheringState:
                        pc.iceGatheringState,

                    signalingState:
                        pc.signalingState,

                    remoteDescription:
                        !!pc.remoteDescription,

                    localDescription:
                        !!pc.localDescription

                };

            }
        );


        console.table(result);

        return result;

    };


// ==========================================
// EXPORT TO WINDOW
// ==========================================

window.initLocalAudio =
    initLocalAudio;

window.muteMic =
    muteMic;

window.unmuteMic =
    unmuteMic;

window.createPeerConnection =
    createPeerConnection;

window.handleWebRTCOffer =
    handleWebRTCOffer;

window.handleWebRTCAnswer =
    handleWebRTCAnswer;

window.handleNewICECandidate =
    handleNewICECandidate;

window.closePeerConnection =
    closePeerConnection;

window.closeAllPeerConnections =
    closeAllPeerConnections;

window.unlockRemoteAudio =
    unlockRemoteAudio;


// ==========================================
// READY
// ==========================================

console.log(
    'WebRTC audio engine loaded.'
);