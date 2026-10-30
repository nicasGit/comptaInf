// /js/import/normalizeStep.js
// Normalise les entrées du workflow avant l'analyse.
// Ne sauvegarde rien : elle prépare uniquement les données utilisées ensuite.

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png"];
const PDF_EXTENSION = "pdf";
const CSV_EXTENSION = "csv";

function extensionOf(name = "") {
    const match = String(name).toLowerCase().match(/\.([^.]+)$/);
    return match ? match[1] : "";
}

function inputName(workflow) {
    return workflow.input?.name ||
        workflow.input?.file?.originalname ||
        workflow.input?.file?.name ||
        "";
}

function inputMimeType(workflow) {
    return workflow.input?.mimeType ||
        workflow.input?.file?.mimetype ||
        workflow.input?.file?.type ||
        "";
}

function inferType(name, mimeType) {
    const extension = extensionOf(name);
    const mime = String(mimeType).toLowerCase();

    if (extension === PDF_EXTENSION || mime === "application/pdf") {
        return "pdf";
    }

    if (IMAGE_EXTENSIONS.includes(extension) || mime.startsWith("image/")) {
        return "image";
    }

    if (extension === CSV_EXTENSION || mime === "text/csv" || mime.includes("csv")) {
        return "csv";
    }

    return null;
}

function inferFormat(name, content = "") {
    const text = `${name} ${content}`.toLowerCase();

    if (/ubs/.test(text) && (/centrale.{0,30}encaissement/.test(text) || /encaissement.{0,30}centrale/.test(text) || /reçu.{0,20}ceesv/.test(text))) {
        return "ubs";
    }

    if (/ceesv|centrale.{0,20}encaissement/.test(text)) {
        return "ceesv";
    }

    return "facture";
}

async function normalizeStep(workflow) {
    if (!workflow?.input) {
        throw new Error("Contexte d'import invalide");
    }

    const sourceName = inputName(workflow);
    const mimeType = inputMimeType(workflow);
    const type = inferType(sourceName, mimeType);

    if (!type) {
        throw new Error(`Format de fichier non pris en charge : ${sourceName || "nom inconnu"}`);
    }

    if (workflow.input.file == null) {
        throw new Error(`Fichier absent pour l'import : ${sourceName}`);
    }

    workflow.input.name = sourceName;
    workflow.input.mimeType = mimeType;
    workflow.input.type = type;

    let content = null;
    let csvContent = "";

    if (type === "csv" && typeof workflow.input.file.text === "function") {
        csvContent = await workflow.input.file.text();
        content = csvContent;
    } else {
        content = workflow.input.file;
    }

    workflow.input.format = inferFormat(sourceName, csvContent);

    workflow.normalized = {
        content,
        metadata: {
            originalName: sourceName,
            mimeType,
            type,
            format: workflow.input.format,
            // L'import serveur conserve le comportement historique : les images
            // sont converties en PDF avant l'enregistrement dans Drive.
            requiresPdfConversion: type === "image"
        }
    };

    workflow.history.push({
        date: new Date().toISOString(),
        step: "normalize",
        message: `Document normalisé : ${type}/${workflow.input.format}`
    });

    return workflow;
}

module.exports = { normalizeStep };