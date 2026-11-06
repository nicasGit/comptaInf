//server.js
console.log("Starting Server ComptaInf....");
function envFlag(name, defaultValue = false) {
    const value = process.env[name];
    if (value === undefined || value === "") return defaultValue;
    return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

let DEV_BYPASS_LOGIN = envFlag("DEV_BYPASS_LOGIN", true);
let DEV_AUTOLOGIN_LOCAL = envFlag("DEV_AUTOLOGIN_LOCAL", true);
let DEV_SHARE_SIMULATE = envFlag("DEV_SHARE_SIMULATE", true);

function isLocalRequest(req) {
    const hostname = String(req.hostname || "")
        .toLowerCase()
        .replace(/^\[|\]$/g, "");
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function devFeatureEnabled(req, flag) {
    return isLocalRequest(req) && flag;
}
const packageJson = require("./package.json");

const express = require("express");
const { registerPublicAssets } = require("./public-assets");
const { exec } = require("child_process");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const ocr = require("./js/ocr");
const oauth2Client = require("./js/oauth");
const sheets = require("./js/sheets");
const drive = require("./js/drive");
const ceesv = require("./js/ceesv");

const { ZipArchive } = require("archiver");
const { importDocument } = require("./js/importDocument");
const {
    prepareWorkflow,
    decideWorkflow
} = require("./js/import/importWorkflow");
const {
    getEnvironment,
    setEnvironment,
    getConfig,
    getCurrentUser,
    getCurrentUserFromRequest,
    getExercice
} = require("./js/config");
const session = require("express-session");

const {
    normalizeFournisseur,
    convertDate,
    convertDateCEESV } = require("./utils/utils");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
registerPublicAssets(app);

app.get("/api/version", (req, res) => {
    let buildInfo = {};
    try {
        buildInfo = JSON.parse(fs.readFileSync(path.join(__dirname, "build-info.json"), "utf8"));
    } catch (_) {
        // Local development without Docker build metadata.
    }

    const commitDate = buildInfo.commitDate ? new Date(buildInfo.commitDate) : null;
    let commitStamp = "";
    if (commitDate && !Number.isNaN(commitDate.getTime())) {
        const parts = new Intl.DateTimeFormat("sv-SE", {
            timeZone: process.env.BUILD_TIMEZONE || "Europe/Zurich",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23"
        }).formatToParts(commitDate);
        const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
        commitStamp = `${values.year}${values.month}${values.day}${values.hour}${values.minute}`;
    }

    res.json({
        version: process.env.APP_VERSION || packageJson.version,
        commit: buildInfo.commit || "dev",
        commitDate: commitStamp
    });
});

const DATA_DIR =
    process.env.DATA_DIR ||
    path.join(__dirname, "data");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}


const matchedRules = [];

const SERVICE_ACCOUNT_FILE =
    path.join(DATA_DIR, "service-account.json");

const upload = multer({
    dest: path.join(
        DATA_DIR,
        "uploads"
    )
});

// Fichiers PWA
app.get("/manifest.json", (req, res) => {
    res.sendFile(path.join(__dirname, "manifest.json"));
});

app.get("/service-worker.js", (req, res) => {
    res.sendFile(path.join(__dirname, "service-worker.js"));
});

app.get("/icon-192.png", (req, res) => {
    res.sendFile(path.join(__dirname, "icon-192.png"));
});

app.get("/icon-512.png", (req, res) => {
    res.sendFile(path.join(__dirname, "icon-512.png"));
});

app.use(session({
    secret: "ComptaInfSecretSessionNJO",
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000
    }
}));

app.get("/share.html", requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, "share.html"));
});


const DEV_USER =
    process.env.DEV_USER ||
    "nicolas.jollois@gmail.com";




function requireAuth(
    req,
    res,
    next
) {

    const isLocalhost = isLocalRequest(req);

    if (devFeatureEnabled(req, DEV_AUTOLOGIN_LOCAL) &&
        !req.session?.email &&
        isLocalhost
    ) {

        const tokenFile =
            path.join(DATA_DIR, "tokens.json");

        if (fs.existsSync(tokenFile)) {

            const tokensStore =
                JSON.parse(
                    fs.readFileSync(
                        tokenFile,
                        "utf8"
                    )
                );

            if (tokensStore[DEV_USER]) {

                req.session.email = DEV_USER;

                /*console.log(
                    "🔧 Auto-login localhost :",
                    DEV_USER
                );*/

            }
            else {

                console.log(
                    "⚠️ Aucun token OAuth pour",
                    DEV_USER
                );

            }

        }

    }
    /* console.log(
         "AUTH",
         req.path,
         req.headers.accept,
         req.accepts("html")
     );*/
    if (!req.session?.email) {

        const apiPaths = [
            '/google-status',
            '/analyse-document',
            '/upload'
        ];

        const apiExcludedPaths = [
            '/api/export'
        ];

        const isApi =
            (req.path.startsWith('/api/') ||
                apiPaths.includes(req.path)) && !apiExcludedPaths.some(p => req.path.startsWith(p));

        if (isApi) {


            return res.status(401).json({
                redirect: '/login'
            });
        }

        //pour le retour apres login
        req.session.returnTo = req.originalUrl;

        return res.redirect("/login");
    }


    next();

}

app.post("/api/operations/update", requireAuth, async (req, res) => {
    try {
        const rowNumber = Number(req.body.rowNumber);
        const operation = req.body.operation;
        if (!rowNumber || !operation) {
            return res.status(400).json({ error: "Ligne ou opération invalide" });
        }
        await sheets.updateOperation(req.session.email, rowNumber, operation);
        res.json({ success: true });
    } catch (error) {
        console.error("[operations/update]", error);
        res.status(500).json({ error: error.message });
    }
});

app.post("/api/import/workflow/prepare", requireAuth, upload.single("pdf"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "Aucun fichier importé" });
        }

        const workflow = await prepareWorkflow("manual", req.file, req.session.email);
        res.json({
            success: true,
            workflowId: workflow.id,
            status: workflow.status,
            document: workflow.document,
            duplicate: workflow.duplicate,
            analysis: workflow.analysis.data,
            proposedDecisions: workflow.duplicate.found
                ? ["insert", "replace", "cancel"]
                : ["insert", "cancel"]
        });
    } catch (error) {
        console.error("[ImportWorkflow] prepare", error);
        res.status(500).json({ error: error.message });
    }
});

app.post("/api/import/workflow/decide", requireAuth, async (req, res) => {
    try {
        console.log("[ImportWorkflow] decide workflow", req.body.workflowId, "action", req.body.action);
        const workflow = await decideWorkflow(
            req.body.workflowId,
            req.body.action,
            req.session.email,
            req.body.comment,
            req.body.document
        );

        console.log("[ImportWorkflow] decide terminé", workflow.id, workflow.normalized.metadata.ceesv?.type || null);
        res.json({
            success: true,
            status: workflow.status,
            execution: workflow.execution,
            decision: workflow.decision
        });
    } catch (error) {
        console.error("[ImportWorkflow] decide", error);
        res.status(500).json({ error: error.message });
    }
});

//
// PAGE PRINCIPALE
//
app.get(["/", "/index.html"], requireAuth, (req, res) => {

    res.sendFile(
        path.join(__dirname, "index.html")
    );

});
//
// PAGE Setting
//
app.get("/settings", requireAuth, async (req, res) => {

    try {

        const settings =
            await sheets.getSettings(req.session.email);


        res.json(settings);

    }
    catch (err) {

        console.error(err);

        res.status(500).json({
            error: err.message
        });

    }

});
//
// STATUS GOOGLE
//
app.get("/google-status", requireAuth, (req, res) => {

    res.json({
        connected:
            !!req.session?.email
    });

});
app.get("/google-user", (req, res) => {

    const user = getCurrentUserFromRequest(req);

    if (user) {
        return res.json(user);
    }


    const isLocalhost = isLocalRequest(req);

    if (req.session?.email === DEV_USER && isLocalhost) {

        return res.json({
            name: "TEST LOCALHOST",
            email: DEV_USER
        });

    }

    res.json({});

});
//
// LOGIN GOOGLE
//


app.get("/login", (req, res) => {

    if (devFeatureEnabled(req, DEV_BYPASS_LOGIN)) {

        req.session.email =
            "nicolas.jollois@gmail.com";

        console.log(
            "🧪 LOGIN BYPASS",
            req.session.sharedFile
        );

        return res.redirect(
            "/oauth/callback?dev=1"
        );

    }

    const url = oauth2Client.generateAuthUrl({

        access_type: "offline",
        prompt: "consent",

        scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/drive.file"
        ]

    });

    res.redirect(url);

});

app.get("/logout", (req, res) => {

    req.session.destroy(err => {

        if (err) {

            console.error(err);

            return res.redirect("/");

        }

        res.redirect("/");

    });

});

app.get("/api/environment", requireAuth, (req, res) => {

    res.json({
        environment:
            getEnvironment(
                req.session.email
            )
    });

});

app.post("/api/environment", requireAuth, (req, res) => {

    const currentUser =
        getCurrentUserFromRequest(req);

    setEnvironment(
        currentUser.email,
        req.body.environment
    );

    res.json({
        success: true,
        environment: req.body.environment
    });

});

app.get("/api/exercice", requireAuth, (req, res) => {

    const user =
        getCurrentUserFromRequest(req);

    res.json({
        exercice:
            user?.exercice
    });

});

app.get("/api/user", requireAuth, (req, res) => {

    res.json(
        getCurrentUserFromRequest(req)
    );

});

app.post('/api/clear-session', (req, res) => {
    // Supprime les variables de la session
    delete req.session.sharedFile;
    delete req.session.uploadMode;

    // Sauvegarde explicitement la session avant de répondre
    req.session.save((err) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, message: "Session mise à jour" });
    });
});

app.get("/api/startup", requireAuth, (req, res) => {

    res.json({
        openSharedFile:
            !!req.session.openSharedFile
    });

    req.session.openSharedFile = false;

});
function redirectAfterLogin(req, res) {

    const returnTo = req.session.returnTo;
    delete req.session.returnTo;
    if (returnTo) {
        console.log("↩️ Retour vers", returnTo);
        return res.redirect(returnTo);
    }


    // retour d'un import en attente
    if (req.session.sharedFile) {

        req.session.openSharedFile = true;

        if (req.session.uploadMode === "android") {

            console.log("📱 Retour Android");


            return res.redirect("/share.html");
        }

        if (devFeatureEnabled(req, DEV_SHARE_SIMULATE)) {

            console.log("📱 Share Simulate");

            return res.redirect("/share.html");
        }

        if (req.session.uploadMode === "browser") {

            console.log("🌐 Retour Browser");

            return res.redirect("/");
        }

        // fallback si pas de mode défini
        console.log("⚠️ UploadMode inconnu");

        return res.redirect("/");
    }

    // connexion normale
    console.log("🏠 Retour Home");

    return res.redirect("/");
}

//
// CALLBACK OAUTH
//
app.get(
    "/oauth/callback",
    async (req, res) => {

        console.log("✅ oauth Callback");

        if (req.session?.email) {

            console.log(
                "OAuth déjà connecté :",
                req.session.email
            );

            return redirectAfterLogin(req, res);

        }

        try {

            const code =
                req.query.code;

            const { tokens } =
                await oauth2Client.getToken(code);



            oauth2Client.setCredentials(tokens);

            const { google } =
                require("googleapis");

            const oauth2 =
                google.oauth2({
                    version: "v2",
                    auth: oauth2Client
                });

            const { data } =
                await oauth2.userinfo.get();

            const email = data.email;
            // Charger les tokens existants
            const tokenFile =
                path.join(DATA_DIR, "tokens.json");

            let tokensStore = {};

            if (fs.existsSync(tokenFile)) {

                tokensStore =
                    JSON.parse(
                        fs.readFileSync(
                            tokenFile,
                            "utf8"
                        )
                    );

            }

            // Sauvegarder ceux du user connecté
            tokensStore[email] = tokens;

            fs.writeFileSync(
                tokenFile,
                JSON.stringify(
                    tokensStore,
                    null,
                    2
                )
            );
            req.session.email =
                data.email;

            console.log(
                "✅ Connecté :",
                data.email
            );
            //retour de la connection google et si on a un fichier on continue l'import

            return redirectAfterLogin(req, res);


        }
        catch (err) {

            console.error(err);

            res.redirect("/login");

        }

    }
);

//
// categories
//
app.get("/api/categories", requireAuth, async (req, res) => {

    try {

        const categories =
            await sheets.getCategories(
                req.session.email
            );

        res.json(categories);

    }
    catch (err) {

        console.error(err);

        res.status(500).json({
            error: err.message
        });

    }

});
app.post(
    "/api/categories", requireAuth,
    async (req, res) => {

        try {

            const categorie =
                req.body.categorie?.trim();
            const compte =
                req.body.compte?.trim();

            const categories =
                await sheets.getCategories(
                    req.session.email
                );

            if (!categorie) {

                return res
                    .status(400)
                    .json({
                        success: false,
                        error: "Catégorie manquante"
                    });

            }


            if (!categories[categorie]) {

                await sheets.addCategorie(
                    req.session.email,
                    categorie,
                    compte
                );

                console.log(
                    "📚 Catégorie mémorisée :",
                    categorie,
                    "→",
                    compte
                );
            }
            res.json({
                success: true
            });

        }
        catch (err) {

            console.error(err);

            res.status(500).json({
                success: false,
                error: err.message
            });

        }

    }
);

//
// fournisseurs
//
app.get(
    "/api/fournisseurs",
    requireAuth,
    async (req, res) => {

        try {

            const fournisseurs =
                await sheets.getFournisseurs(
                    req.session.email
                );

            res.json(fournisseurs);

        }
        catch (err) {

            console.error(err);

            res.status(500).json({
                error: err.message
            });

        }

    }
);
app.post(
    "/api/fournisseurs", requireAuth,
    async (req, res) => {

        try {

            const fournisseur =
                req.body.fournisseur?.trim();

            const categorie =
                req.body.categorie?.trim();
            const frequence =
                req.body.frequence?.trim() || "";

            if (!fournisseur || !categorie) {

                return res
                    .status(400)
                    .json({
                        success: false,
                        error: "Fournisseur ou catégorie manquant"
                    });
            }

            const fournisseurs =
                await sheets.getFournisseurs(
                    req.session.email
                );

            if (!fournisseurs[fournisseur]) {
                fournisseurs[fournisseur] = {
                    categorie,
                    frequence
                };

                await sheets.addFournisseur(
                    req.session.email,
                    fournisseur,
                    categorie,
                    frequence
                );

                console.log(
                    "🧠 Fournisseur mémorisé :",
                    fournisseur,
                    "→",
                    categorie
                );
            }

            res.json({
                success: true
            });

        }
        catch (err) {

            console.error(err);

            res.status(500).json({
                success: false,
                error: err.message
            });
        }
    }
);

function parseComptaDate(value) {
    const text = String(value || "").trim();
    let match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (match) {
        return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
    }

    match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) {
        return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }

    return null;
}

app.get("/api/fournisseurs-periodiques", requireAuth, async (req, res) => {
    try {
        const email = req.session.email;
        const fournisseurs = await sheets.getFournisseurs(email);
        const fournisseursConvert = await sheets.getFournisseursConvert(email);
        const depenses = await sheets.getDepenses(email);
        const now = new Date();
        const year = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const items = [];
        const normalize = value => String(value || "").trim().toLowerCase();
        const expensesBySupplier = {};
        const normalizeSupplier = supplier => {
            const text = String(supplier || "").trim();
            const normalizedText = normalize(text);

            const conversion = Object.entries(fournisseursConvert || {}).find(([search]) => {
                try {
                    return new RegExp(search, "i").test(text);
                } catch {
                    return normalizedText.includes(normalize(search));
                }
            });

            return conversion ? String(conversion[1]).trim().toLowerCase() : normalizedText;
        };

        depenses.slice(1).forEach(row => {
            const supplier = normalizeSupplier(row[1]);
            const date = parseComptaDate(row[0]);
            if (!supplier || !date || date.getFullYear() !== year) {
                return;
            }
            if (!expensesBySupplier[supplier]) {
                expensesBySupplier[supplier] = [];
            }
            expensesBySupplier[supplier].push({
                date: row[0],
                month: date.getMonth() + 1,
                montant: row[4] || "",
                pdf: row[5] || ""
            });
        });

        Object.entries(fournisseurs).forEach(([supplier, config]) => {
            const frequency = normalize(config.frequence);
            if (!["mensuel", "semestriel", "annuel"].includes(frequency)) {
                return;
            }

            const dueMonths = frequency === "mensuel"
                ? Array.from({ length: currentMonth }, (_, index) => index + 1)
                : frequency === "semestriel"
                    ? [1, 7].filter(month => month <= currentMonth)
                    : [1];
            const supplierKey = normalize(supplier);
            let expenses = expensesBySupplier[supplierKey] || [];

            if (expenses.length === 0) {
                const supplierPrefix = supplierKey.replace(/[.*+?^${}()|[\]\\]/g, "");
                expenses = Object.entries(expensesBySupplier)
                    .filter(([name]) =>
                        name === supplierPrefix ||
                        name.startsWith(`${supplierPrefix} -`) ||
                        name.startsWith(`${supplierPrefix} `)
                    )
                    .flatMap(([, supplierExpenses]) => supplierExpenses);
            }
            const periods = dueMonths.map(month => {
                const matching = expenses.filter(expense => {
                    if (frequency === "mensuel") {
                        return expense.month === month;
                    }
                    if (frequency === "semestriel") {
                        return expense.month >= month && expense.month < month + 6;
                    }
                    return expense.month >= 1 && expense.month <= 12;
                });
                const label = frequency === "mensuel"
                    ? new Date(year, month - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
                    : frequency === "semestriel"
                        ? `Semestre ${month === 1 ? 1 : 2} ${year}`
                        : String(year);

                return {
                    period: label.charAt(0).toUpperCase() + label.slice(1),
                    status: matching.length ? "present" : "missing",
                    treatments: matching.map(expense => ({
                        date: expense.date,
                        montant: expense.montant,
                        pdf: expense.pdf
                    }))
                };
            });
            const missing = periods.filter(period => period.status === "missing").length;
            if (missing > 0) {
                items.push({
                    fournisseur: supplier,
                    categorie: config.categorie,
                    frequence: config.frequence,
                    missing,
                    periods
                });
            }
        });

        items.sort((a, b) => a.fournisseur.localeCompare(b.fournisseur, "fr"));
        res.json({
            year,
            missingCount: items.reduce((total, item) => total + item.missing, 0),
            fournisseursCount: items.length,
            items
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.get(
    "/api/fournisseurs-convert",
    requireAuth,
    async (req, res) => {

        try {

            const fournisseursConvert =
                await sheets.getFournisseursConvert(
                    req.session.email
                );

            res.json(fournisseursConvert);

        }
        catch (err) {

            console.error(err);

            res.status(500).json({
                error: err.message
            });
        }
    }
);
//
// affiches DEPENSES
//
app.get("/depenses", requireAuth, (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "depenses.html"
        )
    );

});
//
// recupere DEPENSE
//
app.get(
    "/api/depenses",
    requireAuth,
    async (req, res) => {

        try {

            const depenses =
                await sheets.getDepenses(req.session.email);

            res.json(depenses);

        }
        catch (err) {

            console.error(err);

            res.status(500).json({
                error: err.message
            });

        }

    }
);
//
// LOGIQUE COMMUNE DEPENSE
//
async function saveDepense(email, depense) {

    console.log("function saveDepense");

    const settings =
        await sheets.getSettings(email);

    const EXERCICE_COURANT =
        settings.Exercice.toString();

    const anneeDepense =
        depense.date.substring(0, 4);

    if (anneeDepense !== EXERCICE_COURANT) {
        throw new Error(
            `Probleme de date de facture ${anneeDepense} Different de l'Exercice actif : ${EXERCICE_COURANT}`
        );
    }

    if (depense.mode === "replace") {

        if (depense.duplicateRow) {
            await sheets.deleteRow(
                email,
                depense.duplicateRow
            );
        }
        //delete CEESV
        if (depense.duplicateRows && depense.duplicateRows.length > 0) {
            const rows = [...depense.duplicateRows].sort((a, b) => b - a);

            for (const row of rows) {
                await sheets.deleteRow(email, row);
            }
        }

    }

    await sheets.addDepense(
        email,
        depense.date,
        depense.fournisseur,
        depense.categorie,
        depense.compte,
        depense.montant,
        depense.pdf,
        depense.operationType,
        depense.commentaire,
        depense.justifBanque,
        depense.litres || ""
    );
}

//
// FRAIS KILOMETRIQUES
//
app.post("/api/mileage", requireAuth, async (req, res) => {
    try {
        const distance = Number(req.body.distance);
        const fullTankPrice = Number(req.body.fullTankPrice);
        const tankCapacity = Number(req.body.tankCapacity ?? 45);
        const consumption = Number(req.body.consumption ?? 7.3);

        if (!req.body.date || !Number.isFinite(distance) || distance <= 0) {
            return res.status(400).json({ success: false, error: "Distance invalide" });
        }
        if (!Number.isFinite(fullTankPrice) || fullTankPrice <= 0) {
            return res.status(400).json({ success: false, error: "Prix du plein invalide" });
        }
        if (!Number.isFinite(tankCapacity) || tankCapacity <= 0 || !Number.isFinite(consumption) || consumption <= 0) {
            return res.status(400).json({ success: false, error: "Paramètres du véhicule invalides" });
        }

        const litresFromInvoice = Array.isArray(req.body.litres)
            ? req.body.litres.map(Number).filter(value => Number.isFinite(value) && value > 0)
            : [];
        const litres = litresFromInvoice.length > 0
            ? litresFromInvoice.reduce((sum, value) => sum + value, 0)
            : distance / 100 * consumption;
        const amount = litres * fullTankPrice / tankCapacity;
        const categories = await sheets.getCategories(req.session.email);
        const compte = categories["Frais Véhicule"]?.compte || "";
        const litresRounded = litres.toFixed(2).replace(".", ",");
        const litresDetail = litresFromInvoice.length
            ? ` - pleins enregistrés ${litresFromInvoice.map(value => String(value).replace(".", ",")).join(" + ")} L`
            : "";

        await saveDepense(req.session.email, {
            date: req.body.date,
            fournisseur: "Volenery BP",
            categorie: "Frais Véhicule",
            compte,
            montant: amount.toFixed(2),
            pdf: "",
            operationType: "DEPENSE",
            commentaire: `${distance.toLocaleString("fr-CH")} km - ${litresRounded} L${litresDetail} - conso ${String(consumption).replace(".", ",")} L/100 km - plein ${tankCapacity} L pour ${fullTankPrice.toFixed(2).replace(".", ",")} CHF`,
            justifBanque: "",
            litres: litresFromInvoice.join("|")
        });

        res.json({ success: true, amount, litres });
    } catch (err) {
        console.error("Erreur frais kilométriques :", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

//
// AJOUT DEPENSE
//
app.post(
    "/addDepense", requireAuth,
    async (req, res) => {

        try {

            //console.log("/addDepense");

            await saveDepense(
                req.session.email,
                req.body
            );

            res.send("✅ Dépense enregistrée");

        }
        catch (err) {

            console.error(err);

            res
                .status(500)
                .send("Erreur");

        }

    }
);


app.post("/api/processCEESV", async (req, res) => {

    try {
        //console.log("route /api/processCEESV", req.body)

        const payload = req.body;
        const ceesvData = payload.ceesv || payload.analyse?.ceesv;

        if (ceesvData?.type === "CEESV_UBS") {
            const uploaded = await importDocument(
                payload.analyse?.pdf,
                payload.analyse?.originalName || payload.originalname || req.session.sharedFile?.originalname || "document.pdf",
                req.session.email
            );
            const match = await ceesv.findUBSMatch(req.session.email, ceesvData);

            if (match.trouve) {
                await ceesv.updateCEESVUBS(req.session.email, match.ligne, uploaded.pdfUrl);
                if (match.ligneUBS) {
                    await sheets.deleteRow(req.session.email, match.ligneUBS);
                }
            } else {
                await sheets.addDepense(
                    req.session.email,
                    convertDateCEESV(ceesvData.dateValeur),
                    "UBS - Centrale d'encaissement",
                    "",
                    "",
                    ceesvData.montantBanque,
                    uploaded.pdfUrl,
                    "RECETTE",
                    "Import UBS"
                );
            }

            return res.json({ success: true });
        }

        await ceesv.processCEESV({
            ...payload,
            email: req.session.email,
            ceesv: payload.ceesv || payload.analyse?.ceesv,
            analyse: payload.analyse || payload.depense?.analyse,
            originalname: payload.originalname || payload.analyse?.originalname || req.session.sharedFile?.originalname || "",
            commentaire: payload.commentaire ?? payload.depense?.commentaire ?? "",
            duplicateAction: payload.duplicateAction ?? payload.mode
        });

        res.json({
            success: true
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: err.message
        });

    }

});

//utilisé dans Share.html
app.post(
    "/addDepenseAndImport",
    requireAuth,
    async (req, res) => {
        console.log("addDepenseAndImport");
        try {

            const depense = req.body;

            const sharedFile =
                req.session.sharedFile;

            if (
                !sharedFile ||
                !fs.existsSync(sharedFile.path)
            ) {
                throw new Error(
                    "Aucun fichier partagé"
                );
            }


            const fileName =
                `${depense.fournisseur}_${depense.date}_${depense.montant}_${sharedFile.originalname}`
                    .replace(/[<>:"/\\|?*]/g, "")
                    .replace(/\s+/g, "_");


            const imported =
                await importDocument(
                    sharedFile.path,
                    fileName,
                    req.session.email
                );

            depense.pdf =
                imported.pdfUrl;

            await saveDepense(
                req.session.email,
                depense
            );

            delete req.session.sharedFile;
            delete req.session.uploadMode;

            res.json({
                success: true,
                pdfUrl: imported.pdfUrl
            });

        } catch (err) {

            console.error(err);

            res.status(500).json({
                success: false,
                error: err.message
            });
        }
    }
);


app.post("/updateCEESVUBS", requireAuth, async (req, res) => {

    try {

        const ligneCEESV = Number(req.body.ligne);
        const ligneUBS = Number(req.body.ligneUBS);

        await ceesv.updateCEESVUBS(
            req.session.email,
            ligneCEESV,
            req.body.pdfUrl
        );

        if (ligneUBS) {
            console.log("[/updateCEESVUBS] suppression ligne UBS temporaire", ligneUBS);
            await sheets.deleteRow(req.session.email, ligneUBS);
            console.log("[/updateCEESVUBS] ligne UBS supprimée", ligneUBS);
        } else {
            console.warn("[/updateCEESVUBS] ligne UBS absente dans la requête");
        }

        res.json({
            success: true
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

});

app.post("/findUBSMatch", requireAuth, async (req, res) => {

    try {

        const result =
            await ceesv.findUBSMatch(
                req.session.email,
                req.body.ceesv
            );

        res.json(result);

    }
    catch (err) {

        console.error(err);

        res.status(500).json({
            error: err.message
        });

    }

});

app.post("/deleteRow", requireAuth, async (req, res) => {

    await sheets.deleteRow(
        req.session.email,
        req.body.row
    );

    res.json({
        success: true
    });

});

app.post("/findCEESVMatch", requireAuth, async (req, res) => {

    console.log("findCEESVMatch");
    try {

        const result =
            await ceesv.findCEESVMatch(
                req.session.email,
                req.body.ceesv
            );

        res.json(result);

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: err.message
        });

    }

});

app.post(
    "/api/import-auto-ceesv",
    requireAuth,
    upload.array("files"),
    async (req, res) => {

        console.log("/api/import-auto-ceesv");

        const result = {
            ceesvImportes: 0,
            ubsRattaches: 0,
            ubsStandby: 0,
            erreurs: []
        };

        try {

            for (const file of req.files) {

                try {

                    console.log(
                        "📄 Traitement :",
                        file.originalname
                    );

                    const analyse =
                        await ocr.analyseDocument(
                            file.path,
                            file.originalname,
                            req.session.email
                        );

                    const analyseCeesv =
                        analyse.ceesv;

                    if (!analyseCeesv) {
                        const date = analyse.date;
                        const montant = analyse.montant;
                        const fournisseur = analyse.fournisseur;

                        if (!date || montant == null || !fournisseur) {
                            result.erreurs.push({
                                fichier: file.originalname,
                                erreur: "Document non exploitable (date, montant ou fournisseur manquant)"
                            });
                            continue;
                        }

                        const fileName = [
                            String(fournisseur).replace(/[<>:"/\\|?*]/g, " ").replace(/\s+/g, " ").trim(),
                            String(date).replace(/[<>:"/\\|?*]/g, "-"),
                            Number(montant).toFixed(2),
                            file.originalname
                        ].join("_");
                        const imported = await importDocument(file.path, fileName, req.session.email);
                        const litres = Array.isArray(analyse.litres) ? analyse.litres.join("|") : "";

                        await sheets.addDepense(
                            req.session.email,
                            date,
                            fournisseur,
                            analyse.categorie || "",
                            analyse.compte || "",
                            montant,
                            imported.pdfUrl,
                            analyse.operationType || analyse.type || "DEPENSE",
                            analyse.description || "",
                            "",
                            litres
                        );
                        result.facturesImportees = (result.facturesImportees || 0) + 1;
                        console.log("✅ Facture importée", fournisseur, litres);
                        continue;
                    }

                    //
                    // ETAT CEESV
                    //
                    if (
                        analyseCeesv.type ===
                        "CEESV_ETAT"
                    ) {

                        const date =
                            convertDateCEESV(
                                analyseCeesv.dateValeur
                            );

                        const fileName =
                            `CEESV_${date}_${Number(
                                analyseCeesv.montantFacture || analyseCeesv.montantBanque
                            ).toFixed(2)}_${file.originalname}`;

                        const imported =
                            await importDocument(
                                file.path,
                                fileName,
                                req.session.email
                            );

                        const pdfUrl =
                            imported.pdfUrl;

                        const match =
                            await ceesv.findCEESVMatch(
                                req.session.email,
                                analyseCeesv
                            );

                        if (match.matchFacture) {

                            await sheets.deleteRow(
                                req.session.email,
                                match.ligneFacture
                            );

                        }

                        if (match.matchEtat) {

                            await sheets.deleteRow(
                                req.session.email,
                                match.ligneEtat
                            );

                        }


                        await sheets.addDepense(
                            req.session.email,
                            date,
                            "CEESV - Facture",
                            "",
                            "",
                            analyseCeesv.montantFacture,
                            pdfUrl,
                            "RECETTE",
                            "",
                            match.pdfFacture || ""
                        );

                        await sheets.addDepense(
                            req.session.email,
                            date,
                            "CEESV - Etat",
                            "",
                            "",
                            analyseCeesv.montantEtat,
                            pdfUrl,
                            "RECETTE",
                            "",
                            match.pdfEtat || ""
                        );

                        result.ceesvImportes++;

                        console.log(
                            "✅ CEESV importé"
                        );

                    }

                    //
                    // UBS
                    //
                    else if (
                        analyseCeesv.type ===
                        "CEESV_UBS"
                    ) {


                        const fileName =
                            `UBS_${convertDateCEESV(
                                analyseCeesv.dateValeur
                            )}_${analyseCeesv.montantBanque}.pdf`;


                        const imported =
                            await importDocument(
                                file.path,
                                fileName,
                                req.session.email
                            );

                        const pdfUrl =
                            imported.pdfUrl;



                        const match =
                            await ceesv.findUBSMatch(
                                req.session.email,
                                analyseCeesv
                            );

                        console.log(match);

                        if (match.trouve) {

                            await ceesv.updateCEESVUBS(
                                req.session.email,
                                match.ligne,
                                pdfUrl
                            );

                            if (match.ligneUBS) {
                                await sheets.deleteRow(req.session.email, match.ligneUBS);
                            }

                            result.ubsRattaches++;


                            console.log(
                                "✅ UBS lié"
                            );

                        }
                        else {

                            await sheets.addDepense(
                                req.session.email,
                                convertDateCEESV(
                                    analyseCeesv.dateValeur
                                ),
                                "UBS - Centrale d'encaissement",
                                "",
                                "",
                                analyseCeesv.montantBanque,
                                pdfUrl,
                                "RECETTE",
                                "Import UBS"
                            );

                            console.log(
                                "📥 UBS mis en attente"
                            );

                            result.ubsStandby++;

                        }

                    }

                }
                catch (err) {

                    console.error(err);

                    result.erreurs.push({
                        fichier:
                            file.originalname,
                        erreur:
                            err.message
                    });

                }


            }

            res.json(result);

        }
        catch (err) {

            console.error(err);

            res.status(500).json({
                error: err.message
            });

        }

    }
);



/*app.use((req, res, next) => {
    console.log("METHOD:", req.method);
    console.log("URL:", req.url);
    console.log("CONTENT-TYPE:", req.headers["content-type"]);
    next();
});*/
const badPatterns = [
    ".php",
    ".env",
    "wp-",
    "phpmyadmin",
    "adminer"
];

app.use((req, res, next) => {

    const url = req.url.toLowerCase();

    if (badPatterns.some(p => url.includes(p))) {

        console.log(
            "🚫 Scan:",
            req.ip,
            req.url
        );

        return res.status(404).end();
    }

    next();

});


app.post("/upload",
    requireAuth,
    upload.single("pdf"),
    async (req, res) => {

        try {

            console.log("✅ PDF reçu (Server)");
            //console.log('=== UPLOAD ===');
            //console.log(req.file);


            const fileName =
                req.body.fileName ||
                req.file.originalname;

            const imported =
                await importDocument(
                    req.file.path,
                    fileName,
                    req.session.email
                );

            const pdfUrl =
                imported.pdfUrl;

            res.json({

                success: true,

                pdfUrl,

                driveUrl: pdfUrl

            });

        }
        catch (err) {

            console.error(err);

            res.status(500).json({
                success: false,
                error: err.message
            });

        }

    }
);
//
// exercices
//
app.get("/api/exercices", requireAuth, async (req, res) => {

    try {

        const exercices =
            await drive.getExercices(req.session.email);

        res.json(exercices);

    }
    catch (err) {

        console.error(err);

        if (
            err.message?.includes("invalid_grant")
        ) {

            return res.status(401).json({
                reconnect: true,
                error: "Google session expired"
            });

        }

        res.status(500).json({
            error: err.message
        });

    }
});

app.post(
    "/api/settings",
    requireAuth,
    async (req, res) => {

        try {

            await sheets.saveSetting(
                req.session.email,
                "Environment",
                req.body.environment
            );

            if (req.body.mileageConsumption != null) {
                const consumption = Number(String(req.body.mileageConsumption).replace(',', '.'));
                if (!Number.isFinite(consumption) || consumption <= 0) {
                    return res.status(400).json({ success: false, error: "Consommation invalide" });
                }
                await sheets.saveSetting(
                    req.session.email,
                    "MileageConsumption",
                    String(consumption)
                );
            }

            res.json({
                success: true
            });

        }
        catch (err) {

            console.error(err);

            res.status(500).json({
                success: false,
                error: err.message
            });

        }

    }
);

//
// PARTAGE ANDROID / PWA
//

app.post(
    "/share",
    upload.single("file"),
    (req, res, next) => {

        if (!req.session?.email) {

            req.session.pendingShare = {
                path: req.file.path,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype
            };

            req.session.uploadMode = "android";

            return res.redirect("/login");
        }

        next();

    },
    (req, res) => {


        try {
            if (!req.file) {
                return res.status(400).send("Aucun fichier reçu");
            }

            console.log(
                "📎 Fichier partagé reçu :",
                req.file.originalname
            );

            req.session.sharedFile = {
                path: req.file.path,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype
            };
            req.session.uploadMode = "android";

            res.redirect("/share.html");

        } catch (err) {
            console.error("Erreur partage :", err);
            res.status(500).send("Erreur lors du partage du fichier");
        }
    }
);
app.get("/api/shared-file", requireAuth, (req, res) => {
    const sharedFile = req.session.sharedFile;

    if (!sharedFile) {
        return res.status(404).json({
            error: "Aucun fichier partagé en attente"
        });
    }

    res.json({
        originalname: sharedFile.originalname,
        mimetype: sharedFile.mimetype
    });
});


app.post("/api/analyse-shared-file", requireAuth, async (req, res) => {

    //console.log("/api/analyse-shared-file");
    const sharedFile =
        req.session.sharedFile;

    if (
        !sharedFile ||
        !fs.existsSync(sharedFile.path)
    ) {
        return res.status(404).json({
            error: "Aucun fichier partagé"
        });
    }

    const result =
        await ocr.analyseDocument(
            sharedFile.path,
            sharedFile.originalname,
            req.session.email
        );

    res.json(result);
});

app.post("/api/import/workflow/prepare-shared", requireAuth, async (req, res) => {
    const sharedFile = req.session.sharedFile;
    if (!sharedFile || !fs.existsSync(sharedFile.path)) {
        return res.status(404).json({ error: "Aucun fichier partagé" });
    }

    const file = {
        path: sharedFile.path,
        name: sharedFile.originalname,
        originalname: sharedFile.originalname,
        type: sharedFile.mimetype,
        mimetype: sharedFile.mimetype
    };

    try {
        const workflow = await prepareWorkflow("share", file, req.session.email);
        res.json({
            workflowId: workflow.id,
            status: workflow.status,
            document: workflow.document,
            duplicate: workflow.duplicate,
            analysis: workflow.analysis.data
        });
    } catch (error) {
        console.error("[ImportWorkflow] prepare share", error);
        res.status(500).json({ error: error.message });
    }
});


//
// analyse
//

app.post(
    "/analyse-document",
    upload.single("pdf"),
    async (req, res) => {



        //console.log("ANALYSE DOCUMENT CALLED");

        if (!req.session?.email) {

            console.log("SAVE SHAREDFILE");

            req.session.sharedFile = {
                path: req.file.path,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype
            };

            req.session.uploadMode = "browser";

            return req.session.save(() => {
                res.status(401).json({
                    redirect: "/login"
                });
            });
        }

        console.log("/analyse-document", {
            name: req.file?.originalname,
            type: req.file?.mimetype,
            size: req.file?.size
        });

        const result =
            await ocr.analyseDocument(
                req.file.path,
                req.file.originalname,
                req.session.email
            );

        res.json(result);
    });
//
// FICHIERS UPLOADS
//
app.use("/uploads",
    requireAuth,
    express.static(
        path.join(
            __dirname,
            "uploads"
        )
    )
);


app.get("/test-sheet", async (req, res) => {

    try {

        const depenses =
            await sheets.getDepenses(req.session.email);

        res.json({
            ok: true,
            lignes: depenses.length
        });

    }
    catch (err) {

        console.error(err);

        res.status(500).json({
            ok: false,
            error: err.message
        });

    }

});
app.get("/test-drive", async (req, res) => {

    try {

        const exercices =
            await drive.getExercices(req.session.email);

        res.json(exercices);

    }
    catch (err) {

        console.error(err);

        res.status(500).json({
            error: err.message
        });

    }

});



//app.get("/api/drive/aCharger", async (req, res) => {
//
//    try {
//
//        const folderId =
//            settings.GoogleDrive.FolderACharger;
//
//        const response =
//            await drive.files.list({
//
//                q: `'${folderId}' in parents
//                    and mimeType='application/pdf'
//                    and trashed=false`,
//
//                fields:
//                    "files(id,name)"
//
//            });
//
//        res.json(
//            response.data.files
//        );
//
//    }
//    catch (err) {
//
//        console.error(err);
//
//        res.status(500).json([]);
//
//    }
//
//});
app.get("/api/drive/root-status", requireAuth, async (req, res) => {
    try {
        const folderId = getConfig(req.session.email).RootFolderId;
        if (!folderId) return res.status(400).json({ authorized: false, error: "RootFolderId non configuré" });
        const folder = await drive.getFolder(req.session.email, folderId);
        res.json({ authorized: true, folder });
    } catch (error) {
        res.status(403).json({ authorized: false, error: "Le dossier racine doit être sélectionné ou ouvert explicitement dans Google Drive via le Picker." });
    }
});

app.get(
    "/api/drive/download/:id",
    async (req, res) => {

        const fileId =
            req.params.id;

        const pdf = await drive.downloadFile(req.session.email, fileId);

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Cache-Control", "private, no-store");
        res.send(pdf);

    }
);
app.post(
    "/api/drive/archive",
    requireAuth,
    async (req, res) => {

        try {

            const fileId =
                req.body.fileId;

            const settings =
                await sheets.getSettings(req.session.email);
            const folderTraites =
                settings.GoogleDrive.FolderTraites;

            await drive.archiveFile(
                req.session.email,
                fileId,
                folderTraites
            );

            res.json({
                success: true
            });

        }
        catch (err) {

            console.error(err);

            res.json({
                success: false
            });

        }

    }
);
app.get(
    "/api/export-sheet",
    requireAuth,
    async (req, res) => {

        try {


            const settings =
                await sheets.getSettings(req.session.email);

            //console.log("📤 Export-sheet : ", JSON.stringify(settings, null, 2))

            const sheetId = settings.GoogleSheetId;

            res.json({
                success: true,
                url: `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`
            });

        }
        catch (err) {

            console.error(err);

            res.status(500).json({
                success: false,
                error: err.message
            });

        }

    }
);

function extractDriveId(url) {
    if (!url) return null;
    const fileMatch = String(url).match(/\/d\/([^/?]+)/);
    if (fileMatch) return fileMatch[1];
    const queryMatch = String(url).match(/[?&]id=([^&]+)/);
    return queryMatch ? queryMatch[1] : null;
}

function cleanArchiveName(value, fallback = "Non_renseigne") {
    const cleaned = String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[<>:"/\\|?*]/g, "-")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/\.+$/g, "");
    return cleaned || fallback;
}

function archiveDate(value) {
    const text = String(value || "").trim();
    const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    const frenchMatch = text.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
    if (frenchMatch) {
        return `${frenchMatch[3]}-${frenchMatch[2].padStart(2, "0")}-${frenchMatch[1].padStart(2, "0")}`;
    }
    return cleanArchiveName(text, "Sans_date");
}

function archiveAmount(value) {
    const raw = String(value || "0").trim();
    let normalized = raw.replace(/\s/g, "").replace(/[^0-9,-.]/g, "");
    const commaIndex = normalized.lastIndexOf(",");
    const dotIndex = normalized.lastIndexOf(".");

    if (commaIndex >= 0 && dotIndex >= 0) {
        if (commaIndex > dotIndex) {
            normalized = normalized.replace(/\./g, "").replace(",", ".");
        } else {
            normalized = normalized.replace(/,/g, "");
        }
    } else if (commaIndex >= 0) {
        normalized = /,\d{1,2}$/.test(normalized)
            ? normalized.replace(",", ".")
            : normalized.replace(/,/g, "");
    } else if (dotIndex >= 0 && !/\.\d{1,2}$/.test(normalized)) {
        normalized = normalized.replace(/\./g, "");
    }

    const amount = Number(normalized);
    if (!Number.isFinite(amount)) return cleanArchiveName(raw, "Montant");
    return Math.abs(amount).toFixed(2).replace(".", "-");
}

function buildArchivePdfName(row) {
    const date = archiveDate(row[0]);
    const supplier = cleanArchiveName(row[1], "Fournisseur");
    const amount = archiveAmount(row[4]);
    return `${date}_${supplier}_${amount}.pdf`;
}

function csvCell(value) {
    const text = String(value ?? "").replace(/"/g, '""');
    return /[;"\r\n]/.test(text) ? `"${text}"` : text;
}

app.get(
    "/api/export-justificatifs",
    requireAuth,
    async (req, res) => {

        try {

            const rows =
                await sheets.getDepenses(
                    req.session.email
                );

            const exercice =
                await getExercice(
                    req.session.email
                );

            res.setHeader(
                "Content-Type",
                "application/zip"
            );

            res.setHeader(
                "Content-Disposition",
                `attachment; filename="ComptaInf_Justificatifs_${exercice}.zip"`
            );

            const archive = new ZipArchive({
                zlib: { level: 9 }
            });

            archive.on("warning", err => {
                if (err.code !== "ENOENT") console.error("Archive warning:", err);
            });
            archive.on("error", err => {
                throw err;
            });
            archive.pipe(res);

            const sourceRows = rows || [];
            const headers = sourceRows[0] || [];
            const normalizeHeader = value => String(value || "")
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase()
                .replace(/[^a-z0-9]/g, "");

            const mainPdfIndex = 5;
            let bankPdfIndex = 8;
            let assitempPdfIndex = -1;
            headers.forEach((header, index) => {
                const normalized = normalizeHeader(header);
                if (normalized.includes("banque") && (normalized.includes("pdf") || normalized.includes("justif"))) {
                    bankPdfIndex = index;
                }
                if (normalized.includes("assitemp") || normalized.includes("assistance") && normalized.includes("temp")) {
                    assitempPdfIndex = index;
                }
            });

            const removeIndexes = new Set([headers.findIndex(header => normalizeHeader(header) === "dev")]);
            headers.forEach((header, index) => {
                const normalized = normalizeHeader(header);
                if (normalized === "dev" || normalized.includes("dateimport") || normalized.includes("importdate") || normalized.includes("datedimport")) {
                    removeIndexes.add(index);
                }
            });
            removeIndexes.delete(-1);

            const pdfIndexes = [
                { index: mainPdfIndex, label: "Justificatif", folder: "Justificatifs" },
                { index: bankPdfIndex, label: "Banque", folder: "JustificatifsBanque" },
                { index: assitempPdfIndex, label: "Assitemp", folder: "JustificatifsAssitemp" }
            ].filter((item, position, all) => item.index >= 0 && all.findIndex(candidate => candidate.index === item.index) === position);

            const archiveRows = sourceRows.map(row => {
                const archiveRow = [...(row || [])];
                pdfIndexes.forEach(pdf => {
                    if (pdf.index >= 0 && archiveRow[pdf.index] !== undefined) {
                        archiveRow[pdf.index] = "";
                    }
                });
                return archiveRow;
            });

            pdfIndexes.forEach(pdf => {
                if (archiveRows[0] && archiveRows[0][pdf.index] !== undefined) {
                    archiveRows[0][pdf.index] = `Chemin ${pdf.label.toLowerCase()}`;
                }
            });

            const keptIndexes = headers
                .map((header, index) => index)
                .filter(index => !removeIndexes.has(index));
            const usedNames = new Map();
            let count = 0;

            for (let rowIndex = 1; rowIndex < sourceRows.length; rowIndex++) {
                const row = sourceRows[rowIndex];
                for (const pdf of pdfIndexes) {
                    const pdfUrl = row[pdf.index];
                    if (!pdfUrl) continue;
                    const fileId = extractDriveId(pdfUrl);
                    if (!fileId) continue;

                    try {
                        const buffer = await drive.downloadFile(req.session.email, fileId);
                        const baseName = buildArchivePdfName(row).replace(/\.pdf$/i, "");
                        const labelledBaseName = pdf.label === "Justificatif"
                            ? `${baseName}.pdf`
                            : `${baseName}_${pdf.label}.pdf`;
                        const key = labelledBaseName.toLowerCase();
                        const duplicateIndex = usedNames.get(key) || 0;
                        usedNames.set(key, duplicateIndex + 1);
                        const fileName = duplicateIndex === 0
                            ? labelledBaseName
                            : labelledBaseName.replace(/\.pdf$/i, `_${duplicateIndex + 1}.pdf`);
                        const archivePath = `${pdf.folder}/${fileName}`;

                        const escapedArchivePath = archivePath.replace(/"/g, '""');
                        archiveRows[rowIndex][pdf.index] = `=LIEN_HYPERTEXTE("${escapedArchivePath}";"Ouvrir le PDF ${pdf.label}")`;
                        archive.append(buffer, { name: archivePath });
                        count++;
                    } catch (err) {
                        archiveRows[rowIndex][pdf.index] = "";
                        console.error(`Erreur téléchargement archive ${pdf.label} :`, pdfUrl, err.message);
                    }
                }
            }

            const csv = archiveRows
                .map(row => keptIndexes.map(index => csvCell(row[index])).join(";"))
                .join("\r\n") + "\r\n";
            archive.append(Buffer.from("\ufeff" + csv, "utf8"), {
                name: `ComptaInf_${exercice}.csv`
            });

            console.log(`[Export] Archive exercice ${exercice}: ${count} justificatifs PDF`);
            await archive.finalize();

        } catch (err) {

            console.error(err);

            res.status(500).json({
                success: false,
                error: err.message
            });
        }
    }
);
app.get(
    "/api/export-mega",
    requireAuth,
    async (req, res) => {

        try {

            const rows =
                await sheets.getDepenses(
                    req.session.email
                );

            let csv =
                "Date;Type;Compte;Categorie;Fournisseur;Montant;Commentaire\n";

            rows.forEach(row => {

                csv += [
                    row[0] || "",
                    row[6] || "",
                    row[3] || "",
                    row[2] || "",
                    row[1] || "",
                    row[4] || "",
                    row[7] || ""
                ].join(";") + "\n";

            });

            const exercice =
                await getExercice(req.session.email);

            res.setHeader(
                "Content-Type",
                "text/csv; charset=utf-8"
            );

            res.setHeader(
                "Content-Disposition",
                `attachment; filename="ComptaInf_MEGA_${exercice}.csv"`
            );

            res.send("\uFEFF" + csv);

        }
        catch (err) {

            console.error(err);

            res.status(500).json({
                success: false,
                error: err.message
            });

        }

    }
);
app.post("/api/import-shared-file",
    requireAuth,
    async (req, res) => {

        try {
            console.log("🔥 API IMPORT SHARED FILE CALLED");

            const sharedFile =
                req.session.sharedFile;

            delete req.session.sharedFile;
            delete req.session.uploadMode;

            if (
                !sharedFile ||
                !fs.existsSync(sharedFile.path)
            ) {

                return res.status(404).json({
                    success: false,
                    error: "Aucun fichier partagé"
                });

            }

            const imported =
                await importDocument(
                    sharedFile.path,
                    sharedFile.originalname,
                    req.session.email
                );


            const result = {
                success: true,
                pdfUrl: imported.pdfUrl
            };


            //clean 
            if (fs.existsSync(sharedFile.path)) {
                fs.unlinkSync(sharedFile.path);
            }



            res.json(result);

        }
        catch (err) {

            console.error(err);

            res.status(500).json({
                success: false,
                error: err.message
            });

        }

    }
);

app.get(
    "/api/shared-file-content",
    requireAuth,
    (req, res) => {

        const sharedFile =
            req.session.sharedFile;

        if (
            !sharedFile ||
            !fs.existsSync(sharedFile.path)
        ) {

            return res.status(404).json({
                error: "Aucun fichier partagé"
            });

        }

        res.sendFile(
            path.resolve(sharedFile.path)
        );

    }
);

app.get(
    "/api/shared-file-info",
    requireAuth,
    (req, res) => {

        const sharedFile =
            req.session.sharedFile;

        if (!sharedFile) {
            return res.status(404).json({
                error: "Aucun fichier partagé"
            });
        }

        res.json({
            originalname:
                sharedFile.originalname,
            mimetype:
                sharedFile.mimetype
        });

    }
);
app.post(
    "/api/shared-file-clear",
    requireAuth,
    (req, res) => {

        const sharedFile =
            req.session.sharedFile;

        if (
            sharedFile &&
            sharedFile.path &&
            fs.existsSync(sharedFile.path)
        ) {
            fs.unlinkSync(sharedFile.path);
        }

        delete req.session.sharedFile;
        delete req.session.uploadMode;

        res.json({
            success: true
        });

    }
);

app.post(
    "/api/checkDuplicate",
    async (req, res) => {

        console.log("route /api/checkDuplicate", req.body);

        const {
            date,
            fournisseur,
            montant,
            montantEtat,
            montantFacture,
            montantBanque
        } = req.body;


        const rows =
            await sheets.getDepenses(
                req.session.email
            );

        const fournisseurRecherche =
            normalizeFournisseur(
                fournisseur
            );

        const isCEESVRecherche = fournisseurRecherche?.includes("CEESV");

        const dateNormalized = convertDate(date);

        console.log(
            "CHECK DUPLICATE",
            {
                dateNormalized,
                fournisseur,
                fournisseurRecherche,
                montant,
                montantEtat,
                montantFacture,
                montantBanque
            }
        );

        const multiLignes = [];

        let rowIndex = -1;

        rows.forEach((row, index) => {

            let fournisseurRecherche = normalizeFournisseur(fournisseur);

            const fournisseurLigne = normalizeFournisseur(row[1]);
            const dateLigne = convertDate(row[0]);

            const montantLigne = Math.abs(Number(String(row[4]).replace(",", ".")));

            const montantRecheche = Math.abs(Number(montant));
            const montantEtatRecheche = Math.abs(Number(montantEtat));
            const montantFactureRecheche = Math.abs(Number(montantFacture));

            //console.log(row[0] + " ==" + date + " | " + row[1] + "/" + fournisseurLigne + " ==" + fournisseurRecherche + " | " + Math.abs(Number(String(row[4]).replace(",", "."))) + " ==" + Math.abs(Number(montant)));
            // CEESV : on doit distinguer Etat et Facture
            if (isCEESVRecherche) {

                if (
                    fournisseurLigne === fournisseurRecherche &&
                    dateLigne === dateNormalized &&
                    (montantLigne === montantRecheche ||
                        montantLigne === montantEtatRecheche ||
                        montantLigne === montantFactureRecheche)
                ) {
                    //console.log("found CEESV", rowIndex);
                    rowIndex = index;

                    multiLignes.push({
                        ligne: rowIndex + 1,
                        fournisseur: fournisseurLigne,
                        montant: montantLigne,
                        date: dateLigne
                    });


                }
            } else {

                //retour gerer uniquement hors ceesv
                if (
                    dateLigne === dateNormalized &&
                    fournisseurLigne === fournisseurRecherche &&
                    montantLigne === montantRecheche
                ) {
                    rowIndex = index;
                    return;
                }

            }

        });

        const duplicate = rows[rowIndex];

        if (!duplicate && multiLignes.length === 0) {

            return res.json({
                duplicate: false
            });

        }
        console.log("🔥 Duplicate Found");
        console.log("duplicate result", multiLignes);

        res.json({
            duplicate: true,
            row: rowIndex + 1, // ou +2 selon l'entête
            rowsCeesv: multiLignes || "",
            line: rows[rowIndex],
            comment: duplicate[7] || "",
            operation: {
                Date: duplicate[0],
                Fournisseur: duplicate[1],
                Categorie: duplicate[2],
                Compte: duplicate[3],
                Montant: duplicate[4],
                Pdf: duplicate[5]
            }
        });

    }
);

app.get(
    "/api/standby",
    requireAuth,
    async (req, res) => {

        const rows =
            await sheets.getDepenses(
                req.session.email
            );

        const resultat =
            rows.slice(1).reduce(
                (acc, row) => {

                    const fournisseur =
                        row[1] || "";

                    const estCEESV =
                        fournisseur.includes(
                            "CEESV"
                        );

                    const estUBS =
                        fournisseur ===
                        "UBS - Centrale d'encaissement";

                    if (
                        estCEESV &&
                        !row[8]
                    ) {
                        acc.ceesvSansBanque++;
                    }

                    if (estUBS) {
                        acc.ubsSansCeesv++;
                    }

                    return acc;

                },
                {
                    ceesvSansBanque: 0,
                    ubsSansCeesv: 0
                }
            );

        res.json(resultat);

    }
);
function cleanupUploads() {

    const uploadDir =
        path.join(DATA_DIR, "uploads");

    if (!fs.existsSync(uploadDir)) {
        return;
    }

    fs.readdirSync(uploadDir)
        .forEach(file => {

            const filePath =
                path.join(uploadDir, file);

            try {

                const stat =
                    fs.statSync(filePath);

                if (stat.isDirectory()) {

                    fs.rmSync(filePath, {
                        recursive: true,
                        force: true
                    });

                } else {

                    fs.unlinkSync(filePath);

                }

            }
            catch (e) {

                console.error(
                    "Erreur suppression :",
                    file,
                    e.message
                );

            }

        });

    console.log("🧹 Uploads nettoyés");
}

function cleanupOldUploads() {

    const uploadDir =
        path.join(DATA_DIR, "uploads");

    if (!fs.existsSync(uploadDir)) {
        return;
    }

    const now = Date.now();

    fs.readdirSync(uploadDir)
        .forEach(file => {

            const filePath =
                path.join(uploadDir, file);

            try {

                const stats =
                    fs.statSync(filePath);

                const ageMs =
                    now - stats.mtimeMs;

                // > 1 heure
                if (ageMs > 60 * 60 * 1000) {

                    fs.unlinkSync(filePath);

                    console.log(
                        "🗑️ Upload expiré supprimé :",
                        file
                    );

                }

            }
            catch (err) {

                console.warn(
                    "⚠️ Impossible de supprimer :",
                    file,
                    err.message
                );

            }

        });

}

app.get("/api/me", (req, res) => {

    const user = getCurrentUserFromRequest(req);

    res.json({
        email: req.session.email,
        role: user?.role || ""
    });

});

//
// DEMARRAGE
//

app.listen(PORT, () => {


    console.log(
        `🚀 ComptaInf v${packageJson.version}`
    );

    cleanupUploads();      // nettoyage complet au démarrage
    cleanupOldUploads();   // sécurité supplémentaire

    // toutes les 10 minutes
    setInterval(
        cleanupOldUploads,
        10 * 60 * 1000
    );

    console.log(
        `🚀 ComptaInf lancé sur http://localhost:${PORT}`
    );

    exec('start chrome http://localhost:3000');

});
