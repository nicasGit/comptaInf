//depense.js
let currentCEESV = null;
let ceesvFiles = [];
let duplicateAction = null;
let duplicateRow = null;

function openDepense() {

    document.getElementById("modalDepense")
        .classList.remove("ocr-loading");

    document.getElementById(
        "modalDepense"
    ).style.display = "flex";


    // Réinitialisation formulaire
    document.getElementById("depDate").value = "";
    //new Date();

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

    const montantGroup =
        document.getElementById("montantGroup");

    const ceesvInfo =
        document.getElementById("ceesvInfo");

    const commentaireGroup =
        document.getElementById("commentaireGroup");

    const operationTypeGroup =
        document.getElementById("operationTypeGroup");

    commentaireGroup.style.display = "block";
    montantGroup.style.display = "block";
    operationTypeGroup.style.display = "block";
    ceesvInfo.style.display = "none";


}

async function closeDepense() {

    await fetch("/api/shared-file-clear", {
        method: "POST"
    });

    resetDepense();
    document.getElementById("modalDepense")
        .classList.remove("ocr-loading");
    document.getElementById('modalDepense').style.display = 'none';
    // Date du jour uniquement pour une saisie manuelle
    document.getElementById("depDate").valueAsDate = new Date();

    const montantGroup =
        document.getElementById("montantGroup");

    const ceesvInfo =
        document.getElementById("ceesvInfo");

    const commentaireGroup =
        document.getElementById("commentaireGroup");

    const operationTypeGroup =
        document.getElementById("operationTypeGroup");

    commentaireGroup.style.display = "block";
    montantGroup.style.display = "block";
    operationTypeGroup.style.display = "block";
    ceesvInfo.style.display = "none";

}

function showSavingOverlay(message) {

    document.getElementById(
        "loadingOverlayText"
    ).textContent = message;

    document.getElementById(
        "loadingOverlay"
    ).style.display = "flex";
}

function hideSavingOverlay() {

    document.getElementById(
        "loadingOverlay"
    ).style.display = "none";
}


async function saveOperation() {
    try {
        if (
            duplicateAction === "replace" &&
            duplicateRow
        ) {

            await deleteRow(
                duplicateRow
            );

        }
        showSavingOverlay(
            "📤 Envoi du justificatif..."
        );
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
        showSavingOverlay(
            "💾 Enregistrement des données en cours..."
        );
        await saveNormalDepense(depense);


        duplicateAction = null;
        duplicateRow = null;

    }
    catch (err) {

        console.error(err);

        showToast(
            err.message,
            "error"
        );

    }
    finally {


        hideSavingOverlay();

    }
}




function getCategorieSelectionnee() {

    const select =
        document.getElementById(
            "depCategorie"
        );

    if (select.value === "__new__") {

        return document
            .getElementById(
                "depNouvelleCategorie"
            )
            .value
            .trim();
    }

    return select.value;
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

    const fournisseur =
        document.getElementById(
            "depFournisseur"
        ).value.trim();

    const categorie =
        getCategorieSelectionnee();

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


async function showFile(file, analyseExistante = null) {

    console.log("SHOWFILE", {
        analyseExistante: !!analyseExistante,
        name: file?.name,
        type: file?.type,
        size: file?.size
    });

    console.trace();

    const selectedFile =
        document.getElementById("selectedFile");

    selectedFile.style.display = "block";
    selectedFile.innerHTML = "⏳ Analyse du document...";

    document.getElementById("modalDepense").classList.add("ocr-loading");

    // Aperçu immédiat
    showPreview(file);


    console.log("Type =", file.type);
    console.log("Nom =", file.name);

    try {

        let result;

        if (analyseExistante) {

            result = analyseExistante;

        } else {

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

            result =
                await response.json();

        }

        currentCEESV =
            result.ceesv || null;

        await enrichCEESV();

        openOperationWithData(
            result,
            false
        );


        // Vérification doublon après OCR
        await checkDuplicateAfterOCR(result);


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
    finally {
        document.getElementById("modalDepense")
            .classList.remove("ocr-loading");

    }
}


async function openDuplicateModal(duplicateResult) {


    const action =
        await showDuplicateModal(
            duplicateResult
        );

    duplicateAction = action;
    duplicateRow = duplicateResult.row;

    console.log("duplicateAction =", duplicateAction);

    switch (action) {

        case "cancel":
            closeDepense();
            return;

        case "insert":
            break;

        case "replace":
            // action au moment du enregistrement 
            break;

    }

}


async function checkDuplicateAfterOCR(result) {


    //
    const depenseOCR = {
        date: document.getElementById("depDate").value,
        fournisseur: document.getElementById("depFournisseur").value.trim(),
        montant: parseFloat(document.getElementById("depMontant").value)
    };


    //
    // Vérification doublon après OCR
    //
    if (
        result.fournisseur &&
        result.dates?.length > 0 &&
        result.montants?.length > 0
    ) {

        const duplicateResult =
            await checkDuplicate({
                date: convertDate(result.dates[0]),
                fournisseur: normalizeFournisseur(result.fournisseur),
                categorie: result.categorie,
                compte: result.compte,
                montant: result.montants[0]
            });

        if (duplicateResult.duplicate) {
            openDuplicateModal(duplicateResult);
            /*
             
              const action =
                  await showDuplicateModal(
                      duplicateResult
                  );
            
              duplicateAction = action;
              duplicateRow = duplicateResult.row;
            
              console.log("duplicateAction =", duplicateAction);
            
              switch (action) {
            
                  case "cancel":
                      closeDepense();
                      return;
            
                  case "insert":
                      break;
            
                  case "replace":
                      // action au moment du enregistrement 
                      break;
            
              }
            */
        }
    }

}

function applyOperationType(data) {
    const operationType =
        document.getElementById(
            "operationType"
        );

    operationType.value =
        data.type === "RECETTE"
            ? "RECETTE"
            : "DEPENSE";

    operationType.dispatchEvent(
        new Event("change")
    );

}
function applyFournisseur(data) {
    if (data.fournisseur) {

        const fournisseurInput =
            document.getElementById(
                "depFournisseur"
            );

        fournisseurInput.value =
            data.fournisseur;

        // Déclenche exactement le même traitement
        // que lors d'une saisie manuelle
        fournisseurInput.dispatchEvent(
            new Event("input", {
                bubbles: true
            })
        );
    }

    if (data.categorie) {

        const select =
            document.getElementById("depCategorie");

        select.value = data.categorie;

        select.dispatchEvent(
            new Event("change")
        );
    }
}
function applyMontants(data,
    contexte) {

    const montantInput =
        document.getElementById("depMontant");

    const montantContainer =
        document.getElementById("ocrMontants");

    montantContainer.innerHTML = "";



    if (contexte.affOcrMontant &&
        Array.isArray(data.montants) &&
        data.montants.length > 0
    ) {

        // Premier montant par défaut
        montantInput.value =
            data.montants[0].toFixed(2);

        data.montants.forEach((m, index) => {

            const chip =
                document.createElement("div");

            chip.className = "ocr-chip";

            if (index === 0) {
                chip.classList.add("active");
            }

            chip.textContent =
                Number(m).toFixed(2) +
                " CHF";

            chip.onclick = () => {

                montantContainer
                    .querySelectorAll(".ocr-chip")
                    .forEach(c =>
                        c.classList.remove("active")
                    );

                chip.classList.add("active");

                montantInput.value = m.toFixed(2);
            };

            montantContainer.appendChild(chip);
        });

    }
    else if (data.montant) {

        // Fallback si le serveur ne renvoie
        // qu'un seul montant
        montantInput.value =
            Number(data.montant)
                .toFixed(2);
    }
}
function applyDates(data,
    contexte) {


    const dateInput =
        document.getElementById("depDate");

    const dateContainer =
        document.getElementById("ocrDates");

    dateContainer.innerHTML = "";

    if (contexte.affOcrDate &&
        Array.isArray(data.dates) &&
        data.dates.length > 0
    ) {

        // Première date par défaut
        dateInput.value =
            convertDate(
                data.dates[0]
            );

        data.dates.forEach((date, index) => {

            const chip =
                document.createElement("div");

            chip.className = "ocr-chip";

            if (index === 0) {
                chip.classList.add("active");
            }

            chip.textContent =
                "📅 " + date;

            chip.onclick = () => {

                dateContainer
                    .querySelectorAll(".ocr-chip")
                    .forEach(c =>
                        c.classList.remove("active")
                    );

                chip.classList.add("active");

                dateInput.value =
                    convertDate(date);
            };

            dateContainer.appendChild(chip);
        });

    }
    else if (data.date) {

        // Fallback si le serveur ne renvoie
        // qu'une seule date
        dateInput.value =
            convertDate(
                data.date
            );
    }
}

function applyCEESV(data,
    contexte) {

    const montantGroup =
        document.getElementById("montantGroup");

    const ceesvInfo =
        document.getElementById("ceesvInfo");

    const commentaireGroup =
        document.getElementById("commentaireGroup");

    const operationTypeGroup =
        document.getElementById("operationTypeGroup");

    commentaireGroup.style.display = "block";
    montantGroup.style.display = "block";
    operationTypeGroup.style.display = "block";
    ceesvInfo.style.display = "none";

    if (contexte.isCEESV) {

        operationTypeGroup.style.display = "none";

        document.getElementById(
            "operationTitle"
        ).innerHTML = "🧾 Nouvelle opération CEESV"

        if (contexte.isUBS) {
            document.getElementById(
                "operationTitle"
            ).innerHTML = "🧾 Reçu UBS pour CEESV"

        }

        console.log(
            "CEESV détecté",
            data.ceesv
        );


    }

    if (data.ceesv && Object.keys(data.ceesv).length > 0) {

        montantGroup.style.display = "none";

        ceesvInfo.style.display = "block";

        document.getElementById(
            "depDate"
        ).value =
            convertDate(
                data.ceesv.dateValeur
            );



        if (data.ceesv.type === "CEESV_UBS") {

            commentaireGroup.style.display = "none";

            document.getElementById("depMontant").value =
                data.ceesv.montantBanque.toFixed(2);

            const match =
                data.ceesv.match || {};

            document.getElementById(
                "ceesvInfo"
            ).innerHTML = `
      <div class="ceesv-box">
      
          <div>
              🧾 Montant reçu :
              <strong>
                  ${Number(data.ceesv.montantBanque).toFixed(2)} CHF
              </strong>
          </div>
      
          ${match.trouve
                    ? `
                  <div>
                      ✅ Ligne trouvée :
                      <strong>${match.ligne} - ${match.fournisseur}</strong>
                  </div>
              `
                    : `
                  <div style="color:orange">
                      Aucune ligne CEESV trouvée
                  </div>
              `
                }
              
      </div>
  `;

            if (match.pdfBanque) {

                // console.log("match.pdfBanque " + match.pdfBanque);

                openDuplicateModal(match);

            }




        }
        else {

            document.getElementById(
                "ceesvInfo"
            ).innerHTML = `
      <div class="ceesv-box">
          <div>
              🧾 Facturé :
              <strong>
                  ${Number(data.ceesv.montantFacture).toFixed(2)} CHF
              </strong>
              ${data.ceesv.matchFacture?.trouve
                    ? ' <span style="color:#28a745;font-weight:bold;">✅ UBS trouvé</span>'
                    : ' <span style="color:#f39c12;font-weight:bold;">⏳ UBS en attente</span>'
                }
          </div>
      
          <div>
              🏛 Etat :
              <strong>
                  ${Number(data.ceesv.montantEtat).toFixed(2)} CHF
              </strong>
                  ${data.ceesv.matchEtat?.trouve
                    ? ' <span style="color:#28a745;font-weight:bold;">✅ UBS trouvé</span>'
                    : ' <span style="color:#f39c12;font-weight:bold;">⏳ UBS en attente</span>'
                }

          </div>
      
          <div>
              📋 Factures :
              <strong>
                  ${data.ceesv.nbFactures}
              </strong>
          </div>
      
      </div>
  `;
        }


    }
}

function analyseOCRContext(data) {

    const fournisseur =
        (data.fournisseur || "")
            .toLowerCase();

    return {

        affOcrDate:
            !fournisseur.includes(
                "centrale d'encaissement"
            ),

        affOcrMontant:
            !fournisseur.includes(
                "centrale d'encaissement"
            ),

        isCEESV:
            fournisseur.includes(
                "centrale d'encaissement"
            ),

        isUBS:
            fournisseur.includes(
                "ubs"
            )

    };
}

function openOperationWithData(data, ouvrirModal = true) {

    if (ouvrirModal) {
        openDepense();
    }

    const contexte = analyseOCRContext(data);

    applyOperationType(data);
    applyFournisseur(data);
    applyMontants(data, contexte);
    applyDates(data, contexte);
    applyCEESV(data, contexte);
}




function detectCategorieFromFournisseur(fournisseur) {

    if (!fournisseur) {
        return "";
    }

    const normaliser = texte =>
        texte
            .toLowerCase()
            .trim()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");

    const nomOCR = normaliser(fournisseur);

    // IMPORTANT : après trim, plus rien ?
    if (!nomOCR) {
        return "";
    }

    const fournisseurs =
        Object.keys(comptaFournisseurs);

    // Correspondance exacte
    let correspondance =
        fournisseurs.find(f =>
            normaliser(f) === nomOCR
        );

    // Correspondance partielle
    if (!correspondance) {

        correspondance =
            fournisseurs.find(f => {

                const nomReference =
                    normaliser(f);

                if (!nomReference) {
                    return false;
                }

                return (
                    nomOCR.includes(nomReference) ||
                    nomReference.includes(nomOCR)
                );

            });
    }

    if (!correspondance) {
        console.log(
            "⚠️ Aucun fournisseur reconnu :",
            fournisseur
        );

        return {
            categorie: "",
            fournisseurTrouve: "",
            exact: false
        };
    }

    console.log(
        "✅ Fournisseur reconnu :",
        fournisseur,
        "→",
        correspondance
    );

    return {
        categorie:
            comptaFournisseurs[correspondance]
                ?.categorie || "",

        compte:
            comptaCategories[
                comptaFournisseurs[correspondance]
                    ?.categorie
            ]?.compte || "",

        fournisseurTrouve:
            correspondance,

        exact:
            normaliser(correspondance) === nomOCR
    };
}
function updateCategorieFromFournisseur() {

    const fournisseur =
        document.getElementById(
            "depFournisseur"
        ).value.trim();

    const resultat =
        detectCategorieFromFournisseur(
            fournisseur
        );

    const categorie =
        resultat.categorie;

    const select =
        document.getElementById(
            "depCategorie"
        );

    const compte =
        document.getElementById(
            "depCompte"
        );

    const memoriser =
        document.getElementById(
            "memoriserFournisseur"
        );

    const checkbox =
        document.getElementById(
            "saveFournisseur"
        );


    if (categorie) {

        select.value = categorie;

        compte.value =
            comptaCategories[categorie]
                ?.compte || "";

        select.dispatchEvent(
            new Event("change")
        );

        //
        // On cache uniquement
        // si la correspondance est exacte
        //
        if (resultat.exact) {

            memoriser.style.display = "none";
            checkbox.checked = false;

        }
        else {

            memoriser.style.display = "block";

        }

    }
    else {

        // Fournisseur inconnu
        select.value = "";
        compte.value = "";

        if (fournisseur.length >= 2) {

            memoriser.style.display = "block";

        }
        else {

            memoriser.style.display = "none";
            checkbox.checked = false;

        }
    }
}


async function handleCEESV(depense) {


    if (
        depense.fournisseur !==
        "CEESV - Centrale d'Encaissement"
        ||
        !currentCEESV
    ) {
        return false;
    }

    const compteCEESV =
        comptaCategories?.CEESV?.compte || "";

    const ligneFacture = {

        ...depense,

        fournisseur:
            "CEESV - Facture",

        categorie: "CEESV",
        compte: compteCEESV,

        montant:
            currentCEESV.montantFacture,

        justifBanque:
            currentCEESV
                .matchFacture
                ?.pdfUrl || ""

    };

    const ligneEtat = {

        ...depense,

        fournisseur:
            "CEESV - Etat",

        categorie: "CEESV",
        compte: compteCEESV,

        montant:
            currentCEESV.montantEtat,

        justifBanque:
            currentCEESV
                .matchEtat
                ?.pdfUrl || ""

    };

    await addDepense(
        ligneFacture
    );

    await addDepense(
        ligneEtat
    );

    if (
        currentCEESV
            .matchFacture
            ?.trouve
    ) {

        await deleteRow(
            currentCEESV
                .matchFacture
                .ligne
        );
    }

    if (
        currentCEESV
            .matchEtat
            ?.trouve
    ) {

        await deleteRow(
            currentCEESV
                .matchEtat
                .ligne
        );
    }

    showToast(
        "✅ CEESV enregistré",
        "success"
    );

    await refreshAfterSave();

    return true;
}

async function enrichCEESV() {

    if (!currentCEESV) {
        return;
    }
    if (currentCEESV.type === "CEESV_UBS") {

        const matchResponse =
            await fetch(
                "/findUBSMatch",
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

    }

    if (currentCEESV.type !== "CEESV_UBS") {

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

    }
}


async function handleUBS(driveUrl) {

    if (
        !currentCEESV ||
        currentCEESV.type !== "CEESV_UBS" ||
        !currentCEESV.match?.trouve
    ) {
        return false;
    }

    await fetch(
        "/updateCEESVUBS",
        {
            method: "POST",

            headers: {
                "Content-Type":
                    "application/json"
            },

            body: JSON.stringify({

                ligne:
                    currentCEESV
                        .match
                        .ligne,

                pdfUrl:
                    driveUrl

            })
        }
    );

    showToast(
        "✅ Justificatif UBS lié",
        "success"
    );

    await refreshAfterSave();

    return true;
}
async function saveNormalDepense(depense) {

    await memoriserFournisseur(
        depense
    );

    await saveCategorie(
        depense
    );



    const response =
        await fetch(
            "/addDepense",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify(
                        depense
                    )
            }
        );

    const result =
        await response.text();

    showToast(
        result,
        "success"
    );

    await refreshAfterSave();
}


async function checkDuplicate(depense) {

    const response =
        await fetch(
            "/api/checkDuplicate",
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/json"
                },
                body: JSON.stringify({
                    date: depense.date,
                    fournisseur: depense.fournisseur,
                    categorie: depense.categorie,
                    montant: depense.montant
                })
            }
        );

    return response.json();

}

async function addDepense(depense) {

    return fetch(
        "/addDepense",
        {
            method: "POST",

            headers: {
                "Content-Type":
                    "application/json"
            },

            body:
                JSON.stringify(
                    depense
                )
        }
    );

}
async function deleteRow(row) {

    return fetch(
        "/deleteRow",
        {
            method: "POST",

            headers: {
                "Content-Type":
                    "application/json"
            },

            body:
                JSON.stringify({
                    row
                })
        }
    );
}




async function refreshAfterSave() {

    console.log("refreshAfterSave");

    duplicateAction = null;
    duplicateRow = null;


    await loadDepenses();
    await refreshStats();
    await loadCategories();
    await loadFournisseurs();
    await refreshStandby();

    closeDepense();
    if (currentDriveFileId) {

        await fetch(
            "/api/drive/archive",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({

                    fileId:
                        currentDriveFileId

                })
            }
        );

        currentDriveFileId = null;
    }
    currentFile = null;

    processNextFile();
}




function resetDepense() {

    //
    // CHAMPS
    //
    document.getElementById("depDate").value = "";
    document.getElementById("depFournisseur").value = "";
    document.getElementById("depCategorie").value = "";
    document.getElementById("depCompte").value = "";
    document.getElementById("depMontant").value = "";
    document.getElementById("depComment").value = "";

    currentFile = null;

    //
    // NOUVELLE CATEGORIE
    //
    const nouvelleCategorie =
        document.getElementById("depNouvelleCategorie");

    if (nouvelleCategorie) {
        nouvelleCategorie.value = "";
        nouvelleCategorie.style.display = "none";
    }

    const memoriserCategorie =
        document.getElementById("memoriserCategorie");

    if (memoriserCategorie) {
        memoriserCategorie.style.display = "none";
    }

    const saveCategorie =
        document.getElementById("saveCategorie");

    if (saveCategorie) {
        saveCategorie.checked = true;
    }

    //
    // FOURNISSEUR A MEMORISER
    //
    const memoriserFournisseur =
        document.getElementById("memoriserFournisseur");

    if (memoriserFournisseur) {
        memoriserFournisseur.style.display = "none";
    }

    const saveFournisseur =
        document.getElementById("saveFournisseur");

    if (saveFournisseur) {
        saveFournisseur.checked = false;
    }

    //
    // SUGGESTIONS OCR
    //
    document.getElementById("ocrDates").innerHTML = "";
    document.getElementById("ocrMontants").innerHTML = "";

    //
    // FICHIER
    //
    document.getElementById("pdfFile").value = "";

    document.getElementById(
        "selectedFile"
    ).style.display = "none";

    document.getElementById(
        "dropzoneDepense"
    ).style.display = "flex";

    //
    // APERCU
    //
    const pdf =
        document.getElementById("pdfPreview");

    const img =
        document.getElementById("imagePreview");

    const empty =
        document.getElementById("previewEmpty");

    pdf.src = "";
    pdf.style.display = "none";

    img.src = "";
    img.style.display = "none";

    empty.style.display = "flex";
}




function importAutoCEESV() {

    document.getElementById(
        "modalImportCEESV"
    ).style.display = "flex";

}


function closeImportCEESV() {

    document.getElementById(
        "modalImportCEESV"
    ).style.display = "none";

}


async function startImportCEESV() {

    if (ceesvFiles.length === 0) {

        showToast(
            "📂 Aucun PDF sélectionné",
            "error"
        );

        return;

    }

    showLoader();

    try {

        const formData =
            new FormData();

        ceesvFiles.forEach(file => {

            formData.append(
                "files",
                file
            );

        });

        const response =
            await fetch(
                "/api/import-auto-ceesv",
                {
                    method: "POST",
                    body: formData
                }
            );

        if (!response.ok) {

            throw new Error(
                `Erreur HTTP ${response.status}`
            );

        }

        const result =
            await response.json();

        console.log(
            "Résultat import :",
            result
        );

        let details = "";

        if (
            result.erreurs &&
            result.erreurs.length
        ) {

            details =
                "<br><br><strong>Erreurs :</strong><br>" +
                result.erreurs
                    .map(
                        e =>
                            `📄 ${e.fichier}`
                    )
                    .join("<br>");

        }

        showToast(
            `
  ✅ ${result.ceesvImportes || 0} CEESV détectés<br>
  ✅ ${result.ubsRattaches || 0} UBS détectés<br>
  ✅ ${result.ubsStandby || 0} UBS en attente<br>
  ⚠️ ${(result.erreurs || []).length} erreur(s)
  ${details}
  `,
            "success"
        );

        ceesvFiles = [];

        refreshFilesList();

        closeImportCEESV();

        await loadDepenses();
        await refreshStats();

    }
    catch (err) {

        console.error(
            "Erreur import :",
            err
        );

        showToast(
            `❌ ${err.message}`,
            "error"
        );

    }
    finally {

        hideLoader();

    }

}






function showPreview(file) {
    document.getElementById("dropzoneDepense").style.display = "none";

    const selectedFile = document.getElementById("selectedFile");
    selectedFile.style.display = "block";
    selectedFile.textContent = `✅ ${file.name}`;

    const pdf = document.getElementById("pdfPreview");
    const img = document.getElementById("imagePreview");
    const empty = document.getElementById("previewEmpty");

    pdf.style.display = "none";
    img.style.display = "none";
    empty.style.display = "none";

    clearPdfPreview();

    if (
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf")
    ) {
        renderPdfPreview(file);
    } else {
        img.src = URL.createObjectURL(file);
        img.style.display = "block";
    }
}




function replaceFile() {

    //
    // RESET FORMULAIRE
    //

    document.getElementById("depDate").value = "";

    document.getElementById("depFournisseur").value = "";

    document.getElementById("depCategorie").value = "";

    document.getElementById("depCompte").value = "";

    document.getElementById("depMontant").value = "";

    document.getElementById("operationTitle").innerHTML = "🧾 Nouvelle opération"
    //
    // RESET SUGGESTIONS OCR
    //

    document.getElementById("ocrDates").innerHTML = "";

    document.getElementById("ocrMontants").innerHTML = "";


    //
    // RESET FICHIER
    //

    document.getElementById("pdfFile").value = "";

    document.getElementById(
        "selectedFile"
    ).style.display = "none";

    document.getElementById(
        "selectedFile"
    ).innerHTML = "";

    document.getElementById(
        "dropzoneDepense"
    ).style.display = "flex";


    //
    // RESET APERCU
    //
    currentFile = null;
    currentCEESV = null;

    const pdf =
        document.getElementById("pdfPreview");

    const img =
        document.getElementById("imagePreview");

    const empty =
        document.getElementById("previewEmpty");

    pdf.src = "";
    pdf.style.display = "none";

    img.src = "";
    img.style.display = "none";

    empty.style.display = "flex";


    //
    // OPTIONNEL :
    // remettre la date du jour
    //
    document.getElementById(
        "depDate"
    ).valueAsDate = new Date();

    document.getElementById(
        "saveFournisseur"
    ).checked = false;

    document.getElementById(
        "memoriserFournisseur"
    ).style.display = "none";


    const montantGroup =
        document.getElementById(
            "montantGroup"
        );
    montantGroup.style.display = "block";

    const ceesvInfo =
        document.getElementById(
            "ceesvInfo"
        );
    ceesvInfo.style.display = "none";

}



async function uploadCurrentFile() {

    if (!currentFile) {
        return "";
    }

    const settingsResponse =
        await fetch("/settings");

    const settings =
        await settingsResponse.json();

    const exercice =
        settings.Exercice;

    const anneeDepense =
        new Date(
            document.getElementById(
                "depDate"
            ).value
        ).getFullYear();

    if (String(anneeDepense) !== String(exercice)) {

        throw new Error(
            `La dépense ${anneeDepense} doit appartenir à l'exercice ${exercice}`
        );

    }

    const fournisseur =
        document.getElementById(
            "depFournisseur"
        ).value
            .trim()
            .replace(/[<>:"/\\|?*]/g, "")
            .replace(/\s+/g, "_");

    const date =
        document.getElementById(
            "depDate"
        ).value;

    const montant =
        Number(
            document.getElementById(
                "depMontant"
            ).value
        )
            .toFixed(2)
            .replace(".", "_");

    const today = new Date().toISOString().split("T")[0];

    // Nom d'origine
    let originalName = currentFile?.name;

    // Cas Android Share : pas de nom
    if (!originalName || originalName === "undefined") {

        // Détection extension
        let extension = "pdf";

        if (currentFile?.type) {

            if (currentFile.type.includes("image")) {
                extension = "jpg";
            }

            if (currentFile.type.includes("pdf")) {
                extension = "pdf";
            }
        }

        originalName = `partage_${today}.${extension}`;
    }

    const fileName =
        `${fournisseur}_${date}_${montant}_${originalName}`;

    console.log("Nom reçu :", currentFile?.name);
    console.log("Type reçu :", currentFile?.type);

    const formData =
        new FormData();

    formData.append(
        "fileName",
        fileName
    );

    formData.append(
        "pdf",
        currentFile
    );

    const response =
        await fetch(
            "/upload",
            {
                method: "POST",
                body: formData
            }
        );

    const result =
        await response.json();

    return result.driveUrl || "";
}

async function saveCategorie(depense) {

    if (!depense.categorie) {
        return;
    }

    await fetch(
        "/api/categories",
        {

            method: "POST",

            headers: {
                "Content-Type":
                    "application/json"
            },

            body: JSON.stringify({

                categorie:
                    depense.categorie,

                compte:
                    depense.compte || ""

            })

        }
    );

}


async function memoriserFournisseur(depense) {

    const saveFournisseur =
        document.getElementById(
            "saveFournisseur"
        );

    if (
        !saveFournisseur.checked ||
        !depense.fournisseur ||
        !depense.categorie
    ) {
        console.log(
            "Fournisseur non mémorisé",
            {
                checked: saveFournisseur.checked,
                fournisseur: depense.fournisseur,
                categorie: depense.categorie
            }
        );
        return;
    }

    const response =
        await fetch(
            "/api/fournisseurs",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({

                    fournisseur:
                        depense.fournisseur,

                    categorie:
                        depense.categorie

                })
            }
        );

    const result =
        await response.json();


    console.log("MEMORISATION LA");
    if (result.success) {

        console.log(
            "🧠 Fournisseur mémorisé"
        );

        comptaFournisseurs[
            depense.fournisseur
        ] = {
            categorie:
                depense.categorie
        };
    }
}



function updateMemorisationFournisseur() {

    const fournisseur =
        document.getElementById(
            "depFournisseur"
        ).value.trim();

    const memoriser =
        document.getElementById(
            "memoriserFournisseur"
        );

    const resultat =
        detectCategorieFromFournisseur(
            fournisseur
        );

    // fournisseur déjà connu
    if (resultat.exact) {

        memoriser.style.display = "none";
        return;
    }

    // fournisseur inconnu
    if (fournisseur.length >= 2) {

        memoriser.style.display = "block";

    }
    else {

        memoriser.style.display = "none";

    }
}




function initFournisseurEvents() {
    const fournisseurInput =
        document.getElementById("depFournisseur");

    if (!fournisseurInput) {
        return;
    }

    fournisseurInput.addEventListener(
        "input",
        () => {

            updateCategorieFromFournisseur();

            updateMemorisationFournisseur();

        }
    );
}

function initDropzoneModalDepense() {

    const dz = document.getElementById("dropzoneDepense");
    const inputFile = document.getElementById("pdfFile");


    if (!dz) return;

    dz.addEventListener("click", () => {
        inputFile.click();
    });

    inputFile.addEventListener("change", () => {

        if (inputFile.files.length) {

            currentFile =
                inputFile.files[0];

            showFile(currentFile);

        }

    });

    dz.addEventListener("dragover", (e) => {

        e.preventDefault();

        dz.classList.add("dragover");

    });

    dz.addEventListener("dragleave", () => {

        dz.classList.remove("dragover");

    });

    dz.addEventListener("drop", (e) => {

        e.preventDefault();

        dz.classList.remove("dragover");

        if (!e.dataTransfer.files.length) {
            return;
        }

        currentFile =
            e.dataTransfer.files[0];

        showFile(currentFile);

    });
}


function initOperationType() {

    const operationType =
        document.getElementById(
            "operationType"
        );

    if (!operationType) {
        return;
    }

    operationType.addEventListener(
        "change",
        function () {

            const isRecette =
                this.value === "RECETTE";

            document.getElementById(
                "operationTitle"
            ).innerHTML =
                isRecette
                    ? "💰 Nouvelle recette"
                    : "🧾 Nouvelle dépense";

            document.getElementById(
                "categorieGroup"
            ).style.display =
                isRecette
                    ? "none"
                    : "block";

            document.getElementById(
                "compteGroup"
            ).style.display =
                isRecette
                    ? "none"
                    : "block";

        }
    );
}



async function initSharedAnalyse() {


    req.session.sharedFile

    const sharedAnalyse =
        sessionStorage.getItem(
            "sharedAnalyse"
        );

    if (!sharedAnalyse) {
        return;
    }



    sessionStorage.removeItem(
        "sharedAnalyse"
    );
    sessionStorage.setItem(
        "resumeUpload",
        "0"
    );

    duplicateAction = null;
    duplicateRow = null;

    const result =
        JSON.parse(sharedAnalyse);

    //
    // Récupère le fichier partagé
    //
    const info =
        await (
            await fetch(
                "/api/shared-file"
            )
        ).json();

    const fileResponse =
        await fetch(
            "/api/shared-file-content"
        );

    const blob =
        await fileResponse.blob();

    currentFile =
        new File(
            [blob],
            info.originalname,
            {
                type: info.mimetype
            }
        );

    await showFile(currentFile, result);

    setTimeout(async () => {

        const ocrComplet =
            result.fournisseur &&
            result.categorie &&
            result.dates?.[0] &&
            result.montants?.[0];


        console.log("ocrComplet=" + ocrComplet);

        if (!ocrComplet) {
            return;
        }

        if (duplicateAction === "cancel") {
            closeDepense();
            return;
        }

        if (duplicateAction === "insert") {

            if (result.categorie) {
                document.getElementById("depCategorie").value =
                    result.categorie;
            }
            if (result.compte) {
                document.getElementById("depCompte").value =
                    result.compte;
            }

            console.log("AUTO SAVE", {
                fournisseur:
                    document.getElementById("depFournisseur").value,
                categorie:
                    document.getElementById("depCategorie").value,
                date:
                    document.getElementById("depDate").value,
                montant:
                    document.getElementById("depMontant").value,
                resultCategorie:
                    result.categorie
            });

            await saveOperation();
            closeDepense();
        }



    }, 100);



    await fetch(
        "/api/shared-file-clear",
        {
            method: "POST"
        }
    );

}



async function initDepense() {

    initFournisseurEvents();
    initDropzoneModalDepense();
    initOperationType();
    await initSharedAnalyse();

}

window.addEventListener(
    "DOMContentLoaded",
    initDepense
);
