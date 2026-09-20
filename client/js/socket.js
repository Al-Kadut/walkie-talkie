// ==========================================
// FIREBASE SOCKET ADAPTER
// ==========================================

import {
    ref,
    set,
    remove,
    onValue,
    onChildAdded,
    onChildRemoved,
    push,
    runTransaction,
    onDisconnect
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

import {
    database
} from "./firebase.js";


// ==========================================
// SOCKET ID
// ==========================================

const socketId =
    (
        typeof crypto !== 'undefined' &&
        typeof crypto.randomUUID === 'function'
    )
        ? crypto.randomUUID()
        : Math.random()
            .toString(36)
            .substring(2) +
        Date.now();


// ==========================================
// STATE
// ==========================================

let currentChannel = null;
let currentUsername = null;

const eventHandlers = {};

const firebaseUnsubscribers = [];


// ==========================================
// WEBRTC SIGNAL DUPLICATE PROTECTION
// ==========================================

const processedSignals = new Set();


// ==========================================
// EVENT SYSTEM
// ==========================================

function on(event, callback) {

    if (!eventHandlers[event]) {
        eventHandlers[event] = [];
    }

    eventHandlers[event].push(callback);
}


function once(event, callback) {

    const wrapper = (...args) => {

        try {
            callback(...args);
        } finally {

            const handlers =
                eventHandlers[event] || [];

            const index =
                handlers.indexOf(wrapper);

            if (index !== -1) {
                handlers.splice(index, 1);
            }

        }

    };

    on(event, wrapper);
}


function trigger(event, data) {

    const handlers =
        eventHandlers[event] || [];

    handlers.forEach(
        callback => {

            try {

                callback(data);

            } catch (error) {

                console.error(
                    `Event ${event} error:`,
                    error
                );

            }

        }
    );

}


// ==========================================
// SOCKET OBJECT
// ==========================================

window.socket = {

    id: socketId,

    connected: true,


    // ==========================================
    // ON
    // ==========================================

    on(event, callback) {

        on(
            event,
            callback
        );

    },


    // ==========================================
    // ONCE
    // ==========================================

    once(event, callback) {

        once(
            event,
            callback
        );

    },


    // ==========================================
    // EMIT
    // ==========================================

    emit(
        event,
        data,
        callback
    ) {


        // ======================================
        // JOIN
        // ======================================

        if (
            event ===
            'join-channel'
        ) {

            joinChannel(
                data,
                callback
            );

            return;
        }


        // ======================================
        // LEAVE
        // ======================================

        if (
            event ===
            'leave-channel'
        ) {

            leaveChannel();

            return;
        }


        // ======================================
        // REQUEST SPEAKING
        // ======================================

        if (
            event ===
            'request-speaking'
        ) {

            requestSpeaking(
                callback
            );

            return;
        }


        // ======================================
        // RELEASE SPEAKING
        // ======================================

        if (
            event ===
            'release-speaking'
        ) {

            releaseSpeaking();

            return;
        }


        // ======================================
        // WEBRTC OFFER
        // ======================================

        if (
            event ===
            'webrtc-offer'
        ) {

            const target =
                data?.target ||
                data?.callee ||
                data?.receiver;


            if (!target) {

                console.error(
                    'WebRTC offer: target kosong.'
                );

                return;
            }


            sendSignal(
                target,
                'offer',
                {
                    caller:
                        socketId,

                    sdp:
                        data?.sdp
                }
            );

            return;
        }


        // ======================================
        // WEBRTC ANSWER
        // ======================================

        if (
            event ===
            'webrtc-answer'
        ) {

            const target =
                data?.target ||
                data?.caller ||
                data?.receiver ||
                data?.callee;


            if (!target) {

                console.error(
                    'WebRTC answer: target kosong.'
                );

                return;
            }


            sendSignal(
                target,
                'answer',
                {
                    callee:
                        socketId,

                    sdp:
                        data?.sdp
                }
            );

            return;
        }


        // ======================================
        // ICE CANDIDATE
        // ======================================

        if (
            event ===
            'webrtc-ice-candidate'
        ) {

            const target =
                data?.target ||
                data?.callee ||
                data?.receiver ||
                data?.caller;


            if (!target) {

                console.error(
                    'WebRTC ICE: target kosong.'
                );

                return;
            }


            sendSignal(
                target,
                'ice',
                {
                    sender:
                        socketId,

                    candidate:
                        data?.candidate
                }
            );

            return;
        }


        console.warn(
            'Socket event tidak dikenal:',
            event
        );

    },


    // ==========================================
    // CONNECT
    // ==========================================

    connect() {

        this.connected = true;

        trigger(
            'connect'
        );

    },


    // ==========================================
    // DISCONNECT
    // ==========================================

    disconnect() {

        leaveChannel();

        this.connected = false;

        trigger(
            'disconnect'
        );

    }

};


// ==========================================
// JOIN CHANNEL
// ==========================================

async function joinChannel(
    data,
    callback
) {

    try {

        // ======================================
        // VALIDASI
        // ======================================

        if (
            !data ||
            !data.channelCode ||
            !data.username
        ) {

            if (callback) {

                callback({

                    success: false,

                    message:
                        'Channel dan username wajib diisi.'

                });

            }

            return;
        }


        // ======================================
        // SAVE CHANNEL
        // ======================================

        currentChannel =
            String(
                data.channelCode
            )
                .trim()
                .toUpperCase();


        currentUsername =
            String(
                data.username
            )
                .trim();


        // ======================================
        // RESET SIGNAL CACHE
        // ======================================

        processedSignals.clear();


        // ======================================
        // USERS REF
        // ======================================

        const usersRef =
            ref(
                database,
                `rooms/${currentChannel}/users`
            );


        // ======================================
        // CURRENT USER REF
        // ======================================

        const userRef =
            ref(
                database,
                `rooms/${currentChannel}/users/${socketId}`
            );


        // ======================================
        // USER DATA
        // ======================================

        await set(
            userRef,
            {

                socketId:
                    socketId,

                username:
                    currentUsername,

                joinedAt:
                    Date.now()

            }
        );


        // ======================================
        // AUTO DELETE
        // ======================================

        await onDisconnect(
            userRef
        ).remove();


        // ======================================
        // GET EXISTING USERS
        // ======================================

        const snapshot =
            await getOnce(
                usersRef
            );


        const users = [];


        snapshot.forEach(
            child => {

                const user =
                    child.val();


                if (!user) {
                    return;
                }


                users.push({

                    socketId:
                        child.key,

                    username:
                        user.username

                });

            }
        );


        // ======================================
        // USER JOINED
        // ======================================

        const unsubscribeAdded =
            onChildAdded(
                usersRef,
                snapshot => {

                    // Jangan proses diri sendiri.
                    if (
                        snapshot.key ===
                        socketId
                    ) {

                        return;
                    }


                    const user =
                        snapshot.val();


                    if (!user) {
                        return;
                    }


                    const userData = {

                        socketId:
                            snapshot.key,

                        username:
                            user.username

                    };


                    // ======================================
                    // UI USER
                    // ======================================

                    if (
                        typeof window.uiAddUser ===
                        'function'
                    ) {

                        window.uiAddUser(
                            userData
                        );

                    }


                    // ======================================
                    // WEBRTC
                    //
                    // User lama menjadi caller
                    // ketika user baru masuk.
                    // ======================================

                    if (
                        typeof window.createPeerConnection ===
                        'function'
                    ) {

                        try {

                            window.createPeerConnection(
                                snapshot.key,
                                true
                            );

                        } catch (error) {

                            console.error(
                                'Gagal membuat PeerConnection:',
                                error
                            );

                        }

                    }


                    trigger(
                        'user-joined',
                        userData
                    );

                }
            );


        firebaseUnsubscribers.push(
            unsubscribeAdded
        );


        // ======================================
        // USER LEFT
        // ======================================

        const unsubscribeRemoved =
            onChildRemoved(
                usersRef,
                snapshot => {

                    const leftId =
                        snapshot.key;


                    // ======================================
                    // UI
                    // ======================================

                    if (
                        typeof window.uiRemoveUser ===
                        'function'
                    ) {

                        window.uiRemoveUser(
                            leftId
                        );

                    }


                    // ======================================
                    // WEBRTC CLOSE
                    // ======================================

                    if (
                        typeof window.closePeerConnection ===
                        'function'
                    ) {

                        try {

                            window.closePeerConnection(
                                leftId
                            );

                        } catch (error) {

                            console.error(
                                'Gagal menutup PeerConnection:',
                                error
                            );

                        }

                    }


                    trigger(
                        'user-left',
                        {
                            socketId:
                                leftId
                        }
                    );

                }
            );


        firebaseUnsubscribers.push(
            unsubscribeRemoved
        );


        // ======================================
        // WEBRTC SIGNALS
        // ======================================

        listenSignals();


        // ======================================
        // SPEAKER
        // ======================================

        listenSpeaker();


        // ======================================
        // CONNECTION
        // ======================================

        updateConnectionStatus(
            'Connected',
            'green'
        );


        console.log(
            'Firebase connected:',
            socketId
        );


        console.log(
            'Joined channel:',
            currentChannel
        );


        // ======================================
        // CALLBACK
        // ======================================

        if (callback) {

            callback({

                success:
                    true,

                users:
                    users,

                currentUser: {

                    socketId:
                        socketId,

                    username:
                        currentUsername

                }

            });

        }

    } catch (error) {

        console.error(
            'Firebase join error:',
            error
        );


        if (callback) {

            callback({

                success:
                    false,

                message:
                    error.message

            });

        }

    }

}


// ==========================================
// GET ONCE
// ==========================================

function getOnce(
    databaseRef
) {

    return new Promise(
        resolve => {

            onValue(
                databaseRef,
                snapshot => {

                    resolve(
                        snapshot
                    );

                },
                {
                    onlyOnce:
                        true
                }
            );

        }
    );

}


// ==========================================
// SEND WEBRTC SIGNAL
// ==========================================

async function sendSignal(
    targetId,
    type,
    data
) {

    if (
        !currentChannel ||
        !targetId
    ) {

        console.warn(
            'Signal dibatalkan: channel atau target kosong.'
        );

        return;
    }


    if (
        !data
    ) {

        console.warn(
            'Signal dibatalkan: data kosong.'
        );

        return;
    }


    const signalRef =
        ref(
            database,
            `rooms/${currentChannel}/signals/${targetId}`
        );


    const newSignal =
        push(
            signalRef
        );


    try {

        await set(
            newSignal,
            {

                type:
                    type,

                data:
                    data,

                sender:
                    socketId,

                createdAt:
                    Date.now()

            }
        );


        console.log(
            `WebRTC signal terkirim: ${type}`,
            {
                from:
                    socketId,

                to:
                    targetId
            }
        );

    } catch (error) {

        console.error(
            'Gagal mengirim WebRTC signal:',
            error
        );

    }

}


// ==========================================
// LISTEN WEBRTC SIGNALS
// ==========================================

function listenSignals() {

    if (!currentChannel) {
        return;
    }


    const signalsRef =
        ref(
            database,
            `rooms/${currentChannel}/signals/${socketId}`
        );


    const unsubscribe =
        onChildAdded(
            signalsRef,
            async snapshot => {

                const signal =
                    snapshot.val();


                if (!signal) {
                    return;
                }


                const signalId =
                    snapshot.key;


                // ======================================
                // ANTI DUPLICATE
                // ======================================

                if (
                    processedSignals.has(
                        signalId
                    )
                ) {

                    return;
                }


                processedSignals.add(
                    signalId
                );


                try {

                    // ======================================
                    // OFFER
                    // ======================================

                    if (
                        signal.type ===
                        'offer'
                    ) {

                        console.log(
                            '📥 WebRTC OFFER diterima:',
                            signal.sender
                        );


                        if (
                            typeof window.handleWebRTCOffer ===
                            'function'
                        ) {

                            // PENTING:
                            // tunggu sampai handler selesai
                            // sebelum signal dihapus.

                            await window.handleWebRTCOffer(

                                signal.data?.caller ||
                                signal.sender,

                                signal.data?.sdp

                            );

                        }

                    }


                    // ======================================
                    // ANSWER
                    // ======================================

                    else if (
                        signal.type ===
                        'answer'
                    ) {

                        console.log(
                            '📥 WebRTC ANSWER diterima:',
                            signal.sender
                        );


                        if (
                            typeof window.handleWebRTCAnswer ===
                            'function'
                        ) {

                            await window.handleWebRTCAnswer(

                                signal.data?.callee ||
                                signal.sender,

                                signal.data?.sdp

                            );

                        }

                    }


                    // ======================================
                    // ICE
                    // ======================================

                    else if (
                        signal.type ===
                        'ice'
                    ) {

                        console.log(
                            '📥 WebRTC ICE diterima:',
                            signal.sender
                        );


                        if (
                            typeof window.handleNewICECandidate ===
                            'function'
                        ) {

                            await window.handleNewICECandidate(

                                signal.data?.sender ||
                                signal.sender,

                                signal.data?.candidate

                            );

                        }

                    }


                    else {

                        console.warn(
                            'Signal WebRTC tidak dikenal:',
                            signal.type
                        );

                    }


                    // ======================================
                    // DELETE SIGNAL
                    //
                    // Hanya setelah signal selesai diproses.
                    // ======================================

                    try {

                        await remove(
                            snapshot.ref
                        );


                        console.log(
                            `Signal ${signal.type} selesai diproses dan dihapus.`
                        );

                    } catch (error) {

                        console.error(
                            'Signal delete error:',
                            error
                        );

                    }

                } catch (error) {

                    console.error(
                        'Signal processing error:',
                        error
                    );

                    // Kalau gagal diproses,
                    // JANGAN langsung menghapus signal.
                    // WebRTC masih bisa mencoba memprosesnya
                    // setelah koneksi siap.

                    processedSignals.delete(
                        signalId
                    );

                }

            }
        );


    firebaseUnsubscribers.push(
        unsubscribe
    );

}


// ==========================================
// REQUEST SPEAKING
// ==========================================

async function requestSpeaking(
    callback
) {

    if (!currentChannel) {

        if (callback) {

            callback({

                success:
                    false,

                message:
                    'Belum masuk channel.'

            });

        }

        return;
    }


    const speakerRef =
        ref(
            database,
            `rooms/${currentChannel}/speaking`
        );


    try {

        const result =
            await runTransaction(
                speakerRef,
                currentSpeaker => {

                    // ==================================
                    // CHANNEL KOSONG
                    // ==================================

                    if (
                        currentSpeaker ===
                        null
                    ) {

                        return {

                            socketId:
                                socketId,

                            username:
                                currentUsername,

                            startedAt:
                                Date.now()

                        };

                    }


                    // ==================================
                    // SUDAH DIMILIKI SENDIRI
                    // ==================================

                    if (
                        currentSpeaker &&
                        currentSpeaker.socketId ===
                        socketId
                    ) {

                        return currentSpeaker;

                    }


                    // ==================================
                    // ORANG LAIN SEDANG BICARA
                    // ==================================

                    return;

                }
            );


        const success =
            result.committed &&
            result.snapshot.exists() &&
            result.snapshot.val()?.socketId ===
            socketId;


        if (callback) {

            callback({

                success:
                    success

            });

        }

    } catch (error) {

        console.error(
            'Request speaking error:',
            error
        );


        if (callback) {

            callback({

                success:
                    false,

                message:
                    error.message

            });

        }

    }

}


// ==========================================
// RELEASE SPEAKING
// ==========================================

async function releaseSpeaking() {

    if (!currentChannel) {
        return;
    }


    const speakerRef =
        ref(
            database,
            `rooms/${currentChannel}/speaking`
        );


    try {

        const snapshot =
            await getOnce(
                speakerRef
            );


        const speaker =
            snapshot.val();


        if (
            speaker &&
            speaker.socketId ===
            socketId
        ) {

            await remove(
                speakerRef
            );


            console.log(
                'Speaking lock dilepas.'
            );

        }

    } catch (error) {

        console.error(
            'Release speaking error:',
            error
        );

    }

}


// ==========================================
// LISTEN SPEAKER
// ==========================================

function listenSpeaker() {

    if (!currentChannel) {
        return;
    }


    const speakerRef =
        ref(
            database,
            `rooms/${currentChannel}/speaking`
        );


    const unsubscribe =
        onValue(
            speakerRef,
            snapshot => {

                const speaker =
                    snapshot.val();


                // ======================================
                // TIDAK ADA SPEAKER
                // ======================================

                if (!speaker) {

                    if (
                        typeof window.uiClearSpeaker ===
                        'function'
                    ) {

                        window.uiClearSpeaker(
                            null
                        );

                    }


                    trigger(
                        'speaking-stop',
                        {
                            socketId:
                                null
                        }
                    );


                    return;
                }


                // ======================================
                // DIRI SENDIRI
                // ======================================

                if (
                    speaker.socketId ===
                    socketId
                ) {

                    return;
                }


                // ======================================
                // USER LAIN
                // ======================================

                if (
                    typeof window.uiSetSpeaker ===
                    'function'
                ) {

                    window.uiSetSpeaker(

                        speaker.socketId,

                        speaker.username

                    );

                }


                trigger(
                    'speaking-start',
                    {

                        socketId:
                            speaker.socketId,

                        username:
                            speaker.username

                    }
                );

            }
        );


    firebaseUnsubscribers.push(
        unsubscribe
    );

}


// ==========================================
// LEAVE CHANNEL
// ==========================================

async function leaveChannel() {

    if (!currentChannel) {
        return;
    }


    const channel =
        currentChannel;


    currentChannel =
        null;


    try {

        // ======================================
        // REMOVE USER
        // ======================================

        const userRef =
            ref(
                database,
                `rooms/${channel}/users/${socketId}`
            );


        await remove(
            userRef
        );


        // ======================================
        // RELEASE SPEAKER
        // ======================================

        const speakerRef =
            ref(
                database,
                `rooms/${channel}/speaking`
            );


        const speakerSnapshot =
            await getOnce(
                speakerRef
            );


        const speaker =
            speakerSnapshot.val();


        if (
            speaker &&
            speaker.socketId ===
            socketId
        ) {

            await remove(
                speakerRef
            );

        }

    } catch (error) {

        console.error(
            'Leave channel error:',
            error
        );

    }


    // ======================================
    // UNSUBSCRIBE FIREBASE
    // ======================================

    firebaseUnsubscribers.forEach(
        unsubscribe => {

            try {

                unsubscribe();

            } catch (error) {

                console.warn(
                    'Unsubscribe error:',
                    error
                );

            }

        }
    );


    firebaseUnsubscribers.length =
        0;


    // ======================================
    // RESET SIGNAL CACHE
    // ======================================

    processedSignals.clear();


    currentUsername =
        null;


    console.log(
        'Keluar dari channel:',
        channel
    );

}


// ==========================================
// UI CONNECTION
// ==========================================

function updateConnectionStatus(
    text,
    color
) {

    if (
        typeof window.updateUIConnectionStatus ===
        'function'
    ) {

        window.updateUIConnectionStatus(
            text,
            color
        );

    }

}


// ==========================================
// START
// ==========================================

window.socket.connect();


console.log(
    '=========================================='
);

console.log(
    'Firebase socket adapter loaded'
);

console.log(
    'Socket ID:',
    socketId
);

console.log(
    '=========================================='
);