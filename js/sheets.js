//Sheets.js
const { google } = require("googleapis");
const path = require("path");
const { getConfig } = require("./config");
const { convertDate } = require("../utils/utils");


const DATA_DIR =
    process.env.DATA_DIR ||
    path.join(__dirname, "..", "data");

const SERVICE_ACCOUNT_FILE =
    path.join(
        DATA_DIR,
        "service-account.json"
    );


const auth = new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_FILE,
    scopes: [
        "https://www.googleapis.com/auth/spreadsheets"
    ]
});



function getSpreadsheetId(email) {

    const config = getConfig(email);
    return config.SpreadsheetId;
}

function getConfigSpreadsheetId(email) {

    return getConfig(email).SpreadsheetIdConfig;

}

function getSheets() {
    return google.sheets({
        version: "v4",
        auth: auth
    });
}


async function addDepense(email, date, fournisseur, categorie, compte, montant, pdf, operationType, commentaire = "", justifBanque = "") {

    // console.log("sheet addDepense")

    //const client = await auth.getClient();

    const sheets = getSheets();

    const montantFinal =
        (
            operationType === "RECETTE"
                ? Math.abs(parseFloat(montant))
                : -Math.abs(parseFloat(montant))
        )
            .toFixed(2)
            .replace(".", ",");

    const now = new Date().toLocaleString("fr-CH");

    const dateNormalized = convertDate(date);
    console.log("sheets date=" + dateNormalized);

    await sheets.spreadsheets.values.append({
        spreadsheetId: getSpreadsheetId(email),
        range: "DEPENSES!A:M",
        valueInputOption: "USER_ENTERED",
        requestBody: {
            values: [
                [
                    dateNormalized,
                    fournisseur,
                    categorie,
                    compte,
                    montantFinal,
                    pdf,
                    operationType,
                    commentaire,
                    justifBanque,
                    "",
                    now
                ]
            ]
        }
    });
    console.log("✅ Dépense ajoutée " + operationType + "  " + fournisseur + " " + montantFinal + " " + dateNormalized);
}

async function updateCell(
    email,
    cell,
    ligne,
    value
) {

    const sheetsApi = getSheets();

    await sheetsApi.spreadsheets.values.update({
        spreadsheetId: getSpreadsheetId(email),
        range: `DEPENSES!${cell}${ligne}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
            values: [[value]]
        }
    });

    return true;
}



async function getData(email) {

    const sheetsApi = getSheets();

    const response =
        await sheetsApi.spreadsheets.values.get({
            spreadsheetId: getSpreadsheetId(email),
            range: "DEPENSES!A:M"
        });

    return response.data.values || [];
}



async function getDepenses(email) {
    return getData(email);
}


async function getCategories(email) {

    const client = await auth.getClient();

    const sheets = getSheets();

    const response =
        await sheets.spreadsheets.values.get({

            spreadsheetId: getConfigSpreadsheetId(email),

            range: "CATEGORIES!A:B"

        });

    const rows =
        response.data.values || [];

    const categories = {};

    rows.slice(1).forEach(row => {

        categories[row[0]] = {
            compte: row[1] || ""
        };

    });

    return categories;
}

async function getFournisseurs(email) {

    const client = await auth.getClient();

    const sheets = getSheets();

    const response =
        await sheets.spreadsheets.values.get({

            spreadsheetId: getConfigSpreadsheetId(email),

            range: "FOURNISSEURS!A:B"

        });

    const rows =
        response.data.values || [];

    const fournisseurs = {};

    rows.slice(1).forEach(row => {

        fournisseurs[row[0]] = {
            categorie: row[1] || ""
        };

    });

    return fournisseurs;
}


async function getFournisseursConvert(email) {

    const client = await auth.getClient();

    const sheets = getSheets();

    const response =
        await sheets.spreadsheets.values.get({

            spreadsheetId: getConfigSpreadsheetId(email),

            range: "FOURNISSEURS_CONVERT!A:B"

        });

    const result = {};

    const rows =
        response.data.values || [];

    rows.forEach(row => {

        if (!row[0] || !row[1]) {
            return;
        }

        result[row[0]] = row[1];
    });

    return result;
}



async function getMontantOcrRules(email) {

    const ocrRules =
        await getOCRRules(email);

    return Object.fromEntries(
        Object.entries(ocrRules)
            .filter(([key]) =>
                key.startsWith("MONTANT_")
            )
    );
}

async function getVariableOcrRules(email) {

    const ocrRules =
        await getOCRRules(email);

    return Object.fromEntries(
        Object.entries(ocrRules)
            .filter(([key]) =>
                key.startsWith("VAR_")
            )
    );
}

async function getDateOcrRules(email) {

    const ocrRules =
        await getOCRRules(email);

    return Object.fromEntries(
        Object.entries(ocrRules)
            .filter(([key]) =>
                key.startsWith("DATE_")
            )
    );
}

async function getOCRRules(email) {

    const client = await auth.getClient();

    const sheets = getSheets();

    const response =
        await sheets.spreadsheets.values.get({

            spreadsheetId: getConfigSpreadsheetId(email),

            range: "OCR_RULES!A:B"

        });

    const rows =
        response.data.values || [];

    const result = {};

    rows.slice(0).forEach(row => {

        if (
            row[0] &&
            row[1]
        ) {

            result[row[0].trim()] =
                row[1].trim();

        }

    });

    return result;
}

async function getSettings(email) {

    const sheets = getSheets();

    const response =
        await sheets.spreadsheets.values.get({

            spreadsheetId: getConfigSpreadsheetId(email),

            range: "SETTINGS!A:B"

        });

    const rows =
        response.data.values || [];

    const settings = {};

    settings.GoogleSheetId = getSpreadsheetId(email);

    rows.slice(1).forEach(row => {

        settings[row[0]] =
            row[1];

    });

    return settings;

}

async function addCategorie(
    email,
    categorie,
    compte
) {

    const client =
        await auth.getClient();

    const sheetsApi = getSheets();

    await sheetsApi
        .spreadsheets
        .values
        .append({

            spreadsheetId:
                getConfigSpreadsheetId(email),

            range:
                "CATEGORIES!A:B",

            valueInputOption:
                "USER_ENTERED",

            requestBody: {

                values: [[
                    categorie,
                    compte || ""
                ]]

            }

        });

    console.log(
        "✅ Catégorie ajoutée :",
        categorie
    );

}
async function addFournisseur(
    email,
    fournisseur,
    categorie
) {

    const client =
        await auth.getClient();

    const sheetsApi = getSheets();

    await sheetsApi
        .spreadsheets
        .values
        .append({

            spreadsheetId:
                getConfigSpreadsheetId(email),

            range:
                "FOURNISSEURS!A:B",

            valueInputOption:
                "USER_ENTERED",

            requestBody: {

                values: [[
                    fournisseur,
                    categorie
                ]]

            }

        });

    console.log(
        "✅ Fournisseur ajouté :",
        fournisseur
    );

}

async function saveSetting(email, cle, valeur) {

    const client =
        await auth.getClient();

    const sheetsApi = getSheets();

    const response =
        await sheetsApi.spreadsheets.values.get({

            spreadsheetId:
                getConfigSpreadsheetId(email),

            range:
                "SETTINGS!A:B"

        });

    const rows =
        response.data.values || [];

    const index =
        rows.findIndex(
            row => row[0] === cle
        );

    if (index === -1) {

        await sheetsApi.spreadsheets.values.append({

            spreadsheetId:
                getConfigSpreadsheetId(email),

            range:
                "SETTINGS!A:B",

            valueInputOption:
                "USER_ENTERED",

            requestBody: {
                values: [
                    [cle, valeur]
                ]
            }

        });

    }
    else {

        await sheetsApi.spreadsheets.values.update({

            spreadsheetId:
                getConfigSpreadsheetId(email),

            range:
                `SETTINGS!B${index + 1}`,

            valueInputOption:
                "USER_ENTERED",

            requestBody: {
                values: [
                    [valeur]
                ]
            }

        });

    }

}


async function deleteRow(email, rowNumber) {

    console.log("function deleteRow", rowNumber);

    const sheetsApi = getSheets();

    const spreadsheet =
        await sheetsApi
            .spreadsheets
            .get({
                spreadsheetId:
                    getSpreadsheetId(email)
            });

    const sheetId =
        spreadsheet.data.sheets[0]
            .properties.sheetId;

    await sheetsApi.spreadsheets.batchUpdate({

        spreadsheetId:
            getSpreadsheetId(email),

        requestBody: {

            requests: [

                {
                    deleteDimension: {

                        range: {
                            sheetId,
                            dimension:
                                "ROWS",

                            startIndex:
                                rowNumber - 1,

                            endIndex:
                                rowNumber
                        }

                    }
                }

            ]

        }

    });

}

module.exports = {
    addDepense,
    getDepenses,
    getData,

    addCategorie,
    getCategories,

    addFournisseur,
    getFournisseurs,
    getFournisseursConvert,

    getOCRRules,
    getMontantOcrRules,
    getDateOcrRules,
    getVariableOcrRules,


    getSettings,
    saveSetting,


    deleteRow
};