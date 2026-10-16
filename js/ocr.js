//ocr,js
const fs = require("fs");
const pdf = require("pdf-parse");
const sheets = require("./sheets");
const { getEnvironment } = require("./config");
const { fromPath } = require("pdf2pic");

const Tesseract = require("tesseract.js");
const sharp = require("sharp");
const path = require("path");

const pdfPoppler = require("pdf-poppler");


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

    await pdfPoppler.convert(pdfPath, {
        format: "png",
        out_dir: outputDir,
        out_prefix: "page",
        page: null,
        scale: 2000
    });


    const files = fs.readdirSync(outputDir)
        .filter(f => f.endsWith(".png"))
        .sort();

    let fullText = "";

    for (const file of files) {

        const pagePath = path.join(
            outputDir,
            file
        );

        console.log(
            "📄 OCR page",
            file
        );

        const text =
            await extractText(pagePath);

        fullText += "\n" + text;

        fs.unlinkSync(pagePath);
    }


    fs.rmSync(outputDir, {
        recursive: true,
        force: true
    });

    return fullText;
}


async function extractText(imagePath,
    email = null) {

    console.log("🖼️ extractText appelé :", imagePath);

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

    console.log(
        "✅ image OCR créée en memoire :",
        processedImage
    );
    const result =
        await Tesseract.recognize(
            buffer,
            "fra"
        );



    // console.log("========== OCR ==========");
    // console.log(JSON.stringify(result.data.text));
    // console.log("=========================");


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

    const buffer =
        fs.readFileSync(filePath);

    const data =
        await pdf(buffer);

    return data.text;
}
function extractMontants(text) {

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
                .replace(",", ".");

            return parseFloat(value);

        })
        .filter(value => !isNaN(value));

    // Supprime les doublons
    return [...new Set(montants)];
}


function extractDates(texte) {

    if (/centrale.*encaissement/i.test(texte)) {

        const dates =
            texte.match(
                /\d{2}\.\d{2}\.\d{4}/g
            );

        return dates || [];

    }

    const matches =
        texte.match(
            /\d{2}[./-]\d{2}[./-]\d{4}/g
        );

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

async function detectCategorie(fournisseur, email) {

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
            return "";
        }

        const categorie = fournisseurs[correspondance]?.categorie || "";

        console.log("🎯 Match Fournisseur/Categorie :", categorie)

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
}

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

        return match[1];

    }

    return "";
}


function extractMontantByRule(
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

        if (!match || !match[1]) {
            return null;
        }

        const montant =
            parseFloat(
                match[1]
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
    ocrRules
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
                regex
            );

        if (montant !== null) {

            console.log(
                "✅ Règle utilisée :",
                type
            );

            return montant;

        }

    }

    return null;

}

function extractMontantsWithRules(
    texte,
    ocrRules
) {

    const montantOCR =
        extractMontantFromRules(
            texte,
            ocrRules
        );

    if (montantOCR !== null) {

        return [montantOCR];

    }

    return extractMontants(
        texte
    );

}


async function analyseDocument(
    filePath,
    originalName,
    email
) {

    const ext =
        path.extname(
            originalName
        ).toLowerCase();

    let text = "";

    if (ext === ".pdf") {

        text =
            await analysePdf(filePath);

        if (/[\uE000-\uF8FF]/.test(text)) {

            text =
                await readCorruptedPdf(
                    filePath
                );

        }

    } else {

        text =
            await extractText(filePath);

    }

    const fournisseursConvert =
        await sheets.getFournisseursConvert(
            email
        );

    let fournisseur =
        convertFournisseur(
            text,
            fournisseursConvert
        );

    if (
        !fournisseur ||
        fournisseur === text
    ) {

        fournisseur =
            extractFournisseur(text);

    }

    const ocrRules =
        await sheets.getOCRRules(email);

    const categorie = await detectCategorie(
        fournisseur,
        email
    );

    return {

        text,

        type:
            detectDocumentType(text),

        fournisseur,

        categorie,

        dates:
            extractDates(text),

        montants:
            extractMontantsWithRules(
                text,
                ocrRules
            ),

        ceesv:
            extractCEESVData(text)

    };
}



module.exports = {
    analysePdf,
    extractText,
    extractMontants,
    extractMontantByRule,
    extractMontantFromRules,
    extractMontantsWithRules,
    extractDates,
    extractFournisseur,
    extractDateValeur,
    detectDocumentType,
    extractCEESVData,
    extractDateValeurCEESVUBS,
    isEtatCEESV,
    isUBSCEESV,
    detectCategorie,
    convertFournisseur,
    readCorruptedPdf,
    analyseDocument
};