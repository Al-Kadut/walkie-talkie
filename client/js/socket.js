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

import { database } from "./firebase.js";


// ==========================================
// SOCKET-LIKE OBJECT
// ==========================================

const socketId =
    crypto.randomUUID ?
        crypto.randomUUID() :
        Math.random().toString(36).substring(2) + Date.now();

let currentChannel = null;
let currentUsername = null;

const eventHandlers = {};
const listeners = [];

window.socket = {

    id: socketId,

    connected: true,

    on(event, callback) {
        if (!eventHandlers[event]) {
            eventHandlers[event] = [];
        }

        eventHandlers[event].push(callback);
    },

    once(event, callback) {
        const wrapper = (...args) => {
            callback(...args);

            const handlers = eventHandlers[event] || [];
            const index = handlers.indexOf(wrapper);

            if (index !== -1) {
                handlers.splice(index, 1);
            }
        };

        this.on(event, wrapper);
    },

    emit(event, data, callback) {

        // ==========================================
        // JOIN CHANNEL
        // ==========================================

        if (event === 'join-channel') {
            joinChannel(data, callback);
            return;
        }


        // ==========================================
        // LEAVE CHANNEL
        // ==========================================

        if (event === 'leave-channel') {
            leaveChannel();
            return;
        }


        // ==========================================
        // WEBRTC OFFER
        // ==========================================

        if (event === 'webrtc-offer') {
            sendSignal(
                data.callee,
                'offer',
                {
                    caller: socketId,
                    sdp: data.sdp
                }
            );
            return;
        }


        // ==========================================
        // WEBRTC ANSWER
        // ==========================================

        if (event === 'webrtc-answer') {
            sendSignal(
                data.caller,
                'answer',
                {
                    callee: socketId,
                    sdp: data.sdp
                }
            );
            return;
        }


        // ==========================================
        // ICE CANDIDATE
        // ==========================================

        if (event === 'webrtc-ice-candidate') {
            sendSignal(
                data.target,
                'ice',
                {
                    sender: socketId,
                    candidate: data.candidate
                }
            );
            return;
        }


        // ==========================================
        // SPEAKING START
        // ==========================================

        if (event === 'speaking-start') {
            startSpeaking();
            return;
        }


        // ==========================================
        // SPEAKING STOP
        // ==========================================

        if (event === 'speaking-stop') {
            stopSpeaking();
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
// TRIGGER EVENT
// ==========================================

function trigger(event, data) {

    const handlers = eventHandlers[event];

    if (!handlers) return;

    handlers.forEach(callback => {

        try {
            callback(data);
        } catch (error) {
            console.error(`Error event ${event}:`, error);
        }

    });
}


// ==========================================
// JOIN CHANNEL
// ==========================================

async function joinChannel(data, callback) {

    try {

        currentChannel = data.channelCode;
        currentUsername = data.username;

        const channelRef = ref(
            database,
            `rooms/${currentChannel}`
        );

        const userRef = ref(
            database,
            `rooms/${currentChannel}/users/${socketId}`
        );


        // ==========================================
        // SIMPAN USER
        // ==========================================

        await set(userRef, {

            socketId: socketId,

            username: currentUsername,

            joinedAt: Date.now()

        });


        // ==========================================
        // HAPUS OTOMATIS SAAT KELUAR
        // ==========================================

        onDisconnect(userRef).remove();


        // ==========================================
        // LIST USER
        // ==========================================

        const usersRef = ref(
            database,
            `rooms/${currentChannel}/users`
        );


        const usersSnapshot = await new Promise(resolve => {

            onValue(
                usersRef,
                snapshot => resolve(snapshot),
                {
                    onlyOnce: true
                }
            );

        });


        const users = [];

        usersSnapshot.forEach(child => {

            users.push({

                socketId: child.key,

                username: child.val().username

            });

        });


        // ==========================================
        // MONITOR USER BARU
        // ==========================================

        const joinedListener = onChildAdded(
            usersRef,
            snapshot => {

                const user = snapshot.val();

                if (!user) return;

                if (snapshot.key === socketId) return;

                addUserToList({

                    socketId: snapshot.key,

                    username: user.username

                });

                if (
                    typeof window.createPeerConnection === 'function'
                ) {

                    window.createPeerConnection(
                        snapshot.key,
                        true
                    );

                }

            }
        );

        listeners.push(joinedListener);


        // ==========================================
        // MONITOR USER KELUAR
        // ==========================================

        const leftListener = onChildRemoved(
            usersRef,
            snapshot => {

                const socketIdLeft = snapshot.key;

                removeUserFromList(socketIdLeft);

                if (
                    typeof window.closePeerConnection === 'function'
                ) {

                    window.closePeerConnection(
                        socketIdLeft
                    );

                }

                trigger(
                    'user-left',
                    {
                        socketId: socketIdLeft
                    }
                );

            }
        );

        listeners.push(leftListener);


        // ==========================================
        // MONITOR SIGNAL WEBRTC
        // ==========================================

        listenSignals();


        // ==========================================
        // MONITOR SPEAKER
        // ==========================================

        listenSpeaker();


        // ==========================================
        // TAMPILKAN USER YANG SUDAH ADA
        // ==========================================

        users.forEach(user => {

            if (user.socketId === socketId) return;

            addUserToList(user);

        });


        // ==========================================
        // CALLBACK BERHASIL
        // ==========================================

        if (callback) {

            callback({

                success: true,

                users: users,

                currentUser: {

                    socketId: socketId,

                    username: currentUsername

                }

            });

        }


        updateConnectionStatus(
            'Connected',
            'green'
        );


        console.log(
            'Firebase connected:',
            socketId
        );

    } catch (error) {

        console.error(
            'Firebase join error:',
            error
        );

        if (callback) {

            callback({

                success: false,

                message: error.message

            });

        }

    }
}


// ==========================================
// WEBRTC SIGNALING
// ==========================================

function sendSignal(targetId, type, data) {

    if (!currentChannel || !targetId) return;

    const signalRef = ref(
        database,
        `rooms/${currentChannel}/signals/${targetId}`
    );

    const newSignal = push(signalRef);

    set(newSignal, {

        type: type,

        data: data,

        sender: socketId,

        createdAt: Date.now()

    }).catch(error => {

        console.error(
            'Gagal mengirim signal:',
            error
        );

    });
}


// ==========================================
// LISTEN SIGNAL
// ==========================================

function listenSignals() {

    if (!currentChannel) return;

    const signalsRef = ref(
        database,
        `rooms/${currentChannel}/signals/${socketId}`
    );


    const signalListener = onChildAdded(
        signalsRef,
        async snapshot => {

            const signal = snapshot.val();

            if (!signal) return;


            if (signal.type === 'offer') {

                if (
                    typeof window.handleWebRTCOffer === 'function'
                ) {

                    window.handleWebRTCOffer(

                        signal.data.caller,

                        signal.data.sdp

                    );

                }

            }


            if (signal.type === 'answer') {

                if (
                    typeof window.handleWebRTCAnswer === 'function'
                ) {

                    window.handleWebRTCAnswer(

                        signal.data.callee,

                        signal.data.sdp

                    );

                }

            }


            if (signal.type === 'ice') {

                if (
                    typeof window.handleNewICECandidate === 'function'
                ) {

                    window.handleNewICECandidate(

                        signal.data.sender,

                        signal.data.candidate

                    );

                }

            }


            // Hapus signal setelah diproses

            await remove(snapshot.ref);

        }
    );

    listeners.push(signalListener);
}


// ==========================================
// SPEAKING
// ==========================================

function listenSpeaker() {

    if (!currentChannel) return;

    const speakerRef = ref(
        database,
        `rooms/${currentChannel}/speaking`
    );


    const speakerListener = onValue(
        speakerRef,
        snapshot => {

            const speaker = snapshot.val();

            if (!speaker) {

                trigger(
                    'speaking-stop',
                    {
                        socketId: null
                    }
                );

                clearSpeaker(null);

                return;

            }


            if (speaker.socketId === socketId) return;


            setSpeaker(
                speaker.socketId,
                speaker.username
            );

        }
    );

    listeners.push(speakerListener);
}


// ==========================================
// START SPEAKING
// ==========================================

async function startSpeaking() {

    if (!currentChannel) return;

    const speakerRef = ref(
        database,
        `rooms/${currentChannel}/speaking`
    );


    const result = await runTransaction(
        speakerRef,
        currentSpeaker => {

            if (currentSpeaker === null) {

                return {

                    socketId: socketId,

                    username: currentUsername

                };

            }

            return;

        }
    );


    if (!result.committed) {

        console.log(
            'Channel sedang digunakan orang lain.'
        );

    }

}


// ==========================================
// STOP SPEAKING
// ==========================================

async function stopSpeaking() {

    if (!currentChannel) return;

    const speakerRef = ref(
        database,
        `rooms/${currentChannel}/speaking`
    );


    const snapshot = await new Promise(resolve => {

        onValue(
            speakerRef,
            snap => resolve(snap),
            {
                onlyOnce: true
            }
        );

    });


    const speaker = snapshot.val();


    if (
        speaker &&
        speaker.socketId === socketId
    ) {

        await remove(speakerRef);

    }

}


// ==========================================
// LEAVE CHANNEL
// ==========================================

async function leaveChannel() {

    if (!currentChannel) return;


    try {

        const userRef = ref(
            database,
            `rooms/${currentChannel}/users/${socketId}`
        );

        await remove(userRef);


        const speakerRef = ref(
            database,
            `rooms/${currentChannel}/speaking`
        );


        const speakerSnapshot = await new Promise(resolve => {

            onValue(
                speakerRef,
                snap => resolve(snap),
                {
                    onlyOnce: true
                }
            );

        });


        const speaker = speakerSnapshot.val();


        if (
            speaker &&
            speaker.socketId === socketId
        ) {

            await remove(speakerRef);

        }


    } catch (error) {

        console.error(
            'Leave channel error:',
            error
        );

    }


    listeners.forEach(unsubscribe => {

        try {

            unsubscribe();

        } catch (error) {

            console.error(error);

        }

    });


    listeners.length = 0;

    currentChannel = null;

    currentUsername = null;
}


// ==========================================
// UI HELPERS
// ==========================================

function updateConnectionStatus(text, color) {

    if (
        typeof window.updateUIConnectionStatus === 'function'
    ) {

        window.updateUIConnectionStatus(
            text,
            color
        );

    }

}


function addUserToList(user) {

    if (
        typeof window.uiAddUser === 'function'
    ) {

        window.uiAddUser(user);

    }

}


function removeUserFromList(socketId) {

    if (
        typeof window.uiRemoveUser === 'function'
    ) {

        window.uiRemoveUser(socketId);

    }

}


function setSpeaker(socketId, username) {

    if (
        typeof window.uiSetSpeaker === 'function'
    ) {

        window.uiSetSpeaker(
            socketId,
            username
        );

    }

}


function clearSpeaker(socketId) {

    if (
        typeof window.uiClearSpeaker === 'function'
    ) {

        window.uiClearSpeaker(socketId);

    }

}


// ==========================================
// FIREBASE CONNECTION READY
// ==========================================

window.socket.connect();