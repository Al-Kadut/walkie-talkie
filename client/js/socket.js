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

        callback(...args);

        const handlers =
            eventHandlers[event] || [];

        const index =
            handlers.indexOf(wrapper);

        if (index !== -1) {
            handlers.splice(index, 1);
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


    on(event, callback) {

        on(event, callback);

    },


    once(event, callback) {

        once(event, callback);

    },


    emit(event, data, callback) {

        // ======================================
        // JOIN
        // ======================================

        if (event === 'join-channel') {

            joinChannel(
                data,
                callback
            );

            return;
        }


        // ======================================
        // LEAVE
        // ======================================

        if (event === 'leave-channel') {

            leaveChannel();

            return;
        }


        // ======================================
        // REQUEST SPEAKING
        // ======================================

        if (event === 'request-speaking') {

            requestSpeaking(
                callback
            );

            return;
        }


        // ======================================
        // RELEASE SPEAKING
        // ======================================

        if (event === 'release-speaking') {

            releaseSpeaking();

            return;
        }


        // ======================================
        // WEBRTC OFFER
        // ======================================

        if (event === 'webrtc-offer') {

            const target =
                data?.callee ||
                data?.target ||
                data?.receiver;

            sendSignal(
                target,
                'offer',
                {
                    caller: socketId,
                    sdp: data.sdp
                }
            );

            return;
        }


        // ======================================
        // WEBRTC ANSWER
        // ======================================

        if (event === 'webrtc-answer') {

            const target =
                data?.caller ||
                data?.target ||
                data?.receiver ||
                data?.callee;

            sendSignal(
                target,
                'answer',
                {
                    callee: socketId,
                    sdp: data.sdp
                }
            );

            return;
        }


        // ======================================
        // ICE
        // ======================================

        if (event === 'webrtc-ice-candidate') {

            const target =
                data?.target ||
                data?.callee ||
                data?.receiver ||
                data?.caller;

            sendSignal(
                target,
                'ice',
                {
                    sender: socketId,
                    candidate:
                        data.candidate
                }
            );

            return;
        }

    },


    connect() {

        this.connected = true;

        trigger('connect');

    },


    disconnect() {

        leaveChannel();

        this.connected = false;

        trigger('disconnect');

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

        currentChannel =
            data.channelCode;

        currentUsername =
            data.username;


        const usersRef =
            ref(
                database,
                `rooms/${currentChannel}/users`
            );


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
                socketId: socketId,
                username: currentUsername,
                joinedAt: Date.now()
            }
        );


        // ======================================
        // AUTO DELETE WHEN DISCONNECTED
        // ======================================

        await onDisconnect(
            userRef
        ).remove();


        // ======================================
        // GET USERS
        // ======================================

        const snapshot =
            await getOnce(usersRef);


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


                    if (
                        typeof window.uiAddUser ===
                        'function'
                    ) {

                        window.uiAddUser(
                            userData
                        );

                    }


                    if (
                        typeof window.createPeerConnection ===
                        'function'
                    ) {

                        window.createPeerConnection(
                            snapshot.key,
                            true
                        );

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


                    if (
                        typeof window.uiRemoveUser ===
                        'function'
                    ) {

                        window.uiRemoveUser(
                            leftId
                        );

                    }


                    if (
                        typeof window.closePeerConnection ===
                        'function'
                    ) {

                        window.closePeerConnection(
                            leftId
                        );

                    }


                    trigger(
                        'user-left',
                        {
                            socketId: leftId
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


        // ======================================
        // CALLBACK
        // ======================================

        if (callback) {

            callback({

                success: true,

                users: users,

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

                success: false,

                message:
                    error.message

            });

        }

    }

}


// ==========================================
// GET ONCE
// ==========================================

function getOnce(databaseRef) {

    return new Promise(
        resolve => {

            onValue(
                databaseRef,
                snapshot => {

                    resolve(snapshot);

                },
                {
                    onlyOnce: true
                }
            );

        }
    );

}


// ==========================================
// WEBRTC SIGNAL
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
        return;
    }


    const signalRef =
        ref(
            database,
            `rooms/${currentChannel}/signals/${targetId}`
        );


    const newSignal =
        push(signalRef);


    try {

        await set(
            newSignal,
            {

                type: type,

                data: data,

                sender: socketId,

                createdAt:
                    Date.now()

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
// LISTEN SIGNALS
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


                try {

                    // ==========================
                    // OFFER
                    // ==========================

                    if (
                        signal.type ===
                        'offer'
                    ) {

                        if (
                            typeof window.handleWebRTCOffer ===
                            'function'
                        ) {

                            window.handleWebRTCOffer(

                                signal.data.caller,

                                signal.data.sdp

                            );

                        }

                    }


                    // ==========================
                    // ANSWER
                    // ==========================

                    if (
                        signal.type ===
                        'answer'
                    ) {

                        if (
                            typeof window.handleWebRTCAnswer ===
                            'function'
                        ) {

                            window.handleWebRTCAnswer(

                                signal.data.callee,

                                signal.data.sdp

                            );

                        }

                    }


                    // ==========================
                    // ICE
                    // ==========================

                    if (
                        signal.type ===
                        'ice'
                    ) {

                        if (
                            typeof window.handleNewICECandidate ===
                            'function'
                        ) {

                            window.handleNewICECandidate(

                                signal.data.sender,

                                signal.data.candidate

                            );

                        }

                    }


                } catch (error) {

                    console.error(
                        'Signal processing error:',
                        error
                    );

                }


                // ======================================
                // DELETE AFTER PROCESSING
                // ======================================

                try {

                    await remove(
                        snapshot.ref
                    );

                } catch (error) {

                    console.error(
                        'Signal delete error:',
                        error
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
                success: false,
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

                    // ==============================
                    // CHANNEL KOSONG
                    // ==============================

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


                    // ==============================
                    // SUDAH DIPAKAI SENDIRI
                    // ==============================

                    if (
                        currentSpeaker &&
                        currentSpeaker.socketId ===
                        socketId
                    ) {

                        return currentSpeaker;

                    }


                    // ==============================
                    // DIBATALKAN
                    // ==============================

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

                success: success

            });

        }

    } catch (error) {

        console.error(
            'Request speaking error:',
            error
        );


        if (callback) {

            callback({

                success: false,

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


                // ==========================
                // NO SPEAKER
                // ==========================

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
                            socketId: null
                        }
                    );

                    return;

                }


                // ==========================
                // MYSELF
                // ==========================

                if (
                    speaker.socketId ===
                    socketId
                ) {

                    return;

                }


                // ==========================
                // OTHER USER
                // ==========================

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


    currentChannel = null;


    try {

        const userRef =
            ref(
                database,
                `rooms/${channel}/users/${socketId}`
            );


        await remove(
            userRef
        );


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


    firebaseUnsubscribers.length = 0;

    currentUsername = null;

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
    'Firebase socket adapter loaded:',
    socketId
);