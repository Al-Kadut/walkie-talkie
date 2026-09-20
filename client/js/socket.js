// ==========================================
// WALKIE TALKIE
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

let currentChannel =
    null;

let currentUsername =
    null;


const eventHandlers =
    {};


const firebaseUnsubscribers =
    [];


const knownUserIds =
    new Set();


// ==========================================
// EVENT SYSTEM
// ==========================================

function on(
    event,
    callback
) {

    if (
        !eventHandlers[event]
    ) {

        eventHandlers[event] =
            [];

    }


    eventHandlers[event]
        .push(callback);

}


function once(
    event,
    callback
) {

    const wrapper =
        (...args) => {

            callback(...args);


            const handlers =
                eventHandlers[event] ||
                [];


            const index =
                handlers.indexOf(
                    wrapper
                );


            if (
                index !== -1
            ) {

                handlers.splice(
                    index,
                    1
                );

            }

        };


    on(
        event,
        wrapper
    );

}


function trigger(
    event,
    data
) {

    const handlers =
        eventHandlers[event] ||
        [];


    handlers.forEach(
        callback => {

            try {

                callback(
                    data
                );

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
// SOCKET
// ==========================================

window.socket = {

    id:
        socketId,

    connected:
        true,


    on(
        event,
        callback
    ) {

        on(
            event,
            callback
        );

    },


    once(
        event,
        callback
    ) {

        once(
            event,
            callback
        );

    },


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
                    '❌ Target offer kosong.'
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
                        data.sdp

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
                    '❌ Target answer kosong.'
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
                        data.sdp

                }
            );


            return;

        }


        // ======================================
        // ICE
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
                    '❌ Target ICE kosong.'
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
                        data.candidate

                }
            );


            return;

        }

    },


    connect() {

        this.connected =
            true;


        console.log(
            '🟢 Firebase socket connected:',
            socketId
        );


        trigger(
            'connect'
        );

    },


    disconnect() {

        leaveChannel();


        this.connected =
            false;


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
        // RESET PREVIOUS
        // ======================================

        knownUserIds.clear();


        currentChannel =
            String(
                data.channelCode ||
                ''
            )
                .trim()
                .toUpperCase();


        currentUsername =
            String(
                data.username ||
                ''
            )
                .trim();


        if (
            !currentChannel ||
            !currentUsername
        ) {

            throw new Error(
                'Channel atau username kosong.'
            );

        }


        console.log(
            '🚪 Join channel:',
            currentChannel,
            currentUsername
        );


        // ======================================
        // USERS REF
        // ======================================

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
        // REGISTER USER
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
        // AUTO REMOVE
        // ======================================

        await onDisconnect(
            userRef
        ).remove();


        // ======================================
        // GET CURRENT USERS
        // ======================================

        const snapshot =
            await getOnce(
                usersRef
            );


        const users =
            [];


        snapshot.forEach(
            child => {

                const user =
                    child.val();


                if (!user) {

                    return;

                }


                knownUserIds.add(
                    child.key
                );


                users.push({

                    socketId:
                        child.key,

                    username:
                        user.username

                });

            }
        );


        console.log(
            '👥 Existing users:',
            users
        );


        // ======================================
        // UI EXISTING USERS
        // ======================================

        // Jangan membuat offer di sini secara
        // langsung karena kita gunakan aturan
        // deterministic berdasarkan socket ID.


        // ======================================
        // USER ADDED
        // ======================================

        const unsubscribeAdded =
            onChildAdded(
                usersRef,
                snapshot => {

                    const targetId =
                        snapshot.key;


                    if (
                        targetId ===
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
                            targetId,

                        username:
                            user.username

                    };


                    // ==================================
                    // USER SUDAH DIKETAHUI
                    // ==================================

                    const alreadyKnown =
                        knownUserIds.has(
                            targetId
                        );


                    knownUserIds.add(
                        targetId
                    );


                    if (
                        typeof window.uiAddUser ===
                        'function'
                    ) {

                        // Hanya UI.
                        // main.js sudah menambahkan
                        // existing users dari callback.

                        if (
                            !alreadyKnown
                        ) {

                            window.uiAddUser(
                                userData
                            );

                        }

                    }


                    // ==================================
                    // DECIDE WHO CREATES OFFER
                    // ==================================

                    /*
                     * Hanya socket ID yang lebih kecil
                     * yang membuat offer.
                     *
                     * Ini mencegah:
                     *
                     * A -> offer
                     * B -> offer
                     *
                     * secara bersamaan.
                     */

                    if (
                        socketId <
                        targetId
                    ) {

                        console.log(
                            '📞 Saya menjadi caller:',
                            targetId
                        );


                        if (
                            typeof window.createPeerConnection ===
                            'function'
                        ) {

                            window.createPeerConnection(
                                targetId,
                                true
                            );

                        }

                    } else {

                        console.log(
                            '📞 Saya menunggu offer:',
                            targetId
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
        // CREATE OFFER FOR EXISTING USERS
        // ======================================

        /*
         * Firebase onChildAdded akan mengirim
         * existing children setelah listener aktif.
         *
         * Karena knownUserIds sudah berisi semua
         * user dari snapshot, kita perlu melakukan
         * initial connection secara manual.
         */

        for (
            const user of users
        ) {

            if (
                user.socketId ===
                socketId
            ) {

                continue;

            }


            if (
                socketId <
                user.socketId
            ) {

                console.log(
                    '📞 Membuat initial offer:',
                    user.socketId
                );


                if (
                    typeof window.createPeerConnection ===
                    'function'
                ) {

                    window.createPeerConnection(
                        user.socketId,
                        true
                    );

                }

            } else {

                console.log(
                    '📞 Menunggu initial offer:',
                    user.socketId
                );

            }

        }


        // ======================================
        // USER REMOVED
        // ======================================

        const unsubscribeRemoved =
            onChildRemoved(
                usersRef,
                snapshot => {

                    const leftId =
                        snapshot.key;


                    knownUserIds.delete(
                        leftId
                    );


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
        // SIGNAL LISTENER
        // ======================================

        listenSignals();


        // ======================================
        // SPEAKER
        // ======================================

        listenSpeaker();


        // ======================================
        // STATUS
        // ======================================

        updateConnectionStatus(
            'Connected',
            'green'
        );


        console.log(
            '✅ Firebase connected:',
            socketId
        );


        // ======================================
        // CALLBACK MAIN.JS
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
            '❌ Firebase join error:',
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
        !currentChannel
    ) {

        console.warn(
            'Tidak ada channel aktif.'
        );

        return;

    }


    if (
        !targetId
    ) {

        console.warn(
            'Target signal kosong.'
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
            '📡 Signal terkirim:',
            type,
            '→',
            targetId
        );


    } catch (error) {

        console.error(
            '❌ Gagal mengirim WebRTC signal:',
            error
        );

    }

}


// ==========================================
// LISTEN WEBRTC SIGNALS
// ==========================================

function listenSignals() {

    if (
        !currentChannel
    ) {

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


                console.log(
                    '📡 Signal diterima:',
                    signal.type,
                    'dari',
                    signal.sender
                );


                try {

                    // ==================================
                    // OFFER
                    // ==================================

                    if (
                        signal.type ===
                        'offer'
                    ) {

                        if (
                            typeof window.handleWebRTCOffer ===
                            'function'
                        ) {

                            await window.handleWebRTCOffer(

                                signal.data?.caller ||
                                signal.sender,

                                signal.data?.sdp

                            );

                        }

                    }


                    // ==================================
                    // ANSWER
                    // ==================================

                    else if (
                        signal.type ===
                        'answer'
                    ) {

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


                    // ==================================
                    // ICE
                    // ==================================

                    else if (
                        signal.type ===
                        'ice'
                    ) {

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


                    // ==================================
                    // DELETE AFTER SUCCESS
                    // ==================================

                    await remove(
                        snapshot.ref
                    );


                    console.log(
                        '🗑️ Signal selesai diproses:',
                        signal.type
                    );


                } catch (error) {

                    console.error(
                        '❌ Signal processing error:',
                        error
                    );

                    /*
                     * Jangan langsung menghapus signal
                     * jika processing gagal.
                     *
                     * Ini membantu debugging dan retry.
                     */

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

    if (
        !currentChannel
    ) {

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

                    // Channel kosong
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


                    // Sudah menjadi speaker
                    if (
                        currentSpeaker &&
                        currentSpeaker.socketId ===
                        socketId
                    ) {

                        return currentSpeaker;

                    }


                    // Sedang digunakan orang lain
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
            '❌ Request speaking error:',
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

    if (
        !currentChannel
    ) {

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
                '🎙️ Speaker released.'
            );

        }


    } catch (error) {

        console.error(
            '❌ Release speaking error:',
            error
        );

    }

}


// ==========================================
// LISTEN SPEAKER
// ==========================================

function listenSpeaker() {

    if (
        !currentChannel
    ) {

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


                // ==================================
                // NO SPEAKER
                // ==================================

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


                // ==================================
                // MYSELF
                // ==================================

                if (
                    speaker.socketId ===
                    socketId
                ) {

                    return;

                }


                // ==================================
                // OTHER USER
                // ==================================

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

    if (
        !currentChannel
    ) {

        return;

    }


    const channel =
        currentChannel;


    currentChannel =
        null;


    knownUserIds.clear();


    try {

        // ==================================
        // REMOVE USER
        // ==================================

        const userRef =
            ref(
                database,
                `rooms/${channel}/users/${socketId}`
            );


        await remove(
            userRef
        );


        // ==================================
        // REMOVE SPEAKER
        // ==================================

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
            '❌ Leave channel error:',
            error
        );

    }


    // ======================================
    // UNSUBSCRIBE
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


    currentUsername =
        null;


    console.log(
        '🚪 Leave channel:',
        channel
    );

}


// ==========================================
// UI CONNECTION STATUS
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
    '✅ Firebase socket adapter loaded:',
    socketId
);