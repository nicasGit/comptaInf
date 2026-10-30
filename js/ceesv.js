//js/ceesv.js

const sheets = require("./sheets");
const { importDocument } = require("./importDocument");
const { convertDateCEESV } = require("../utils/utils");

//Import pdf + update sheet ETAT + FACTURE
async function processCEESV(data) {

    console.log("function processCEESV ceesv.js", data);
    //console.log("function processCEESV ceesv.js");

    const email = data.email;
    const originalname = data.originalname;

    //soit on a data soit on a depense...
    const source = data.analyse || data.depense || data;



    const mode = data.duplicateAction;

    // import pdf 

    const pdfUrl = source.pdf;
    /*
        const fileName =
            `${source.fournisseur}_${source.date}_${source.montant}_${originalname}`
                .replace(/[<>:"/\\|?*]/g, "")
                .replace(/\s+/g, "_");
    
    
    
        const imported =
            await importDocument(
                source.pdf,
                fileName,
                email
            );
    
        const pdfUrl = imported.pdfUrl;
        //console.log("date", source.ceesv.dateValeur, convertDateCEESV(source.ceesv.dateValeur));
    */
    // import sheet
    if (!data.ceesv?.dateValeur) {
        throw new Error("Date CEESV manquante");
    }

    if (data.ceesv.montantFacture == null || data.ceesv.montantEtat == null) {
        throw new Error("Montants CEESV facture/état manquants");
    }

    const ligneFacture = {

        date: convertDateCEESV(data.ceesv.dateValeur),
        fournisseur: "CEESV - Facture",
        categorie: "CEESV",
        compte: data.ceesv.Compte || "",
        montant: Number(data.ceesv.montantFacture),
        pdf: pdfUrl,
        operationType: "RECETTE",
        commentaire: data.commentaire || data.depense?.commentaire || "",
        justifBanque:
            data.ceesv.matchFacture?.pdfUrl || ""
    };

    const ligneEtat = {

        date: convertDateCEESV(data.ceesv.dateValeur),
        fournisseur: "CEESV - Etat",
        categorie: "CEESV",
        compte: data.ceesv.Compte || "",
        montant: Number(data.ceesv.montantEtat),
        pdf: pdfUrl,
        operationType: "RECETTE",
        commentaire: data.commentaire || data.depense?.commentaire || "",
        justifBanque:
            data.ceesv.matchEtat?.pdfUrl || ""
    };


    await sheets.addDepense(
        email,
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
        email,
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

    const lignesUBSTemporaires = [...new Set([
        Number(data.ceesv?.ligneFacture || data.ceesv?.matchFacture?.ligne || 0),
        Number(data.ceesv?.ligneEtat || data.ceesv?.matchEtat?.ligne || 0)
    ])].filter(ligne => ligne > 0).sort((a, b) => b - a);

    for (const ligne of lignesUBSTemporaires) {
        console.log("🗑️ Suppression ligne UBS temporaire CEESV", ligne);
        await sheets.deleteRow(email, ligne);
    }

    console.log("mode =", mode)
    if (mode === "replace") {

        if (data.duplicateRows && data.duplicateRows.length > 0) {
            const rows = [...data.duplicateRows]
                .sort((a, b) => b.ligne - a.ligne);

            for (const row of rows) {
                console.log(`🗑️ Suppression ligne ${row.ligne} (${row.fournisseur})`);

                await sheets.deleteRow(
                    email,
                    Number(row.ligne)
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

    const rows =
        await sheets.getData(email);

    const result = {
        trouve: false,
        ligne: null,
        ligneUBS: null,
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
            fournisseur === "UBS - Centrale d'encaissement" &&
            dateSheet === dateOCR &&
            montant === montantBanque
        ) {
            result.ligneUBS = i + 1;
        }

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
        }
    }

    return result;
}


async function updateCEESVUBS(email, ligne, pdfUrl) {

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