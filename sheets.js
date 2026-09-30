const { google } = require("googleapis");
const { getEnvironment } = require("./config");

const auth = new google.auth.GoogleAuth({
    keyFile: "service-account.json",
    scopes: [
        "https://www.googleapis.com/auth/spreadsheets"
    ]
});

//PROD
const spreadsheetId = "1iZHcGtKdXN8itSSNUv4_j16k16Yx5BbRbOMNKDxcGAw";
const spreadsheetIdConfig =  "1j8veCGCftsk5p2E0691-XU4vzbFL15oxRQLKz1BgbrE";
//DEV
const spreadsheetDEVId = "1oCW3pak3WYV-7YQQNtogvEFemI-6SY_X9UlfnY3HD5s";
const spreadsheetDEVIdConfig =  "1uqwrtwrWVA9n1z_OtZY8JAnoV4GQhcgRXArNG2YnGnw";

function getSpreadsheetId(){

    return getEnvironment() === "DEV"
        ? spreadsheetDEVId
        : spreadsheetId;

}
function getConfigSpreadsheetId(){

    return getEnvironment() === "DEV"
        ? spreadsheetDEVIdConfig
        : spreadsheetIdConfig;

}


async function addDepense(date, fournisseur, categorie, compte, montant, pdf, operationType) {

    const client = await auth.getClient();

    const sheets = google.sheets({
        version: "v4",
        auth: client
    });


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
        range: "DEPENSES!A:F",
        valueInputOption: "USER_ENTERED",
        requestBody: {
            values: [
                [
                    date,
                    fournisseur,
                    categorie,
					compte,
                    montantFinal,
					pdf
                ]
            ]
        }
    });
	console.log("✅ Dépense ajoutée " +operationType +"  "+montantFinal);
}



async function getDepenses() {

    const client = await auth.getClient();

    const sheets = google.sheets({
        version: "v4",
        auth: client
    });

    const response =
        await sheets.spreadsheets.values.get({

            spreadsheetId: getSpreadsheetId(),

            range: "DEPENSES!A:F"

        });

    return response.data.values || [];
}


async function getCategories() {

    const client = await auth.getClient();

    const sheets = google.sheets({
        version: "v4",
        auth: client
    });

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

    const sheets = google.sheets({
        version: "v4",
        auth: client
    });

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

    const sheets = google.sheets({
        version: "v4",
        auth: client
    });

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

    const sheetsApi =
        google.sheets({

            version: "v4",
            auth: client

        });

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

    const sheetsApi =
        google.sheets({

            version: "v4",
            auth: client

        });

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

async function saveSetting(cle, valeur){

    const client =
        await auth.getClient();

    const sheetsApi =
        google.sheets({
            version: "v4",
            auth: client
        });

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

    if(index === -1){

        await sheetsApi.spreadsheets.values.append({

            spreadsheetId:
                getConfigSpreadsheetId(),

            range:
                "SETTINGS!A:B",

            valueInputOption:
                "USER_ENTERED",

            requestBody:{
                values:[
                    [cle, valeur]
                ]
            }

        });

    }
    else{

        await sheetsApi.spreadsheets.values.update({

            spreadsheetId:
                getConfigSpreadsheetId(),

            range:
                `SETTINGS!B${index + 1}`,

            valueInputOption:
                "USER_ENTERED",

            requestBody:{
                values:[
                    [valeur]
                ]
            }

        });

    }

}
                   

module.exports = {
    addDepense,
    getDepenses,
	
	addCategorie,
	getCategories,
	
	addFournisseur,
	getFournisseurs,
	
	getSettings,
	saveSetting
};