//operations.js 

console.log("operations.js chargé");

/*
const params =
    new URLSearchParams(
        window.location.search
    );

const pageType =
    params.get("type") || "depenses";
*/

let allRows = [];
let pageType = "all";
let standbyOnly = false;

async function initOperations(type = "all") {

    console.log(
        "initOperations",
        type
    );

    standbyOnly = false;
    pageType = type;

    document.querySelector(".card-title").innerHTML =
        type === "recettes"
            ? "Total recettes"
            : type === "depenses"
                ? "Total dépenses"
                : "Total mouvements";

    document.querySelectorAll(".card-title")[1].innerHTML =
        type === "recettes"
            ? "Nombre de recettes"
            : type === "depenses"
                ? "Nombre de dépenses"
                : "Nombre d'opérations";

    await loadOperationsData();
    await loadOperationsSettings();
    await refreshStandby();

    document
        .getElementById("search")
        ?.addEventListener(
            "input",
            renderOperationsTable
        );

}




async function loadOperationsData() {
    console.log("loadOperationsData");
    const response =
        await fetch("/api/depenses");

    allRows =
        await response.json();

    renderOperationsTable();

    refreshOperationsStats();
}


async function loadStandby() {

    await loadOperations("all");

    standbyOnly = true;

    renderOperationsTable();

    document.getElementById(
        "pageTitle"
    ).innerHTML =
        "⏳ Rapprochements en attente";

    document.querySelector(".card-title")
        .innerHTML =
        "💰 Montant en attente";

    document.querySelectorAll(".card-title")[1]
        .innerHTML =
        "📋 Nombre d'attentes";

    refreshOperationsStats();
}

function renderOperationsTable() {

    let dernierMois = "";
    const totauxParMois = {};
    const nbParMois = {};

    allRows
        .slice(1)
        .forEach(row => {

            const montant =
                Number(
                    String(row[4] || "0")
                        .replace(",", ".")
                );

            if (
                pageType === "depenses" &&
                montant >= 0
            ) {
                return;
            }

            if (
                pageType === "recettes" &&
                montant <= 0
            ) {
                return;
            }


            if (!row[0]) {
                return;
            }

            if (standbyOnly) {

                const fournisseur =
                    row[1] || "";

                const estCEESV =
                    fournisseur.includes("CEESV");

                const estUBS =
                    fournisseur ===
                    "UBS - Centrale d'encaissement";

                const enAttente =
                    (estCEESV && !row[8]) ||
                    estUBS;

                if (!enAttente) {
                    return;
                }

            }

            const date = new Date(row[0]);

            const mois =
                date.toLocaleDateString(
                    "fr-FR",
                    {
                        month: "long",
                        year: "numeric"
                    }
                );

            if (!nbParMois[mois]) {
                nbParMois[mois] = 0;
            }

            nbParMois[mois]++;


            if (!totauxParMois[mois]) {
                totauxParMois[mois] = 0;
            }

            totauxParMois[mois] +=
                Math.abs(montant);

        });

    const filtre =
        document
            .getElementById("search")
            .value
            .toLowerCase();

    const tbody =
        document
            .getElementById(
                "depensesBody"
            );

    tbody.innerHTML = "";

    allRows
        .slice(1)
        .sort((a, b) => {

            const dateA = new Date(a[0]);
            const dateB = new Date(b[0]);

            return dateB - dateA;

        })
        .forEach(row => {

            const fournisseur =
                (row[1] || "")
                    .toLowerCase();

            if (
                filtre &&
                !fournisseur.includes(
                    filtre
                )
            ) {
                return;
            }

            const pdfLink =
                row[5]
                    ? `
                        <a href="${row[5]}"
                           target="_blank"
                           class="pdf-link"
                           title="Ouvrir le justificatif">
                           📄 Voir
                        </a>
                    `
                    : "—";

            const tr =
                document.createElement(
                    "tr"
                );
            const montant =
                Number(
                    String(row[4] || "0")
                        .replace(",", ".")
                );

            if (
                pageType === "depenses" &&
                montant >= 0
            ) {
                return;
            }

            if (
                pageType === "recettes" &&
                montant <= 0
            ) {
                return;
            }
            if (standbyOnly) {

                const fournisseur =
                    row[1] || "";

                const estCEESV =
                    fournisseur.includes("CEESV");

                const estUBS =
                    fournisseur ===
                    "UBS - Centrale d'encaissement";

                const enAttente =
                    (estCEESV && !row[8]) ||
                    estUBS;

                if (!enAttente) {
                    return;
                }

            }

            const classeMontant =
                montant < 0
                    ? "montant-negatif"
                    : "montant-positif";



            const date =
                new Date(row[0]);

            const mois =
                date.toLocaleDateString(
                    "fr-FR",
                    {
                        month: "long",
                        year: "numeric"
                    }
                );

            if (mois !== dernierMois) {

                dernierMois = mois;

                const trMois =
                    document.createElement("tr");

                trMois.innerHTML = `
    <td colspan="6"
        class="mois-separateur">

        <div style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            width:100%;
        ">

            <span>
                📅 ${mois.charAt(0).toUpperCase() + mois.slice(1)}
                (${nbParMois[mois]} opérations)
            </span>

            <span>
                ${totauxParMois[mois].toLocaleString(
                    "fr-FR",
                    {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    }
                )} CHF
            </span>

        </div>

    </td>
`;


                tbody.appendChild(trMois);

            }

            tr.innerHTML = `
                    <td>${row[0] || ""}</td>
                    <td>${row[1] || ""}</td>
                    <td>${row[2] || ""}</td>
					<td>${row[3] || ""}</td>
                    <td class="${classeMontant}">
    ${Math.abs(montant).toLocaleString(
                "fr-FR",
                {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }
            )} CHF
</td>
                    <td>${pdfLink}</td>
                `;

            tbody.appendChild(tr);

        });

}

function refreshOperationsStats() {



    let total = 0;
    let nb = 0;

    allRows
        .slice(1)
        .forEach(row => {

            if (standbyOnly) {

                const fournisseur =
                    row[1] || "";

                const estCEESV =
                    fournisseur.includes("CEESV");

                const estUBS =
                    fournisseur ===
                    "UBS - Centrale d'encaissement";

                const enAttente =
                    (estCEESV && !row[8]) ||
                    estUBS;

                if (!enAttente) {
                    return;
                }

            }

            const montant =
                Number(
                    String(row[4] || "0")
                        .replace(",", ".")
                );

            if (
                pageType === "depenses"
            ) {

                if (montant < 0) {

                    total += Math.abs(montant);
                    nb++;

                }

            }
            else if (
                pageType === "recettes"
            ) {

                if (montant > 0) {

                    total += montant;
                    nb++;

                }

            }
            else {

                total += Math.abs(montant);
                nb++;

            }




        });

    document.getElementById(
        "totalDepenses"
    ).innerHTML =
        total.toLocaleString(
            "fr-FR",
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }
        ) + " CHF";

    document.getElementById(
        "nbDepenses"
    ).innerHTML = nb;

}



async function loadOperationsSettings() {

    const response =
        await fetch("/settings");

    const settings =
        await response.json();

    document.getElementById(
        "pageTitle"
    ).innerHTML =
        pageType === "recettes"
            ? `💰 Recettes - Exercice ${settings.Exercice}`
            : pageType === "depenses"
                ? `🧾 Dépenses - Exercice ${settings.Exercice}`
                : `📋 Mouvements - Exercice ${settings.Exercice}`;
}

