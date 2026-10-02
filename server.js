const express = require("express");
const { exec } = require("child_process");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const ocr = require("./ocr");
const oauth2Client = require("./oauth");
const sheets = require("./sheets");
const drive = require("./drive");
const {
    getEnvironment,
    setEnvironment
} = require("./config");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const DATA_DIR =
    process.env.DATA_DIR ||
    path.join(__dirname, "data");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}


const OAUTH_TOKEN_FILE =
    path.join(DATA_DIR, "oauth-token.json");

const GOOGLE_USER_FILE =
    path.join(DATA_DIR, "google-user.json");

const SERVICE_ACCOUNT_FILE =
    path.join(DATA_DIR, "service-account.json");

const upload = multer({
    dest: "uploads/"
});


function getCurrentUser() {

    const users = JSON.parse(
        fs.readFileSync(
            path.join(DATA_DIR, "users.json"),
            "utf8"
        )
    );

    return users.users[0];
}


//
// PAGE PRINCIPALE
//
app.get("/", (req, res) => {

    res.sendFile(
        path.join(__dirname, "index.html")
    );

});
//
// PAGE Setting
//
app.get("/settings", async (req, res) => {

    try {

        const settings =
            await sheets.getSettings();

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
app.get("/google-status", (req, res) => {

    const connected =
        fs.existsSync(OAUTH_TOKEN_FILE);

    res.json({
        connected
    });

});
//
// User GOOGLE
//
app.get("/google-user", (req, res) => {

    if (!fs.existsSync(GOOGLE_USER_FILE)) {

        return res.json({});
    }

    const user = JSON.parse(
        fs.readFileSync(
            GOOGLE_USER_FILE,
            "utf8"
        )
    );

    res.json(user);
});
//
// LOGIN GOOGLE
//
app.get("/login", (req, res) => {

    const url = oauth2Client.generateAuthUrl({

        access_type: "offline",

        prompt: "consent",

        scope: [
            "https://www.googleapis.com/auth/drive",
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile"

        ]

    });

    res.redirect(url);

});
app.get("/api/environment", (req, res) => {

    res.json({
        environment: getEnvironment()
    });

});

app.post("/api/environment", (req, res) => {

    const currentUser =
        getCurrentUser();

    setEnvironment(
        currentUser.email,
        req.body.environment
    );

    res.json({
        success: true,
        environment: req.body.environment
    });

});

app.get("/api/exercice", (req, res) => {

    res.json({
        exercice: getCurrentUser().exercice
    });

});

app.get("/api/user", (req, res) => {

    const user = getCurrentUser();

    res.json({
        email: user.email,
        environment: user.environment,
        exercice: user.exercice
    });

});

//
// CALLBACK OAUTH
//
app.get(
    "/oauth/callback",
    async (req, res) => {

        try {

            const code = req.query.code;

            const { tokens } =
                await oauth2Client.getToken(code);

            fs.writeFileSync(
                OAUTH_TOKEN_FILE,
                JSON.stringify(
                    tokens,
                    null,
                    2
                )
            );

            console.log(
                "✅ Token sauvegardé"
            );

            oauth2Client.setCredentials(tokens);

            const { google } = require("googleapis");

            const oauth2 = google.oauth2({
                version: "v2",
                auth: oauth2Client
            });

            const userInfo =
                await oauth2.userinfo.get();

            console.log(userInfo.data);

            fs.writeFileSync(
                GOOGLE_USER_FILE,
                JSON.stringify(
                    userInfo.data,
                    null,
                    2
                )
            );

            res.redirect("/");

        }
        catch (err) {

            console.error(err);

            res.redirect("/");

        }

    }
);

//
// categories
//
app.get("/api/categories", async (req, res) => {

    try {

        const categories =
            await sheets.getCategories();

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
    "/api/categories",
    async (req, res) => {

        try {

            const categorie =
                req.body.categorie?.trim();

            const compte =
                req.body.compte?.trim();

            const categories =
                await sheets.getCategories();

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
    async (req, res) => {

        try {

            const fournisseurs =
                await sheets.getFournisseurs();

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
    "/api/fournisseurs",
    async (req, res) => {

        try {

            const fournisseur =
                req.body.fournisseur?.trim();

            const categorie =
                req.body.categorie?.trim();

            if (!fournisseur || !categorie) {

                return res
                    .status(400)
                    .json({
                        success: false,
                        error: "Fournisseur ou catégorie manquant"
                    });
            }

            const fournisseurs =
                await sheets.getFournisseurs();

            if (!fournisseurs[fournisseur]) {
                fournisseurs[fournisseur] = {
                    categorie
                };

                await sheets.addFournisseur(
                    fournisseur,
                    categorie
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
``
//
// affiches DEPENSES
//
app.get("/depenses", (req, res) => {

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
    async (req, res) => {

        try {

            const depenses =
                await sheets.getDepenses();

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
// AJOUT DEPENSE
//
app.post(
    "/addDepense",
    async (req, res) => {

        try {

            const depense = req.body;

            const settings =
                await sheets.getSettings();

            const EXERCICE_COURANT =
                settings.Exercice.toString();

            const anneeDepense = depense.date.substring(0, 4);

            if (anneeDepense !== EXERCICE_COURANT) {

                return res
                    .status(400)
                    .send(
                        `Probleme de date de facture ${anneeDepense} Different de l'Exercice actif : ${EXERCICE_COURANT}`
                    );

            }


            await sheets.addDepense(
                depense.date,
                depense.fournisseur,
                depense.categorie,
                depense.compte,
                depense.montant,
                depense.pdf,
                depense.operationType,
                depense.commentaire,
                depense.justifBanque
            );

            res.send(
                "✅ Dépense enregistrée"
            );

        }
        catch (err) {

            console.error(err);

            res
                .status(500)
                .send("Erreur");

        }

    }
);

app.post("/updateCEESVUBS", async (req, res) => {

    try {

        await sheets.updateCEESVUBS(
            req.body.ligne,
            req.body.pdfUrl
        );

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

app.post("/findUBSMatch", async (req, res) => {

    try {

        const result =
            await sheets.findUBSMatch(
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

app.post("/deleteRow", async (req, res) => {

    await sheets.deleteRow(
        req.body.row
    );

    res.json({
        success: true
    });

});

app.post("/findCEESVMatch", async (req, res) => {

    try {

        const result =
            await sheets.findCEESVMatch(
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
    "/upload",
    upload.single("pdf"),
    async (req, res) => {

        try {

            console.log("✅ PDF reçu");

            const settings =
                await sheets.getSettings();

            const exercice =
                settings.Exercice;

            const fileName =
                req.body.fileName ||
                req.file.originalname;

            const fileId =
                await drive.uploadFile(
                    req.file.path,
                    fileName,
                    exercice
                );

            const pdfUrl =
                `https://drive.google.com/file/d/${fileId}/view`;

            res.json({

                success: true,

                fileId,

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
app.get("/api/exercices", async (req, res) => {

    try {

        const exercices =
            await drive.getExercices();

        res.json(exercices);

    }
    catch (err) {

        console.error(err);

        res.status(500).json({
            error: err.message
        });

    }

});

app.post(
    "/api/settings",
    async (req, res) => {

        try {

            await sheets.saveSetting(
                "Environment",
                req.body.environment
            );

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
// analyse
//
app.post(
    "/analyse-document",
    upload.single("pdf"),
    async (req, res) => {

        try {

            const ext =
                path.extname(
                    req.file.originalname
                ).toLowerCase();

            let text = "";

            if (ext === ".pdf") {

                text =
                    await ocr.analysePdf(
                        req.file.path
                    );

            } else {

                text =
                    await ocr.extractText(
                        req.file.path
                    );

            }

            //console.log("=== TEXTE OCR ===");
            //console.log(text);

            const ceesvData =
                ocr.extractCEESVData(text);

            res.json({
                type:
                    ocr.detectDocumentType(text),

                fournisseur:
                    ocr.extractFournisseur(text),

                dates:
                    ocr.extractDates(text),

                montants:
                    ocr.extractMontants(text),

                ceesv:
                    ceesvData,

            });

        }
        catch (err) {

            console.error(err);

            res.status(500).json({
                error:
                    err.message
            });

        }

    }
);
//
// FICHIERS UPLOADS
//
app.use(
    "/uploads",
    express.static(
        path.join(
            __dirname,
            "uploads"
        )
    )
);

//
// APP JS
//
app.use(
    "/app.js",
    express.static(
        path.join(
            __dirname,
            "app.js"
        )
    )
);

//
// CSS SI TU AJOUTES UN FICHIER CSS PLUS TARD
//
app.use(
    "/css",
    express.static(
        path.join(
            __dirname,
            "css"
        )
    )
);



app.get("/test-sheet", async (req, res) => {

    try {

        const depenses =
            await sheets.getDepenses();

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
            await drive.getExercices();

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
app.get(
    "/api/drive/download/:id",
    async (req, res) => {

        const fileId =
            req.params.id;

        const response =
            await drive.files.get(
                {
                    fileId,
                    alt: "media"
                },
                {
                    responseType:
                        "arraybuffer"
                }
            );

        res.send(
            Buffer.from(
                response.data
            )
        );

    }
);
app.post(
    "/api/drive/archive",
    async (req, res) => {

        try {

            const fileId =
                req.body.fileId;

            const folderTraites =
                settings.GoogleDrive.FolderTraites;

            const file =
                await drive.files.get({
                    fileId,
                    fields: "parents"
                });

            await drive.files.update({

                fileId,

                addParents:
                    folderTraites,

                removeParents:
                    file.data.parents.join(",")

            });

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
//
// DEMARRAGE
//
app.listen(PORT, () => {

    console.log(
        `🚀 ComptaInf lancé sur http://localhost:${PORT}`
    );

    exec('start chrome http://localhost:3000');

});