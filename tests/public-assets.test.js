const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { test } = require("node:test");
const express = require("express");
const { registerPublicAssets } = require("../public-assets");

async function serve(t, rootDirectory) {
    const app = express();
    registerPublicAssets(app, rootDirectory);
    const server = app.listen(0, "127.0.0.1");
    t.after(() => new Promise(resolve => server.close(resolve)));
    await once(server, "listening");
    return `http://127.0.0.1:${server.address().port}`;
}

test("public browser resources referenced by the interface remain available", async t => {
    const rootDirectory = path.join(__dirname, "..");
    const base = await serve(t, rootDirectory);
    const index = fs.readFileSync(path.join(rootDirectory, "index.html"), "utf8");
    const assets = [...index.matchAll(/(?:src|href)="\/?((?:js|css|utils)\/[^"?]+)"/g)]
        .map(match => match[1]);
    assets.push(...fs.readdirSync(path.join(rootDirectory, "views"))
        .filter(name => name.endsWith(".html"))
        .map(name => `views/${name}`));

    assert.ok(assets.length > 10);
    for (const asset of assets) {
        const response = await fetch(`${base}/${asset}`);
        assert.equal(response.status, 200, asset);
        assert.ok((await response.text()).length > 0, asset);
    }
});

test("private files stay inaccessible even when present on disk", async t => {
    const rootDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "comptainf-assets-"));
    t.after(() => fs.rmSync(rootDirectory, { recursive: true, force: true }));
    const privateFiles = [
        "data/tokens.json", "data/service-account.json", "data/oauth-client.json",
        "data/users.json", "data/settings.json", "data/uploads/document.pdf",
        "server.js", "public-assets.js", "package.json", "package-lock.json",
        "js/oauth.js", "js/config.js", "js/sheets.js", "js/ocr.js",
        "js/import/executionStep.js", ".env", ".git/config", "backup.zip",
        "css/secret.json", "views/backup.html", "utils/secret.json",
        "uploads/document.pdf", "index.html", "share.html"
    ];
    for (const file of privateFiles) {
        const target = path.join(rootDirectory, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, "PRIVATE_SENTINEL");
    }
    const base = await serve(t, rootDirectory);
    for (const file of [...privateFiles,
        "js/%2e%2e/data/tokens.json",
        "js/%2e%2e%2fdata%2ftokens.json",
        "css/%2e%2e%5cdata%5ctokens.json"
    ]) {
        const response = await fetch(`${base}/${file}`);
        assert.equal(response.status, 404, file);
        assert.ok(!(await response.text()).includes("PRIVATE_SENTINEL"), file);
    }
});
