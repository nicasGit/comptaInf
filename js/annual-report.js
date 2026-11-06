const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const { convertDate } = require("../utils/utils");

function buildAnnualSummary(rows, year) {
    year = String(year);
    if (!/^\d{4}$/.test(year)) throw new Error("Exercice invalide");
    const operations = [];
    let invalid = 0;
    let outsideYear = 0;
    for (const row of rows.slice(1)) {
        if (!row.some(value => String(value ?? "").trim())) continue;
        const date = convertDate(String(row[0] || "").trim().replace(/^'+/, ""));
        const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        const parsed = match ? new Date(`${date}T00:00:00Z`) : null;
        const amountText = String(row[4] ?? "").replace(/[\s'’]/g, "").replace(/,/g, ".");
        const amount = Number(amountText);
        if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ||
            !amountText || !Number.isFinite(amount)) {
            invalid++;
            continue;
        }
        if (match[1] !== year) { outsideYear++; continue; }
        operations.push({ date, supplier: String(row[1] || "Sans fournisseur"),
            category: String(row[2] || "Sans catégorie"), account: String(row[3] || "Sans compte"),
            cents: Math.round(amount * 100), pdf: Boolean(row[5]), comment: String(row[7] || "") });
    }
    operations.sort((a, b) => a.date.localeCompare(b.date));
    const months = Array.from({ length: 12 }, (_, index) => ({ label: `${year}-${String(index + 1).padStart(2, "0")}`, income: 0, expenses: 0 }));
    const groups = new Map();
    let income = 0;
    let expenses = 0;
    for (const operation of operations) {
        const received = Math.max(0, operation.cents);
        const spent = Math.max(0, -operation.cents);
        income += received;
        expenses += spent;
        const month = months[Number(operation.date.slice(5, 7)) - 1];
        month.income += received;
        month.expenses += spent;
        const key = JSON.stringify([operation.account, operation.category]);
        if (!groups.has(key)) groups.set(key, { label: `${operation.account} / ${operation.category}`, income: 0, expenses: 0 });
        groups.get(key).income += received;
        groups.get(key).expenses += spent;
    }
    return { year, operations, income, expenses, result: income - expenses, months,
        groups: [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, "fr")), invalid, outsideYear };
}

async function generateAnnualReport(rows, year, userName = "") {
    const summary = buildAnnualSummary(rows, year);
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    pdf.setTitle(`ComptaInf - Bilan annuel ${summary.year}`);
    pdf.setCreator("ComptaInf");
    let page;
    let y;
    // Standard PDF fonts use WinAnsi. Keep unsupported OCR characters from breaking export.
    function safe(value) {
        return Array.from(String(value).replace(/[\r\n\t]+/g, " ").replace(/[\u202f\u00a0]/g, " "))
            .map(character => { try { font.encodeText(character); return character; } catch { return "?"; } }).join("");
    }
    function text(value, x, top, size = 10, strong = false) {
        page.drawText(safe(value), { x, y: top, size, font: strong ? bold : font, color: rgb(0.12, 0.16, 0.22) });
    }
    function newPage() {
        page = pdf.addPage([595.28, 841.89]);
        y = 775;
        text(`ComptaInf - Bilan annuel ${summary.year}`, 40, 805, 15, true);
    }
    function line(value, strong = false, size = 10) {
        const words = safe(value).split(/\s+/);
        let current = "";
        for (const word of words) {
            // Split long references as well as ordinary text.
            for (const character of (current ? " " : "") + word) {
                if (font.widthOfTextAtSize(current + character, size) > 510) {
                    if (y < 55) newPage();
                    text(current, 40, y, size, strong); y -= 15; current = "";
                }
                current += character;
            }
        }
        if (y < 55) newPage();
        text(current, 40, y, size, strong); y -= 17;
    }
    const money = cents => `${(cents / 100).toFixed(2)} CHF`;
    function section(title) { if (y < 105) newPage(); y -= 12; line(title, true, 12); }
    function totals(item) {
        line(`${item.label} | Recettes : ${money(item.income)} | Dépenses : ${money(item.expenses)} | Résultat : ${money(item.income - item.expenses)}`);
    }
    newPage();
    if (userName) line(userName, true);
    line(`Exercice : du 01.01.${summary.year} au 31.12.${summary.year}`);
    line(`Édité le ${new Date().toLocaleDateString("fr-CH", { timeZone: "Europe/Zurich" })}`);
    line("Synthèse des écritures enregistrées : recettes, dépenses et résultat.");
    line("Ce document ne présente pas de bilan des actifs et passifs.");
    section("Synthèse annuelle");
    line(`Recettes : ${money(summary.income)}`, true);
    line(`Dépenses : ${money(summary.expenses)}`, true);
    line(`Résultat : ${money(summary.result)}`, true);
    line(`${summary.operations.length} opération(s) ; ${summary.operations.filter(item => !item.pdf).length} sans justificatif principal.`);
    if (!summary.operations.length) line("Aucune opération pour cet exercice.");
    if (summary.invalid) line(`Attention : ${summary.invalid} ligne(s) exclue(s), date ou montant invalide.`);
    if (summary.outsideYear) line(`${summary.outsideYear} ligne(s) hors exercice exclue(s).`);
    section("Synthèse mensuelle");
    summary.months.forEach(totals);
    section("Synthèse par compte et catégorie");
    summary.groups.forEach(totals);
    section("Détail des opérations");
    for (const operation of summary.operations) {
        line(`${operation.date} | ${operation.supplier} | ${money(operation.cents)}`, true);
        line(`${operation.account} / ${operation.category} | Justificatif : ${operation.pdf ? "oui" : "manquant"}`);
        if (operation.comment) line(`Commentaire : ${operation.comment}`);
    }
    const pages = pdf.getPages();
    pages.forEach((item, index) => {
        item.drawText(`ComptaInf - ${summary.year} | Page ${index + 1} / ${pages.length}`, { x: 40, y: 25, size: 9, font });
    });
    return Buffer.from(await pdf.save());
}

module.exports = { buildAnnualSummary, generateAnnualReport };
