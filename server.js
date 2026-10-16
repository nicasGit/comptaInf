//server.js
const express = require("express");
const { exec } = require("child_process");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const ocr = require("./js/ocr");
const oauth2Client = require("./js/oauth");
const sheets = require("./js/sheets");
const drive = require("./js/drive");
const { importDocument } = require("./js/importDocument");
const {
    getEnvironment,
    setEnvironment
} = require("./js/config");
const session = require("express-session");

const { getDepenses } = require("./js/sheets");

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

app.get("/share.html", requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, "share.html"));
});

function getCurrentUser(req) {

    if (!req.session.email) {
        return null;
    }

    const users = JSON.parse(
        fs.readFileSync(
            path.join(DATA_DIR, "users.json"),
            "utf8"
        )
    );

    return users.users.find(
        u =>
            u.email.toLowerCase() ===
            req.session.email.toLowerCase()
    );

}

app.use(session({
    secret: "ComptaInfSecretSessionNJO",
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000
    }
}));


const DEV_USER =
    process.env.DEV_USER ||
    "nicolas.jollois@gmail.com";




function requireAuth(
    req,
    res,
    next
) {

    const isLocalhost =
        req.hostname === "localhost" ||
        req.hostname === "127.0.0.1";

    if (
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

    if (!req.session?.email) {

        // Requête venant d'un navigateur
        if (req.accepts("html")) {
            return res.redirect("/login");
        }

        return res.status(401).json({
            error: "Non connecté"
        });

    }

    next();

}
//
// PAGE PRINCIPALE
//
app.get("/", requireAuth, (req, res) => {

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
            await sheets.getSettings(
                req.session.email
            );


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

    const user = getCurrentUser(req);

    if (user) {
        return res.json(user);
    }


    const isLocalhost =
        req.hostname === "localhost" ||
        req.hostname === "127.0.0.1";

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

    const url = oauth2Client.generateAuthUrl({

        access_type: "offline",
        prompt: "consent",

        scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/drive"
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
        getCurrentUser(req);

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
        getCurrentUser(req);

    res.json({
        exercice:
            user?.exercice
    });

});

app.get("/api/user", requireAuth, (req, res) => {

    res.json(
        getCurrentUser(
            req.session.email
        )
    );

});

//
// CALLBACK OAUTH
//
app.get(
    "/oauth/callback",
    async (req, res) => {

        console.log("callback ", req.session?.email);

        if (req.session?.email) {

            console.log(
                "OAuth déjà connecté :",
                req.session.email
            );

            return res.redirect("/");

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

            res.redirect("/");

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
                    categorie
                };

                await sheets.addFournisseur(
                    req.session.email,
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
// AJOUT DEPENSE
//
app.post(
    "/addDepense", requireAuth,
    async (req, res) => {

        try {

            const depense = req.body;

            const settings =
                await sheets.getSettings(
                    req.session.email
                );

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
                req.session.email,
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

app.post("/updateCEESVUBS", requireAuth, async (req, res) => {

    try {

        await sheets.updateCEESVUBS(
            req.session.email,
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

app.post("/findUBSMatch", requireAuth, async (req, res) => {

    try {

        const result =
            await sheets.findUBSMatch(
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

    try {

        const result =
            await sheets.findCEESVMatch(
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

                    const ceesv =
                        analyse.ceesv;

                    if (!ceesv) {

                        result.erreurs.push({
                            fichier:
                                file.originalname,
                            erreur:
                                "CEESV non reconnu"
                        });

                        continue;

                    }

                    //
                    // ETAT CEESV
                    //
                    if (
                        ceesv.type ===
                        "CEESV_ETAT"
                    ) {

                        const date =
                            convertDateCEESV(
                                ceesv.dateValeur
                            );

                        const fileName =
                            `CEESV_${date}_${Number(
                                ceesv.montantFacture || ceesv.montantBanque
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
                            await sheets.findCEESVMatch(
                                req.session.email,
                                ceesv
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
                            ceesv.montantFacture,
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
                            ceesv.montantEtat,
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
                        ceesv.type ===
                        "CEESV_UBS"
                    ) {


                        const fileName =
                            `UBS_${convertDateCEESV(
                                ceesv.dateValeur
                            )}_${ceesv.montantBanque}.pdf`;


                        const imported =
                            await importDocument(
                                file.path,
                                fileName,
                                req.session.email
                            );

                        const pdfUrl =
                            imported.pdfUrl;



                        const match =
                            await sheets.findUBSMatch(
                                req.session.email,
                                ceesv
                            );

                        console.log(match);

                        if (match.trouve) {


                            await sheets.updateCEESVUBS(
                                req.session.email,
                                match.ligne,
                                pdfUrl
                            );

                            result.ubsRattaches++;


                            console.log(
                                "✅ UBS lié"
                            );

                        }
                        else {

                            await sheets.addDepense(
                                req.session.email,
                                convertDateCEESV(
                                    ceesv.dateValeur
                                ),
                                "UBS - Centrale d'encaissement",
                                "",
                                "",
                                ceesv.montantBanque,
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

function convertDateCEESV(dateStr) {

    if (!dateStr) {
        return "";
    }

    const p =
        dateStr.split(".");

    return `${p[2]}-${p[1]}-${p[0]}`;

}


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


app.post(
    "/upload",
    requireAuth,
    upload.single("pdf"),
    async (req, res) => {

        try {

            console.log("✅ PDF reçu");
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

            return res.redirect("/login");
        }

        next();

    },
    (req, res) => {

        //
        //console.log("headers =", req.headers);
        //
        //console.log("SESSION =", req.session?.email);
        //console.log("FILES =", req.files);
        //console.log("FILE =", req.file);
        //console.log("BODY =", req.body);
        /*
                if (req.files?.length) {
        
                    req.files.forEach(f => {
        
                        console.log(
                            "FIELD =",
                            f.fieldname
                        );
        
                        console.log(
                            "NAME =",
                            f.originalname
                        );
        
                    });
        
                }*/

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


//
// analyse
//

app.post(
    "/analyse-document",
    requireAuth,
    upload.single("pdf"),
    async (req, res) => {

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
app.use(
    "/uploads", requireAuth,
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
    requireAuth,
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

app.post(
    "/api/import-shared-file",
    requireAuth,
    async (req, res) => {

        try {

            const sharedFile =
                req.session.sharedFile;

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

            delete req.session.sharedFile;

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

            fs.unlinkSync(
                sharedFile.path
            );

        }

        delete req.session.sharedFile;

        res.json({
            success: true
        });

    }
);

function normalizeFournisseur(nom, converts) {

    const key = (nom || "")
        .trim()
        .toLowerCase();

    return converts[key] || key;

}

app.post(
    "/api/checkDuplicate",
    async (req, res) => {


        console.log("🔥 CHECK DUPLICATE CALLED");

        const {
            date,
            fournisseur,
            montant
        } = req.body;




        const rows =
            await sheets.getDepenses(
                req.session.email
            );


        const fournisseursConvert =
            await sheets.getFournisseursConvert(
                req.session.email
            );

        const fournisseurRecherche =
            normalizeFournisseur(
                fournisseur,
                fournisseursConvert
            );

        console.log(
            "CHECK DUPLICATE",
            {
                date,
                fournisseur,
                fournisseurRecherche,
                montant
            }
        );


        const rowIndex =
            rows.findIndex(row => {

                const fournisseurLigne =
                    normalizeFournisseur(
                        row[1],
                        fournisseursConvert
                    );

                return (
                    row[0] === date &&
                    fournisseurLigne === fournisseurRecherche &&
                    Math.abs(
                        Number(
                            String(row[4]).replace(",", ".")
                        )
                    ) === Math.abs(
                        Number(montant)
                    )
                );

            });



        const duplicate = rows[rowIndex];


        if (!duplicate) {

            return res.json({
                duplicate: false
            });

        }

        console.log("Duplicate !");


        res.json({
            duplicate: true,
            row: rowIndex + 1, // ou +2 selon l'entête
            line: rows[rowIndex],
            comment: duplicate[7] || "",
            operation: {
                Date: duplicate[0],
                Fournisseur: duplicate[1],
                Montant: duplicate[4]
            }
        });

    }
);

app.get(
    "/api/standby",
    requireAuth,
    async (req, res) => {

        const rows =
            await getDepenses(
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
//
// DEMARRAGE
//

app.listen(PORT, () => {

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