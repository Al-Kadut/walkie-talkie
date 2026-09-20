// ==========================================
// WALKIE TALKIE - WEBRTC AUDIO ENGINE
// Firebase Signaling
// ==========================================

const peerConnections = {};
const pendingIceCandidates = {};

let localStream = null;


// ==========================================
// RTC CONFIG
// ==========================================

const rtcConfig = {

    iceServers: [

        {
            urls: 'stun:stun.l.google.com:19302'
        },

        {
            urls: 'stun:global.stun.twilio.com:3478'
        },

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

        if (
            !navigator.mediaDevices ||
            !navigator.mediaDevices.getUserMedia
        ) {

            console.error(
                'Browser tidak mendukung microphone.'
            );

            return false;
        }


        console.log(
            '🎙️ Meminta izin microphone...'
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


        // Simpan juga ke window
        window.localStream =
            localStream;


        console.log(
            '✅ Microphone berhasil aktif.'
        );


        // Mute awal
        muteMic();


        localStream
            .getAudioTracks()
            .forEach(track => {

                console.log(
                    '🎤 Local audio track:',
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
            '❌ Error microphone:',
            error
        );


        if (
            error.name ===
            'NotAllowedError'
        ) {

            alert(
                'Izin microphone ditolak. Izinkan microphone pada browser.'
            );

        }


        if (
            error.name ===
            'NotFoundError'
        ) {

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
        '🎙️ Microphone: MUTED'
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
        '🎙️ Microphone: UNMUTED'
    );


    localStream
        .getAudioTracks()
        .forEach(track => {

            console.log(
                'Audio track:',
                {
                    enabled: track.enabled,
                    muted: track.muted,
                    readyState: track.readyState
                }
            );

        });

}


// ==========================================
// ADD LOCAL TRACKS
// ==========================================

function addLocalTracksToPeer(pc) {

    if (!localStream) {

        console.warn(
            'localStream belum tersedia.'
        );

        return;

    }


    const tracks =
        localStream.getAudioTracks();


    tracks.forEach(track => {

        try {

            const alreadyAdded =
                pc.getSenders()
                    .some(
                        sender =>
                            sender.track &&
                            sender.track.id ===
                            track.id
                    );


            if (alreadyAdded) {

                return;

            }


            pc.addTrack(
                track,
                localStream
            );


            console.log(
                '✅ Local audio track ditambahkan ke PeerConnection.'
            );


        } catch (error) {

            console.error(
                '❌ Gagal addTrack:',
                error
            );

        }

    });

}


// ==========================================
// CREATE PEER CONNECTION
// ==========================================

function createPeerConnection(
    targetSocketId,
    isCaller = false
) {

    console.log(
        '🔗 Create PeerConnection:',
        targetSocketId,
        'caller:',
        isCaller
    );


    // ======================================
    // EXISTING CONNECTION
    // ======================================

    if (
        peerConnections[targetSocketId]
    ) {

        const existing =
            peerConnections[targetSocketId];


        addLocalTracksToPeer(
            existing
        );


        return existing;

    }


    // ======================================
    // CREATE
    // ======================================

    const pc =
        new RTCPeerConnection(
            rtcConfig
        );


    peerConnections[targetSocketId] =
        pc;


    pendingIceCandidates[targetSocketId] =
        [];


    // ======================================
    // LOCAL AUDIO
    // ======================================

    addLocalTracksToPeer(
        pc
    );


    // ======================================
    // RECEIVE AUDIO
    // ======================================

    pc.addTransceiver(
        'audio',
        {
            direction: 'sendrecv'
        }
    );


    // ======================================
    // ICE CANDIDATE
    // ======================================

    pc.onicecandidate =
        event => {

            if (
                !event.candidate
            ) {

                return;

            }


            console.log(
                '🧊 Mengirim ICE candidate:',
                targetSocketId
            );


            let candidate;


            try {

                if (
                    typeof event.candidate.toJSON ===
                    'function'
                ) {

                    candidate =
                        event.candidate.toJSON();

                } else {

                    candidate = {

                        candidate:
                            event.candidate.candidate,

                        sdpMid:
                            event.candidate.sdpMid,

                        sdpMLineIndex:
                            event.candidate.sdpMLineIndex,

                        usernameFragment:
                            event.candidate.usernameFragment

                    };

                }

            } catch (error) {

                console.error(
                    'Gagal membuat ICE JSON:',
                    error
                );

                return;

            }


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
                            candidate

                    }
                );

            }

        };


    // ======================================
    // REMOTE AUDIO
    // ======================================

    pc.ontrack =
        event => {

            console.log(
                '🔊 REMOTE AUDIO TRACK DITERIMA:',
                targetSocketId
            );


            let stream =
                event.streams &&
                event.streams[0];


            if (!stream) {

                stream =
                    new MediaStream();

                stream.addTrack(
                    event.track
                );

            }


            // ==================================
            // AUDIO ELEMENT
            // ==================================

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


                audioEl.autoplay =
                    true;

                audioEl.playsInline =
                    true;

                audioEl.controls =
                    false;

                audioEl.muted =
                    false;

                audioEl.volume =
                    1.0;


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


            // ==================================
            // SET STREAM
            // ==================================

            audioEl.srcObject =
                stream;


            audioEl.muted =
                false;

            audioEl.volume =
                1.0;


            // ==================================
            // PLAY
            // ==================================

            const playAudio =
                async () => {

                    try {

                        audioEl.muted =
                            false;

                        audioEl.volume =
                            1.0;


                        await audioEl.play();


                        console.log(
                            '🔊 REMOTE AUDIO PLAYING:',
                            targetSocketId
                        );


                    } catch (error) {

                        console.warn(
                            '⚠️ Autoplay ditolak:',
                            error
                        );

                    }

                };


            playAudio();


            // ==================================
            // AUDIO EVENTS
            // ==================================

            audioEl.onloadedmetadata =
                () => {

                    console.log(
                        '🔊 Audio metadata siap:',
                        targetSocketId
                    );

                    playAudio();

                };


            audioEl.oncanplay =
                () => {

                    console.log(
                        '🔊 Audio siap dimainkan:',
                        targetSocketId
                    );

                    playAudio();

                };


            audioEl.onplaying =
                () => {

                    console.log(
                        '🔊 Audio benar-benar PLAYING:',
                        targetSocketId
                    );

                };


            // ==================================
            // TRACK EVENTS
            // ==================================

            event.track.onunmute =
                () => {

                    console.log(
                        '🔊 Remote track UNMUTED:',
                        targetSocketId
                    );

                    playAudio();

                };


            event.track.onmute =
                () => {

                    console.log(
                        '🔇 Remote track MUTED:',
                        targetSocketId
                    );

                };


            event.track.onended =
                () => {

                    console.log(
                        '⛔ Remote track ENDED:',
                        targetSocketId
                    );

                };

        };


    // ======================================
    // CONNECTION STATE
    // ======================================

    pc.onconnectionstatechange =
        () => {

            console.log(
                '🌐 WebRTC connection:',
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
                    '❌ WebRTC connection FAILED:',
                    targetSocketId
                );

            }


            if (
                pc.connectionState ===
                'disconnected'
            ) {

                console.warn(
                    '⚠️ WebRTC disconnected:',
                    targetSocketId
                );

            }

        };


    // ======================================
    // ICE STATE
    // ======================================

    pc.oniceconnectionstatechange =
        () => {

            console.log(
                '🧊 ICE state:',
                targetSocketId,
                pc.iceConnectionState
            );

        };


    // ======================================
    // ICE GATHERING
    // ======================================

    pc.onicegatheringstatechange =
        () => {

            console.log(
                '🧊 ICE gathering:',
                targetSocketId,
                pc.iceGatheringState
            );

        };


    // ======================================
    // SIGNALING STATE
    // ======================================

    pc.onsignalingstatechange =
        () => {

            console.log(
                '📡 Signaling state:',
                targetSocketId,
                pc.signalingState
            );

        };


    // ======================================
    // CALLER
    // ======================================

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
            '📤 Membuat WebRTC offer:',
            targetSocketId
        );


        const offer =
            await pc.createOffer();


        await pc.setLocalDescription(
            offer
        );


        const offerData = {

            type:
                pc.localDescription.type,

            sdp:
                pc.localDescription.sdp

        };


        console.log(
            '📤 SDP OFFER:',
            offerData
        );


        window.socket.emit(
            'webrtc-offer',
            {

                target:
                    targetSocketId,

                sdp:
                    offerData

            }
        );


        console.log(
            '✅ WebRTC offer dikirim:',
            targetSocketId
        );


    } catch (error) {

        console.error(
            '❌ Error membuat offer:',
            error
        );

    }

}


// ==========================================
// HANDLE OFFER
// ==========================================

async function handleWebRTCOffer(
    callerId,
    sdp
) {

    try {

        console.log(
            '📥 WebRTC offer diterima dari:',
            callerId
        );


        console.log(
            '📥 SDP OFFER:',
            sdp
        );


        if (
            !sdp
        ) {

            throw new Error(
                'SDP offer kosong.'
            );

        }


        let remoteOffer;


        if (
            typeof sdp ===
            'string'
        ) {

            remoteOffer = {

                type:
                    'offer',

                sdp:
                    sdp

            };

        } else {

            remoteOffer = {

                type:
                    sdp.type ||
                    'offer',

                sdp:
                    sdp.sdp ||
                    ''

            };

        }


        if (
            !remoteOffer.sdp
        ) {

            throw new Error(
                'SDP offer tidak memiliki sdp.'
            );

        }


        console.log(
            '📥 Remote offer normalized:',
            remoteOffer
        );


        const pc =
            createPeerConnection(
                callerId,
                false
            );


        // ======================================
        // HANDLE GLARE
        // ======================================

        if (
            pc.signalingState ===
            'have-local-offer'
        ) {

            console.warn(
                '⚠️ Offer collision. Rollback local offer.'
            );


            await pc.setLocalDescription(
                {
                    type:
                        'rollback'
                }
            );

        }


        // ======================================
        // SET REMOTE OFFER
        // ======================================

        await pc.setRemoteDescription(
            remoteOffer
        );


        console.log(
            '✅ Remote description berhasil:',
            callerId
        );


        // ======================================
        // PENDING ICE
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


        const answerData = {

            type:
                pc.localDescription.type,

            sdp:
                pc.localDescription.sdp

        };


        console.log(
            '📤 SDP ANSWER:',
            answerData
        );


        // ======================================
        // SEND ANSWER
        // ======================================

        window.socket.emit(
            'webrtc-answer',
            {

                target:
                    callerId,

                sdp:
                    answerData

            }
        );


        console.log(
            '✅ WebRTC answer dikirim:',
            callerId
        );


    } catch (error) {

        console.error(
            '❌ Error handling WebRTC offer:',
            error
        );

    }

}


// ==========================================
// HANDLE ANSWER
// ==========================================

async function handleWebRTCAnswer(
    calleeId,
    sdp
) {

    try {

        console.log(
            '📥 WebRTC answer diterima dari:',
            calleeId
        );


        console.log(
            '📥 SDP ANSWER:',
            sdp
        );


        const pc =
            peerConnections[calleeId];


        if (!pc) {

            console.warn(
                'PeerConnection tidak ditemukan:',
                calleeId
            );

            return;

        }


        if (!sdp) {

            throw new Error(
                'SDP answer kosong.'
            );

        }


        let remoteAnswer;


        if (
            typeof sdp ===
            'string'
        ) {

            remoteAnswer = {

                type:
                    'answer',

                sdp:
                    sdp

            };

        } else {

            remoteAnswer = {

                type:
                    sdp.type ||
                    'answer',

                sdp:
                    sdp.sdp ||
                    ''

            };

        }


        if (
            !remoteAnswer.sdp
        ) {

            throw new Error(
                'SDP answer tidak memiliki sdp.'
            );

        }


        console.log(
            '📥 Remote answer normalized:',
            remoteAnswer
        );


        await pc.setRemoteDescription(
            remoteAnswer
        );


        console.log(
            '✅ Remote answer berhasil:',
            calleeId
        );


        await flushPendingIceCandidates(
            calleeId
        );


    } catch (error) {

        console.error(
            '❌ Error setting remote answer:',
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

        if (
            !candidate
        ) {

            return;

        }


        let normalizedCandidate;


        if (
            typeof candidate ===
            'string'
        ) {

            normalizedCandidate = {

                candidate:
                    candidate

            };

        } else {

            normalizedCandidate = {

                candidate:
                    candidate.candidate,

                sdpMid:
                    candidate.sdpMid ??
                    null,

                sdpMLineIndex:
                    candidate.sdpMLineIndex ??
                    null,

                usernameFragment:
                    candidate.usernameFragment ??
                    null

            };

        }


        if (
            !normalizedCandidate.candidate
        ) {

            console.warn(
                'ICE candidate kosong.'
            );

            return;

        }


        const pc =
            peerConnections[senderId];


        // ======================================
        // PC BELUM ADA
        // ======================================

        if (!pc) {

            console.log(
                '🧊 ICE datang sebelum PeerConnection. Disimpan:',
                senderId
            );


            if (
                !pendingIceCandidates[senderId]
            ) {

                pendingIceCandidates[senderId] =
                    [];

            }


            pendingIceCandidates[senderId]
                .push(
                    normalizedCandidate
                );


            return;

        }


        // ======================================
        // REMOTE SDP BELUM ADA
        // ======================================

        if (
            !pc.remoteDescription ||
            !pc.remoteDescription.type
        ) {

            console.log(
                '🧊 Remote SDP belum siap. ICE disimpan:',
                senderId
            );


            if (
                !pendingIceCandidates[senderId]
            ) {

                pendingIceCandidates[senderId] =
                    [];

            }


            pendingIceCandidates[senderId]
                .push(
                    normalizedCandidate
                );


            return;

        }


        // ======================================
        // ADD ICE
        // ======================================

        await pc.addIceCandidate(
            new RTCIceCandidate(
                normalizedCandidate
            )
        );


        console.log(
            '✅ ICE candidate berhasil ditambahkan:',
            senderId
        );


    } catch (error) {

        console.error(
            '❌ Error adding ICE candidate:',
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
        pendingIceCandidates[socketId] ||
        [];


    if (
        !candidates.length
    ) {

        return;

    }


    console.log(
        `🧊 Menambahkan ${candidates.length} pending ICE:`,
        socketId
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


            console.log(
                '✅ Pending ICE ditambahkan:',
                socketId
            );


        } catch (error) {

            console.error(
                '❌ Gagal pending ICE:',
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

            pc.ontrack =
                null;

            pc.onicecandidate =
                null;

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


    const audioEl =
        document.getElementById(
            `audio-${targetSocketId}`
        );


    if (audioEl) {

        try {

            audioEl.pause();

        } catch (error) {

        }


        audioEl.srcObject =
            null;

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

async function unlockRemoteAudio() {

    const audioElements =
        document.querySelectorAll(
            'audio[id^="audio-"]'
        );


    for (
        const audioEl of audioElements
    ) {

        try {

            audioEl.muted =
                false;

            audioEl.volume =
                1.0;


            await audioEl.play();


            console.log(
                '🔊 Remote audio unlocked:',
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
// USER INTERACTION
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
// DEBUG
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


        console.table(
            result
        );


        return result;

    };


// ==========================================
// EXPORT
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
    '✅ WebRTC audio engine loaded.'
);