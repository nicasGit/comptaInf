const { google } = require("googleapis");
const { getEnvironment } = require("./config");
const path = require("path");
const { getConfig } = require("./config");

const DATA_DIR =
    process.env.DATA_DIR ||
    path.join(__dirname, "data");

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



function getSpreadsheetId() {

    return getConfig().SpreadsheetId;

}
function getConfigSpreadsheetId() {

    return getConfig().SpreadsheetIdConfig;

}

function getSheets() {
    return google.sheets({
        version: "v4",
        auth: auth
    });
}


async function addDepense(date, fournisseur, categorie, compte, montant, pdf, operationType, commentaire = "", justifBanque = "") {

    const client = await auth.getClient();

    const sheets = getSheets();

    const montantFinal =
        (
            operationType === "RECETTE"
                ? Math.abs(parseFloat(montant))
                : -Math.abs(parseFloat(montant))
        )
            .toFixed(2)
            .replace(".", ",");

    await sheets.spreadsheets.values.append({
        spreadsheetId: getSpreadsheetId(),
        range: "DEPENSES!A:M",
        valueInputOption: "USER_ENTERED",
        requestBody: {
            values: [
                [
                    date,
                    fournisseur,
                    categorie,
                    compte,
                    montantFinal,
                    pdf,
                    operationType,
                    commentaire,
                    justifBanque
                ]
            ]
        }
    });
    console.log("✅ Dépense ajoutée " + operationType + "  " + montantFinal);
}
async function updateCEESVUBS(ligne, pdfUrl) {

    const client = await auth.getClient();

    const sheetsApi = getSheets();

    await sheetsApi.spreadsheets.values.update({

        spreadsheetId: getSpreadsheetId(),

        range: `DEPENSES!I${ligne}`,

        valueInputOption: "USER_ENTERED",

        requestBody: {
            values: [[pdfUrl]]
        }

    });

    console.log(
        "✅ Justif Banque mise à jour ligne",
        ligne
    );
}


async function findCEESVMatch(ceesv) {

    const client = await auth.getClient();

    const sheetsApi = getSheets();

    const response =
        await sheetsApi.spreadsheets.values.get({

            spreadsheetId: getSpreadsheetId(),

            range: "DEPENSES!A:M"

        });

    const rows = response.data.values || [];

    const result = {

        matchFacture: false,
        matchEtat: false,

        ligneFacture: null,
        ligneEtat: null

    };



    const dateOCR =
        convertDateCEESV(
            ceesv.dateValeur
        );


    for (let i = 1; i < rows.length; i++) {

        const row = rows[i];

        const dateSheet =
            row[0] || "";

        const fournisseur =
            row[1] || "";

        const montantSheet =
            Number(
                String(row[4] || "0")
                    .replace(",", ".")
            );


        if (
            dateSheet === dateOCR &&
            fournisseur === "UBS - Centrale d'encaissement" &&
            montantSheet === Number(ceesv.montantFacture)
        ) {

            result.matchFacture = true;
            result.ligneFacture = i + 1;
            result.pdfFacture = row[5];
            console.log(
                "✅ Match Facture trouvé",
                montantSheet
            );
        }

        if (
            dateSheet === dateOCR &&
            fournisseur === "UBS - Centrale d'encaissement" &&
            montantSheet === Number(ceesv.montantEtat)
        ) {

            result.matchEtat = true;
            result.ligneEtat = i + 1;
            result.pdfEtat = row[5];
            console.log(
                "✅ Match Etat trouvé",
                montantSheet
            );
        }
    }

    return result;
}

function convertDateCEESV(dateStr) {

    if (!dateStr) {
        return "";
    }

    const p = dateStr.split(".");

    return `${p[2]}-${p[1]}-${p[0]}`;
}

async function findUBSMatch(ceesv) {

    const client = await auth.getClient();

    const sheetsApi = getSheets();

    const response =
        await sheetsApi.spreadsheets.values.get({

            spreadsheetId: getSpreadsheetId(),

            range: "DEPENSES!A:M"

        });

    const rows = response.data.values || [];

    const result = {
        trouve: false,
        ligne: null,
        pdfUrl: ""
    };

    const dateOCR =
        convertDateCEESV(
            ceesv.dateValeur
        );


    for (let i = 1; i < rows.length; i++) {

        const row = rows[i];

        const dateSheet = row[0] || "";
        const fournisseur = row[1] || "";

        const montant =
            Number(
                String(row[4] || "0")
                    .replace(",", ".")
            );

        const montantBanque =
            Number(
                String(ceesv.montantBanque)
                    .replace(",", ".")
            );

        if (
            fournisseur ===
            "UBS - Centrale d'encaissement"
            &&
            dateSheet === dateOCR
            &&
            montant === montantBanque
        ) {

            result.trouve = true;
            result.ligne = i + 1;
            result.pdfUrl = row[5] || "";

            break;
        }
    }

    return result;
}

function convertDateCEESV(dateStr) {

    const p = dateStr.split(".");

    return `${p[2]}-${p[1]}-${p[0]}`;

}

async function getDepenses() {

    const client = await auth.getClient();

    const sheets = getSheets();

    const response =
        await sheets.spreadsheets.values.get({

            spreadsheetId: getSpreadsheetId(),

            range: "DEPENSES!A:L"

        });

    return response.data.values || [];
}


async function getCategories() {

    const client = await auth.getClient();

    const sheets = getSheets();

    const response =
        await sheets.spreadsheets.values.get({

            spreadsheetId: getConfigSpreadsheetId(),

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

async function getFournisseurs() {

    const client = await auth.getClient();

    const sheets = getSheets();

    const response =
        await sheets.spreadsheets.values.get({

            spreadsheetId: getConfigSpreadsheetId(),

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

async function getSettings() {

    const client = await auth.getClient();

    const sheets = getSheets();

    const response =
        await sheets.spreadsheets.values.get({

            spreadsheetId: getConfigSpreadsheetId(),

            range: "SETTINGS!A:B"

        });

    const rows =
        response.data.values || [];

    const settings = {};

    rows.slice(1).forEach(row => {

        settings[row[0]] =
            row[1];

    });

    return settings;

}

async function addCategorie(
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
                getConfigSpreadsheetId(),

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
                getConfigSpreadsheetId(),

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

async function saveSetting(cle, valeur) {

    const client =
        await auth.getClient();

    const sheetsApi = getSheets();

    const response =
        await sheetsApi.spreadsheets.values.get({

            spreadsheetId:
                getConfigSpreadsheetId(),

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
                getConfigSpreadsheetId(),

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
                getConfigSpreadsheetId(),

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


async function deleteRow(rowNumber) {

    const client = await auth.getClient();

    const sheetsApi = getSheets();

    const spreadsheet =
        await sheetsApi
            .spreadsheets
            .get({
                spreadsheetId:
                    getSpreadsheetId()
            });

    const sheetId =
        spreadsheet.data.sheets[0]
            .properties.sheetId;

    await sheetsApi.spreadsheets.batchUpdate({

        spreadsheetId:
            getSpreadsheetId(),

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

    addCategorie,
    getCategories,

    addFournisseur,
    getFournisseurs,

    getSettings,
    saveSetting,

    updateCEESVUBS,
    findCEESVMatch,
    findUBSMatch,
    deleteRow
};