// js/importDocument.js

const drive = require("./drive");
const sheets = require("./sheets");

async function importDocument(
    filePath,
    originalName,
    email
) {

    const settings =
        await sheets.getSettings(
            email
        );

    const fileId =
        await drive.uploadFile(
            email,
            filePath,
            originalName,
            settings.Exercice
        );

    const pdfUrl =
        `https://drive.google.com/file/d/${fileId}/view`;

    return {

        fileId,

        pdfUrl

    };

}

module.exports = {
    importDocument
};
