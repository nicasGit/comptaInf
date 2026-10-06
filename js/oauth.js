const fs = require("fs");
const { google } = require("googleapis");
const path = require("path");



const DATA_DIR =
    process.env.DATA_DIR ||
    path.join(__dirname, "..", "data");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const oauthConfig = JSON.parse(
    fs.readFileSync(
        path.join(
            DATA_DIR,
            "oauth-client.json"
        ),
        "utf8"
    )
);

const oauth2Client =
    new google.auth.OAuth2(
        oauthConfig.client_id,
        oauthConfig.client_secret,
        oauthConfig.redirect_uri
    );


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