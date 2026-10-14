//fournisseurs.js
let comptaFournisseurs = {};
let comptaFournisseursConvert = {};

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


async function loadFournisseursConvert() {

    try {

        const response =
            await fetch("/api/fournisseurs-convert");

        comptaFournisseursConvert =
            await response.json();

        console.log(
            "Conversions chargées :",
            comptaFournisseursConvert
        );
    }
    catch (err) {

        console.error(
            "Erreur chargement conversions :",
            err
        );
    }
}


function initFournisseurAutocomplete() {

    const input =
        document.getElementById(
            "depFournisseur"
        );

    const box =
        document.getElementById(
            "fournisseurSuggestions"
        );

    if (!input || !box) {
        return;
    }

    input.addEventListener(
        "input",
        function () {

            const valeur =
                this.value
                    .toLowerCase()
                    .trim();

            box.innerHTML = "";

            const existe =
                Object.keys(comptaFournisseurs)
                    .some(
                        f =>
                            f.toLowerCase().trim() ===
                            valeur
                    );

            if (existe) {

                box.style.display = "none";
                return;
            }

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



function initFournisseurs() {

    loadFournisseurs();

    loadFournisseursConvert();

    initFournisseurAutocomplete();

}

window.addEventListener(
    "DOMContentLoaded",
    initFournisseurs
);

