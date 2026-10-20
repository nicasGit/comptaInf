// js/utils.js

function convertDate(date) {

    if (!date) {
        return "";
    }

    if (date.includes(".") || date.includes("/")) {

        const p = date.split(/[./]/);

        if (p.length === 3) {
            return `${p[2]}-${p[1]}-${p[0]}`;
        }
    }

    return date;
}

