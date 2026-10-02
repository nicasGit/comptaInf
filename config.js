// config.js

const fs = require("fs");
const path = require("path");


const DATA_DIR =
    process.env.DATA_DIR ||
    path.join(__dirname, "data");


const USERS_FILE =
    path.join(DATA_DIR, "users.json");

const SETTINGS_FILE =
    path.join(DATA_DIR, "settings.json");





function getSettings() {

    return JSON.parse(
        fs.readFileSync(
            SETTINGS_FILE,
            "utf8"
        )
    );

}
function getCurrentUser(email) {

    if (!email) {
        return null;
    }

    const users = JSON.parse(
        fs.readFileSync(
            USERS_FILE,
            "utf8"
        )
    );

    return users.users.find(
        u =>
            u.email.toLowerCase() ===
            email.toLowerCase()
    ) || null;

}

function getEnvironment(email) {

    const user =
        getCurrentUser(email);

    return (
        user?.environment ||
        "DEV"
    );

}

function setEnvironment(email, environment) {

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


function getConfig(email) {

    const settings =
        getSettings();

    const environment =
        getEnvironment(email);

    return settings[environment];

}

function getExercice(email) {

    const user =
        getCurrentUser(email);

    return user?.exercice;

}
function setExercice(
    email,
    exercice
) {

    const users = JSON.parse(
        fs.readFileSync(
            USERS_FILE,
            "utf8"
        )
    );

    const user =
        users.users.find(
            u => u.email === email
        );

    if (!user) {

        throw new Error(
            "Utilisateur introuvable"
        );

    }

    user.exercice = exercice;

    fs.writeFileSync(
        USERS_FILE,
        JSON.stringify(
            users,
            null,
            2
        )
    );

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