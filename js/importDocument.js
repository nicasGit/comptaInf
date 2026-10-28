// js/importDocument.js
const drive = require("./drive");
const { convertImageToPdf } = require("../utils/utils");

async function importDocument(
    filePath,
    originalName,
    email
) {
    //console.log("function importDocument", filePath, originalName);

    const sheets = require("./sheets");
    const settings =
        await sheets.getSettings(email);

    //convertion image en pdf 
    if (/\.(jpg|jpeg|png)$/i.test(originalName)) {

        const pdfResult =
            await convertImageToPdf(
                filePath,
                originalName
            );

        filePath =
            pdfResult.filePath;

        originalName =
            pdfResult.originalName;
    }

    console.log("📥 import " + originalName)

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
