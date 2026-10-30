// Analyse le document normalisé avec les fonctions OCR existantes.
const { analyseDocument: analyseOcrDocument } = require("../ocr");

function getServerPath(input) {
    return input?.file?.path || input?.file?.filepath || null;
}

async function analyseCsv(workflow) {
    const file = workflow.input.file;
    const text = typeof file.text === "function"
        ? await file.text()
        : workflow.normalized.content;

    if (typeof text !== "string") {
        throw new Error("Impossible de lire le contenu CSV");
    }

    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) {
        throw new Error("Le fichier CSV est vide");
    }

    const separator = lines[0].includes(";") ? ";" : ",";
    const headers = lines[0].split(separator).map(value => value.trim().replace(/^"|"$/g, ""));
    const values = lines[1].split(separator).map(value => value.trim().replace(/^"|"$/g, ""));
    const data = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));

    workflow.analysis.raw = text;
    workflow.analysis.data = data;
    workflow.analysis.confidence = 1;

    workflow.document = {
        ...workflow.document,
        fournisseur: data.fournisseur || data.Fournisseur || null,
        date: data.date || data.Date || null,
        montant: data.montant || data.Montant || null,
        reference: data.reference || data.Reference || null,
        categorie: data.categorie || data.Categorie || null,
        compte: data.compte || data.Compte || null,
        description: data.description || data.Description || null
    };
}

async function analyseDocument(workflow) {
    const filePath = getServerPath(workflow.input);
    if (!filePath) {
        throw new Error("Le fichier n'est pas disponible côté serveur pour l'analyse");
    }

    const email = workflow.source.email;
    const result = await analyseOcrDocument(filePath, workflow.input.name, email);

    workflow.analysis.raw = result.text || null;
    workflow.analysis.data = result;
    workflow.analysis.confidence = typeof result.confidence === "number" ? result.confidence : null;

    workflow.document = {
        ...workflow.document,
        fournisseur: result.fournisseur || null,
        date: result.date || null,
        montant: result.montant || null,
        reference: result.reference || result.ceesv?.reference || null,
        compte: result.compte || null,
        categorie: result.categorie || null,
        description: workflow.input.name || null
    };

    workflow.normalized.metadata.operationType = result.operationType || result.type || null;

    const ceesvText = result.text || "";
    const isExplicitCeesv =
        result.ceesv?.type === "CEESV_UBS" ||
        /centrale.{0,20}encaissement|ceesv|factures\s+\d+|reçu.{0,20}ubs.{0,20}ceesv|ubs.{0,20}ceesv/i.test(ceesvText);
    const ceesvData = isExplicitCeesv && result.ceesv
        ? { ...result.ceesv }
        : null;

    workflow.normalized.metadata.ceesv = ceesvData;

    if (ceesvData) {
        workflow.document.ceesv = ceesvData;
        workflow.document.date = ceesvData.dateValeur
            ? ceesvData.dateValeur
            : workflow.document.date;
    }

}

async function analyseStep(workflow) {
    if (workflow.input?.type === "csv") {
        await analyseCsv(workflow);
    } else {
        await analyseDocument(workflow);
    }

    workflow.history.push({
        date: new Date().toISOString(),
        step: "analyse",
        message: `Analyse ${workflow.input.type} terminée`
    });

    return workflow;
}

module.exports = { analyseStep };