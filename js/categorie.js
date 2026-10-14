//categorie.js
let comptaCategories = {};
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


loadCategories();