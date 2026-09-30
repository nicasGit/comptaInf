const { google } = require("googleapis");
const oauth2Client = require("./oauth");

const ROOT_FOLDER_ID =
    "1TlTV_Q-FPtPjxSRTazLLCeLhOEyEL-70";

async function getDrive(){

    return google.drive({

        version: "v3",
        auth: oauth2Client

    });

}

async function getOrCreateFolder(
    drive,
    parentId,
    folderName
){

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

    if(result.data.files.length){

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

async function getConfigFolderId(){

    const drive =
        await getDrive();

    return await getOrCreateFolder(
        drive,
        ROOT_FOLDER_ID,
        "config"
    );

}

async function findFile(
    drive,
    parentId,
    fileName
){

    const result =
        await drive.files.list({

            q: `
                '${parentId}' in parents
                and name='${fileName}'
                and trashed=false
            `,

            fields: "files(id,name)"

        });

    return result.data.files[0] || null;

}

async function loadJson(fileName){

return {};
 

    const drive =
        await getDrive();

    const configFolderId =
        await getConfigFolderId();

    const file =
        await findFile(
            drive,
            configFolderId,
            fileName
        );
console.log("file :", file);
    if(!file){

        return {};
    }
console.log("Config folder :", configFolderId);

const fileX =
    await findFile(
        drive,
        configFolderId,
        fileName
    );

console.log("File trouvé :", fileX);

    const response =
        await drive.files.get({

            fileId: file.id,

            alt: "media"

        });

    return response.data;

}

async function saveJson(
    fileName,
    data
){

    const drive =
        await getDrive();

    const configFolderId =
        await getConfigFolderId();

    const existingFile =
        await findFile(
            drive,
            configFolderId,
            fileName
        );

    const media = {

        mimeType:
            "application/json",

        body:
            Buffer.from(
                JSON.stringify(
                    data,
                    null,
                    4
                )
            )

    };

    if(existingFile){

        await drive.files.update({

            fileId:
                existingFile.id,

            media

        });

        return existingFile.id;
    }

    const file =
        await drive.files.create({

            requestBody: {

                name: fileName,

                parents: [
                    configFolderId
                ]

            },

            media,

            fields: "id"

        });

    return file.data.id;
}

module.exports = {

    loadJson,
    saveJson

};
