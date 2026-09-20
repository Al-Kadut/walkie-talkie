// ==========================================
// FIREBASE CONFIGURATION
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
    getDatabase
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";


// ==========================================
// FIREBASE CONFIG
// ==========================================

const firebaseConfig = {
    apiKey: "AIzaSyAigZN8gsTFbFNtlSilVtt_j9aa4OHJwck",
    authDomain: "walkie-talkie-web-d41e0.firebaseapp.com",
    databaseURL: "https://walkie-talkie-web-d41e0-default-rtdb.firebaseio.com",
    projectId: "walkie-talkie-web-d41e0",
    storageBucket: "walkie-talkie-web-d41e0.firebasestorage.app",
    messagingSenderId: "766342018145",
    appId: "1:766342018145:web:8dbe15984dfdbfbfd92620",
    measurementId: "G-HVTVL3F3PE"
};


// ==========================================
// INITIALIZE FIREBASE
// ==========================================

const app = initializeApp(firebaseConfig);

const database = getDatabase(app);


// ==========================================
// EXPORT
// ==========================================

export {
    app,
    database
};