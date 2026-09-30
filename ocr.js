const fs = require("fs");
const pdf = require("pdf-parse");

const Tesseract = require("tesseract.js");

async function extractText(imagePath) {

    const result =
        await Tesseract.recognize(
            imagePath,
            "fra"
        );

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


function extractDates(texte){

    if (/centrale.*encaissement/i.test(texte)){

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

function extractDateValeurOLD(texte){

    const dates =
        texte.match(
            /\d{2}\.\d{2}\.\d{4}/g
        ) || [];

    return dates.length >= 3
        ? dates[2]
        : dates[0] || null;

}

function extractDateValeur(texte){

    const match =
        texte.match(
            /Date\s*(?:de)?\s*valeur\s*:?\s*(\d{2}\.\d{2}\.\d{4})/i
        );

    return match
        ? match[1]
        : null;
}

function detectDocumentType(texte){

    const normalise =
        texte.toLowerCase();

    if (/centrale.*encaissement/i.test(texte))
	{
        return "RECETTE";
    }

    return "DEPENSE";
}

function extractFournisseur(texte){

	if(/ceesv.*centrale.*encaissement/i.test(texte)){
		return "CEESV - Centrale d'Encaissement";
	}

	if (/centrale.*encaissement/i.test(texte) && /ubs/i.test(texte))
	{
		return "UBS - Centrale d'encaissement";
	}

    const lignes = texte
        .split("\n")
        .map(l => l.trim())
        .filter(l => l.length > 2);

    return lignes[0] || "";
}

function extractDateValeurOLD2(texte){

    const match =
        texte.match(
            /Date de valeur\s*([0-9]{2}\.[0-9]{2}\.[0-9]{4})/i
        );

    return match
        ? match[1]
        : null;
}


function extractMontantEtat(texte){

    const match =
        texte.match(
            /Montant Etat\s*:?\s*CHF\s*([\d\s]+,\d{2})/i
        );

    if(!match){
        return null;
    }

    return parseFloat(
        match[1]
            .replace(/\s/g, "")
            .replace(",", ".")
    );
}

function extractNbFactures(texte){

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


function extractCEESVData(texte){

    const result = {};

    const date =
        texte.match(
            /Date\s*(?:de)?\s*valeur\s*:?\s*(\d{2}\.\d{2}\.\d{4})/i
        );

    if(date){
        result.dateValeur = date[1];
    }

    const reference =
        texte.match(
            /Référence\s*:?\s*(\d+)/i
        );

    if(reference){
        result.reference = reference[1];
    }

    const recap =
        texte.match(
            /Factures\s*(\d+)\s*([\d\s]+,\d{2})\s*([\d\s]+,\d{2})/i
        );

    if(recap){

        result.nbFactures =
            parseInt(recap[1], 10);

        result.montantFacture =
            recap[2]
                .replace(/\s/g, "")
                .replace(",", ".");

        result.montantEtat =
            recap[3]
                .replace(/\s/g, "")
                .replace(",", ".");
    }

    return result;
}

module.exports = {
    analysePdf,
    extractText,
    extractMontants,
    extractDates,
    extractFournisseur,
	extractDateValeur,
	detectDocumentType,
	extractCEESVData
};