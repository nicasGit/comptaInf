async function initStats() {

    showLoader();

    try {

        const response =
            await fetch("/api/depenses");

        //const operations =
        //    await response.json();
        const rows =
            await response.json();

        const headers = rows[0];

        const operations =
            rows.slice(1).map(row => {

                const obj = {};

                headers.forEach((header, index) => {

                    obj[header] = row[index];

                });

                return obj;

            });

        console.log(operations);
        console.table(operations);

        //console.log("OPERATIONS =", operations);
        //console.table(operations);

        let recettes = 0;
        let depenses = 0;

        const categories = {};
        const fournisseurs = {};
        const mois = {};

        operations.forEach(op => {

            const montant =
                parseFloat(
                    (op.Montant || "0")
                        .replace(",", ".")
                );

            const categorie =
                op.Categorie ||
                op.categorie ||
                "Sans catégorie";

            const fournisseur =
                op.Fournisseur ||
                op.fournisseur ||
                "Inconnu";

            const date =
                op.Date ||
                op.date;

            if (montant >= 0) {
                recettes += montant;
            } else {
                depenses += Math.abs(montant);

                categories[categorie] =
                    (categories[categorie] || 0)
                    + Math.abs(montant);
            }

            fournisseurs[fournisseur] =
                (fournisseurs[fournisseur] || 0)
                + Math.abs(montant);

            if (date) {

                const moisKey =
                    date.substring(0, 7);

                mois[moisKey] =
                    (mois[moisKey] || 0)
                    + montant;
            }

        });

        document.getElementById(
            "statRecettes"
        ).textContent =
            recettes.toFixed(2) + " CHF";

        document.getElementById(
            "statDepenses"
        ).textContent =
            depenses.toFixed(2) + " CHF";

        document.getElementById(
            "statResultat"
        ).textContent =
            (recettes - depenses).toFixed(2) + " CHF";

        document.getElementById(
            "statOperations"
        ).textContent =
            operations.length;

        renderTop(
            "statsCategories",
            categories,
            10
        );

        renderTop(
            "statsFournisseurs",
            fournisseurs,
            10
        );

        renderMois(mois);
        renderChart(mois);

    }
    finally {

        hideLoader();
    }

}


function renderChart(source) {

    const canvas =
        document.getElementById(
            "statsChart"
        );

    if (!canvas) {
        return;
    }

    const ctx =
        canvas.getContext("2d");

    const entries =
        Object.entries(source)
            .sort();

    if (entries.length === 0) {
        return;
    }

    const valeurs =
        entries.map(x => x[1]);

    const max =
        Math.max(...valeurs);

    const min =
        Math.min(...valeurs);

    const width =
        canvas.width;

    const height =
        canvas.height;

    const margin = 40;

    ctx.clearRect(
        0,
        0,
        width,
        height
    );

    //
    // Axe X
    //
    ctx.strokeStyle = "#bbb";
    ctx.beginPath();
    ctx.moveTo(
        margin,
        height - margin
    );
    ctx.lineTo(
        width - margin,
        height - margin
    );
    ctx.stroke();

    //
    // Axe Y
    //
    ctx.beginPath();
    ctx.moveTo(
        margin,
        margin
    );
    ctx.lineTo(
        margin,
        height - margin
    );
    ctx.stroke();

    //
    // Courbe
    //
    ctx.strokeStyle = "#4caf50";
    ctx.lineWidth = 3;
    ctx.beginPath();

    entries.forEach(
        ([mois, total], index) => {

            const x =
                margin +
                (
                    index *
                    (width - margin * 2)
                ) /
                Math.max(
                    entries.length - 1,
                    1
                );

            const y =
                height -
                margin -
                (
                    (total - min)
                    /
                    Math.max(
                        max - min,
                        1
                    )
                ) *
                (height - margin * 2);

            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }

        }
    );

    ctx.stroke();

    //
    // Points + labels
    //
    entries.forEach(
        ([mois, total], index) => {

            const x =
                margin +
                (
                    index *
                    (width - margin * 2)
                ) /
                Math.max(
                    entries.length - 1,
                    1
                );

            const y =
                height -
                margin -
                (
                    (total - min)
                    /
                    Math.max(
                        max - min,
                        1
                    )
                ) *
                (height - margin * 2);

            ctx.fillStyle = "#4caf50";

            ctx.beginPath();
            ctx.arc(
                x,
                y,
                4,
                0,
                Math.PI * 2
            );
            ctx.fill();

            ctx.fillStyle = "#666";
            ctx.font = "12px Arial";

            ctx.fillText(
                mois,
                x - 20,
                height - 15
            );

            ctx.fillText(
                total.toFixed(0),
                x - 15,
                y - 10
            );

        }
    );

}

function renderTop(containerId, source, max) {

    const container =
        document.getElementById(containerId);

    container.innerHTML = Object.entries(source)
        .sort((a, b) => b[1] - a[1])
        .slice(0, max)
        .map(([label, total]) => `
            <div class="stat-line">
                <span>${label}</span>
                <strong>${total.toFixed(2)} CHF</strong>
            </div>
        `)
        .join("");

}

function renderMois(source) {

    const container =
        document.getElementById("statsMois");

    container.innerHTML = Object.entries(source)
        .sort()
        .map(([mois, total]) => `
            <div class="stat-line">
                <span>${mois}</span>
                <strong>${total.toFixed(2)} CHF</strong>
            </div>
        `)
        .join("");

}