//js/ceesv.js

const sheets = require("./sheets");
const { importDocument } = require("./importDocument");
const { convertDateCEESV } = require("../utils/utils");

async function processCEESV(data) {

    //console.log("function processCEESV ceesv.js", data);
    console.log("function processCEESV ceesv.js");

    const mode = data.analyse.mode;

    // import pdf 

    const fileName =
        `${data.analyse.fournisseur}_${data.analyse.date}_${data.analyse.montant}_${data.analyse.originalName}`
            .replace(/[<>:"/\\|?*]/g, "")
            .replace(/\s+/g, "_");



    const imported =
        await importDocument(
            data.analyse.pdf,
            fileName,
            data.analyse.email
        );

    const pdfUrl = imported.pdfUrl;
    //console.log("date", data.analyse.ceesv.dateValeur, convertDateCEESV(data.analyse.ceesv.dateValeur));

    // import sheet
    const ligneFacture = {

        date: convertDateCEESV(data.analyse.ceesv.dateValeur),
        fournisseur: "CEESV - Facture",
        categorie: "CEESV",
        compte: data.analyse.ceesv.Compte,
        montant: data.analyse.ceesv.montantFacture,
        pdf: pdfUrl,
        operationType: "RECETTE",
        commentaire: "",
        justifBanque:
            data.analyse.ceesv.matchFacture?.pdfUrl || ""
    };

    const ligneEtat = {

        date: convertDateCEESV(data.analyse.ceesv.dateValeur),
        fournisseur: "CEESV - Etat",
        categorie: "CEESV",
        compte: data.analyse.ceesv.Compte,
        montant: data.analyse.ceesv.montantEtat,
        pdf: pdfUrl,
        operationType: "RECETTE",
        commentaire: "",
        justifBanque:
            data.analyse.ceesv.matchEtat?.pdfUrl || ""
    };


    await sheets.addDepense(
        data.analyse.email,
        ligneFacture.date,
        ligneFacture.fournisseur,
        ligneFacture.categorie,
        ligneFacture.compte,
        ligneFacture.montant,
        ligneFacture.pdf,
        ligneFacture.operationType,
        ligneFacture.commentaire,
        ligneFacture.justifBanque
    );

    await sheets.addDepense(
        data.analyse.email,
        ligneEtat.date,
        ligneEtat.fournisseur,
        ligneEtat.categorie,
        ligneEtat.compte,
        ligneEtat.montant,
        ligneEtat.pdf,
        ligneEtat.operationType,
        ligneEtat.commentaire,
        ligneEtat.justifBanque
    );


    if (mode == "replace") {

        if (data.analyse.duplicateRows && data.analyse.duplicateRows.length > 0) {
            const rows = [...data.analyse.duplicateRows]
                .sort((a, b) => b.ligne - a.ligne);

            for (const row of rows) {
                console.log(`🗑️ Suppression ligne ${row.ligne} (${row.fournisseur})`);

                await sheets.deleteRow(
                    data.analyse.email,
                    row.ligne
                );
            }
        }

    }

    return true;
}




async function findCEESVMatch(email, ceesv) {

    //const client = await auth.getClient();

    const rows =
        await sheets.getData(email);

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

        //console.log("check match " + dateSheet + "=== " + dateOCR + "|" +            fournisseur + "  === UBS - Centrale d'encaissement" +            montantSheet + " === " + Number(ceesv.montantFacture));
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



async function findUBSMatch(email, ceesv) {

    const client = await auth.getClient();

    const rows =
        await sheets.getData(email);

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

        //fournisseur === "UBS - Centrale d'encaissement"
        if (
            (fournisseur === "CEESV - Etat" || fournisseur === "CEESV - Facture")
            &&
            dateSheet === dateOCR
            &&
            montant === montantBanque
        ) {

            result.trouve = true;
            result.ligne = i + 1;
            result.fournisseur = fournisseur;
            result.comment = row[7] || "";
            result.pdfUrl = row[5] || "";
            result.pdfBanque = row[8] || "";
            result.Date = row[0] || "";

            result.operation = {
                Date: row[0] || "",
                Fournisseur: "Reçu UBS - Centrale d'encaissement pour " + fournisseur,
                Categorie: row[2] || "",
                Compte: row[3] || "",
                Montant: row[4] || ""
            };

            result.row = i + 1;

            break;
        }
    }

    return result;
}


async function updateCEESVUBS(email, ligne, pdfUrl) {

    const client = await auth.getClient();

    await sheets.updateCell(
        email,
        "I",
        ligne,
        pdfUrl
    );

    console.log(
        "✅ Justif Banque mise à jour ligne",
        ligne
    );
}


module.exports = {
    processCEESV,
    findCEESVMatch,
    findUBSMatch,
    updateCEESVUBS
};