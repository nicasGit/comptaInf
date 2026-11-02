async function initStats() {
    showLoader();
    try {
        const response = await fetch("/api/depenses");
        const rows = await response.json();
        if (!Array.isArray(rows) || rows.length < 2) return;

        const operations = rows.slice(1).map(row => ({
            date: row[0] || "",
            fournisseur: row[1] || "Inconnu",
            categorie: row[2] || "Sans catégorie",
            montant: statsNumber(row[4]),
            pdf: row[5] || ""
        })).filter(op => op.date && Number.isFinite(op.montant));

        window.statsOperations = operations;
        document.getElementById("statsPeriod")?.addEventListener("change", () => renderStatsPeriod());
        renderStatsPeriod();
    } finally {
        hideLoader();
    }
}

function statsNumber(value) {
    return Number(String(value ?? "0").replace(/\s/g, "").replace("'", "").replace(/,/g, "."));
}

function statsMonthKey(value) {
    const text = String(value || "").trim();
    const swiss = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (swiss) return `${swiss[3]}-${swiss[2].padStart(2, "0")}`;
    const iso = text.match(/^(\d{4})-(\d{2})/);
    return iso ? `${iso[1]}-${iso[2]}` : "";
}

function renderStatsPeriod() {
    const operations = window.statsOperations || [];
    const period = document.getElementById("statsPeriod")?.value || "all";
    let visible = operations;
    if (period !== "all") {
        const monthKeys = [...new Set(operations.map(op => statsMonthKey(op.date)).filter(Boolean))].sort();
        const selected = new Set(monthKeys.slice(-Number(period)));
        visible = operations.filter(op => selected.has(statsMonthKey(op.date)));
    }

    let recettes = 0;
    let depenses = 0;
    const categories = {};
    const fournisseurs = {};
    const monthly = {};

    visible.forEach(op => {
        const month = statsMonthKey(op.date);
        if (!monthly[month]) monthly[month] = { recettes: 0, depenses: 0, resultat: 0 };
        if (op.montant >= 0) {
            recettes += op.montant;
            monthly[month].recettes += op.montant;
        } else {
            depenses += Math.abs(op.montant);
            monthly[month].depenses += Math.abs(op.montant);
            categories[op.categorie] = (categories[op.categorie] || 0) + Math.abs(op.montant);
        }
        fournisseurs[op.fournisseur] = (fournisseurs[op.fournisseur] || 0) + Math.abs(op.montant);
        monthly[month].resultat += op.montant;
    });

    document.getElementById("statRecettes").textContent = statsMoney(recettes);
    document.getElementById("statDepenses").textContent = statsMoney(depenses);
    const resultat = recettes - depenses;
    const resultatElement = document.getElementById("statResultat");
    resultatElement.textContent = statsMoney(resultat);
    resultatElement.classList.toggle("negative", resultat < 0);
    document.getElementById("statOperations").textContent = visible.length.toLocaleString("fr-FR");
    renderTop("statsCategories", categories, 8);
    renderTop("statsFournisseurs", fournisseurs, 8);
    renderMois(monthly);
    renderChart(monthly);
}

function statsMoney(value) {
    return `${value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CHF`;
}


function renderChart(source) {
    const canvas = document.getElementById("statsChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const entries = Object.entries(source).sort();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!entries.length) return;

    const left = 62, right = 20, top = 25, bottom = 45;
    const chartWidth = canvas.width - left - right;
    const chartHeight = canvas.height - top - bottom;
    const values = entries.flatMap(([, totals]) => [totals.recettes, totals.depenses]);
    const maximum = Math.max(...values, 1);
    const roundedMaximum = Math.ceil(maximum / 1000) * 1000 || maximum;

    ctx.font = "12px Arial";
    ctx.fillStyle = "#6b7280";
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    for (let index = 0; index <= 4; index++) {
        const y = top + chartHeight * index / 4;
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(canvas.width - right, y);
        ctx.stroke();
        ctx.fillText(`${Math.round(roundedMaximum * (4 - index) / 4).toLocaleString("fr-FR")}`, 6, y + 4);
    }

    const step = chartWidth / Math.max(entries.length, 1);
    entries.forEach(([month, totals], index) => {
        const center = left + step * index + step / 2;
        const barWidth = Math.min(28, step * .28);
        drawStatsBar(ctx, center - barWidth / 2 - 2, totals.recettes, roundedMaximum, chartHeight, top, barWidth, "#22a06b");
        drawStatsBar(ctx, center + barWidth / 2 + 2, totals.depenses, roundedMaximum, chartHeight, top, barWidth, "#ef4444");
        ctx.fillStyle = "#64748b";
        ctx.textAlign = "center";
        ctx.fillText(statsShortMonth(month), center, canvas.height - 18);
    });
    ctx.textAlign = "left";
}

function drawStatsBar(ctx, x, value, maximum, chartHeight, top, width, color) {
    const height = value / maximum * chartHeight;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, top + chartHeight - height, width, height, 5);
    ctx.fill();
}

function statsShortMonth(month) {
    const match = String(month).match(/^(\d{4})-(\d{2})$/);
    if (!match) return month;
    const months = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
    return `${months[Number(match[2]) - 1]} ${match[1].slice(2)}`;
}

function renderTop(containerId, source, max) {
    const container = document.getElementById(containerId);
    const entries = Object.entries(source).sort((a, b) => b[1] - a[1]).slice(0, max);
    const maximum = entries[0]?.[1] || 1;
    container.innerHTML = entries.length ? entries.map(([label, total], index) => `
        <div class="stat-ranking-row">
            <div class="stat-ranking-head"><span><b>${index + 1}</b> ${statsEscape(label)}</span><strong>${statsMoney(total)}</strong></div>
            <div class="stat-ranking-track"><div style="width:${Math.max(5, total / maximum * 100)}%"></div></div>
        </div>
    `).join("") : '<div class="stats-empty">Aucune donnée pour cette période.</div>';
}

function renderMois(source) {
    const container = document.getElementById("statsMois");
    const entries = Object.entries(source).sort().slice(-12);
    container.innerHTML = entries.length ? entries.map(([month, totals]) => {
        const resultatClass = totals.resultat >= 0 ? "positive" : "negative";
        return `<div class="stat-month-row">
            <strong>${statsShortMonth(month)}</strong>
            <span><i class="month-income">+ ${statsMoney(totals.recettes)}</i><i class="month-expense">− ${statsMoney(totals.depenses)}</i></span>
            <b class="${resultatClass}">${statsMoney(totals.resultat)}</b>
        </div>`;
    }).join("") : '<div class="stats-empty">Aucune donnée.</div>';
}

function statsEscape(value) {
    return String(value).replace(/[&<>]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[character]));
}