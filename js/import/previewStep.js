function previewPayload(workflow) {
    return {
        document: workflow.document,
        duplicate: workflow.duplicate,
        normalized: workflow.normalized.metadata,
        proposedDecisions: workflow.duplicate.found
            ? ["insert", "replace", "cancel"]
            : ["insert", "cancel"]
    };
}

async function previewStep(workflow) {
    workflow.preview = previewPayload(workflow);

    if (typeof workflow.previewHandler === "function") {
        const decision = await workflow.previewHandler(workflow.preview);

        if (typeof decision === "string") {
            workflow.decision.action = decision;
        } else if (decision && typeof decision === "object") {
            workflow.decision.action = decision.action || null;
            workflow.decision.confirmed = Boolean(decision.confirmed);
            workflow.decision.comment = decision.comment || null;
        }
    }

    if (!workflow.decision.action) {
        workflow.decision.action = workflow.duplicate.found ? null : "insert";
    }

    if (workflow.decision.action) {
        workflow.decision.confirmed = workflow.decision.action !== "cancel";
        workflow.decision.timestamp = new Date().toISOString();
    }

    workflow.history.push({
        date: new Date().toISOString(),
        step: "preview",
        message: workflow.decision.action
            ? `Décision: ${workflow.decision.action}`
            : "En attente de la décision utilisateur"
    });

    return workflow;
}

module.exports = { previewStep, previewPayload };