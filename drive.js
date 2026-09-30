const fs = require("fs");
const { google } = require("googleapis");
const { getEnvironment } =  require("./config");

const oauth2Client = require("./oauth");

const ROOT_FOLDER_ID =
    "1TlTV_Q-FPtPjxSRTazLLCeLhOEyEL-70";
const ROOT_FOLDER_DEV_ID =
    "1XDq_HxRtHYukIPeon7bsm_TwlUEWh8o6";

function getRootFolderId(){

    const environment =
        getEnvironment();

    return environment === "DEV"
        ? ROOT_FOLDER_DEV_ID
        : ROOT_FOLDER_ID;

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

    if(result.data.files.length > 0){

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

async function uploadFile(
    filePath,
    fileName,
    year
) {

    const drive = google.drive({

        version: "v3",
        auth: oauth2Client

    });

    //
    // 2026
    //
    const yearFolderId =
        await getOrCreateFolder(
            drive,
            getRootFolderId(),
            year.toString()
        );

    //
    // Justificatifs
    //
    const justificatifsFolderId =
        await getOrCreateFolder(
            drive,
            yearFolderId,
            "Justificatifs"
        );
    //
    // Upload
    //
    const response =
        await drive.files.create({

            requestBody: {

                name: fileName,

                parents: [
                    justificatifsFolderId
                ]

            },

            media: {

                mimeType:
                    "application/pdf",

                body:
                    fs.createReadStream(
                        filePath
                    )

            },

            fields: "id"

        });

    return response.data.id;
}

async function getExercices(){

    const drive = google.drive({

        version: "v3",
        auth: oauth2Client

    });

    const response =
        await drive.files.list({

            q: `
                '${getRootFolderId()}' in parents
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