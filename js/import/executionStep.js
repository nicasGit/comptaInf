const fs = require("fs");
const sheets = require("../sheets");
const { importDocument } = require("../importDocument");
const ceesv = require("../ceesv");

function cleanFileName(value) {
    return String(value || "")
        .replace(/[<>:"/\\|?*]/g, "")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_");
}

function withPdfExtension(fileName) {
    return fileName.replace(/\.(jpg|jpeg|png|pdf)$/i, "") + ".pdf";
}

function buildDriveFileName(workflow) {
    const originalName = workflow.input.name || "document.pdf";
    const ceesvData = workflow.normalized.metadata.ceesv;

    if (ceesvData?.type === "CEESV_ETAT") {
        const date = String(workflow.document.date || ceesvData.dateValeur || "").replace(/\./g, "-");
        const montant = ceesvData.montantFacture ?? ceesvData.montantEtat ?? workflow.document.montant ?? "";
        return withPdfExtension(cleanFileName(`CEESV_${date}_${montant}_${originalName}`));
    }

    if (ceesvData?.type === "CEESV_UBS") {
        const date = String(workflow.document.date || ceesvData.dateValeur || "").replace(/\./g, "-");
        const montant = ceesvData.montantBanque ?? workflow.document.montant ?? "";
        return withPdfExtension(cleanFileName(`UBS_${date}_${montant}`));
    }

    const fournisseur = workflow.document.fournisseur || "Document";
    const date = workflow.document.date || "";
    const montant = workflow.document.montant ?? "";
    return withPdfExtension(cleanFileName(`${fournisseur}_${date}_${montant}_${originalName}`));
}

async function saveOperation(workflow, uploaded) {
    const document = workflow.document;
    if (workflow.decision.action === "replace") {
        await sheets.replaceDepenses(workflow.source.email, [{
            ...document,
            pdf: uploaded.pdfUrl,
            operationType: workflow.normalized.metadata.operationType || "DEPENSE"
        }], workflow.duplicate.matches.map(match => match.row));
        workflow.execution.deletedRows = workflow.duplicate.matches.map(match => match.row);
        return;
    }
    const result = await sheets.addDepense(workflow.source.email, document.date,
        document.fournisseur, document.categorie || "", document.compte || "",
        document.montant, uploaded.pdfUrl,
        workflow.normalized.metadata.operationType || "DEPENSE",
        document.commentaire || "", "", document.litres || "");
    workflow.execution.sheetRow = result?.row || null;
}

async function executionStep(workflow) {
    if (workflow.execution.completed) return workflow;
    if (workflow.execution.started) throw new Error("Import déjà en cours");
    try {
        workflow.execution.started = true;

        const settings = await sheets.getSettings(workflow.source.email);
        const exercice = String(settings.Exercice);
        const ceesvDataForYear = workflow.normalized.metadata.ceesv;
        const rawYearDate = ceesvDataForYear?.dateValeur || workflow.document.date || "";
        const yearMatch = String(rawYearDate).match(/(\d{4})/);
        const year = yearMatch ? yearMatch[1] : "";
        console.log("[ImportWorkflow] exercice", exercice, "année détectée", year, "CEESV", ceesvDataForYear?.type || null);

        if (!year || year !== exercice) {
            throw new Error(`Date de facture ${year || "inconnue"} différente de l'exercice actif ${exercice}`);
        }

        const driveFileName = buildDriveFileName(workflow);
        const uploaded = workflow.execution.result || await importDocument(
            workflow.input.file.path,
            driveFileName,
            workflow.source.email
        );
        workflow.execution.driveFileName = driveFileName;

        workflow.execution.driveFileId = uploaded.fileId;
        workflow.execution.result = uploaded;

        const ceesvData = workflow.normalized.metadata.ceesv;

        if (ceesvData?.type === "CEESV_UBS") {
            console.log("[ImportWorkflow] execution CEESV_UBS", workflow.id);
            const match = await ceesv.findUBSMatch(workflow.source.email, ceesvData);

            if (match.trouve) {
                await ceesv.updateCEESVUBS(workflow.source.email, match.ligne, uploaded.pdfUrl);

                if (match.ligneUBS) {
                    console.log("[ImportWorkflow] suppression ligne UBS temporaire", match.ligneUBS, "mode", workflow.decision.action);
                    await sheets.deleteRow(workflow.source.email, match.ligneUBS);
                    workflow.execution.deletedRows.push(match.ligneUBS);
                    console.log("[ImportWorkflow] ligne UBS supprimée", match.ligneUBS);
                } else {
                    console.warn("[ImportWorkflow] CEESV trouvé mais ligneUBS absente");
                }
                workflow.execution.completed = true;
            } else {
                await saveOperation(workflow, uploaded);
                workflow.execution.completed = true;
            }
        } else if (ceesvData?.type === "CEESV_ETAT") {
            console.log("[ImportWorkflow] execution CEESV_ETAT", workflow.id);
            const match = await ceesv.findCEESVMatch(workflow.source.email, ceesvData);

            if (!ceesvData.dateValeur || ceesvData.montantFacture == null || ceesvData.montantEtat == null) {
                throw new Error("Données CEESV incomplètes: date ou montants facture/état absents");
            }

            await ceesv.processCEESV({
                email: workflow.source.email,
                originalname: workflow.input.name,
                analyse: { pdf: uploaded.pdfUrl },
                ceesv: {
                    ...ceesvData,
                    ...workflow.document.ceesv,
                    Compte: workflow.document.compte || "",
                    matchFacture: match.matchFacture
                        ? { pdfUrl: match.pdfFacture, ligne: match.ligneFacture }
                        : null,
                    matchEtat: match.matchEtat
                        ? { pdfUrl: match.pdfEtat, ligne: match.ligneEtat }
                        : null,
                    ligneFacture: match.matchFacture ? match.ligneFacture : null,
                    ligneEtat: match.matchEtat ? match.ligneEtat : null
                },
                commentaire: workflow.document.commentaire || "",
                duplicateAction: workflow.decision.action,
                duplicateRows: workflow.duplicate.matches.map(match => ({
                    ligne: match.row,
                    fournisseur: match.fournisseur
                }))
            });

            workflow.execution.completed = true;
        } else {
            await saveOperation(workflow, uploaded);
            workflow.execution.completed = true;
        }
    } finally {
        workflow.execution.started = false;
    }

    workflow.history.push({
        date: new Date().toISOString(),
        step: "execution",
        message: "Document enregistré dans Drive et Google Sheets"
    });

    if (workflow.input.file?.path && fs.existsSync(workflow.input.file.path)) {
        // Le nettoyage des fichiers temporaires est géré par le serveur.
    }

    return workflow;
}

module.exports = { executionStep };
