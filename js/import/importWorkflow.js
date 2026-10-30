// js/importWorkflow.js - Controleur d'import
const { normalizeStep } = require('./normalizeStep');
const { createWorkflowContext } = require('./workflowContext');
const { analyseStep } = require('./analyseStep');
const { duplicateStep } = require('./duplicateStep');
const { previewStep } = require('./previewStep');
const { executionStep } = require('./executionStep');

// pas de sauve avant decision user

// Principe
//-------------
// Entrée du document
//    - Share Android
//    - Upload
//    - Drag'n'drop
//    - Import Manuel

// 1. Normalisation
//      Pdf / Impage / Csv --> donnees standardisées

// 2. Analyse
//      OCr - extraction -validation

// 3. Recherche Doublon
//      comparaison avec ecriture existante

// 4. Previsualisation et decision
//      Inserer / ecraser / annuler
//      user garde le controle dans tous les cas

// 5. Execution
//      Google Sheet - Drive - maj interface

/*

normalizeStep
    INPUT  : input
    OUTPUT : input.type, input.format

analyseStep
    INPUT  : input
    OUTPUT : analysis, document

duplicateStep
    INPUT  : document
    OUTPUT : duplicate

previewStep
    INPUT  : document + duplicate
    OUTPUT : decision

executionStep
    INPUT  : decision + document
    OUTPUT : execution
    */



/*
export async function runWorkflow(source) {

    const workflow = new WorkflowContext(source);

    await normalizeStep(workflow);
    await analyseStep(workflow);
    await duplicateStep(workflow);
    await previewStep(workflow);
    await executionStep(workflow);

    return workflow;

}*/

const activeWorkflows = new Map();

async function prepareWorkflow(source, file = null, email = null) {
    const workflow = createWorkflowContext(source, file);
    workflow.source.email = email;

    workflow.status = "normalizing";
    await normalizeStep(workflow);

    workflow.status = "analyzing";
    await analyseStep(workflow);

    workflow.status = "checking_duplicate";
    await duplicateStep(workflow);

    workflow.status = "waiting_decision";
    activeWorkflows.set(workflow.id, workflow);
    return workflow;
}

async function decideWorkflow(workflowId, action, email = null, comment = null, documentData = null) {
    const workflow = activeWorkflows.get(workflowId);

    if (!workflow) {
        throw new Error("Workflow d'import introuvable ou expiré");
    }

    if (email && workflow.source.email !== email) {
        throw new Error("Workflow appartenant à un autre utilisateur");
    }

    if (documentData) {
        workflow.document = {
            ...workflow.document,
            ...documentData,
            description: documentData.description || workflow.document.description,
            commentaire: documentData.commentaire ?? workflow.document.commentaire ?? ""
        };
    }

    workflow.decision.action = action;
    workflow.decision.comment = comment;
    workflow.decision.confirmed = action !== "cancel";
    workflow.decision.timestamp = new Date().toISOString();

    if (action === "cancel") {
        workflow.status = "cancelled";
        activeWorkflows.delete(workflowId);
        return workflow;
    }

    if (!["insert", "replace"].includes(action)) {
        throw new Error("Décision d'import invalide");
    }

    if (action === "replace" && !workflow.duplicate?.found) {
        throw new Error("Remplacement sans doublon");
    }

    workflow.status = "saving";
    await executionStep(workflow);
    workflow.status = "completed";
    activeWorkflows.delete(workflowId);
    return workflow;
}

async function runWorkflow(source, file = null) {

    const workflow = createWorkflowContext(source, file);

    try {
        workflow.status = "normalizing";
        await normalizeStep(workflow);

        workflow.status = "analyzing";
        await analyseStep(workflow);

        workflow.status = "checking_duplicate";
        await duplicateStep(workflow);

        workflow.status = "waiting_decision";
        await previewStep(workflow);

        // Annulation : aucune sauvegarde
        if (!workflow.decision.action) {
            workflow.status = "waiting_decision";
            return workflow;
        }

        if (workflow.decision.action === "cancel") {
            workflow.status = "cancelled";
            return workflow;
        }

        if (!["insert", "replace"].includes(workflow.decision.action)) {
            throw new Error("Décision d'import invalide");
        }

        if (
            workflow.decision.action === "replace" &&
            !workflow.duplicate?.found
        ) {
            throw new Error("Remplacement sans doublon");
        }

        workflow.status = "saving";
        await executionStep(workflow);

        workflow.status = "completed";

    } catch (error) {
        workflow.status = "error";
        workflow.error = error;
        console.error("[ImportWorkflow]", error);
    }

    return workflow;
}

module.exports = {
    runWorkflow,
    prepareWorkflow,
    decideWorkflow
};
