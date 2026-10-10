
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

let previewVersion = 0;

async function renderPdfPreview(file) {
  const version = ++previewVersion;
  const container = document.getElementById("pdfPreview");

  container.replaceChildren();
  container.style.display = "block";
  container.style.overflowY = "auto";
  container.textContent = "Chargement du PDF...";

  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data }).promise;

    if (version !== previewVersion) return;

    container.replaceChildren();

    for (let number = 1; number <= pdf.numPages; number++) {
      if (version !== previewVersion) return;

      const page = await pdf.getPage(number);
      const original = page.getViewport({ scale: 1 });
      const width = container.clientWidth || 350;
      const scale = Math.min(width / original.width, 2);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      canvas.style.display = "block";
      canvas.style.marginBottom = "12px";

      container.appendChild(canvas);

      await page.render({
        canvasContext: context,
        viewport
      }).promise;
    }
  } catch (error) {
    console.error("PDF.js :", error);
    if (version === previewVersion) {
      container.textContent =
        "Impossible d'afficher le PDF : " + error.message;
    }
  }
}

function clearPdfPreview() {
  previewVersion++;
  document.getElementById("pdfPreview").replaceChildren();
}
