const path = require("path");

// Only browser assets belong here. Never expose the project or data directories.
const PUBLIC_ASSETS = [
    "css/design_v0.css",
    "css/design_v1.css",
    "js/dashboard.js",
    "js/operations.js",
    "js/depense.js",
    "js/stats.js",
    "js/categorie.js",
    "js/fournisseur.js",
    "js/navigation.js",
    "js/mileage.js",
    "js/professional-expenses.js",
    "js/pdf-preview.js",
    "utils/utils.js",
    "views/dashboard.html",
    "views/operations.html",
    "views/stats.html",
    "views/mileage.html",
    "views/professional-expenses.html"
];

function registerPublicAssets(app, rootDirectory = __dirname) {
    for (const asset of PUBLIC_ASSETS) {
        app.get(`/${asset}`, (req, res) => {
            res.sendFile(path.join(rootDirectory, asset));
        });
    }
}

module.exports = { registerPublicAssets };
