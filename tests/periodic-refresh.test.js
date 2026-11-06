const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

test("periodic checks reread Sheets and apply changed frequencies immediately", async () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
    const start = source.indexOf("function parseComptaDate(");
    const end = source.indexOf('\napp.get(', source.indexOf('app.get("/api/fournisseurs-periodiques"'));
    let handler;
    let frequency = "mensuel";
    let reads = 0;
    const year = new Date().getFullYear();
    const month = new Date().getMonth() + 1;
    vm.runInNewContext(source.slice(start, end), {
        app: { get: (route, auth, callback) => { handler = callback; } },
        requireAuth() {}, console,
        sheets: {
            getFournisseurs: async () => { reads++; return { Test: { frequence: frequency } }; },
            getFournisseursConvert: async () => ({}),
            getDepenses: async () => [["Date"], [`${year}-01-02`, "Test", "", "", 10]]
        }
    });
    for (const [value, size] of [["mensuel", 1], ["trimestriel", 3], ["semestriel", 6], ["annuel", 12]]) {
        frequency = value;
        let result;
        let cache;
        await handler({ session: { email: "test" } }, {
            setHeader: (name, value) => { cache = value; },
            json: data => { result = data; }
        });
        assert.equal(cache, "private, no-store");
        const expected = Math.ceil(month / size) - 1;
        assert.equal(result.missingCount, expected, value);
        if (expected) {
            assert.equal(result.items[0].frequence, value);
            assert.equal(result.items[0].periods[0].status, "present");
            assert.equal(result.items[0].periods.length, Math.ceil(month / size));
        }
    }
    assert.equal(reads, 4);
});

test("dashboard periodic refresh bypasses cache and replaces previous data", async () => {
    let count = 0;
    const elements = {
        cardPeriodic: { style: {} }, nbPeriodic: {}, periodicDetail: {}
    };
    const context = {
        document: { getElementById: id => elements[id] },
        fetch: async (url, options) => {
            assert.equal(url, "/api/fournisseurs-periodiques");
            assert.equal(options.cache, "no-store");
            return { ok: true, json: async () => ({ missingCount: ++count, fournisseursCount: count, items: [] }) };
        }
    };
    vm.createContext(context);
    const source = fs.readFileSync(path.join(__dirname, "..", "js/dashboard.js"), "utf8");
    vm.runInContext(source.slice(0, source.indexOf("function initDashboardEvents()")), context);
    await context.refreshPeriodicTreatments();
    assert.equal(elements.nbPeriodic.textContent, 1);
    await context.refreshPeriodicTreatments();
    assert.equal(elements.nbPeriodic.textContent, 2);
});
