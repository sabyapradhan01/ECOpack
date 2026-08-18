/* =========================================================
   ECOPACK
   REAL FIREBASE + REAL ESP32 ARCHITECTURE

   FLOW:
   Sign Up / Login
        ↓
   User has 0 boxes initially
        ↓
   Create Box
        ↓
   Empty box is created in Firebase
        ↓
   Waiting for ESP32
        ↓
   ESP32 writes live data
        ↓
   ECOpack displays real data

   NO DEMO SENSOR WRITES
========================================================= */


/* =========================================================
   FIREBASE IMPORTS
========================================================= */

import {
    auth,
    db
} from "./firebase.js";

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

import {
    ref,
    set,
    update,
    push,
    onValue
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";


/* =========================================================
   GLOBAL STATE
========================================================= */

let currentUser = null;

let selectedBoxId = null;

let selectedBoxListener = null;

let boxesListener = null;

let map = null;

let mapMarker = null;

let settingsFormDirty = false;


/* =========================================================
   DOM ELEMENTS
========================================================= */

const authScreen =
    document.getElementById("authScreen");

const appScreen =
    document.getElementById("appScreen");

const loginForm =
    document.getElementById("loginForm");

const signupForm =
    document.getElementById("signupForm");

const authSwitchButton =
    document.getElementById("authSwitchButton");

const authSwitchText =
    document.getElementById("authSwitchText");

const loginError =
    document.getElementById("loginError");

const signupError =
    document.getElementById("signupError");

const logoutButton =
    document.getElementById("logoutButton");

const boxSelector =
    document.getElementById("boxSelector");

const createBoxButton =
    document.getElementById("createBoxButton");

const renameBoxButton =
    document.getElementById("renameBoxButton");

const settingsForm =
    document.getElementById("settingsForm");

const createBoxModal =
    document.getElementById("createBoxModal");

const renameBoxModal =
    document.getElementById("renameBoxModal");

const createBoxForm =
    document.getElementById("createBoxForm");

const renameBoxForm =
    document.getElementById("renameBoxForm");

const liveModeButton =
    document.getElementById("liveModeButton");

const demoModeButton =
    document.getElementById("demoModeButton");


/* =========================================================
   DASHBOARD SECTIONS

   We hide all box analytics when the user has 0 boxes.
========================================================= */

const selectedBoxSection =
    document.querySelector(".selected-box-section");

const environmentGrid =
    document.querySelector(".environment-grid");

const twoColumnSection =
    document.querySelector(".two-column-section");

const analyticsSection =
    document.querySelector(".analytics-section");

const systemStatusCard =
    document.querySelector(".system-status-card");


/* =========================================================
   SETTINGS INPUT DIRTY TRACKING
========================================================= */

const settingsInputs = [

    document.getElementById("productName"),

    document.getElementById("productCategory"),

    document.getElementById("temperatureMin"),

    document.getElementById("temperatureMax"),

    document.getElementById("humidityMin"),

    document.getElementById("humidityMax")

];


settingsInputs.forEach(
    function (input) {

        if (!input) {
            return;
        }

        input.addEventListener(
            "input",
            function () {

                settingsFormDirty = true;

            }
        );

        input.addEventListener(
            "change",
            function () {

                settingsFormDirty = true;

            }
        );

    }
);


/* =========================================================
   AUTHENTICATION
========================================================= */


/* ---------------------------------------------------------
   SIGN UP
--------------------------------------------------------- */

signupForm.addEventListener(
    "submit",
    async function (event) {

        event.preventDefault();

        signupError.textContent = "";


        const name =
            document
                .getElementById("signupName")
                .value
                .trim();


        const email =
            document
                .getElementById("signupEmail")
                .value
                .trim()
                .toLowerCase();


        const password =
            document
                .getElementById("signupPassword")
                .value;


        const confirmPassword =
            document
                .getElementById("signupConfirmPassword")
                .value;


        if (
            password !==
            confirmPassword
        ) {

            signupError.textContent =
                "Passwords do not match.";

            return;

        }


        if (
            password.length < 6
        ) {

            signupError.textContent =
                "Password must contain at least 6 characters.";

            return;

        }


        try {

            /*
                Create actual Firebase account.
            */

            const credential =
                await createUserWithEmailAndPassword(
                    auth,
                    email,
                    password
                );


            const user =
                credential.user;


            /*
                Save display name to Firebase Auth.
            */

            await updateProfile(
                user,
                {
                    displayName: name
                }
            );


            /*
                Create user profile.

                IMPORTANT:
                NO BOX IS CREATED HERE.
            */

            await set(
                ref(
                    db,
                    `users/${user.uid}`
                ),
                {
                    name,
                    email,
                    createdAt: Date.now()
                }
            );


            /*
                Firebase automatically keeps
                the user signed in.

                onAuthStateChanged() will open
                the dashboard.
            */

        }

        catch (error) {

            console.error(
                "Signup error:",
                error
            );


            signupError.textContent =
                firebaseAuthError(
                    error
                );

        }

    }
);


/* ---------------------------------------------------------
   LOGIN
--------------------------------------------------------- */

loginForm.addEventListener(
    "submit",
    async function (event) {

        event.preventDefault();

        loginError.textContent = "";


        const email =
            document
                .getElementById("loginEmail")
                .value
                .trim()
                .toLowerCase();


        const password =
            document
                .getElementById("loginPassword")
                .value;


        try {

            await signInWithEmailAndPassword(
                auth,
                email,
                password
            );

        }

        catch (error) {

            console.error(
                "Login error:",
                error
            );


            loginError.textContent =
                firebaseAuthError(
                    error
                );

        }

    }
);


/* ---------------------------------------------------------
   LOGIN / SIGNUP SWITCH
--------------------------------------------------------- */

authSwitchButton.addEventListener(
    "click",
    function () {

        loginError.textContent = "";

        signupError.textContent = "";


        const signupVisible =
            !signupForm.classList.contains(
                "hidden"
            );


        if (signupVisible) {

            signupForm.classList.add(
                "hidden"
            );

            loginForm.classList.remove(
                "hidden"
            );


            authSwitchText.textContent =
                "Don't have an account?";


            authSwitchButton.textContent =
                "Sign Up";

        }

        else {

            loginForm.classList.add(
                "hidden"
            );

            signupForm.classList.remove(
                "hidden"
            );


            authSwitchText.textContent =
                "Already have an account?";


            authSwitchButton.textContent =
                "Log in";

        }

    }
);


/* ---------------------------------------------------------
   LOGOUT
--------------------------------------------------------- */

logoutButton.addEventListener(
    "click",
    async function () {

        try {

            unsubscribeListeners();


            await signOut(
                auth
            );

        }

        catch (error) {

            console.error(
                "Logout error:",
                error
            );

        }

    }
);


/* =========================================================
   FIREBASE AUTH STATE
========================================================= */

onAuthStateChanged(
    auth,
    async function (user) {

        if (user) {

            currentUser = user;

            await showApplication();

        }

        else {

            currentUser = null;

            selectedBoxId = null;

            unsubscribeListeners();

            showAuthScreen();

        }

    }
);


/* =========================================================
   SHOW AUTH SCREEN
========================================================= */

function showAuthScreen() {

    appScreen.classList.add(
        "hidden"
    );

    authScreen.classList.remove(
        "hidden"
    );

}


/* =========================================================
   SHOW APPLICATION
========================================================= */

async function showApplication() {

    authScreen.classList.add(
        "hidden"
    );

    appScreen.classList.remove(
        "hidden"
    );


    /*
        We are using REAL mode now.
        There is no browser-side demo generator.
    */

    setLiveMode();


    /*
        Load boxes from Firebase.
    */

    listenToUserBoxes();

}


/* =========================================================
   EMPTY BOX TEMPLATE
========================================================= */

function createEmptyBox(
    name,
    deviceId
) {

    return {

        /*
            Basic identity
        */

        name:
            name || null,

        deviceId:
            deviceId || null,

        deviceUid:
            null,

        paired:
            false,

        connected:
            false,


        /*
            Product/configuration
        */

        productName:
            null,

        category:
            null,

        configuration: {

            temperatureMin:
                null,

            temperatureMax:
                null,

            humidityMin:
                null,

            humidityMax:
                null

        },


        /*
            Real ESP32 data.

            NULL until the ESP32 writes
            something to Firebase.
        */

        liveData: {

            temperature:
                null,

            humidity:
                null,

            fanStatus:
                null,

            timestamp:
                null

        },


        /*
            GPS data.

            NULL until the GPS module
            sends a valid reading.
        */

        location: {

            latitude:
                null,

            longitude:
                null,

            gpsStatus:
                null,

            satellites:
                null,

            accuracy:
                null,

            speed:
                null,

            timestamp:
                null

        },


        /*
            Device connection
        */

        deviceStatus: {

            online:
                false,

            lastSeen:
                null

        },


        /*
            Historical data
        */

        sensorHistory:
            {},

        locationHistory:
            {},

        alerts:
            {}

    };

}


/* =========================================================
   LISTEN TO USER BOXES
========================================================= */

function listenToUserBoxes() {

    if (!currentUser) {
        return;
    }


    /*
        Remove old listener.
    */

    if (boxesListener) {

        boxesListener();

        boxesListener = null;

    }


    const boxesRef =
        ref(
            db,
            `boxes/${currentUser.uid}`
        );


    boxesListener =
        onValue(
            boxesRef,

            function (snapshot) {

                const boxes =
                    snapshot.val();


                /*
                    IMPORTANT:
                    null means ZERO boxes.
                */

                if (
                    !boxes ||
                    Object.keys(boxes).length === 0
                ) {

                    selectedBoxId = null;

                    renderNoBoxesState();

                    return;

                }


                /*
                    Boxes exist.
                */

                renderBoxSelector(
                    boxes
                );


                const ids =
                    Object.keys(
                        boxes
                    );


                /*
                    Keep currently selected box
                    if it still exists.
                */

                if (
                    !selectedBoxId ||
                    !boxes[selectedBoxId]
                ) {

                    selectedBoxId =
                        ids[0];

                }


                boxSelector.value =
                    selectedBoxId;


                renderBoxesState();


                listenToSelectedBox();

            },

            function (error) {

                console.error(
                    "Box listener error:",
                    error
                );


                /*
                    Don't immediately keep
                    showing a generic alert.

                    Give a clearer message.
                */

                const message =
                    error?.message ||
                    "Unknown Firebase error";


                alert(
                    `Could not read your ECOpack boxes.\n\n${message}\n\nCheck Firebase Realtime Database Rules.`
                );

            }
        );

}


/* =========================================================
   RENDER NO BOXES STATE
========================================================= */

function renderNoBoxesState() {

    /*
        Selector
    */

    boxSelector.innerHTML = "";


    const option =
        document.createElement(
            "option"
        );


    option.value = "";

    option.textContent =
        "No boxes yet";

    option.disabled = true;

    option.selected = true;


    boxSelector.appendChild(
        option
    );


    boxSelector.disabled =
        true;


    /*
        Create button remains active.
    */

    createBoxButton.disabled =
        false;


    /*
        Hide every box-dependent section.
    */

    setBoxDashboardVisible(
        false
    );


    /*
        Update workspace label.
    */

    document.getElementById(
        "workspaceStatusText"
    ).textContent =
        "No boxes connected";


    document.getElementById(
        "workspaceStatusDescription"
    ).textContent =
        "— create a box to begin monitoring";


    /*
        Data source
    */

    document.getElementById(
        "dataSourceLabel"
    ).textContent =
        "LIVE";


    /*
        Remove map if necessary.
    */

    if (map) {

        setTimeout(
            function () {

                map.invalidateSize();

            },
            100
        );

    }

}


/* =========================================================
   RENDER BOXES STATE
========================================================= */

function renderBoxesState() {

    boxSelector.disabled =
        false;


    createBoxButton.disabled =
        false;


    setBoxDashboardVisible(
        true
    );


    document.getElementById(
        "workspaceStatusText"
    ).textContent =
        "Live device mode";


    document.getElementById(
        "workspaceStatusDescription"
    ).textContent =
        "— waiting for ESP32 Firebase data";


    document.getElementById(
        "dataSourceLabel"
    ).textContent =
        "LIVE";

}


/* =========================================================
   SHOW / HIDE BOX DASHBOARD
========================================================= */

function setBoxDashboardVisible(
    visible
) {

    const display =
        visible
            ? ""
            : "none";


    if (selectedBoxSection) {
        selectedBoxSection.style.display =
            display;
    }


    if (environmentGrid) {
        environmentGrid.style.display =
            display;
    }


    if (twoColumnSection) {
        twoColumnSection.style.display =
            display;
    }


    if (analyticsSection) {
        analyticsSection.style.display =
            display;
    }


    if (systemStatusCard) {
        systemStatusCard.style.display =
            display;
    }

}


/* =========================================================
   RENDER BOX SELECTOR
========================================================= */

function renderBoxSelector(
    boxes
) {

    boxSelector.innerHTML = "";


    Object.entries(
        boxes
    ).forEach(
        function (
            [
                boxId,
                box
            ]
        ) {

            const option =
                document.createElement(
                    "option"
                );


            option.value =
                boxId;


            option.textContent =
                `${box.name || "Unnamed Box"} — ${
                    box.deviceId || "No Device ID"
                }`;


            boxSelector.appendChild(
                option
            );

        }
    );


    if (selectedBoxId) {

        boxSelector.value =
            selectedBoxId;

    }

}


/* =========================================================
   SELECT BOX
========================================================= */

boxSelector.addEventListener(
    "change",
    function () {

        selectedBoxId =
            boxSelector.value;


        settingsFormDirty =
            false;


        listenToSelectedBox();

    }
);


/* =========================================================
   LISTEN TO SELECTED BOX
========================================================= */

function listenToSelectedBox() {

    if (
        !currentUser ||
        !selectedBoxId
    ) {

        return;

    }


    if (selectedBoxListener) {

        selectedBoxListener();

        selectedBoxListener = null;

    }


    const boxRef =
        ref(
            db,
            `boxes/${currentUser.uid}/${selectedBoxId}`
        );


    selectedBoxListener =
        onValue(
            boxRef,

            function (snapshot) {

                const box =
                    snapshot.val();


                if (!box) {

                    return;

                }


                setBoxDashboardVisible(
                    true
                );


                updateBoxUI(
                    box
                );


                updateConfigurationUI(
                    box
                );


                updateCharts(
                    box
                );


                updateActivity(
                    box
                );


                updateSystemStatus(
                    box
                );


                updateMap(
                    box
                );

            },

            function (error) {

                console.error(
                    "Selected box listener error:",
                    error
                );

            }
        );

}


/* =========================================================
   UPDATE BOX UI
========================================================= */

function updateBoxUI(
    box
) {

    /*
        Basic identity
    */

    document.getElementById(
        "selectedBoxName"
    ).textContent =
        box.name ||
        "Unnamed Box";


    document.getElementById(
        "selectedBoxDevice"
    ).textContent =
        box.deviceId ||
        "No ESP32 ID";


    /*
        Configuration
    */

    const config =
        box.configuration ||
        {};


    const tempMin =
        config.temperatureMin;


    const tempMax =
        config.temperatureMax;


    const humidityMin =
        config.humidityMin;


    const humidityMax =
        config.humidityMax;


    /*
        Temperature range
    */

    document.getElementById(
        "temperatureRange"
    ).textContent =
        tempMin != null &&
        tempMax != null
            ? `${tempMin}–${tempMax}° safe range`
            : "Limits not set";


    /*
        Humidity range
    */

    document.getElementById(
        "humidityRange"
    ).textContent =
        humidityMin != null &&
        humidityMax != null
            ? `${humidityMin}–${humidityMax}% safe range`
            : "Limits not set";


    /*
        Live data
    */

    const liveData =
        box.liveData ||
        {};


    /*
        Temperature
    */

    const temperature =
        liveData.temperature;


    if (
        temperature == null
    ) {

        document.getElementById(
            "temperatureValue"
        ).textContent =
            "—";


        setConditionWaiting(
            document.getElementById(
                "temperatureCondition"
            )
        );

    }

    else {

        document.getElementById(
            "temperatureValue"
        ).textContent =
            Number(
                temperature
            ).toFixed(1);


        if (
            tempMin != null &&
            tempMax != null
        ) {

            setConditionUI(
                document.getElementById(
                    "temperatureCondition"
                ),
                getCondition(
                    Number(
                        temperature
                    ),
                    Number(
                        tempMin
                    ),
                    Number(
                        tempMax
                    )
                )
            );

        }

        else {

            setConditionWaiting(
                document.getElementById(
                    "temperatureCondition"
                )
            );

        }

    }


    /*
        Humidity
    */

    const humidity =
        liveData.humidity;


    if (
        humidity == null
    ) {

        document.getElementById(
            "humidityValue"
        ).textContent =
            "—";


        setConditionWaiting(
            document.getElementById(
                "humidityCondition"
            )
        );

    }

    else {

        document.getElementById(
            "humidityValue"
        ).textContent =
            Math.round(
                Number(
                    humidity
                )
            );


        if (
            humidityMin != null &&
            humidityMax != null
        ) {

            setConditionUI(
                document.getElementById(
                    "humidityCondition"
                ),
                getCondition(
                    Number(
                        humidity
                    ),
                    Number(
                        humidityMin
                    ),
                    Number(
                        humidityMax
                    )
                )
            );

        }

        else {

            setConditionWaiting(
                document.getElementById(
                    "humidityCondition"
                )
            );

        }

    }


    /*
        Fan
    */

    const fanStatus =
        liveData.fanStatus;


    const fanIndicator =
        document.getElementById(
            "fanIndicator"
        );


    const fanText =
        document.getElementById(
            "fanStatusText"
        );


    fanIndicator.classList.remove(
        "active"
    );


    if (
        fanStatus == null
    ) {

        fanText.textContent =
            "—";

    }

    else if (
        Boolean(
            fanStatus
        )
    ) {

        fanIndicator.classList.add(
            "active"
        );

        fanText.textContent =
            "Active";

    }

    else {

        fanText.textContent =
            "Off";

    }


    /*
        Device status
    */

    const online =
        box.deviceStatus?.online === true;


    document.getElementById(
        "deviceStatusText"
    ).textContent =
        online
            ? "ONLINE"
            : "OFFLINE";


    document.getElementById(
        "lastSeenText"
    ).textContent =
        online
            ? "Last seen just now"
            : box.deviceStatus?.lastSeen
                ? `Last seen ${formatTimeAgo(
                    box.deviceStatus.lastSeen
                )}`
                : "Waiting for ESP32";


    /*
        GPS
    */

    const location =
        box.location ||
        {};


    document.getElementById(
        "gpsStatusText"
    ).textContent =
        location.gpsStatus ||
        "WAITING";


    document.getElementById(
        "gpsStatusDetail"
    ).textContent =
        location.gpsStatus ||
        "WAITING";


    document.getElementById(
        "latitudeValue"
    ).textContent =
        location.latitude == null
            ? "—"
            : Number(
                location.latitude
            ).toFixed(5);


    document.getElementById(
        "longitudeValue"
    ).textContent =
        location.longitude == null
            ? "—"
            : Number(
                location.longitude
            ).toFixed(5);


    document.getElementById(
        "satelliteValue"
    ).textContent =
        location.satellites == null
            ? "—"
            : location.satellites;


    document.getElementById(
        "accuracyValue"
    ).textContent =
        location.accuracy == null
            ? "—"
            : `±${location.accuracy} m`;


    document.getElementById(
        "speedValue"
    ).textContent =
        location.speed == null
            ? "—"
            : `${Number(
                location.speed
            ).toFixed(1)} km/h`;


    document.getElementById(
        "gpsUpdatedValue"
    ).textContent =
        location.timestamp
            ? formatTimeAgo(
                location.timestamp
            )
            : "Waiting";

}


/* =========================================================
   CONFIGURATION UI
========================================================= */

function updateConfigurationUI(
    box
) {

    /*
        Never overwrite user input while
        they are typing.
    */

    if (
        settingsFormDirty
    ) {

        return;

    }


    const config =
        box.configuration ||
        {};


    document.getElementById(
        "productName"
    ).value =
        box.productName ||
        "";


    document.getElementById(
        "productCategory"
    ).value =
        box.category ||
        "Other";


    document.getElementById(
        "temperatureMin"
    ).value =
        config.temperatureMin ??
        "";


    document.getElementById(
        "temperatureMax"
    ).value =
        config.temperatureMax ??
        "";


    document.getElementById(
        "humidityMin"
    ).value =
        config.humidityMin ??
        "";


    document.getElementById(
        "humidityMax"
    ).value =
        config.humidityMax ??
        "";

}


/* =========================================================
   SAVE SETTINGS
========================================================= */

settingsForm.addEventListener(
    "submit",
    async function (event) {

        event.preventDefault();


        if (
            !currentUser ||
            !selectedBoxId
        ) {

            return;

        }


        const productName =
            document
                .getElementById(
                    "productName"
                )
                .value
                .trim();


        const category =
            document
                .getElementById(
                    "productCategory"
                )
                .value;


        const temperatureMinValue =
            document
                .getElementById(
                    "temperatureMin"
                )
                .value
                .trim();


        const temperatureMaxValue =
            document
                .getElementById(
                    "temperatureMax"
                )
                .value
                .trim();


        const humidityMinValue =
            document
                .getElementById(
                    "humidityMin"
                )
                .value
                .trim();


        const humidityMaxValue =
            document
                .getElementById(
                    "humidityMax"
                )
                .value
                .trim();


        /*
            Convert empty values to null.
        */

        const temperatureMin =
            temperatureMinValue === ""
                ? null
                : Number(
                    temperatureMinValue
                );


        const temperatureMax =
            temperatureMaxValue === ""
                ? null
                : Number(
                    temperatureMaxValue
                );


        const humidityMin =
            humidityMinValue === ""
                ? null
                : Number(
                    humidityMinValue
                );


        const humidityMax =
            humidityMaxValue === ""
                ? null
                : Number(
                    humidityMaxValue
                );


        /*
            Validate temperature only
            if both values are supplied.
        */

        if (
            temperatureMin !== null &&
            temperatureMax !== null &&
            temperatureMin >=
            temperatureMax
        ) {

            alert(
                "Minimum temperature must be lower than maximum temperature."
            );

            return;

        }


        /*
            Validate humidity only
            if both values are supplied.
        */

        if (
            humidityMin !== null &&
            humidityMax !== null &&
            humidityMin >=
            humidityMax
        ) {

            alert(
                "Minimum humidity must be lower than maximum humidity."
            );

            return;

        }


        if (
            humidityMin !== null &&
            (
                humidityMin < 0 ||
                humidityMin > 100
            )
        ) {

            alert(
                "Humidity must be between 0% and 100%."
            );

            return;

        }


        if (
            humidityMax !== null &&
            (
                humidityMax < 0 ||
                humidityMax > 100
            )
        ) {

            alert(
                "Humidity must be between 0% and 100%."
            );

            return;

        }


        const boxPath =
            `boxes/${currentUser.uid}/${selectedBoxId}`;


        try {

            await update(
                ref(
                    db,
                    boxPath
                ),
                {

                    productName:
                        productName ||
                        null,

                    category:
                        category ||
                        null,

                    "configuration/temperatureMin":
                        temperatureMin,

                    "configuration/temperatureMax":
                        temperatureMax,

                    "configuration/humidityMin":
                        humidityMin,

                    "configuration/humidityMax":
                        humidityMax

                }
            );


            /*
                Firebase saved successfully.
            */

            settingsFormDirty =
                false;


            const message =
                document.getElementById(
                    "settingsMessage"
                );


            message.textContent =
                "Settings saved to Firebase.";


            setTimeout(
                function () {

                    message.textContent =
                        "";

                },
                3000
            );

        }

        catch (error) {

            console.error(
                "Settings save error:",
                error
            );


            alert(
                `Could not save settings.\n\n${
                    error?.message ||
                    "Check Firebase Rules."
                }`
            );

        }

    }
);


/* =========================================================
   CREATE BOX
========================================================= */

createBoxButton.addEventListener(
    "click",
    function () {

        createBoxModal.classList.remove(
            "hidden"
        );


        document.getElementById(
            "newBoxName"
        ).focus();

    }
);


/* ---------------------------------------------------------
   CREATE BOX - CLOSE
--------------------------------------------------------- */

document.getElementById(
    "closeCreateBox"
).addEventListener(
    "click",
    closeCreateBoxModal
);


document.getElementById(
    "cancelCreateBox"
).addEventListener(
    "click",
    closeCreateBoxModal
);


function closeCreateBoxModal() {

    createBoxModal.classList.add(
        "hidden"
    );

    createBoxForm.reset();

}


/* ---------------------------------------------------------
   CREATE BOX - SUBMIT
--------------------------------------------------------- */

createBoxForm.addEventListener(
    "submit",
    async function (event) {

        event.preventDefault();


        if (!currentUser) {

            return;

        }


        const name =
            document
                .getElementById(
                    "newBoxName"
                )
                .value
                .trim();


        const deviceId =
            document
                .getElementById(
                    "newBoxDevice"
                )
                .value
                .trim();


        if (
            !name ||
            !deviceId
        ) {

            alert(
                "Please enter both the box name and ESP32 device ID."
            );

            return;

        }


        try {

            /*
                Generate unique Firebase box ID.
            */

            const boxCollectionRef =
                ref(
                    db,
                    `boxes/${currentUser.uid}`
                );


            const newBoxRef =
                push(
                    boxCollectionRef
                );


            /*
                Create completely empty box.
            */

            await set(
                newBoxRef,
                createEmptyBox(
                    name,
                    deviceId
                )
            );


            /*
                Select new box.
            */

            selectedBoxId =
                newBoxRef.key;


            settingsFormDirty =
                false;


            closeCreateBoxModal();


            /*
                Listener will automatically
                render the new box.
            */

        }

        catch (error) {

            console.error(
                "Create box error:",
                error
            );


            alert(
                `Could not create the box.\n\n${
                    error?.message ||
                    "Check Firebase Rules."
                }`
            );

        }

    }
);


/* =========================================================
   RENAME BOX
========================================================= */

renameBoxButton.addEventListener(
    "click",
    function () {

        if (
            !currentUser ||
            !selectedBoxId
        ) {

            return;

        }


        const currentName =
            document.getElementById(
                "selectedBoxName"
            ).textContent;


        document.getElementById(
            "renameBoxInput"
        ).value =
            currentName ===
            "Unnamed Box"
                ? ""
                : currentName;


        renameBoxModal.classList.remove(
            "hidden"
        );


        document.getElementById(
            "renameBoxInput"
        ).focus();

    }
);


/* ---------------------------------------------------------
   RENAME CLOSE
--------------------------------------------------------- */

document.getElementById(
    "closeRenameBox"
).addEventListener(
    "click",
    closeRenameBoxModal
);


document.getElementById(
    "cancelRenameBox"
).addEventListener(
    "click",
    closeRenameBoxModal
);


function closeRenameBoxModal() {

    renameBoxModal.classList.add(
        "hidden"
    );

    renameBoxForm.reset();

}


/* ---------------------------------------------------------
   RENAME SUBMIT
--------------------------------------------------------- */

renameBoxForm.addEventListener(
    "submit",
    async function (event) {

        event.preventDefault();


        const newName =
            document
                .getElementById(
                    "renameBoxInput"
                )
                .value
                .trim();


        if (
            !currentUser ||
            !selectedBoxId ||
            !newName
        ) {

            return;

        }


        try {

            await update(
                ref(
                    db,
                    `boxes/${currentUser.uid}/${selectedBoxId}`
                ),
                {
                    name: newName
                }
            );


            closeRenameBoxModal();

        }

        catch (error) {

            console.error(
                "Rename error:",
                error
            );


            alert(
                `Could not rename the box.\n\n${
                    error?.message ||
                    "Check Firebase Rules."
                }`
            );

        }

    }
);


/* =========================================================
   LIVE MODE
========================================================= */

function setLiveMode() {

    if (liveModeButton) {

        liveModeButton.classList.add(
            "active"
        );

    }


    if (demoModeButton) {

        demoModeButton.classList.remove(
            "active"
        );

    }


    const dataSource =
        document.getElementById(
            "dataSourceLabel"
        );


    if (dataSource) {

        dataSource.textContent =
            "LIVE";

    }


    const status =
        document.getElementById(
            "workspaceStatusText"
        );


    if (status) {

        status.textContent =
            "Live device mode";

    }


    const description =
        document.getElementById(
            "workspaceStatusDescription"
        );


    if (description) {

        description.textContent =
            "— waiting for ESP32 Firebase data";

    }

}


/*
    Keep the existing LIVE/DEMO buttons from
    accidentally starting fake data.

    DEMO is now disabled because we are moving
    to the real ESP32.
*/

if (liveModeButton) {

    liveModeButton.addEventListener(
        "click",
        function () {

            setLiveMode();

        }
    );

}


if (demoModeButton) {

    demoModeButton.disabled =
        true;

    demoModeButton.title =
        "Demo mode is disabled in the real-device version.";

}


/* =========================================================
   CONDITION HELPERS
========================================================= */

function getCondition(
    value,
    min,
    max
) {

    if (
        min == null ||
        max == null
    ) {

        return {

            text:
                "WAITING",

            className:
                "normal"

        };

    }


    if (
        value <
        min
    ) {

        return {

            text:
                "LOW",

            className:
                "warning"

        };

    }


    if (
        value >
        max
    ) {

        return {

            text:
                "HIGH",

            className:
                "danger"

        };

    }


    return {

        text:
            "NORMAL",

        className:
            "normal"

    };

}


function setConditionUI(
    element,
    condition
) {

    if (!element) {

        return;

    }


    element.className =
        `condition ${condition.className}`;


    element.innerHTML =
        `<span></span>${condition.text}`;

}


function setConditionWaiting(
    element
) {

    if (!element) {

        return;

    }


    element.className =
        "condition normal";


    element.innerHTML =
        "<span></span>WAITING";

}


/* =========================================================
   CHARTS
========================================================= */

function updateCharts(
    box
) {

    const history =
        Object.values(
            box.sensorHistory || {}
        );


    const recent =
        history.slice(
            -12
        );


    /*
        No readings yet.
    */

    if (
        recent.length === 0
    ) {

        clearChart(
            "temperaturePath"
        );

        clearChart(
            "humidityPath"
        );

        clearChart(
            "analyticsTemperaturePath"
        );

        clearChart(
            "analyticsHumidityPath"
        );

        updateLocationHistory(
            box
        );

        return;

    }


    const temperatures =
        recent
            .filter(
                item =>
                    item.temperature != null
            )
            .map(
                item =>
                    Number(
                        item.temperature
                    )
            );


    const humidities =
        recent
            .filter(
                item =>
                    item.humidity != null
            )
            .map(
                item =>
                    Number(
                        item.humidity
                    )
            );


    document.getElementById(
        "temperaturePath"
    ).setAttribute(
        "d",
        buildSVGPath(
            temperatures,
            700,
            100
        )
    );


    document.getElementById(
        "humidityPath"
    ).setAttribute(
        "d",
        buildSVGPath(
            humidities,
            700,
            100
        )
    );


    document.getElementById(
        "analyticsTemperaturePath"
    ).setAttribute(
        "d",
        buildSVGPath(
            temperatures,
            700,
            120
        )
    );


    document.getElementById(
        "analyticsHumidityPath"
    ).setAttribute(
        "d",
        buildSVGPath(
            humidities,
            700,
            120
        )
    );


    updateLocationHistory(
        box
    );

}


function clearChart(
    elementId
) {

    const element =
        document.getElementById(
            elementId
        );


    if (element) {

        element.setAttribute(
            "d",
            ""
        );

    }

}


function buildSVGPath(
    values,
    width,
    height
) {

    if (
        !values ||
        values.length === 0
    ) {

        return "";

    }


    const min =
        Math.min(
            ...values
        );


    const max =
        Math.max(
            ...values
        );


    const range =
        Math.max(
            max - min,
            0.5
        );


    return values
        .map(
            function (
                value,
                index
            ) {

                const x =
                    values.length === 1
                        ? 0
                        : (
                            index /
                            (
                                values.length -
                                1
                            )
                        ) *
                        width;


                const y =
                    height -
                    (
                        (
                            value -
                            min
                        ) /
                        range
                    ) *
                    (
                        height -
                        20
                    );


                return `${
                    index === 0
                        ? "M"
                        : "L"
                } ${x} ${y}`;

            }
        )
        .join(" ");

}


/* =========================================================
   LOCATION HISTORY
========================================================= */

function updateLocationHistory(
    box
) {

    const container =
        document.getElementById(
            "locationHistoryBars"
        );


    if (!container) {

        return;

    }


    container.innerHTML =
        "";


    const entries =
        Object.values(
            box.locationHistory || {}
        );


    const count =
        Math.min(
            5,
            entries.length
        );


    for (
        let i = 0;
        i < 5;
        i++
    ) {

        const bar =
            document.createElement(
                "span"
            );


        if (
            count > 0 &&
            i === 4
        ) {

            bar.classList.add(
                "active"
            );

        }


        container.appendChild(
            bar
        );

    }

}


/* =========================================================
   ACTIVITY
========================================================= */

function updateActivity(
    box
) {

    const container =
        document.getElementById(
            "activityList"
        );


    if (!container) {

        return;

    }


    container.innerHTML =
        "";


    const alerts =
        Object.values(
            box.alerts || {}
        )
        .sort(
            function (
                a,
                b
            ) {

                return Number(
                    b.timestamp || 0
                ) -
                Number(
                    a.timestamp || 0
                );

            }
        )
        .slice(
            0,
            6
        );


    if (
        alerts.length === 0
    ) {

        container.innerHTML = `
            <div class="activity-item">
                <span></span>

                <div class="activity-content">

                    <div class="activity-message">
                        No recent activity
                    </div>

                    <div class="activity-time">
                        Waiting for ESP32 data.
                    </div>

                </div>
            </div>
        `;

        return;

    }


    alerts.forEach(
        function (
            alert
        ) {

            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "activity-item";


            item.innerHTML = `

                <span></span>

                <div class="activity-content">

                    <div class="activity-message">
                        ${escapeHTML(
                            alert.title ||
                            "Activity"
                        )}
                    </div>

                    ${
                        alert.message
                            ? `
                                <div class="activity-time">
                                    ${escapeHTML(
                                        alert.message
                                    )}
                                </div>
                            `
                            : ""
                    }

                    <div class="activity-time">
                        ${formatTimeAgo(
                            alert.timestamp
                        )}
                    </div>

                </div>

            `;


            container.appendChild(
                item
            );

        }
    );

}


/* =========================================================
   SYSTEM STATUS
========================================================= */

function updateSystemStatus(
    box
) {

    const config =
        box.configuration ||
        {};


    const liveData =
        box.liveData ||
        {};


    const temperature =
        liveData.temperature;


    const humidity =
        liveData.humidity;


    const online =
        box.deviceStatus?.online === true;


    const gpsFixed =
        box.location?.gpsStatus ===
        "FIXED";


    /*
        If there is no ESP32 connection
        yet, show waiting state.
    */

    if (!online) {

        document.getElementById(
            "overallStatus"
        ).textContent =
            "WAITING";


        const indicator =
            document.getElementById(
                "overallStatusIndicator"
            );


        indicator.style.color =
            "var(--brown)";


        indicator.innerHTML = `
            <span></span>
            Waiting for ESP32
        `;


    }

    else {

        let normal =
            true;


        if (
            temperature != null &&
            config.temperatureMin != null &&
            config.temperatureMax != null
        ) {

            normal =
                normal &&
                temperature >=
                    config.temperatureMin &&
                temperature <=
                    config.temperatureMax;

        }


        if (
            humidity != null &&
            config.humidityMin != null &&
            config.humidityMax != null
        ) {

            normal =
                normal &&
                humidity >=
                    config.humidityMin &&
                humidity <=
                    config.humidityMax;

        }


        document.getElementById(
            "overallStatus"
        ).textContent =
            normal
                ? "NORMAL"
                : "ATTENTION";


        const indicator =
            document.getElementById(
                "overallStatusIndicator"
            );


        indicator.style.color =
            normal
                ? "var(--green)"
                : "var(--red)";


        indicator.innerHTML = `
            <span></span>
            ${
                normal
                    ? "All conditions within limits"
                    : "One or more conditions need attention"
            }
        `;

    }


    const rows =
        document.getElementById(
            "systemStatusRows"
        );


    rows.innerHTML =
        "";


    /*
        Temperature status
    */

    let temperatureGood =
        false;


    let temperatureDescription =
        "Waiting for ESP32 temperature";


    if (
        temperature != null
    ) {

        if (
            config.temperatureMin != null &&
            config.temperatureMax != null
        ) {

            temperatureGood =
                temperature >=
                config.temperatureMin &&
                temperature <=
                config.temperatureMax;


            temperatureDescription =
                `${Number(
                    temperature
                ).toFixed(1)}°C · Within ${
                    config.temperatureMin
                }–${
                    config.temperatureMax
                }°C`;

        }

        else {

            temperatureGood =
                true;

            temperatureDescription =
                `${Number(
                    temperature
                ).toFixed(1)}°C · Limits not set`;

        }

    }


    addSystemStatusRow(
        rows,
        temperatureGood,
        temperatureGood
            ? "Temperature stable"
            : "Temperature waiting",
        temperatureDescription
    );


    /*
        Humidity status
    */

    let humidityGood =
        false;


    let humidityDescription =
        "Waiting for ESP32 humidity";


    if (
        humidity != null
    ) {

        if (
            config.humidityMin != null &&
            config.humidityMax != null
        ) {

            humidityGood =
                humidity >=
                config.humidityMin &&
                humidity <=
                config.humidityMax;


            humidityDescription =
                `${Number(
                    humidity
                ).toFixed(0)}% · Within ${
                    config.humidityMin
                }–${
                    config.humidityMax
                }%`;

        }

        else {

            humidityGood =
                true;

            humidityDescription =
                `${Number(
                    humidity
                ).toFixed(0)}% · Limits not set`;

        }

    }


    addSystemStatusRow(
        rows,
        humidityGood,
        humidityGood
            ? "Humidity stable"
            : "Humidity waiting",
        humidityDescription
    );


    /*
        ESP32 status
    */

    addSystemStatusRow(
        rows,
        online,
        online
            ? "ESP32 connected"
            : "ESP32 offline",
        online
            ? "Device heartbeat detected"
            : "Waiting for ESP32"
    );


    /*
        GPS status
    */

    addSystemStatusRow(
        rows,
        gpsFixed,
        gpsFixed
            ? "GPS signal acquired"
            : "GPS waiting",
        gpsFixed
            ? "Location data available"
            : "Waiting for GPS fix"
    );

}


function addSystemStatusRow(
    container,
    good,
    title,
    description
) {

    const row =
        document.createElement(
            "div"
        );


    row.className =
        "system-status-row";


    row.innerHTML = `

        <span
            class="system-status-icon
            ${good ? "" : "warning"}"
        ></span>

        <div class="system-status-text">

            <strong>
                ${escapeHTML(
                    title
                )}
            </strong>

            <span>
                ${escapeHTML(
                    description
                )}
            </span>

        </div>
    `;


    container.appendChild(
        row
    );

}


/* =========================================================
   MAP
========================================================= */

function initializeMap() {

    /*
        Don't initialize it multiple times.
    */

    if (map) {

        return;

    }


    const mapElement =
        document.getElementById(
            "map"
        );


    if (!mapElement) {

        return;

    }


    map =
        L.map(
            "map"
        ).setView(
            [
                28.61386,
                77.20896
            ],
            14
        );


    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {

            maxZoom: 19,

            attribution:
                "&copy; OpenStreetMap contributors"

        }
    ).addTo(
        map
    );


    mapMarker =
        L.circleMarker(
            [
                28.61386,
                77.20896
            ],
            {

                radius:
                    9,

                color:
                    "#795d48",

                fillColor:
                    "#795d48",

                fillOpacity:
                    0.9,

                weight:
                    3

            }
        ).addTo(
            map
        );

}


/* ---------------------------------------------------------
   UPDATE MAP
--------------------------------------------------------- */

function updateMap(
    box
) {

    /*
        No map data yet.
    */

    const latitude =
        Number(
            box.location?.latitude
        );


    const longitude =
        Number(
            box.location?.longitude
        );


    if (
        !Number.isFinite(
            latitude
        ) ||
        !Number.isFinite(
            longitude
        )
    ) {

        return;

    }


    if (!map) {

        initializeMap();

    }


    if (
        !map ||
        !mapMarker
    ) {

        return;

    }


    mapMarker.setLatLng(
        [
            latitude,
            longitude
        ]
    );


    mapMarker.bindPopup(
        `<strong>${escapeHTML(
            box.name ||
            "ECOpack Box"
        )}</strong><br>
        ${latitude.toFixed(5)},
        ${longitude.toFixed(5)}`
    );


    map.panTo(
        [
            latitude,
            longitude
        ],
        {
            animate:
                true,

            duration:
                0.6

        }
    );


    setTimeout(
        function () {

            map.invalidateSize();

        },
        200
    );

}


/* =========================================================
   UNSUBSCRIBE FIREBASE LISTENERS
========================================================= */

function unsubscribeListeners() {

    if (boxesListener) {

        boxesListener();

        boxesListener = null;

    }


    if (selectedBoxListener) {

        selectedBoxListener();

        selectedBoxListener = null;

    }

}


/* =========================================================
   MODAL BACKDROP
========================================================= */

createBoxModal.addEventListener(
    "click",
    function (event) {

        if (
            event.target ===
            createBoxModal
        ) {

            closeCreateBoxModal();

        }

    }
);


renameBoxModal.addEventListener(
    "click",
    function (event) {

        if (
            event.target ===
            renameBoxModal
        ) {

            closeRenameBoxModal();

        }

    }
);


/* =========================================================
   ESCAPE KEY
========================================================= */

document.addEventListener(
    "keydown",
    function (event) {

        if (
            event.key ===
            "Escape"
        ) {

            closeCreateBoxModal();

            closeRenameBoxModal();

        }

    }
);


/* =========================================================
   FIREBASE AUTH ERROR TRANSLATION
========================================================= */

function firebaseAuthError(
    error
) {

    switch (
        error.code
    ) {

        case "auth/email-already-in-use":

            return (
                "This email is already registered."
            );


        case "auth/invalid-email":

            return (
                "Please enter a valid email address."
            );


        case "auth/weak-password":

            return (
                "Password is too weak. Use at least 6 characters."
            );


        case "auth/invalid-credential":

            return (
                "Incorrect email or password."
            );


        case "auth/user-not-found":

            return (
                "No account exists with this email."
            );


        case "auth/wrong-password":

            return (
                "Incorrect email or password."
            );


        case "auth/too-many-requests":

            return (
                "Too many attempts. Please wait and try again."
            );


        default:

            return (
                error.message ||
                "Authentication failed."
            );

    }

}


/* =========================================================
   TIME
========================================================= */

function formatTimeAgo(
    timestamp
) {

    if (
        timestamp == null
    ) {

        return "unknown";

    }


    const numericTimestamp =
        Number(
            timestamp
        );


    if (
        !Number.isFinite(
            numericTimestamp
        )
    ) {

        return "unknown";

    }


    /*
        The ESP32 currently may use millis()
        rather than Unix time.

        Detect very small uptime values so
        we don't accidentally calculate nonsense.
    */

    if (
        numericTimestamp < 100000000000
    ) {

        return "recently";

    }


    const seconds =
        Math.floor(
            (
                Date.now() -
                numericTimestamp
            ) /
            1000
        );


    if (
        seconds < 5
    ) {

        return "just now";

    }


    if (
        seconds < 60
    ) {

        return `${seconds}s ago`;

    }


    const minutes =
        Math.floor(
            seconds /
            60
        );


    if (
        minutes < 60
    ) {

        return `${minutes}m ago`;

    }


    const hours =
        Math.floor(
            minutes /
            60
        );


    return `${hours}h ago`;

}


/* =========================================================
   HTML ESCAPE
========================================================= */

function escapeHTML(
    value
) {

    return String(
        value
    )

        .replaceAll(
            "&",
            "&amp;"
        )

        .replaceAll(
            "<",
            "&lt;"
        )

        .replaceAll(
            ">",
            "&gt;"
        )

        .replaceAll(
            '"',
            "&quot;"
        )

        .replaceAll(
            "'",
            "&#039;"
        );

}


/* =========================================================
   INITIALIZATION
========================================================= */

console.log(
    "ECOpack real Firebase frontend loaded."
);