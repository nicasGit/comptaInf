//depense.js
function openDepense() {

    document.getElementById(
        "modalDepense"
    ).style.display = "flex";


    // Réinitialisation formulaire
    document.getElementById("depDate").valueAsDate =
        new Date();

    document.getElementById("depFournisseur").value = "";

    document.getElementById("depCategorie").value = "";

    document.getElementById("depCompte").value = "";

    document.getElementById("depMontant").value = "";

    document.getElementById("depComment").value = "";


    // Réinitialisation suggestions OCR
    document.getElementById("ocrDates").innerHTML = "";

    document.getElementById("ocrMontants").innerHTML = "";


    // Réinitialisation fichier
    document.getElementById("pdfFile").value = "";

    document.getElementById(
        "dropzoneDepense"
    ).style.display = "flex";

    document.getElementById(
        "selectedFile"
    ).style.display = "none";


    // Réinitialisation aperçu
    document.getElementById(
        "pdfPreview"
    ).style.display = "none";

    document.getElementById(
        "imagePreview"
    ).style.display = "none";

    document.getElementById(
        "previewEmpty"
    ).style.display = "flex";
}

function closeDepense() {
    resetDepense();
    document.getElementById('modalDepense').style.display = 'none';
    // Date du jour uniquement pour une saisie manuelle
    document.getElementById("depDate").valueAsDate = new Date();


}



async function saveOperation() {

    showLoader();

    try {

        const driveUrl =
            await uploadCurrentFile();

        const depense =
            buildDepense(driveUrl);

        if (await handleCEESV(depense)) {
            return;
        }

        if (await handleUBS(driveUrl)) {
            return;
        }

        await saveNormalDepense(depense);

    }
    catch (err) {

        console.error(err);

        showToast(
            err.message,
            "error"
        );

    }
    finally {

        hideLoader();

    }
}

function buildDepense(driveUrl) {

    const erreurs = [];

    const isCEESV =
        currentCEESV &&
        currentCEESV.type !== "CEESV_UBS";

    let montant =
        parseFloat(
            document.getElementById(
                "depMontant"
            ).value
        );

    const operationType =
        document.getElementById(
            "operationType"
        ).value;

    const categorie =
        getCategorieSelectionnee();

    const fournisseur =
        document.getElementById(
            "depFournisseur"
        ).value.trim();

    const date =
        document.getElementById(
            "depDate"
        ).value;

    if (!date) {
        erreurs.push(
            "📅 Date obligatoire"
        );
    }

    if (!fournisseur) {
        erreurs.push(
            "🏢 Fournisseur obligatoire"
        );
    }

    if (!isCEESV && isNaN(montant)) {
        erreurs.push(
            "💰 Montant obligatoire"
        );
    }

    if (
        operationType === "DEPENSE" &&
        !categorie
    ) {
        erreurs.push(
            "📂 Catégorie obligatoire"
        );
    }

    if (erreurs.length) {

        throw new Error(
            erreurs.join("<br>")
        );
    }

    // Dépense => négatif
    if (
        operationType === "DEPENSE" &&
        montant > 0
    ) {
        montant = -montant;
    }

    // Recette => positif
    if (
        operationType === "RECETTE" &&
        montant < 0
    ) {
        montant = Math.abs(montant);
    }

    return {

        date,
        fournisseur,
        categorie,

        compte:
            document.getElementById(
                "depCompte"
            ).value,

        montant,

        commentaire:
            document.getElementById(
                "depComment"
            ).value,

        pdf: driveUrl,

        operationType
    };
}


async function showFile(file) {

    const selectedFile =
        document.getElementById("selectedFile");

    selectedFile.style.display = "block";
    selectedFile.innerHTML = "⏳ Analyse du document...";

    // Aperçu immédiat
    showPreview(file);


    console.log("Type =", file.type);
    console.log("Nom =", file.name);

    try {

        const formData = new FormData();

        formData.append("pdf", file);

        const response =
            await fetch("/analyse-document", {
                method: "POST",
                body: formData
            });

        if (!response.ok) {
            throw new Error(
                "Erreur OCR HTTP " + response.status
            );
        }

        const result =
            await response.json();

        currentCEESV =
            result.ceesv || null;
        console.log(
            "currentCEESV =",
            currentCEESV
        );
        if (
            currentCEESV &&
            currentCEESV.type === "CEESV_UBS") {

            const matchResponse =
                await fetch(
                    "/findCEESVMatch",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body: JSON.stringify({
                            ceesv: currentCEESV
                        })
                    }
                );

            currentCEESV.match =
                await matchResponse.json();

            console.log(
                "MATCH CEESV =",
                currentCEESV.match
            );
        }

        if (
            currentCEESV &&
            currentCEESV.type !== "CEESV_UBS"
        ) {
            const matchResponse =
                await fetch(
                    "/findCEESVMatch",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type":
                                "application/json"
                        },
                        body: JSON.stringify({
                            ceesv: currentCEESV
                        })
                    }
                );

            const match =
                await matchResponse.json();

            currentCEESV.matchFacture = {
                trouve: match.matchFacture,
                ligne: match.ligneFacture,
                pdfUrl: match.pdfFacture
            };

            currentCEESV.matchEtat = {
                trouve: match.matchEtat,
                ligne: match.ligneEtat,
                pdfUrl: match.pdfEtat
            };

            console.log(
                "Match CEESV",
                currentCEESV
            );
        }


        console.log("OCR COMPLET :", result);
        console.log("Dates :", result.dates);
        console.log("Montants :", result.montants);
        console.log("ceesv :", currentCEESV);

        /*
         * Très important :
         * false = la modal est déjà ouverte.
         */
        openOperationWithData(result, false);

        document.getElementById(
            "dropzoneDepense"
        ).style.display = "none";

        selectedFile.style.display = "block";

        selectedFile.innerHTML = `
            ✅ ${file.name}
            (${Math.round(file.size / 1024)} Ko)

            <button
                type="button"
                onclick="replaceFile()"
                class="btn-small">
                🔄 Remplacer
            </button>
        `;

    }
    catch (err) {

        console.error("Erreur OCR :", err);

        selectedFile.innerHTML =
            "❌ Analyse OCR impossible";
    }
}

