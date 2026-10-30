// /js/import/workflowContext.js


function createWorkflowContext(source, file = null) {
    return {
        // Identification du workflow
        id: crypto.randomUUID(),
        source: { // share, manual, drop
            type: source,
            user: null,
            email: null,
            sessionId: null
        },
        status: "idle",
        createdAt: new Date().toISOString(),

        // Document original
        input: {
            file,
            name: file?.name ?? null,
            mimeType: file?.type ?? null,
            type: null, // pdf, image, csv
            format: null // facture, ceesv, ubs
        },

        // Normalisation 
        normalized: {
            content: null,
            metadata: {}
        },

        // Résultat OCR / CSV
        analysis: {
            raw: null,
            data: null,
            confidence: null,
            warnings: []
        },

        // Données comptables normalisées
        document: {
            fournisseur: null,
            date: null,
            montant: null,
            reference: null,
            compte: null,
            categorie: null,
            description: null,
            commentaire: null
        },

        // Recherche de doublons
        duplicate: {
            checked: false,
            found: false,
            matches: [],
            selected: null,
            fingerprint: null
        },

        // Décision utilisateur
        decision: {
            action: null, // insert, replace, cancel
            confirmed: false,
            timestamp: null,
            comment: null
        },

        // Sauvegarde
        execution: {
            started: false,
            completed: false,
            deletedRows: [],
            sheetRow: null,
            driveFileId: null,
            result: null
        },

        // Diagnostic
        errors: [],
        history: []
    };
}

/* Exemple de push
workflow.errors.push({
    step: "analyse",
    message: "Date introuvable"
});

history.push({
    date: new Date().toISOString(),
    step: "duplicate",
    message: "2 doublons trouvés"
});
*/

module.exports = { createWorkflowContext };