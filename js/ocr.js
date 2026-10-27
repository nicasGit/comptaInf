//ocr.js
const fs = require("fs");
const pdf = require("pdf-parse");
const sheets = require("./sheets");
const { convertDate } = require("../utils/utils");


const Tesseract = require("tesseract.js");
const sharp = require("sharp");
const path = require("path");

//const pdfPoppler = require("pdf-poppler");
let pdfPoppler = null;
const isWindows = process.platform === "win32";

if (isWindows) {
    pdfPoppler = require("pdf-poppler");
}
const { spawn } = require("child_process");
//sous HAOS install : apk add --no-cache poppler-utils


function normalizeOCRText(text) {

    return text

        // dates OCR
        .replace(
            /(\d{2}),(\d{2}),(\d{4})/g,
            "$1.$2.$3"
        )

        // espaces au milieu des dates
        .replace(
            /(\d{2})\s+(\d{2})\s+(\d{4})/g,
            "$1.$2.$3"
        );

}


async function pdfToImagesLinux(pdfPath, outputDir) {

    return new Promise((resolve, reject) => {

        const proc = spawn("pdftocairo", [
            "-png",
            "-r", "300",
            pdfPath,
            path.join(outputDir, "page")
        ]);

        proc.on("close", code => {
            if (code === 0) resolve();
            else reject(new Error(`pdftocairo exit code ${code}`));
        });
    });
}



async function pdfToImages(pdfPath, outputDir) {

    if (isWindows) {
        await pdfPoppler.convert(pdfPath, {
            format: "png",
            out_dir: outputDir,
            out_prefix: "page",
            page: null,
            scale: 2000
        });
    } else {

        try {
            await pdfToImagesLinux(pdfPath, outputDir);
        } catch (err) {
            console.error("Conversion PDF impossible :", err.message);
            return [];
        }

    }

    return outputDir;
}


async function readCorruptedPdf(pdfPath) {

    const outputDir = path.join(
        path.dirname(pdfPath),
        "ocr"
    );

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, {
            recursive: true
        });
    }

    const images = await pdfToImages(pdfPath, outputDir);

    const files = fs.readdirSync(outputDir)
        .filter(f => f.endsWith(".png"))
        .sort();

    let fullText = "";
    for (const file of files) {

        const pagePath = path.join(
            outputDir,
            file
        );

        //console.log(
        //   "📄 OCR page",
        //   file
        //);

        const text =
            await extractTextFromImage(pagePath);

        fullText += "\n" + text;

        fs.unlinkSync(pagePath);
    }


    //console.log("========== OCR ==========");
    //console.log(fullText);
    //console.log("===================");

    fs.rmSync(outputDir, {
        recursive: true,
        force: true
    });

    return fullText;
}


async function extractTextFromImage(imagePath,
    email = null) {

    //console.log("🖼️ extractText appelé :", imagePath);
    console.log("🔍🖼️ Analyse Image");

    const processedImage =
        imagePath + "_ocr.png";

    const buffer = await sharp(imagePath)
        .rotate()
        .resize({
            width: 2000,
            withoutEnlargement: true
        })
        .grayscale()
        .normalize()
        .toBuffer();

    //console.log(
    //    "✅ image OCR créée en memoire :",
    //    processedImage
    //);
    const result =
        await Tesseract.recognize(
            buffer,
            "fra"
        );


    result.data.text = normalizeOCRText(result.data.text);

    //console.log("========== OCR ==========");
    //console.log(JSON.stringify(result.data.text));
    //console.log(result.data.text);
    //console.log("=========================");


    console.log(
        "Confiance OCR :",
        result.data.confidence
    );
    if (result.data.words) {

        result.data.words
            .sort((a, b) =>
                b.confidence - a.confidence
            )
            .slice(0, 20)
            .forEach(w => {

                console.log(
                    w.text,
                    w.confidence
                );

            });

    }
    /* console.log(
         "=== TEXTE OCR ===\n",
         result.data.text
     );*/

    return result.data.text;
}




async function analysePdf(filePath) {

    console.log("🔍📄 Analyse PDF");

    const buffer =
        fs.readFileSync(filePath);

    const data =
        await pdf(buffer);

    return data.text;
}


function extractMontants(text, matchedRules = []) {

    // Cherche les montants après CHF
    // Accepte :
    // CHF 22
    // CHF 22.5
    // CHF 22.50
    // CHF 1'250.50
    const regex =
        /CHF\s*([0-9][0-9'’ ]*(?:[.,][0-9]{1,2})?)/gi;

    const matches = [...text.matchAll(regex)];

    if (!matches.length) {
        return [];
    }



    const montants = matches
        .map(match => {

            const value = match[1]
                .replace(/['’ ]/g, "")
                .replace(/\s/g, "")
                .replace(",", ".");

            return parseFloat(value);

        })
        .filter(value => !isNaN(value));

    matchedRules.push({
        nom: "💰 extractMontants " + montants,
        regex: regex.toString()
    });

    // Supprime les doublons
    return [...new Set(montants)];
}


function extractDates(texte, matchedRules = []) {

    let regex = "";

    //
    // CEESV : règle métier prioritaire
    //
    const dateValeur =
        extractDateValeur(texte);

    if (dateValeur) {

        console.log(
            "🎯 Date de valeur trouvée",
            dateValeur
        );

        matchedRules.push({
            nom: "📅 Date trouvée par valeur metier",
            regex: regex.toString()
        });

        return [dateValeur];

    }

    if (/centrale.*encaissement/i.test(texte)) {

        regex = /\d{2}\.\d{2}\.\d{4}/g;
        const dates =
            texte.match(
                regex
            );

        matchedRules.push({
            nom: "📅 Date trouvée par central encaissement ",
            regex: regex.toString()
        });

        return dates || [];

    }
    //
    // Dates numériques
    //
    regex = /\d{2}[.,\/-]\d{2}[.,\/-]\d{4}/g;
    let matches =
        texte.match(
            regex
        );

    if (matches?.length) {

        matchedRules.push({
            nom: "📅 Date trouvée par gestion numerique",
            regex: regex.toString()
        });


        return matches;
    }


    //
    // Exemple :
    // 15 oct. 2026 15:56:49 UTC+2
    //
    regex = /\d{1,2}\s+[a-zéûôàèùç]{3,}\.?\s+\d{4}/gi;
    matches =
        texte.match(
            regex
        );

    matchedRules.push({
        nom: "📅 Date trouvée par autre texte",
        regex: regex.toString()
    });

    return matches || [];

}

function extractDateValeurOLD(texte) {

    const dates =
        texte.match(
            /\d{2}\.\d{2}\.\d{4}/g
        ) || [];

    return dates.length >= 3
        ? dates[2]
        : dates[0] || null;

}

function extractDateValeurOLD2(texte) {

    const match =
        texte.match(
            /Date de valeur\s*([0-9]{2}\.[0-9]{2}\.[0-9]{4})/i
        );

    return match
        ? match[1]
        : null;
}


function extractDateValeur(texte) {

    const match =
        texte.match(
            /Date\s*(?:de)?\s*valeur\s*:?\s*(\d{2}\.\d{2}\.\d{4})/i
        );

    return match
        ? match[1]
        : null;
}

function extractDateValeurCEESVUBS(texte) {

    const bloc = texte.match(
        /Date de transaction.*?Date de comptabilisation.*?Date de valeur.*?Réception de l'ordre(.*)/is
    );

    if (!bloc) {
        return null;
    }

    const dates = bloc[1].match(/\d{2}\.\d{2}\.\d{4}/g);

    return (dates && dates.length >= 3)
        ? dates[2]
        : null;
}

function detectDocumentType(texte) {

    const normalise =
        texte.toLowerCase();

    if (/centrale.*encaissement/i.test(texte)) {
        return "RECETTE";
    }

    return "DEPENSE";
}

async function detectCategorie(fournisseur, email, matchedRules = []) {

    try {


        const fournisseurs =
            await sheets.getFournisseurs(email);


        const normaliser = texte =>
            texte
                .toLowerCase()
                .trim()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "");

        const nomOCR = normaliser(fournisseur);

        if (!nomOCR) {
            console.log("❌ Fournisseur OCR vide");
            matchedRules.push({
                nom: "❌ Fournisseur OCR vide",
                regex: ""
            });
            return "";
        }

        const correspondance =
            Object.keys(fournisseurs).find(f => {

                const ref = normaliser(f);

                return (
                    nomOCR === ref ||
                    nomOCR.includes(ref) ||
                    ref.includes(nomOCR)
                );

            });



        if (!correspondance) {
            console.log("❌ No Match Fournisseur/Categorie pour ", fournisseur)
            matchedRules.push({
                nom: "❌ No Match Fournisseur/Categorie pour " + fournisseur,
                regex: ""
            });

            return "";
        }

        const categorie = fournisseurs[correspondance]?.categorie || "";

        console.log("🎯 Match Fournisseur/Categorie :", categorie)
        matchedRules.push({
            nom: "🎯 Match Fournisseur/Categorie :" + fournisseur + " | " + categorie,
            regex: ""
        });

        return categorie;

    }
    catch (e) {

        console.error(
            "Erreur détection catégorie",
            e
        );

        return "";

    }

}

async function detectCompte(categorie, email) {

    const categories =
        await sheets.getCategories(email);

    return categories[categorie]?.compte || "";
}


function extractFournisseur(texte) {

    if (/ceesv.*centrale.*encaissement/i.test(texte)) {
        return "CEESV - Centrale d'Encaissement";
    }

    if (/centrale.*encaissement/i.test(texte) && /ubs/i.test(texte)) {
        return "UBS - Centrale d'encaissement";
    }

    const lignes = texte
        .split("\n")
        .map(l => l.trim())
        .filter(l => l.length > 2);

    return lignes[0] || "";
}


/*
function extractMontantEtat(texte) {

    const match =
        texte.match(
            /Montant Etat\s*:?\s*CHF\s*([\d\s]+,\d{2})/i
        );

    if (!match) {
        return null;
    }

    return parseFloat(
        match[1]
            .replace(/\s/g, "")
            .replace(",", ".")
    );
}*/

function extractNbFactures(texte) {

    const match =
        texte.match(
            /Factures\s*(\d+)\s*[\d\s,]+/i
        );

    return match
        ? parseInt(match[1], 10)
        : null;
}
function extractFournisseurOld(text) {

    const fournisseurs = [

        "Swisscom",
        "Coop",
        "Migros",
        "Sunrise",
        "Salt",
        "Digitec",
        "Galaxus"

    ];

    return fournisseurs.find(
        f =>
            text
                .toLowerCase()
                .includes(
                    f.toLowerCase()
                )
    ) || "";
}


function extractCEESVData(texte) {

    //
    // CAS UBS
    //
    if (
        /centrale.*encaissement/i.test(texte) &&
        /date de transaction/i.test(texte)
    ) {

        return {
            type: "CEESV_UBS",

            dateValeur:
                extractDateValeurCEESVUBS(texte),

            montantBanque:
                extractMontants(texte)[0] || null
        };
    }

    //
    // CAS ETAT CEESV
    //
    const result = {
        type: "CEESV_ETAT"
    };

    const date =
        texte.match(
            /Date\s*(?:de)?\s*valeur\s*:?\s*(\d{2}\.\d{2}\.\d{4})/i
        );

    if (date) {
        result.dateValeur = date[1];
    }

    const reference =
        texte.match(
            /Référence\s*:?\s*(\d+)/i
        );

    if (reference) {
        result.reference = reference[1];
    }

    const recap =
        texte.match(
            /Factures\s*(\d+)\s*([\d\s]+,\d{2})\s*([\d\s]+,\d{2})/i
        );

    if (recap) {

        result.nbFactures =
            parseInt(recap[1], 10);

        result.montantFacture =
            parseFloat(
                recap[2]
                    .replace(/\s/g, "")
                    .replace(",", ".")
            );
        result.montantFacture.toFixed(2);

        result.montantEtat =
            parseFloat(
                recap[3]
                    .replace(/\s/g, "")
                    .replace(",", ".")
            );
        result.montantEtat.toFixed(2);
    }

    //
    // Aucun CEESV reconnu
    //
    if (
        !result.dateValeur &&
        !result.reference &&
        !result.montantFacture
    ) {
        return null;
    }

    return result;
}
function isUBSCEESV(texte) {
    return (
        /centrale.*encaissement/i.test(texte) &&
        /date de transaction/i.test(texte) &&
        /ubs/i.test(texte)
    );
}

function isEtatCEESV(texte) {
    return (
        /ceesv/i.test(texte) &&
        /factures/i.test(texte)
    );
}
function convertFournisseur(
    texte,
    fournisseursConvert
    , matchedRules = []
) {

    if (!texte) {
        return "";
    }

    const match =
        Object.entries(
            fournisseursConvert || {}
        ).find(([search]) => {

            try {

                return new RegExp(
                    search,
                    "i"
                ).test(texte);

            }
            catch {

                return texte
                    .toLowerCase()
                    .includes(
                        search.toLowerCase()
                    );

            }

        });

    if (match) {

        console.log(
            "🎯 Match OCR :",
            match[0],
            "=>",
            match[1]
        );


        matchedRules.push({
            nom: "🎯 Match OCR " + match[0] + "=>" + match[1],
            regex: ""
        });

        return match[1];

    }

    return "";
}


function extractMontantByRule(
    texte,
    regex,
    matchedRules = []
) {

    if (!texte || !regex) {
        return null;
    }

    try {

        const match =
            texte.match(
                new RegExp(
                    regex,
                    "i"
                )
            );

        if (!match || !match[1]) {

            // matchedRules.push({
            //     nom: "💰❌ No Match OCR pour Montant",
            //     regex: regex.toString()
            // });

            return null;
        }

        const montant =
            parseFloat(
                match[1]
                    .replace(/['’]/g, "")
                    .replace(/\s/g, "")
                    .replace(",", ".")
            );


        if (isNaN(montant)) {
            return null;
        }
        montant.toFixed(2);

        console.log(
            "💰 Montant trouvé par règle :",
            regex,
            "=>",
            montant
        );


        matchedRules.push({
            nom: "💰 Montant trouvé par règle : " + montant,
            regex: regex.toString()
        });

        return montant;

    }
    catch (err) {

        console.error(
            "❌ Regex OCR invalide :",
            regex,
            err.message
        );

        return null;

    }

}
function extractMontantFromRules(
    texte,
    ocrRules,
    matchedRules = []
) {

    for (const [type, regex] of Object.entries(
        ocrRules || {}
    )) {


        /*  console.log(
              "🧪 Test règle :",
              type,
              "=",
              regex
          );*/

        const montant =
            extractMontantByRule(
                texte,
                regex,
                matchedRules
            );

        if (montant !== null) {

            console.log(
                "✅ Règle utilisée :",
                type
            );

            matchedRules.push({
                nom: "✅ Règle utilisée :" + type,
                regex: regex.toString()
            });

            return montant;

        }

    }


    return null;

}

function extractMontantsWithRules(
    texte,
    ocrRules,
    matchedRules = []
) {

    const montantOCR =
        extractMontantFromRules(
            texte,
            ocrRules,
            matchedRules
        );

    if (montantOCR !== null) {

        return [montantOCR];

    }

    return extractMontants(
        texte,
        matchedRules
    );

}
function convertMonthToNumber(month) {

    const months = {
        janvier: "01",
        février: "02",
        fevrier: "02",
        mars: "03",
        avril: "04",
        mai: "05",
        juin: "06",
        juillet: "07",
        août: "08",
        aout: "08",
        septembre: "09",
        octobre: "10",
        novembre: "11",
        décembre: "12",
        decembre: "12"
    };

    return months[
        month
            .toLowerCase()
            .trim()
    ] || month;
}


function extractVariablesFromRules(
    texte,
    ocrVariableRules,
    matchedRules = []
) {

    const variables = {};

    //
    // PASS 1
    // Extraction OCR
    //
    for (const [name, expression] of Object.entries(
        ocrVariableRules || {}
    )) {

        if (
            /^year\(/i.test(expression) ||
            /^month\(/i.test(expression) ||
            /^day\(/i.test(expression)
        ) {
            continue;
        }

        try {

            let value = "";

            //
            // Fonction OCR
            //
            const fonctionMatch =
                expression.match(
                    /^convMoisChiffre\((.+)\)$/i
                );

            if (fonctionMatch) {

                const regex =
                    new RegExp(
                        fonctionMatch[1],
                        "i"
                    );

                const match =
                    texte.match(regex);

                value =
                    match?.[1] ||
                    match?.[0] ||
                    "";

                value =
                    convertMonthToNumber(value);

            } else {

                const match =
                    texte.match(
                        new RegExp(
                            expression,
                            "i"
                        )
                    );

                value =
                    match?.[1] ||
                    match?.[0] ||
                    "";
            }

            variables[name] = value;

            if (value) {

                matchedRules.push({
                    nom:
                        `🧩 Variable OCR ${name} = ${value}`,
                    regex: expression
                });

                console.log(
                    `🧩 Variable OCR ${name} = ${value}`
                );
            }

        } catch (err) {

            console.error(
                `❌ Variable OCR ${name}`,
                err.message
            );
        }
    }

    //
    // PASS 2
    // Variables calculées
    //
    for (const [name, expression] of Object.entries(
        ocrVariableRules || {}
    )) {

        if (
            !/^year\(/i.test(expression) &&
            !/^month\(/i.test(expression) &&
            !/^day\(/i.test(expression)
        ) {
            continue;
        }

        const value =
            applyVariableTransform(
                "",
                expression,
                variables
            );

        variables[name] = value;

        matchedRules.push({
            nom:
                `🧩 Variable calculée ${name} = ${value}`,
            regex: expression
        });

        console.log(
            `🧩 Variable calculée ${name} = ${value}`
        );
    }

    return variables;
}

function applyVariableTransform(
    value,
    transform,
    variables = {}
) {

    let match;

    match = transform.match(/^year\((.+)\)$/i);
    if (match) {

        const source =
            variables[match[1]] || "";

        return source
            .split(/[\/\-.,]/)[2] || "";
    }

    match = transform.match(/^month\((.+)\)$/i);
    if (match) {

        const source =
            variables[match[1]] || "";

        return source
            .split(/[\/\-.,]/)[1] || "";
    }

    match = transform.match(/^day\((.+)\)$/i);
    if (match) {

        const source =
            variables[match[1]] || "";

        return source
            .split(/[\/\-.,]/)[0] || "";
    }

    match = transform.match(
        /^convMoisChiffre\((.+)\)$/i
    );

    if (match) {

        const regex =
            new RegExp(match[1], "i");

        const m =
            value.match(regex);

        return m
            ? convertMonthToNumber(
                m[1] || m[0]
            )
            : "";
    }

    switch (transform) {

        case "convMoisChiffre":
            return convertMonthToNumber(value);

        default:
            return value;
    }
}

function replaceVariables(
    texte,
    variables = {}
) {

    if (!texte) {
        return texte;
    }

    return texte.replace(
        /\{([^}]+)\}/g,
        (_, key) =>
            variables[key] !== undefined
                ? variables[key]
                : `{${key}}`
    );
}


async function analyseDocument(
    filePath,
    originalName,
    email
) {

    const matchedRules = [];

    const ext =
        path.extname(
            originalName
        ).toLowerCase();

    let text = "";

    if (ext === ".pdf") {

        text = await analysePdf(filePath);

        const texteCorrompu =
            /[\uE000-\uF8FF]/.test(text);

        if (texteCorrompu) {

            console.log(
                "⚠️ PDF avec glyphes privés"
            );

            text = await readCorruptedPdf(
                filePath
            );
            // console.log("extractMontants=" + extractMontants(text));
            // console.log("extractDates=" + extractDates(text));

        }

    } else {


        text =
            await extractTextFromImage(filePath);

    }

    const ocrRulesDate =
        await sheets.getDateOcrRules(email);

    const dates =
        extractDatesWithRules(
            text,
            ocrRulesDate,
            matchedRules
        );

    const date =
        dates?.[0]
            ? convertDate(dates[0])
            : "";



    const ocrVariableRules =
        await sheets.getVariableOcrRules(email);

    const ocrVariables =
        extractVariablesFromRules(
            text,
            {
                ...ocrRulesDate,
                ...ocrVariableRules
            },
            matchedRules
        );



    const fournisseursConvert =
        await sheets.getFournisseursConvert(
            email
        );

    let fournisseur =
        convertFournisseur(
            text,
            fournisseursConvert,
            matchedRules
        );

    if (
        !fournisseur ||
        fournisseur === text
    ) {

        fournisseur =
            extractFournisseur(text);

    }

    //replace with variable from rules
    fournisseur =
        replaceVariables(
            fournisseur,
            ocrVariables
        );

    const ocrRulesMontant =
        await sheets.getMontantOcrRules(email);
    //await sheets.getOCRRules(email);




    const categorie = await detectCategorie(
        fournisseur,
        email,
        matchedRules
    );

    const compte = await detectCompte(
        categorie,
        email
    );



    // const date = dates?.[0];
    const montants = extractMontantsWithRules(
        text,
        ocrRulesMontant,
        matchedRules
    );



    let montant = Number(
        String(montants?.[0] || "0")
            .replace(",", ".")
            .replace(/[^\d.-]/g, "")
    );
    montant = Number(montant).toFixed(2);
    // console.log("montant normalisé =", montant);

    const type = detectDocumentType(text);

    return {

        email,

        text,

        type,
        operationType: type,

        fournisseur,

        categorie,

        compte,

        dates,

        date,

        montants,

        montant,

        ocrVariables,

        ceesv:
            extractCEESVData(text),

        pdf: filePath,

        matchedRules

    };
}

//Fonction générique
function extractDateByRule(
    texte,
    regex
) {

    if (!texte || !regex) {
        return null;
    }

    try {

        const match =
            texte.match(
                new RegExp(
                    regex,
                    "i"
                )
            );

        if (!match?.[1]) {
            return null;
        }

        const date =
            convertDate(
                match[1]
            );

        console.log(
            "📅 Date trouvée par règle :",
            regex,
            "=>",
            date
        );

        matchedRules.push({
            nom: "📅 Date trouvée par règle OCR ",
            regex: regex.toString()
        });

        return date;

    }
    catch (err) {

        console.error(
            "❌ Regex Date invalide :",
            regex,
            err.message
        );

        return null;
    }

}
//Parcours des règles
function extractDateFromRules(
    texte,
    ocrRules
) {

    for (const [type, regex] of Object.entries(
        ocrRules || {}
    )) {

        if (!type.endsWith("_DATE")) {
            continue;
        }

        const date =
            extractDateByRule(
                texte,
                regex
            );

        if (date) {

            console.log(
                "✅ Règle date utilisée :",
                type
            );

            return date;
        }

    }

    return null;

}

//Fallback OCR standard
function extractDatesWithRules(
    texte,
    ocrRules,
    matchedRules = []
) {

    const dateRule =
        extractDateFromRules(
            texte,
            ocrRules
        );

    if (dateRule) {
        return [dateRule];
    }

    return extractDates(
        texte,
        matchedRules
    );

}



module.exports = {
    analysePdf,
    extractMontants,
    extractMontantByRule,
    extractMontantFromRules,
    extractMontantsWithRules,
    extractDates,
    extractDateByRule,
    extractDateFromRules,
    extractDatesWithRules,
    extractFournisseur,
    extractDateValeur,
    detectDocumentType,
    extractCEESVData,
    extractDateValeurCEESVUBS,
    isEtatCEESV,
    isUBSCEESV,
    detectCategorie,
    detectCompte,
    convertFournisseur,
    readCorruptedPdf,
    analyseDocument,
    convertDate
};