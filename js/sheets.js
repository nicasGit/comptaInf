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

function dateCell(value) {
    const normalized = convertDate(String(value ?? "").replace(/^'+/, ""));
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) throw new Error("Date invalide");
    const [, year, month, day] = match.map(Number);
    const timestamp = Date.UTC(year, month - 1, day);
    const date = new Date(timestamp);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        throw new Error("Date invalide");
    }
    // Sheets stores dates as days since 1899-12-30, independent of time zone.
    return {
        userEnteredValue: { numberValue: (timestamp - Date.UTC(1899, 11, 30)) / 86400000 },
        userEnteredFormat: { numberFormat: { type: "DATE", pattern: "yyyy-mm-dd" } }
    };
}


async function addDepense(email, date, fournisseur, categorie, compte, montant, pdf, operationType, commentaire = "", justifBanque = "", litres = "") {

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

    const result = await sheets.spreadsheets.values.append({
        spreadsheetId: getSpreadsheetId(email),
        range: "DEPENSES!A:N",
        insertDataOption: "INSERT_ROWS",
        valueInputOption: "USER_ENTERED",
        requestBody: {
            values: [[
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
                now,
                "",
                "",
                litres
            ]]
        }
    });
    console.log("✅ Dépense ajoutée " + operationType + "  " + fournisseur + " " + montantFinal + " " + dateNormalized);
    const updatedRange = result.data.updates?.updatedRange || "";
    return { row: Number(updatedRange.match(/!A(\d+):/)?.[1]) || null };
}

// Append the replacement and remove old rows in one atomic Sheets request.
async function replaceDepenses(email, operations, oldRows) {
    const spreadsheetId = getSpreadsheetId(email);
    const sheetsApi = getSheets();
    const metadata = await sheetsApi.spreadsheets.get({ spreadsheetId });
    const sheet = metadata.data.sheets.find(item => item.properties.title === "DEPENSES");
    if (!sheet) throw new Error("Feuille DEPENSES introuvable");
    const sheetId = sheet.properties.sheetId;
    const rows = [...new Set(oldRows.map(Number))].sort((a, b) => b - a);
    if (rows.some(row => !Number.isInteger(row) || row < 2)) {
        throw new Error("Ligne de remplacement invalide");
    }
    const now = new Date().toLocaleString("fr-CH");
    const values = operations.map(operation => {
        const amount = Number(String(operation.montant).replace(",", "."));
        if (!Number.isFinite(amount)) throw new Error("Montant invalide");
        return [convertDate(operation.date), operation.fournisseur, operation.categorie || "",
            operation.compte || "", Number((operation.operationType === "RECETTE"
                ? Math.abs(amount) : -Math.abs(amount)).toFixed(2)), operation.pdf || "",
            operation.operationType || "DEPENSE", operation.commentaire || "",
            operation.justifBanque || "", "", now, "", "", operation.litres || ""];
    });
    if (!values.length) throw new Error("Aucune écriture de remplacement");
    await sheetsApi.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [
            { appendCells: { sheetId, fields: "userEnteredValue,userEnteredFormat.numberFormat", rows: values.map(row => ({
                values: row.map((value, column) => column === 0 ? dateCell(value) : ({ userEnteredValue: typeof value === "number"
                    ? { numberValue: value } : { stringValue: String(value) } }))
            })) } },
            ...rows.map(row => ({ deleteDimension: { range: {
                sheetId, dimension: "ROWS", startIndex: row - 1, endIndex: row
            } } }))
        ] }
    });
}

async function updateOperation(email, rowNumber, operation) {
    const sheetsApi = getSheets();
    const montant = Number(String(operation.montant ?? "").replace(/,/g, "."));
    const montantFinal = Number.isFinite(montant)
        ? (operation.operationType === "RECETTE"
            ? Math.abs(montant)
            : -Math.abs(montant)).toFixed(2).replace(".", ",")
        : operation.montant;

    await sheetsApi.spreadsheets.values.update({
        spreadsheetId: getSpreadsheetId(email),
        range: `DEPENSES!A${rowNumber}:H${rowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
            values: [[
                operation.date,
                operation.fournisseur,
                operation.categorie,
                operation.compte,
                montantFinal,
                operation.pdf,
                operation.operationType,
                operation.commentaire
            ]]
        }
    });
    return true;
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
            range: "DEPENSES!A:N"
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

            range: "FOURNISSEURS!A:C"

        });

    const rows =
        response.data.values || [];

    const fournisseurs = {};

    rows.slice(1).forEach(row => {

        fournisseurs[row[0]] = {
            categorie: row[1] || "",
            frequence: row[2] || ""
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
    categorie,
    frequence = ""
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
                "FOURNISSEURS!A:C",

            valueInputOption:
                "USER_ENTERED",

            requestBody: {

                values: [[
                    fournisseur,
                    categorie,
                    frequence
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

    const depensesSheet =
        spreadsheet.data.sheets.find(sheet =>
            String(sheet.properties.title).trim().toUpperCase() === "DEPENSES"
        );
    console.log("🗑️ Suppression DEPENSES ligne Sheets", rowNumber, "sheetId", depensesSheet?.properties.sheetId);

    const sheetId =
        depensesSheet?.properties.sheetId ??
        spreadsheet.data.sheets[0].properties.sheetId;

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
    replaceDepenses,
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


    deleteRow,
    updateCell,
    updateOperation
};
