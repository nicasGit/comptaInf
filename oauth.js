const fs = require("fs");
const { google } = require("googleapis");
const path = require("path");

const oauth2Client = new google.auth.OAuth2(
    "859419987812-qg32bdvidiaav5k0ige4dafq247j9v4b.apps.googleusercontent.com",
    "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",
    "http://localhost:3000/oauth/callback"
);


const DATA_DIR =
    process.env.DATA_DIR ||
    path.join(__dirname, "data");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const OAUTH_TOKEN_FILE =
    path.join(DATA_DIR, "oauth-token.json");


if (fs.existsSync(OAUTH_TOKEN_FILE)) {

    const tokens = JSON.parse(
        fs.readFileSync(OAUTH_TOKEN_FILE)
    );

    oauth2Client.setCredentials(tokens);

    console.log("✅ OAuth restauré");
}

module.exports = oauth2Client;