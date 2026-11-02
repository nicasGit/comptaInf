let professionalExpenses = [];
let professionalCategoryFilter = "all";

async function loadProfessionalExpenses() {
    const content = document.getElementById("content");
    if (!content) return;
    const response = await fetch("/views/professional-expenses.html");
    content.innerHTML = await response.text();

    document.querySelectorAll(".professional-tab").forEach(button => {
        button.addEventListener("click", () => {
            document.querySelectorAll(".professional-tab").forEach(item => item.classList.remove("active"));
            button.classList.add("active");
            professionalCategoryFilter = button.dataset.category;
            renderProfessionalExpenses();
        });
    });
    document.getElementById("professionalSearch")?.addEventListener("input", renderProfessionalExpenses);

    await refreshProfessionalExpenses();
}

async function refreshProfessionalExpenses() {
    const response = await fetch("/api/depenses");
    const rows = await response.json();
    if (!Array.isArray(rows)) return;

    professionalExpenses = rows.slice(1).map(row => {
        const amount = parseProfessionalAmount(row[4]);
        const supplier = String(row[1] || "");
        const category = String(row[2] || "");
        return {
            date: String(row[0] || ""),
            supplier,
            category,
            amount,
            pdf: String(row[5] || ""),
            litres: String(row[13] || "")
        };
    }).filter(expense => expense.amount < 0).map(expense => ({
        ...expense,
        amount: Math.abs(expense.amount),
        professionalCategory: classifyProfessionalExpense(expense.category, expense.supplier)
    }));

    renderProfessionalExpenses();
}

function parseProfessionalAmount(value) {
    return Number(String(value ?? 0).replace(/\s/g, "").replace("'", "").replace(/,/g, "."));
}

function classifyProfessionalExpense(category, supplier) {
    const text = `${category} ${supplier}`.toLowerCase();
    if (/volenery|carburant|véhicule|vehicule|essence|diesel|station|bp\s/i.test(text)) return "vehicle";
    if (/matériel médical|materiel medical|fourniture médicale|fourniture medical/i.test(text)) return "medical";
    if (/pharmacie|médicament|medicament/i.test(text)) return "pharmacy";
    if (/assurance|rc pro|mutuelle/i.test(text)) return "insurance";
    if (/formation|cours|seminaire|séminaire/i.test(text)) return "training";
    if (/téléphonie|telephonie|internet|swisscom|sunrise|salt/i.test(text)) return "telecom";
    return "other";
}

function renderProfessionalExpenses() {
    const search = document.getElementById("professionalSearch")?.value.toLowerCase() || "";
    const visible = professionalExpenses.filter(expense => {
        const categoryMatches = professionalCategoryFilter === "all" || expense.professionalCategory === professionalCategoryFilter;
        const searchMatches = !search || expense.supplier.toLocaleLowerCase().includes(search);
        return categoryMatches && searchMatches;
    });

    const total = professionalExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const mileageTotal = professionalExpenses
        .filter(expense => expense.professionalCategory === "vehicle")
        .reduce((sum, expense) => sum + expense.amount, 0);
    const missing = professionalExpenses.filter(expense => !expense.pdf).length;

    document.getElementById("professionalTotal").textContent = formatProfessionalAmount(total);
    document.getElementById("professionalCount").textContent = professionalExpenses.length;
    document.getElementById("professionalMileage").textContent = formatProfessionalAmount(mileageTotal);
    document.getElementById("professionalMissing").textContent = missing;

    renderProfessionalCategories();
    const body = document.getElementById("professionalExpenses");
    body.innerHTML = visible.length ? visible.map(expense => `
        <tr>
            <td>${professionalEscape(expense.date)}</td>
            <td>${professionalEscape(expense.supplier)}</td>
            <td>${professionalEscape(expense.category || professionalCategoryLabel(expense.professionalCategory))}</td>
            <td>${expense.pdf ? `<a href="${professionalEscape(expense.pdf)}" target="_blank">📄 Ouvrir</a>` : '<span class="professional-missing">Manquant</span>'}</td>
            <td class="professional-amount">${formatProfessionalAmount(expense.amount)}</td>
        </tr>`).join("") : '<tr><td colspan="5">Aucune dépense professionnelle.</td></tr>';
}

function renderProfessionalCategories() {
    const container = document.getElementById("professionalCategories");
    if (!container) return;
    const names = { vehicle: "Véhicule", medical: "Matériel médical", pharmacy: "Pharmacie", insurance: "Assurances", training: "Formation", telecom: "Téléphonie", other: "Autres" };
    const colors = { vehicle: "#ef6c00", medical: "#00897b", pharmacy: "#5e35b1", insurance: "#1565c0", training: "#6d4c41", telecom: "#039be5", other: "#78909c" };
    const backgrounds = { vehicle: "#fff3e0", medical: "#e0f2f1", pharmacy: "#ede7f6", insurance: "#e3f2fd", training: "#efebe9", telecom: "#e1f5fe", other: "#eceff1" };
    const totals = {};
    professionalExpenses.forEach(expense => totals[expense.professionalCategory] = (totals[expense.professionalCategory] || 0) + expense.amount);
    container.innerHTML = Object.keys(names).filter(key => totals[key]).map(key => `
        <div class="professional-category" style="--category-color:${colors[key]};--category-background:${backgrounds[key]}"><span>${names[key]}</span><strong>${formatProfessionalAmount(totals[key])}</strong></div>
    `).join("") || '<span>Aucune dépense enregistrée.</span>';
}

function professionalCategoryLabel(category) {
    return { vehicle: "Véhicule", medical: "Matériel médical", pharmacy: "Pharmacie", insurance: "Assurances", training: "Formation", telecom: "Téléphonie", other: "Autres" }[category] || "Autres";
}

function formatProfessionalAmount(amount) {
    return `${amount.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CHF`;
}

function professionalEscape(value) {
    return String(value).replace(/[&<>]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[character]));
}
