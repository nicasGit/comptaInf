const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { PDFDocument } = require("pdf-lib");
const { buildAnnualSummary, generateAnnualReport } = require("../js/annual-report");

const rows = [
    ["Date", "Fournisseur", "Catégorie", "Compte", "Montant"],
    ["2026-01-02", "CEESV", "Soins", "3000", "1’234,50", "pdf", "RECETTE"],
    ["03.02.2026", "Matériel", "Fournitures", "4000", "-200,25", "", "DEPENSE"],
    ["'2026-02-04", "Autre", "Soins", "3000", "0,10", "pdf"],
    ["2025-01-01", "Ancien", "", "", 999],
    ["2026-02-30", "Date impossible", "", "", 50],
    ["2026-03-01", "Montant absent", "", "", ""],
    ["2026-03-02", "Montant invalide", "", "", "abc"],
    []
];

test("annual summary filters the year and reconciles totals in cents", () => {
    const summary = buildAnnualSummary(rows, 2026);
    assert.equal(summary.operations.length, 3);
    assert.equal(summary.income, 123460);
    assert.equal(summary.expenses, 20025);
    assert.equal(summary.result, 103435);
    assert.equal(summary.invalid, 3);
    assert.equal(summary.outsideYear, 1);
    assert.equal(summary.months.length, 12);
    assert.equal(summary.months[1].expenses, 20025);
    assert.equal(summary.months.reduce((sum, item) => sum + item.income, 0), summary.income);
    assert.equal(summary.groups.reduce((sum, item) => sum + item.expenses, 0), summary.expenses);
    assert.throws(() => buildAnnualSummary(rows, "bad"), /Exercice invalide/);
});

test("annual PDF is readable for empty years and paginates long Unicode content", async () => {
    const empty = await PDFDocument.load(await generateAnnualReport([rows[0]], 2026));
    assert.ok(empty.getPageCount() >= 1);
    const manyRows = [rows[0], ...Array.from({ length: 100 }, () => [
        "2026-01-01", "Fournisseur 🩺 中文 " + "X".repeat(200), "Catégorie", "4000", "-10,10", "", "DEPENSE", "Commentaire\nmultiligne"
    ])];
    const buffer = await generateAnnualReport(manyRows, 2026, "Élodie 🩺");
    assert.equal(buffer.subarray(0, 5).toString(), "%PDF-");
    const pdf = await PDFDocument.load(buffer);
    assert.ok(pdf.getPageCount() > 2);
    assert.equal(pdf.getTitle(), "ComptaInf - Bilan annuel 2026");
    assert.deepEqual(pdf.getPage(0).getSize(), { width: 595.28, height: 841.89 });
});

test("PDF export requires authentication and returns an attachment for the active exercise", async () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
    const start = source.indexOf('app.get("/api/export-pdf"');
    const end = source.indexOf('\napp.get(', start + 1);
    let handler;
    const auth = () => {};
    let exercise = "2026";
    let reads = 0;
    vm.runInNewContext(source.slice(start, end), {
        app: { get: (route, middleware, callback) => { assert.equal(middleware, auth); handler = callback; } },
        requireAuth: auth,
        sheets: { getSettings: async email => { assert.equal(email, "test"); return { Exercice: exercise }; },
            getDepenses: async () => { reads++; return rows; } },
        getCurrentUserFromRequest: () => ({ name: "Test" }), generateAnnualReport, console
    });
    const headers = {};
    let body;
    const response = { setHeader: (name, value) => { headers[name] = value; }, send: value => { body = value; } };
    await handler({ session: { email: "test" } }, response);
    assert.equal(headers["Content-Type"], "application/pdf");
    assert.match(headers["Content-Disposition"], /ComptaInf_Bilan_2026.pdf/);
    assert.equal(headers["Cache-Control"], "private, no-store");
    await PDFDocument.load(body);
    exercise = "invalid";
    let status;
    await handler({ session: { email: "test" } }, { status: code => { status = code; return { json() {} }; } });
    assert.equal(status, 400);
    assert.equal(reads, 1);
});
