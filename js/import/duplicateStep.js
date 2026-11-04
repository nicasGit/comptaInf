const sheets = require("../sheets");
const { normalizeFournisseur, convertDate } = require("../../utils/utils");

function normalizeAmount(value) {
    return Math.abs(Number(String(value ?? 0).replace(/,/g, ".")));
}

async function duplicateStep(workflow) {
    const email = workflow.source.email;
    if (!email) {
        throw new Error("Email utilisateur absent du contexte d'import");
    }

    const rows = await sheets.getDepenses(email);
    const document = workflow.document;
    const fournisseur = normalizeFournisseur(document.fournisseur);
    const date = convertDate(document.date);
    const montant = normalizeAmount(document.montant);
    const ceesv = workflow.normalized.metadata.ceesv;
    const ceesvAmounts = [
        ceesv?.montantFacture,
        ceesv?.montantEtat,
        ceesv?.montantBanque
    ].map(normalizeAmount);
    const isCeesv = fournisseur?.includes("CEESV") || workflow.input.format !== "facture";
    const matches = [];


    // console.log(`Search - fournisseur=${fournisseur}, date=${date}, montant=${montant}, ceesvAmounts=${ceesvAmounts}, isCeesv=${isCeesv}   `);

    rows.forEach((row, index) => {
        const sameSupplier = normalizeFournisseur(row[1]) === fournisseur;
        const sameDate = convertDate(row[0]) === date;
        const sheetAmount = normalizeAmount(row[4]);
        const sameAmount = isCeesv
            ? ceesvAmounts.some(value => value !== 0 && value === sheetAmount) || sheetAmount === montant
            : sheetAmount === montant;

        // console.log(`test${index + 1}: fournisseur=${row[1]}, date=${row[0]}, montant=${row[4]}`);

        if (sameSupplier && sameDate && sameAmount) {

            // console.log(`Doublon trouvé à la ligne ${index + 1}: fournisseur=${row[1]}, date=${row[0]}, montant=${row[4]}`);

            matches.push({
                // getData/getDepenses retourne la ligne d'en-tête à l'index 0.
                // La ligne Google Sheets physique est donc index + 1.
                row: index + 1,
                ligne: index + 1,
                date: row[0],
                fournisseur: row[1],
                categorie: row[2],
                compte: row[3],
                montant: sheetAmount,
                pdfUrl: row[5] || "",
                commentaire: row[7] || ""
            });
        }
    });

    //console.log("duplicateStep matches", matches);

    workflow.duplicate.checked = true;
    workflow.duplicate.found = matches.length > 0;
    workflow.duplicate.matches = matches;
    workflow.duplicate.selected = matches[0] || null;

    workflow.history.push({
        date: new Date().toISOString(),
        step: "duplicate",
        message: matches.length
            ? `${matches.length} doublon(s) trouvé(s)`
            : "Aucun doublon trouvé"
    });

    return workflow;
}

module.exports = { duplicateStep };