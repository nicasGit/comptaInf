//dashboard.js
async function initDashboard() {

    initDropzone();
    initDashboardEvents();

    await loadExercices();
    await loadDepenses();
    await refreshStats();

    await loadEnvironmentBadge();
    await loadGoogleStatus();
    await loadGoogleUser();

    await refreshStandby();

    updateDate();

}
function initDashboardEvents() {

    const exerciceSelect =
        document.getElementById(
            "exerciceSelect"
        );

    if (!exerciceSelect) {
        return;
    }

    exerciceSelect.addEventListener(
        "change",
        async function () {

            await loadDepenses(
                this.value
            );

            await refreshStats(
                this.value
            );

        }
    );

}

function initDropzone() {

    const dropzone =
        document.getElementById(
            "dropzone"
        );

    const input =
        document.getElementById(
            "pdfFileMain"
        );

    if (!dropzone || !input) {
        return;
    }

    dropzone.addEventListener(
        "dragover",
        e => {
            e.preventDefault();
            dropzone.classList.add(
                "dragover"
            );
        }
    );

    dropzone.addEventListener(
        "dragleave",
        () => {
            dropzone.classList.remove(
                "dragover"
            );
        }
    );

    dropzone.addEventListener(
        "drop",
        e => {

            e.preventDefault();

            dropzone.classList.remove(
                "dragover"
            );

            const files =
                Array.from(
                    e.dataTransfer.files
                );

            if (!files.length) {
                return;
            }

            pendingFiles.push(
                ...files
            );

            processNextFile();

        }
    );

    dropzone.addEventListener(
        "click",
        () => input.click()
    );

    input.addEventListener(
        "change",
        e => {

            const files =
                Array.from(
                    e.target.files
                );

            if (!files.length) {
                return;
            }

            pendingFiles.push(
                ...files
            );

            processNextFile();

        }
    );

}


async function loadEnvironmentBadge() {

    const response =
        await fetch(
            "/api/environment"
        );

    const data =
        await response.json();

    const badge =
        document.getElementById(
            "environmentBadge"
        );

    if (!badge) {
        return;
    }

    if (data.environment === "DEV") {

        badge.innerHTML =
            "🧪 DEV";

        badge.className =
            "google-badge";

        badge.style.background =
            "#f39c12";

    }
    else {

        badge.style.display =
            "none";

    }

}
async function loadGoogleStatus() {

    const response =
        await fetch("/google-status");

    const data =
        await response.json();

    document
        .querySelectorAll(".googleOnly")
        .forEach(el => {

            el.style.display =
                data.connected
                    ? "block"
                    : "none";

        });

    const badge =
        document.getElementById(
            "googleBadge"
        );

    if (!badge) {
        return;
    }

    if (data.connected) {

        const btn =
            document.getElementById(
                "googleLoginBtn"
            );

        const logoutBtn =
            document.getElementById(
                "googleLogoutBtn"
            );

        badge.classList.remove(
            "disconnected"
        );

        badge.classList.add(
            "connected"
        );

        badge.style.display =
            "none";

        if (btn) {
            btn.style.display =
                "none";
        }

        if (logoutBtn) {
            logoutBtn.style.display =
                "block";
        }

    }
    else {

        badge.style.display =
            "block";

        badge.innerHTML =
            "🔴 Google non connecté";

    }

}

async function loadGoogleUser() {

    const response =
        await fetch("/google-user");

    const user =
        await response.json();

    const welcome =
        document.getElementById(
            "welcomeTitle"
        );

    if (!welcome) {
        return;
    }

    if (user.name) {

        welcome.innerHTML =
            `Bonjour ${user.name} 👋`;

    }

}

function updateDate() {

    const currentDate =
        document.getElementById(
            "currentDate"
        );

    if (!currentDate) {
        return;
    }

    const now =
        new Date();

    const options = {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    };

    let date =
        now.toLocaleDateString(
            "fr-FR",
            options
        );

    date =
        date.charAt(0).toUpperCase() +
        date.slice(1);

    currentDate.innerHTML =
        "📅 " + date;

}

async function loadDepenses() {

    const response =
        await fetch("/api/depenses");

    const rows =
        await response.json();

    const tbody =
        document.getElementById(
            "operationsBody"
        );

    if (!tbody) {
        return;
    }



    tbody.innerHTML = "";

    rows.slice(1).reverse().forEach(row => {


        const montant =
            Number(
                String(row[4] || "0")
                    .replace(",", ".")
            );
        const classeMontant =
            montant < 0
                ? "montant-negatif"
                : "montant-positif";


        const pdfLink = row[5]
            ? `<a  href="${row[5]}"
    			target="_blank" 
    			class="pdf-link"
    			title="Ouvrir le justificatif">📄</a>`
            : "—";

        const estCEESV =
            (row[1] || "")
                .includes("CEESV");


        const banqueLink = row[8]
            ? `<a href="${row[8]}"
                target="_blank"
                title="Justificatif Banque">✅</a>`
            : (estCEESV ? "⏳" : "");


        const tr =
            document.createElement("tr");

        tr.innerHTML = `
				<td>${row[0] || ""}</td>
				<td>${row[1] || ""}</td>
				<td>${row[2] || ""}</td>
				<td>${row[3] || ""}</td><!-- compte MEGA-->
				<td class="${classeMontant}">${montant} CHF</td> <!-- compte montant-->
                <td>${row[7] || ""}</td>
				<td>${pdfLink}</td>
                <td>${banqueLink}</td>
				</td>
			`;

        tbody.appendChild(tr);

    });

}


async function refreshStats() {

    const response =
        await fetch("/api/depenses");

    const rows =
        await response.json();

    let totalRecettes = 0;
    let totalDepenses = 0;

    rows.slice(1).forEach(row => {

        const montant =
            Number(
                String(row[4] || "0")
                    .replace(",", ".")
            );

        if (montant > 0) {

            totalRecettes += montant;

        } else {

            totalDepenses += Math.abs(montant);

        }

    });

    const resultat =
        totalRecettes - totalDepenses;


    const recettes =
        document.getElementById(
            "recettesTotal"
        );

    if (!recettes) {
        return;
    }

    recettes.innerHTML =
        totalRecettes.toLocaleString(
            "fr-FR",
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }
        ) +
        " CHF";

    document.getElementById(
        "depensesTotal"
    ).innerHTML =
        totalDepenses.toLocaleString(
            "fr-FR",
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }) +
        " CHF";

    document.getElementById(
        "resultatTotal"
    ).innerHTML =
        resultat.toLocaleString(
            "fr-FR",
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }) +
        " CHF";
}


async function refreshStandby() {

    const card =
        document.getElementById(
            "cardStandby"
        );

    if (!card) {
        return;
    }

    const response =
        await fetch("/api/standby");

    const standby =
        await response.json();

    const total =
        standby.ceesvSansBanque +
        standby.ubsSansCeesv;

    console.log("total =", total);


    if (total > 0) {

        document.getElementById(
            "cardStandby"
        ).style.display = "";

        document.getElementById(
            "nbStandby"
        ).innerHTML = total;

        document.getElementById(
            "standbyDetail"
        ).innerHTML =
            `${standby.ceesvSansBanque} CEESV sans banque<br>
             ${standby.ubsSansCeesv} UBS sans CEESV`;

    } else {

        document.getElementById(
            "cardStandby"
        ).style.display = "none";

    }

}