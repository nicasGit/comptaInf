const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { createWorkflowContext } = require("../js/import/workflowContext");

function load(file, dependencies = {}) {
    const filename = path.join(__dirname, "..", file);
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
        module, exports: module.exports, __dirname: path.dirname(filename),
        require: name => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name),
        console: { log() {}, warn() {}, error() {} }, process, crypto: globalThis.crypto
    }, { filename });
    return module.exports;
}

function workflow() {
    const item = createWorkflowContext("manual", { path: "unused.pdf" });
    item.source.email = "test@example.com";
    item.document = { date: "2026-01-02", fournisseur: "Test", montant: 10 };
    item.decision.action = "insert";
    return item;
}

test("failed imports can retry, reuse the uploaded PDF, and never report false success", async () => {
    let uploads = 0;
    let writes = 0;
    const { executionStep } = load("js/import/executionStep.js", {
        "../sheets": {
            getSettings: async () => ({ Exercice: 2026 }),
            addDepense: async () => {
                if (++writes === 1) throw new Error("Sheets unavailable");
                return { row: 2 };
            }
        },
        "../importDocument": { importDocument: async () => {
            uploads++;
            return { fileId: "id", pdfUrl: "pdf" };
        } },
        "../ceesv": {}
    });
    const item = workflow();
    await assert.rejects(executionStep(item), /Sheets unavailable/);
    assert.equal(item.execution.completed, false);
    assert.equal(item.execution.started, false);
    await executionStep(item);
    assert.equal(item.execution.completed, true);
    assert.equal(writes, 2);
    assert.equal(uploads, 1);
    await executionStep(item);
    assert.equal(writes, 2);
});

test("validation failures can be corrected before retrying", async () => {
    let uploads = 0;
    const { executionStep } = load("js/import/executionStep.js", {
        "../sheets": { getSettings: async () => ({ Exercice: 2026 }), addDepense: async () => ({ row: 2 }) },
        "../importDocument": { importDocument: async () => { uploads++; return { pdfUrl: "pdf" }; } },
        "../ceesv": {}
    });
    const item = workflow();
    item.document.date = "2025-01-02";
    await assert.rejects(executionStep(item));
    assert.equal(uploads, 0);
    item.document.date = "2026-01-02";
    await executionStep(item);
    assert.equal(item.execution.completed, true);
});

test("replacement failure leaves the existing rows untouched", async () => {
    const calls = [];
    const { executionStep } = load("js/import/executionStep.js", {
        "../sheets": {
            getSettings: async () => ({ Exercice: 2026 }),
            deleteRow: async () => { throw new Error("Must not delete separately"); },
            replaceDepenses: async (...args) => { calls.push(args); throw new Error("Atomic failure"); }
        },
        "../importDocument": { importDocument: async () => ({ pdfUrl: "pdf" }) },
        "../ceesv": {}
    });
    const item = workflow();
    item.decision.action = "replace";
    item.duplicate.matches = [{ row: 4 }];
    await assert.rejects(executionStep(item), /Atomic failure/);
    assert.equal(item.execution.completed, false);
    assert.equal(item.execution.deletedRows.length, 0);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][2][0], 4);
});

test("Sheets appends concurrently and replacements use one atomic request", async () => {
    let nextRow = 2;
    let batch;
    const api = { spreadsheets: {
        values: { append: async request => {
            assert.equal(request.insertDataOption, "INSERT_ROWS");
            const row = nextRow++;
            return { data: { updates: { updatedRange: `DEPENSES!A${row}:N${row}` } } };
        } },
        get: async () => ({ data: { sheets: [{ properties: { title: "DEPENSES", sheetId: 7 } }] } }),
        batchUpdate: async request => { batch = request; }
    } };
    const sheets = load("js/sheets.js", {
        googleapis: { google: { auth: { GoogleAuth: class {} }, sheets: () => api } },
        "./config": { getConfig: () => ({ SpreadsheetId: "sheet" }) },
        "../utils/utils": { convertDate: value => value }
    });
    const added = await Promise.all([sheets.addDepense("a", "2026-01-02", "A", "", "", 10),
        sheets.addDepense("a", "2026-01-02", "B", "", "", 20)]);
    assert.deepEqual(added.map(item => item.row), [2, 3]);
    await sheets.replaceDepenses("a", [{ date: "2026-01-02", montant: 10 }], [4, 2, 4]);
    const requests = batch.requestBody.requests;
    assert.ok(requests[0].appendCells);
    const date = requests[0].appendCells.rows[0].values[0];
    assert.equal(date.userEnteredValue.numberValue, 46024);
    assert.equal(date.userEnteredValue.stringValue, undefined);
    assert.equal(date.userEnteredFormat.numberFormat.type, "DATE");
    assert.equal(date.userEnteredFormat.numberFormat.pattern, "yyyy-mm-dd");
    assert.equal(requests.length, 3);
    assert.equal(requests[1].deleteDimension.range.startIndex, 3);
    assert.equal(requests[2].deleteDimension.range.startIndex, 1);
    await assert.rejects(sheets.replaceDepenses("a", [{ montant: 10 }], [1]), /invalide/);
    await assert.rejects(sheets.replaceDepenses("a", [{ date: "2026-02-30", montant: 10 }], [2]), /Date invalide/);
    await sheets.replaceDepenses("a", [{ date: "'2026-01-02", montant: 10 }], [2]);
    assert.equal(batch.requestBody.requests[0].appendCells.rows[0].values[0].userEnteredValue.numberValue, 46024);
});

test("Host spoofing cannot enable developer login on a remote connection", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
    const prefix = source.slice(0, source.indexOf('const packageJson'));
    const context = { process: { env: {} } };
    vm.createContext(context);
    vm.runInContext(prefix.replace('console.log("Starting Server ComptaInf....");', ""), context);
    assert.equal(vm.runInContext("DEV_BYPASS_LOGIN || DEV_AUTOLOGIN_LOCAL || DEV_SHARE_SIMULATE", context), false);
    assert.equal(context.isLocalRequest({ hostname: "localhost", socket: { remoteAddress: "192.0.2.1" } }), false);
    assert.equal(context.isLocalRequest({ socket: { remoteAddress: "::ffff:127.0.0.1" } }), true);
});

test("a second decision cannot change or finish an import while it is saving", async () => {
    let release;
    let executions = 0;
    const gate = new Promise(resolve => { release = resolve; });
    const controller = load("js/import/importWorkflow.js", {
        "./normalizeStep": { normalizeStep: async () => {} },
        "./workflowContext": { createWorkflowContext: workflow },
        "./analyseStep": { analyseStep: async () => {} },
        "./duplicateStep": { duplicateStep: async () => {} },
        "./previewStep": {},
        "./executionStep": { executionStep: async item => {
            executions++;
            await gate;
            item.execution.completed = true;
        } }
    });
    const item = await controller.prepareWorkflow("manual", null, "test@example.com");
    const saving = controller.decideWorkflow(item.id, "insert", "test@example.com");
    await assert.rejects(controller.decideWorkflow(item.id, "cancel", "test@example.com"), /en cours/);
    assert.equal(item.decision.action, "insert");
    assert.equal(item.status, "saving");
    release();
    await saving;
    assert.equal(executions, 1);
    assert.equal(item.status, "completed");
});

test("CEESV saves both entries and removes all matched rows in one operation", async () => {
    let recorded;
    const { processCEESV } = load("js/ceesv.js", {
        "./sheets": { replaceDepenses: async (...args) => { recorded = args; } },
        "./importDocument": {},
        "../utils/utils": { convertDateCEESV: value => value }
    });
    await processCEESV({ email: "a", analyse: { pdf: "pdf" }, duplicateAction: "replace",
        duplicateRows: [{ ligne: 7 }], ceesv: { dateValeur: "2026-01-02",
            montantFacture: 10, montantEtat: 20, ligneFacture: 3, ligneEtat: 5 } });
    assert.equal(recorded[1].length, 2);
    assert.deepEqual(Array.from(recorded[2]), [3, 5, 7]);
});
