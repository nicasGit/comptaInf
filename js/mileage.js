async function loadMileage() {
    const response = await fetch("/views/mileage.html");
    document.getElementById("content").innerHTML = await response.text();

    await loadSavedMileageExpenses();
}

async function loadStoredFuelLitres() {
    try {
        const response = await fetch("/api/depenses");
        const rows = await response.json();
        const select = document.getElementById("mileageStoredLitres");
        if (!Array.isArray(rows)) return;

        select.replaceChildren(new Option("Saisir le volume ci-dessous", ""));
        rows.slice(1).forEach(row => {
            const comment = String(row[7] || "");
            if (!/volenery/i.test(row[1] || "") || !/véhicule/i.test(row[2] || "") || !row[13]) return;
            if (/L\/100\s*km/i.test(comment)) return;
            const option = document.createElement("option");
            option.value = String(row[13]);
            option.textContent = `${row[0]} — ${String(row[13]).replace(/\|/g, " L + ")} L`;
            select.appendChild(option);
        });
    } catch (error) {
        console.error("Impossible de charger les litres Volenery", error);
    }
}

async function loadSavedMileageExpenses() {
    try {
        const [expensesResponse, settingsResponse] = await Promise.all([
            fetch("/api/depenses"),
            fetch("/settings")
        ]);
        const rows = await expensesResponse.json();
        const settings = await settingsResponse.json();
        if (!Array.isArray(rows)) return;

        const consumption = Number(String(settings.MileageConsumption || "7.3").replace(',', '.'));
        const validConsumption = Number.isFinite(consumption) && consumption > 0 ? consumption : 7.3;
        const invoices = new Map();

        rows.slice(1).forEach(row => {
            const supplier = String(row[1] || "");
            const category = String(row[2] || "");
            const litresValue = String(row[13] || "").trim();
            if (!/volenery/i.test(supplier) || !/véhicule/i.test(category) || !litresValue) return;

            const litres = litresValue.split("|").map(value =>
                Number(String(value).replace(/\s/g, "").replace(',', '.'))
            ).filter(value => Number.isFinite(value) && value > 0);
            const invoiceKey = String(row[5] || "").trim() || `${row[0] || ""}|${supplier}|${category}`;
            const rawAmount = String(row[4] || "0").replace(/\s/g, "").replace("'", "").replace(',', '.');
            if (!invoices.has(invoiceKey)) {
                invoices.set(invoiceKey, { date: row[0] || "", litres: [], amount: 0 });
            }
            const invoice = invoices.get(invoiceKey);
            invoice.date = invoice.date || row[0] || "";
            invoice.litres.push(...litres);
            invoice.amount += Math.abs(Number(rawAmount)) || 0;
        });

        const expenses = [...invoices.values()].map(invoice => {
            const totalLitres = invoice.litres.reduce((sum, value) => sum + value, 0);
            return {
                date: invoice.date,
                distance: totalLitres * 100 / validConsumption,
                litres: invoice.litres,
                totalLitres,
                amount: invoice.amount
            };
        });

        const totalDistance = expenses.reduce((sum, expense) => sum + expense.distance, 0);
        const totalLitres = expenses.reduce((sum, expense) => sum + expense.totalLitres, 0);
        const totalAmount = expenses.reduce((sum, expense) => sum + expense.amount, 0);
        document.getElementById("mileageSavedCount").textContent = `${validConsumption.toFixed(1).replace(".", ",")} L/100 km`;
        document.getElementById("mileageSavedDistance").textContent = `${totalDistance.toFixed(1).replace(".", ",")} km`;
        document.getElementById("mileageSavedLitres").textContent = `${totalLitres.toFixed(2).replace(".", ",")} L`;
        document.getElementById("mileageSavedAmount").textContent = `${totalAmount.toFixed(2).replace(".", ",")} CHF`;

        const body = document.getElementById("mileageSavedExpenses");
        body.innerHTML = expenses.length ? expenses.map(expense => {
            const litresDetail = expense.litres
                .map(value => `${value.toFixed(2).replace(".", ",") } L`)
                .join(" + ");
            return `
            <tr>
                <td>${escapeHtml(expense.date)}</td>
                <td>${expense.distance.toFixed(1).replace(".", ",")} km</td>
                <td>${litresDetail}</td>
                <td>${expense.amount.toFixed(2).replace(".", ",")} CHF</td>
            </tr>`;
        }).join("") : '<tr><td colspan="4">Aucun frais kilométrique enregistré.</td></tr>';
    } catch (error) {
        console.error("Impossible de charger les frais kilométriques enregistrés", error);
    }
}

function escapeHtml(value) {
    return String(value).replace(/[&<>]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]);
}

function calculateMileage() {
    const distance = Number(document.getElementById("mileageDistance")?.value || 0);
    const fullTankPrice = Number(document.getElementById("mileageFuelPrice")?.value || 0);
    const tankCapacity = Number(document.getElementById("mileageFuelCapacity")?.value || 45);
    const consumption = Number(document.getElementById("mileageConsumption")?.value || 7.3);
    const storedValue = document.getElementById("mileageStoredLitres")?.value || "";
    const storedLitres = storedValue.split("|").map(value => Number(String(value).replace(",", "."))).filter(value => value > 0);

    const litres = storedLitres.length
        ? storedLitres.reduce((sum, value) => sum + value, 0)
        : distance / 100 * consumption;
    const pricePerLiter = tankCapacity > 0 ? fullTankPrice / tankCapacity : 0;
    const amount = litres * pricePerLiter;

    return { distance, fullTankPrice, tankCapacity, consumption, litres, storedLitres, pricePerLiter, amount };
}

function updateMileageCalculation() {
    if (!document.getElementById("mileageAmount")) return;
    const values = calculateMileage();
    document.getElementById("mileageLitres").textContent = `${values.litres.toFixed(2)} L`;
    document.getElementById("mileagePricePerLiter").textContent = `${values.pricePerLiter.toFixed(2)} CHF/L`;
    document.getElementById("mileageAmount").textContent = `${values.amount.toFixed(2)} CHF`;
    updateMileageRecap(values);
}

function updateMileageRecap(values) {
    const recap = document.getElementById("mileageInvoiceRecap");
    const details = document.getElementById("mileageInvoiceDetails");
    if (!recap || !details) return;

    if (!values.storedLitres.length) {
        recap.style.display = "none";
        details.innerHTML = "";
        return;
    }

    recap.style.display = "grid";
    const chips = values.storedLitres.map((litres, index) =>
        `<span>Plein ${index + 1} : ${litres.toFixed(2).replace(".", ",")} L</span>`
    ).join("");
    details.innerHTML = `
        <div class="mileage-fuel-list">${chips}</div>
        <div><strong>Total facturé : ${values.litres.toFixed(2).replace(".", ",")} L</strong></div>
        <div>Montant facture : ${Number(document.getElementById("mileageFuelPrice")?.value || 0).toFixed(2).replace(".", ",")} CHF</div>
    `;
}

async function saveMileageExpense(event) {
    event.preventDefault();
    const values = calculateMileage();

    if (!values.distance || !values.fullTankPrice || !values.tankCapacity || !values.consumption) {
        alert("Veuillez renseigner la distance, le prix du plein, le volume et la consommation.");
        return;
    }

    const submitButton = event.submitter;
    submitButton.disabled = true;

    try {
        const response = await fetch("/api/mileage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                date: document.getElementById("mileageDate").value,
                distance: values.distance,
                fullTankPrice: values.fullTankPrice,
                tankCapacity: values.tankCapacity,
                consumption: values.consumption,
                litres: values.storedLitres
            })
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || "Impossible d'enregistrer les frais kilométriques");
        }

        alert(`${result.amount.toFixed(2)} CHF ajoutés aux dépenses.`);
        event.target.reset();
        document.getElementById("mileageFuelCapacity").value = "45";
        document.getElementById("mileageConsumption").value = "7.3";
        document.getElementById("mileageDate").value = new Date().toISOString().slice(0, 10);
        updateMileageCalculation();
        await loadSavedMileageExpenses();
    } catch (error) {
        alert(error.message);
    } finally {
        submitButton.disabled = false;
    }
}
