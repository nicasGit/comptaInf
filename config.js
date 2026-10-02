// config.js

const fs = require("fs");
const path = require("path");

let currentEnvironment = null;

const DATA_DIR =
    process.env.DATA_DIR ||
    path.join(__dirname, "data");


const USERS_FILE =
    path.join(DATA_DIR, "users.json");

const SETTINGS_FILE =
    path.join(DATA_DIR, "settings.json");


const GOOGLE_USER_FILE =
    path.join(DATA_DIR, "google-user.json");


function getSettings() {

    return JSON.parse(
        fs.readFileSync(
            SETTINGS_FILE,
            "utf8"
        )
    );

}

function getCurrentUser() {

    const googleUser = JSON.parse(
        fs.readFileSync(
            GOOGLE_USER_FILE,
            "utf8"
        )
    );

    const users = JSON.parse(
        fs.readFileSync(
            USERS_FILE,
            "utf8"
        )
    );

    return users.users.find(
        u =>
            u.email.toLowerCase() ===
            googleUser.email.toLowerCase()
    );

}

function getEnvironment() {

    if (currentEnvironment) {
        return currentEnvironment;
    }

    const user = getCurrentUser();

    return (
        user.environment ||
        user.defaultEnvironment ||
        "DEV"
    );
}

function setEnvironmentOLD(env) {

    currentEnvironment = env;

}

function setEnvironment(email, environment) {

    currentEnvironment = environment;

    const users = JSON.parse(
        fs.readFileSync(USERS_FILE, "utf8")
    );

    const user = users.users.find(
        u => u.email === email
    );

    if (!user) {
        throw new Error(
            "Utilisateur introuvable"
        );
    }

    user.environment = environment;

    fs.writeFileSync(
        USERS_FILE,
        JSON.stringify(users, null, 2)
    );
}


function getConfig() {

    const settings = getSettings();
    const environment = getEnvironment();

    return settings[environment];

}

function getExercice() {

    const user = getCurrentUser();

    return user.exercice;

}
function setExercice(email, exercice) {

    const users = getUsers();

    const user =
        users.users.find(
            u => u.email === email
        );

    user.exercice = exercice;

    saveUsers(users);

}

module.exports = {
    getEnvironment,
    setEnvironment,
    getCurrentUser,
    getExercice,
    setExercice,
    getSettings,
    getConfig
};