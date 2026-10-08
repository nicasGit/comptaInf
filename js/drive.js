//drive.js
const fs = require("fs");
const { google } = require("googleapis");
const { getConfig } = require("./config");
const path = require("path");
const oauth2Client = require("./oauth");



const DATA_DIR =
    process.env.DATA_DIR ||
    path.join(__dirname, "..", "data");

const SERVICE_ACCOUNT_FILE =
    path.join(
        DATA_DIR,
        "service-account.json"
    );

const auth =
    new google.auth.GoogleAuth({
        keyFile: SERVICE_ACCOUNT_FILE,
        scopes: [
            "https://www.googleapis.com/auth/drive"
        ]
    });




function getDrive(email) {

    const tokenFile =
        path.join(DATA_DIR, "tokens.json");

    const tokensStore =
        JSON.parse(
            fs.readFileSync(
                tokenFile,
                "utf8"
            )
        );

    const tokens =
        tokensStore[email];

    if (!tokens) {

        throw new Error(
            `Aucun token trouvé pour ${email}`
        );

    }

    oauth2Client.setCredentials(tokens);

    return google.drive({
        version: "v3",
        auth: oauth2Client
    });
}

function getRootFolderId(email) {

    return getConfig(email).RootFolderId;

}


async function getFolderIdByName(
    drive,
    parentId,
    folderName
) {

    const result =
        await drive.files.list({
            q: `
                '${parentId}' in parents
                and name='${folderName}'
                and mimeType='application/vnd.google-apps.folder'
                and trashed=false
            `,
            fields: "files(id,name)"
        });

    return result.data.files[0]?.id;
}

async function getOrCreateFolder(
    drive,
    parentId,
    folderName
) {

    const result =
        await drive.files.list({

            q: `
                '${parentId}' in parents
                and name='${folderName}'
                and mimeType='application/vnd.google-apps.folder'
                and trashed=false
            `,

            fields: "files(id,name)"

        });

    if (result.data.files.length > 0) {

        return result.data.files[0].id;
    }

    const folder =
        await drive.files.create({

            requestBody: {

                name: folderName,

                mimeType:
                    "application/vnd.google-apps.folder",

                parents: [parentId]

            },

            fields: "id"

        });

    return folder.data.id;
}

const mime = require("mime-types");

async function uploadFile(
    email,
    filePath,
    fileName,
    year
) {

    let response;

    try {
        const config = getConfig(email);
        const drive = getDrive(email);

        const mimeType =
            mime.lookup(filePath)
            || "application/octet-stream";

        //
        // 2026
        //
        const yearFolderId =
            await getOrCreateFolder(
                drive,
                getRootFolderId(email),
                year.toString()
            );

        //
        // Justificatifs
        //
        const justificatifsFolderId =
            await getOrCreateFolder(
                drive,
                yearFolderId,
                config.FolderJustificatifs
            );
        //
        // Upload
        //
        response =
            await drive.files.create({

                requestBody: {

                    name: fileName,

                    parents: [
                        justificatifsFolderId
                    ]

                },

                media: {

                    mimeType,

                    body:
                        fs.createReadStream(
                            filePath
                        )

                },

                fields: "id"

            });
    }
    finally {
        if (
            filePath &&
            fs.existsSync(filePath)
        ) {

            fs.unlinkSync(filePath);

        }

    }

    return response.data.id;
}

async function getExercices(email) {

    const drive = getDrive(email);

    const response =
        await drive.files.list({

            q: `
                '${getRootFolderId(email)}' in parents
                and mimeType='application/vnd.google-apps.folder'
                and trashed=false
            `,

            fields: "files(id,name)"

        });

    return response.data.files
        .filter(f =>
            /^\d{4}$/.test(f.name)
        )
        .map(f => f.name)
        .sort()
        .reverse();

}

module.exports = {
    uploadFile,
    getExercices
};