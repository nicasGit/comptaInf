//navigation.js
let currentFile = null;
let pendingFiles = [];
let currentCEESV = null;

let comptaFournisseurs = {};
let comptaCategories = {};
let currentDriveFileId = null;


async function loadOperations(type) {

    const response =
        await fetch(
            `/views/operations.html?type=${type}`
        );

    const html =
        await response.text();

    document.getElementById(
        "content"
    ).innerHTML = html;

    await initOperations(type);

}


async function loadDashboard() {

    showLoader();

    try {

        const response =
            await fetch("/views/dashboard.html");

        const html =
            await response.text();

        document.getElementById(
            "content"
        ).innerHTML = html;

        await initDashboard();

    }
    finally {

        hideLoader();

    }

}


function showLoader() {

    document
        .getElementById("pageLoader")
        ?.classList.add("active");

}

function hideLoader() {

    document
        .getElementById("pageLoader")
        ?.classList.remove("active");
}



function showPreview(file) {

    document.getElementById(
        "dropzoneDepense"
    ).style.display = "none";

    const selectedFile =
        document.getElementById(
            "selectedFile"
        );

    selectedFile.style.display = "block";

    selectedFile.innerHTML =
        `✅ ${file.name}
        <button
            type="button"
            onclick="replaceFile()"
            class="btn-small">
            🔄 Remplacer
        </button>`;

    const fileUrl =
        URL.createObjectURL(file);

    const pdf =
        document.getElementById("pdfPreview");

    const img =
        document.getElementById("imagePreview");

    const empty =
        document.getElementById("previewEmpty");

    pdf.style.display = "none";
    img.style.display = "none";
    empty.style.display = "none";

    if (file.type === "application/pdf") {

        pdf.src = fileUrl;
        pdf.style.display = "block";

    }
    else {

        img.src = fileUrl;
        img.style.display = "block";

    }

}
function openOperationWithData(data, ouvrirModal = true) {

    if (ouvrirModal) {
        openDepense();
    }

    //
    // RECETTE / DEPENSE
    //
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

    const montantGroup =
        document.getElementById(
            "montantGroup"
        );
    const ceesvInfo =
        document.getElementById(
            "ceesvInfo"
        );

    const commentaireGroup =
        document.getElementById(
            "commentaireGroup"
        );


    commentaireGroup.style.display = "block";
    montantGroup.style.display = "block";
    operationTypeGroup.style.display = "block";

    ceesvInfo.style.display = "none";

    const montantInput =
        document.getElementById("depMontant");

    const dateInput =
        document.getElementById("depDate");

    const montantContainer =
        document.getElementById("ocrMontants");

    const dateContainer =
        document.getElementById("ocrDates");


    // Nettoyage
    montantContainer.innerHTML = "";
    dateContainer.innerHTML = "";



    //
    // FOURNISSEUR
    //
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

    //
    // TEST CEESV Specifique
    //



    let affOcrDate = true;
    let affOcrMontant = true;
    let isUBS = false;

    if (data.fournisseur.toLowerCase().includes("centrale d'encaissement")) {
        affOcrDate = false;
        affOcrMontant = false;

        operationTypeGroup.style.display = "none";

        document.getElementById(
            "operationTitle"
        ).innerHTML = "🧾 Nouvelle opération CEESV"

        if (data.fournisseur.toLowerCase().includes("ubs")) {
            document.getElementById(
                "operationTitle"
            ).innerHTML = "🧾 Reçu UBS pour CEESV"
            isUBS = true;

        }

        console.log(
            "CEESV détecté",
            data.ceesv
        );


    }



    //
    // MONTANTS
    //

    //console.log(
    //    "Montants reçus :",
    //    data.montants
    //);

    if (affOcrMontant &&
        Array.isArray(data.montants) &&
        data.montants.length > 0
    ) {

        // Premier montant par défaut
        montantInput.value =
            data.montants[0];

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

                montantInput.value = m;
            };

            montantContainer.appendChild(chip);
        });

    }
    else if (data.montant) {

        // Fallback si le serveur ne renvoie
        // qu'un seul montant
        montantInput.value =
            data.montant;
    }


    //
    // CONVERSION DATE
    //

    function convertDate(date) {

        if (!date) {
            return "";
        }

        if (
            date.includes(".") ||
            date.includes("/")
        ) {

            const p =
                date.split(/[./]/);

            if (p.length === 3) {

                return (
                    `${p[2]}-${p[1]}-${p[0]}`
                );

            }
        }

        return date;
    }



    document.getElementById(
        "ceesvInfo"
    ).innerHTML = "";




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
                data.ceesv.montantBanque;

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
                                <strong>${match.fournisseur}</strong>
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

    //
    // DATES
    //
    if (affOcrDate &&
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




const envMode =
    document.getElementById(
        "environmentMode"
    );

if (envMode) {

    envMode.addEventListener(
        "change",
        function () {

            const info =
                document.getElementById(
                    "environmentInfo"
                );

            if (this.value === "DEV") {

                info.innerHTML =
                    "🧪 Mode développement";

            }
            else {

                info.innerHTML =
                    "🚀 Mode production";

            }

        }
    );

}

async function loadExercices() {

    const response =
        await fetch("/api/exercices");

    const exercices =
        await response.json();

    const select =
        document.getElementById(
            "exerciceSelect"
        );

    select.innerHTML = "";

    exercices.forEach(exercice => {

        const option =
            document.createElement(
                "option"
            );

        option.value =
            exercice;

        option.textContent =
            exercice;

        select.appendChild(
            option
        );

    });

    const settingsResponse =
        await fetch("/settings");

    const settings =
        await settingsResponse.json();

    select.value =
        settings.Exercice.toString();
}


async function loadFournisseurs() {

    try {

        const response =
            await fetch("/api/fournisseurs");

        comptaFournisseurs =
            await response.json();

        //console.log(
        //    "Fournisseurs chargés :",
        //    comptaFournisseurs
        //);

        const dataList =
            document.getElementById(
                "fournisseursList"
            );



        if (dataList) {

            dataList.innerHTML = "";

            Object.keys(comptaFournisseurs)
                .sort()
                .forEach(fournisseur => {

                    const option =
                        document.createElement(
                            "option"
                        );

                    option.value =
                        fournisseur;

                    dataList.appendChild(
                        option
                    );

                });

            console.log(
                "Nb options :",
                dataList.options.length
            );
        }



    }
    catch (err) {

        console.error(
            "Erreur chargement fournisseurs :",
            err
        );

    }
}


window.addEventListener(
    "DOMContentLoaded",
    () => {

        const input =
            document.getElementById(
                "depFournisseur"
            );

        const box =
            document.getElementById(
                "fournisseurSuggestions"
            );

        input.addEventListener(
            "input",
            function () {

                const valeur =
                    this.value
                        .toLowerCase()
                        .trim();

                box.innerHTML = "";

                if (valeur.length < 2) {

                    box.style.display =
                        "none";

                    return;
                }

                const matches =
                    Object.keys(
                        comptaFournisseurs
                    )
                        .filter(f =>
                            f.toLowerCase()
                                .includes(valeur)
                        )
                        .slice(0, 10);

                if (matches.length === 0) {

                    box.style.display =
                        "none";

                    return;
                }

                matches.forEach(f => {

                    const item =
                        document.createElement(
                            "div"
                        );

                    item.className =
                        "autocomplete-item";

                    item.textContent =
                        f;

                    item.onclick = () => {

                        input.value = f;

                        box.style.display =
                            "none";

                        updateCategorieFromFournisseur();
                        updateMemorisationFournisseur();

                    };

                    box.appendChild(item);

                });

                box.style.display =
                    "block";
            }
        );

        document.addEventListener(
            "click",
            e => {

                if (
                    !box.contains(e.target)
                    &&
                    e.target !== input
                ) {

                    box.style.display =
                        "none";

                }

            }
        );

    }
);




window.addEventListener("DOMContentLoaded", () => {

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

});
window.addEventListener("DOMContentLoaded", () => {

    const dz = document.getElementById("dropzoneDepense");
    const inputFile = document.getElementById("pdfFile");
    const selectedFile = document.getElementById("selectedFile");

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




});

async function processNextFile() {

    console.log(
        "processNextFile"
    );

    console.log(
        "currentFile =",
        currentFile
    );

    console.log(
        "pendingFiles =",
        pendingFiles.length
    );

    if (currentFile) {
        return;
    }

    if (pendingFiles.length === 0) {
        return;
    }

    currentFile =
        pendingFiles.shift();

    if (currentFile.file) {

        currentDriveFileId =
            currentFile.driveId;

        currentFile =
            currentFile.file;

    }

    console.log(
        "Traitement :",
        currentFile.name
    );

    openDepense();

    await showFile(
        currentFile
    );
}

window.addEventListener("DOMContentLoaded", () => {

    const categorieSelect =
        document.getElementById("depCategorie");

    const nouvelleCategorie =
        document.getElementById("depNouvelleCategorie");

    const compteInput =
        document.getElementById("depCompte");

    const memoriserCategorie =
        document.getElementById("memoriserCategorie");

    if (!categorieSelect || !compteInput) {
        return;
    }

    categorieSelect.addEventListener("change", function () {

        const categorie = this.value;


        //
        // NOUVELLE CATEGORIE
        //
        if (categorie === "__new__") {

            nouvelleCategorie.style.display = "block";

            memoriserCategorie.style.display = "block";

            nouvelleCategorie.value = "";

            compteInput.value = "";

            nouvelleCategorie.focus();

            console.log(
                "➕ Création d'une nouvelle catégorie"
            );

            return;
        }


        //
        // CATEGORIE EXISTANTE
        //

        nouvelleCategorie.style.display = "none";

        memoriserCategorie.style.display = "none";

        const compte =
            comptaCategories[categorie]?.compte || "";

        compteInput.value = compte;

        console.log(
            "Catégorie :",
            categorie,
            "Compte MEGA :",
            compte
        );

        updateMemorisationFournisseur();
    });

});
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
            `La dépense doit appartenir à l'exercice ${exercice}`
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

    const fileName =
        `${fournisseur}_${date}_${montant}_${currentFile.name}`;

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



async function handleCEESV(depense) {


    if (
        depense.fournisseur !==
        "CEESV - Centrale d'Encaissement"
        ||
        !currentCEESV
    ) {
        return false;
    }

    const ligneFacture = {

        ...depense,

        fournisseur:
            "CEESV - Facture",

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

    await loadDepenses();
    await refreshStats();
    await loadCategories();
    await loadFournisseurs();

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

const params =
    new URLSearchParams(window.location.search);

if (params.get("google") === "ok") {

    const badge =
        document.getElementById(
            "googleBadge"
        );

    if (badge) {

        badge.classList.remove(
            "disconnected"
        );

        badge.classList.add(
            "connected"
        );

        badge.innerHTML =
            "🟢 Google connecté";

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





function logoutGoogle() {

    window.location.href =
        "/logout";

}





async function loadCategories() {

    try {

        const response =
            await fetch("/api/categories");

        comptaCategories =
            await response.json();

        const select =
            document.getElementById(
                "depCategorie"
            );

        select.innerHTML = `
            <option value="">
                Sélectionner une catégorie...
            </option>
        `;

        Object.keys(
            comptaCategories
        ).forEach(categorie => {

            const option =
                document.createElement(
                    "option"
                );

            option.value =
                categorie;

            option.textContent =
                categorie;

            select.appendChild(
                option
            );

        });

        // Toujours mettre Nouvelle catégorie en dernier
        const newOption =
            document.createElement("option");

        newOption.value = "__new__";

        newOption.textContent =
            "➕ Nouvelle catégorie...";

        select.appendChild(newOption);

    }
    catch (err) {

        console.error(
            "Erreur catégories :",
            err
        );

    }

}

loadCategories();
loadFournisseurs();



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

function openSettings() {

    fetch("/settings")

        .then(r => r.json())

        .then(async settings => {


            const exerciceResponse =
                await fetch("/api/exercice");

            const exerciceData =
                await exerciceResponse.json();

            document.getElementById(
                "settingExercice"
            ).value = exerciceData.exercice;

            const envResponse =
                await fetch("/api/environment");

            const envData =
                await envResponse.json();

            document.getElementById(
                "environmentMode"
            ).value = envData.environment;

            document.getElementById(
                "modalSettings"
            ).style.display =
                "flex";

        });

}

function closeSettings() {

    document.getElementById(
        "modalSettings"
    ).style.display =
        "none";

}
async function saveSettings() {

    const environment =
        document.getElementById(
            "environmentMode"
        ).value;

    const response =
        await fetch(
            "/api/environment",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    environment
                })
            }
        );

    const result =
        await response.json();

    if (result.success) {

        const badge =
            document.getElementById(
                "environmentBadge"
            );

        if (environment === "DEV") {

            badge.innerHTML = "🧪 DEV";
            badge.style.display = "block";

        }
        else {

            badge.innerHTML = "";
            badge.style.display = "none";

        }

        closeSettings();
        location.reload();

    }

}



window.addEventListener(
    "DOMContentLoaded",
    () => {

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
);

function showToast(message, type = "info") {

    const container =
        document.getElementById(
            "toastContainer"
        );

    const toast =
        document.createElement("div");

    toast.className =
        `toast ${type}`;

    toast.innerHTML = message;

    container.appendChild(toast);

    setTimeout(() => {

        toast.style.opacity = "0";

        toast.style.transition =
            "0.5s";

        setTimeout(() => {
            toast.remove();
        }, 500);

    }, 3000);
}

async function checkDriveFiles() {

    /* TODO 
    try {
 
         const response =
             await fetch(
                 "/api/drive/aCharger"
             );
 
         const files =
             await response.json();
 
         if (
             !files ||
             files.length === 0
         ) {
             return;
         }
 
         showDriveImportModal(
             files
         );
 
     }
     catch (err) {
 
         console.error(
             "Erreur Drive",
             err
         );
 
     }*/

}
function showDriveImportModal(files) {

    const noms =
        files
            .map(f => `• ${f.name}`)
            .join("\n");

    const ok =
        confirm(
            `${files.length} fichier(s) trouvé(s) dans A_CHARGER\n\n${noms}\n\nImporter ?`
        );

    if (ok) {

        importDriveFiles(files);

    }

}
window.addEventListener(
    "DOMContentLoaded",
    async () => {

        await checkDriveFiles();


    }
);

async function importDriveFiles(files) {

    for (const file of files) {

        const response =
            await fetch(
                `/api/drive/download/${file.id}`
            );

        const blob =
            await response.blob();

        const pdf =
            new File(
                [blob],
                file.name,
                {
                    type:
                        "application/pdf"
                }
            );

        pendingFiles.push({
            file: pdf,
            driveId: file.id
        });

    }

    processNextFile();

}


let ceesvFiles = [];

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

window.addEventListener(
    "DOMContentLoaded",
    () => {

        const dz =
            document.getElementById(
                "dropzoneCEESV"
            );

        const input =
            document.getElementById(
                "ceesvFiles"
            );

        dz.addEventListener(
            "click",
            () => input.click()
        );

        input.addEventListener(
            "change",
            e => {

                ceesvFiles =
                    Array.from(
                        e.target.files
                    );

                refreshFilesList();

            }
        );

        dz.addEventListener(
            "dragover",
            e => {

                e.preventDefault();

                dz.classList.add(
                    "dragover"
                );

            }
        );

        dz.addEventListener(
            "dragleave",
            () => {

                dz.classList.remove(
                    "dragover"
                );

            }
        );

        dz.addEventListener(
            "drop",
            e => {

                e.preventDefault();

                dz.classList.remove(
                    "dragover"
                );

                ceesvFiles =
                    Array.from(
                        e.dataTransfer.files
                    );

                refreshFilesList();

            }
        );

    }
);

function refreshFilesList() {

    const div =
        document.getElementById(
            "ceesvFilesList"
        );

    div.innerHTML =
        ceesvFiles
            .map(
                f =>
                    `📄 ${f.name}`
            )
            .join("<br>");

}

window.addEventListener(
    "DOMContentLoaded",
    async () => {

        await loadDashboard();

    }
);