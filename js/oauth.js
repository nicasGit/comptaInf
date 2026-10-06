//oauth.js
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




module.exports = oauth2Client;