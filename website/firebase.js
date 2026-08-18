import { initializeApp }
    from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";

import {
    getAuth
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

import {
    getDatabase
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";


const firebaseConfig = {
    apiKey: "AIzaSyD6e6NvHzRGnwuCXBgf8etsOx0nMiRsoLI",
    authDomain: "ecopack-af91d.firebaseapp.com",
    databaseURL: "https://ecopack-af91d-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "ecopack-af91d",
    storageBucket: "ecopack-af91d.firebasestorage.app",
    messagingSenderId: "274424276717",
    appId: "1:274424276717:web:6cfe8375c84c1667aa0ee4"
};


const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getDatabase(app);


export {
    app,
    auth,
    db
};