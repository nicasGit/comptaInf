
const response = await fetch(
    'http://localhost:3001/upload',
    {
        method: 'POST',
        body: formData
    }
);


const zone = document.getElementById('dropzone');

zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('dragover');
});

zone.addEventListener('dragleave', () => {
    zone.classList.remove('dragover');
});

zone.addEventListener('drop', async e => {

    e.preventDefault();

    zone.classList.remove('dragover');

    const file = e.dataTransfer.files[0];

    if (!file)
        return;

    const formData = new FormData();

    formData.append("pdf", file);

    const response = await fetch('/upload', {
        method: 'POST',
        body: formData
    });

    alert(await response.text());

});


window.addEventListener(
    "DOMContentLoaded",
    async () => {

        const sharedAnalyse =
            sessionStorage.getItem(
                "sharedAnalyse"
            );
        alert("sharedAnalyse = " + sharedAnalyse);
        if (!sharedAnalyse) {
            return;
        }

        sessionStorage.removeItem(
            "sharedAnalyse"
        );

        const result =
            JSON.parse(sharedAnalyse);

        //
        // Récupère le fichier partagé
        //
        const info =
            await (
                await fetch(
                    "/api/shared-file-info"
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


        currentCEESV =
            result.ceesv || null;


        if (
            currentCEESV &&
            currentCEESV.type === "CEESV_UBS"
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

            currentCEESV.match =
                await matchResponse.json();

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

        }

        if (typeof openDepense === "function") {

            openDepense();

            openOperationWithData(
                result,
                false
            );

        }

        await fetch(
            "/api/shared-file-clear",
            {
                method: "POST"
            }
        );

    }
);