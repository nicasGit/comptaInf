//navigation.js
// traitement Drive
let currentFile = null;
let pendingFiles = [];
let currentDriveFileId = null;

// Loader
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


// Dashboard
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


async function loadStats() {

    showLoader();

    try {

        const response =
            await fetch("/views/stats.html");

        const html =
            await response.text();

        document.getElementById(
            "content"
        ).innerHTML = html;

        await initStats();

    }
    finally {

        hideLoader();

    }

}

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


// Settings
function initSettings() {

    const envMode =
        document.getElementById(
            "environmentMode"
        );

    if (!envMode) {
        return;
    }

    envMode.addEventListener(
        "change",
        function () {

            const info =
                document.getElementById(
                    "environmentInfo"
                );

            info.innerHTML =
                this.value === "DEV"
                    ? "🧪 Mode développement"
                    : "🚀 Mode production";
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

    const exerciceResponse =
        await fetch("/api/exercice");

    const exerciceData =
        await exerciceResponse.json();

    select.value =
        exerciceData.exercice;
}






// Google
function updateGoogleBadge() {

    const params =
        new URLSearchParams(
            window.location.search
        );

    if (params.get("google") !== "ok") {
        return;
    }

    const badge =
        document.getElementById(
            "googleBadge"
        );

    if (!badge) {
        return;
    }

    badge.classList.remove(
        "disconnected"
    );

    badge.classList.add(
        "connected"
    );

    badge.innerHTML =
        "🟢 Google connecté";
}





function logoutGoogle() {

    window.location.href =
        "/logout";

}






async function openSettings() {

    const exerciceResponse =
        await fetch("/api/exercice");

    const exerciceData =
        await exerciceResponse.json();

    document.getElementById(
        "settingExercice"
    ).value =
        exerciceData.exercice;

    const envResponse =
        await fetch("/api/environment");

    const envData =
        await envResponse.json();

    document.getElementById(
        "environmentMode"
    ).value =
        envData.environment;

    document.getElementById(
        "modalSettings"
    ).style.display = "flex";
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



// Drive
async function processNextFile() {

    console.log(
        `processNextFile : ${pendingFiles.length} fichier(s)`
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


//Toast
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

// CEESV
function initCEESVDropzone() {

    const dz =
        document.getElementById(
            "dropzoneCEESV"
        );

    if (!dz) {
        return;
    }
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



function refreshFilesList() {

    const div =
        document.getElementById(
            "ceesvFilesList"
        );

    if (!div) {
        return;
    }

    div.innerHTML =
        ceesvFiles
            .map(
                f =>
                    `📄 ${f.name}`
            )
            .join("<br>");

}







// Bootstrap
window.addEventListener(
    "DOMContentLoaded",
    async () => {

        initSettings();

        updateGoogleBadge();

        await checkDriveFiles();

        initCEESVDropzone();

        await loadDashboard();

    }
);