const fs = require("fs");
const { google } = require("googleapis");

const oauth2Client = new google.auth.OAuth2(
    "859419987812-qg32bdvidiaav5k0ige4dafq247j9v4b.apps.googleusercontent.com",
    "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",
    "http://localhost:3000/oauth/callback"
);

if(fs.existsSync("oauth-token.json")){
 
const tokens = JSON.parse(
fs.readFileSync("oauth-token.json")
);
 
oauth2Client.setCredentials(tokens);
 
console.log("✅ OAuth restauré");
}
 
module.exports = oauth2Client;