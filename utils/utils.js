// /utils/utils.js
function convertDate(date) {

    if (!date) {
        return "";
    }

    const mois = {
        jan: "01",
        fév: "02",
        fev: "02",
        mar: "03",
        avr: "04",
        mai: "05",
        jun: "06",
        juil: "07",
        aoû: "08",
        aou: "08",
        sep: "09",
        oct: "10",
        nov: "11",
        déc: "12",
        dec: "12"
    };

    const txt = date
        .toLowerCase()
        .replace(".", "")
        .trim();

    const match = txt.match(
        /^(\d{1,2})\s+([a-zéû]+)\s+(\d{4})$/
    );

    if (match) {

        const jour = match[1].padStart(2, "0");

        const moisNum =
            mois[match[2].substring(0, 3)];

        if (moisNum) {
            return `${match[3]}-${moisNum}-${jour}`;
        }
    }

    // Normalisation finale
    const p = date.replace(/,/g, ".").split(/[./-]/);

    if (p.length === 3) {

        let [a, b, c] = p.map(x => x.trim());

        // déjà yyyy-mm-dd
        if (a.length === 4) {
            return `${a}-${b.padStart(2, "0")}-${c.padStart(2, "0")}`;
        }

        // dd-mm-yyyy
        return `${c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
    }

    return date;
}
function convertDateOLD(date) {

    if (!date) {
        return "";
    }

    const mois = {
        jan: "01",
        fév: "02",
        fev: "02",
        mar: "03",
        avr: "04",
        mai: "05",
        jun: "06",
        juil: "07",
        aoû: "08",
        aou: "08",
        sep: "09",
        oct: "10",
        nov: "11",
        déc: "12",
        dec: "12"
    };

    // 15 oct. 2026
    const txt =
        date.toLowerCase()
            .replace(".", "")
            .trim();

    const match =
        txt.match(
            /^(\d{1,2})\s+([a-zéû]+)\s+(\d{4})$/
        );

    if (match) {

        const jour =
            match[1].padStart(2, "0");

        const moisNum =
            mois[
            match[2].substring(0, 3)
            ];

        if (moisNum) {

            return `${match[3]}-${moisNum}-${jour}`;

        }

    }

    // ancien format
    date = date.replace(/,/g, ".");

    const p =
        date.split(/[./-]/);

    if (p.length === 3) {

        return `${p[2]}-${p[1]}-${p[0]}`;

    }

    return date;
}

function convertDateCEESV(dateStr) {

    if (!dateStr) {
        return "";
    }

    const p = dateStr.split(".");

    return `${p[2]}-${p[1]}-${p[0]}`;
}


async function convertImageToPdf(
    filePath,
    originalName
) {

    const fs = require("fs");
    const sharp = require("sharp");
    const { PDFDocument } = require("pdf-lib");

    const tempImagePath =
        filePath + "_processed.jpg";

    await sharp(filePath)
        .rotate()
        .resize({
            width: 2000,
            withoutEnlargement: true
        })
        .jpeg({
            quality: 85
        })
        .toFile(tempImagePath);

    const imageBytes =
        fs.readFileSync(tempImagePath);

    const pdfDoc =
        await PDFDocument.create();

    let image;

    if (
        originalName
            .toLowerCase()
            .endsWith(".png")
    ) {

        image =
            await pdfDoc.embedPng(
                imageBytes
            );

    }
    else {

        image =
            await pdfDoc.embedJpg(
                imageBytes
            );

    }

    const page =
        pdfDoc.addPage([
            image.width,
            image.height
        ]);

    page.drawImage(image, {
        x: 0,
        y: 0,
        width: image.width,
        height: image.height
    });

    const pdfBytes =
        await pdfDoc.save();

    const pdfPath =
        filePath + ".pdf";

    fs.writeFileSync(
        pdfPath,
        pdfBytes
    );

    fs.unlinkSync(tempImagePath);

    return {
        filePath: pdfPath,
        originalName: originalName.replace(
            /\.(jpg|jpeg|png)$/i,
            ".pdf"
        )
    };

}



function normalizeFournisseur(fournisseur) {

    switch (fournisseur) {

        case "CEESV - Facture":
        case "CEESV - Etat":
            return "CEESV - Centrale d'Encaissement";

        default:
            return fournisseur;
    }

}
/*function convertFournisseur(nom, converts) {

    const key = (nom || "")
        .trim()
        .toLowerCase();

    return converts[key] || key;

}*/


if (typeof module !== "undefined") {
    module.exports = {
        convertDate,
        convertDateCEESV,
        convertImageToPdf,
        normalizeFournisseur
    };
}