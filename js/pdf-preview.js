//pdf-preview.js
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

let previewVersion = 0;
const pdfZooms = {
  pdfPreview: 1,
  duplicatePdfPreview: 1
};
const pdfUrls = {
  pdfPreview: null,
  duplicatePdfPreview: null
};

async function renderPdfPreview(file,
  containerId = "pdfPreview") {
  const version = ++previewVersion;
  const container = document.getElementById(containerId);

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
      const viewport = page.getViewport({
        scale: scale * pdfZooms[containerId]
      });

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.style.maxWidth = "none";
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

async function renderPdfUrl(
  url,
  containerId = "pdfPreview"
) {

  const version = ++previewVersion;
  pdfUrls[containerId] = url;

  const container =
    document.getElementById(containerId);

  container.replaceChildren();
  container.style.display = "block";
  container.style.overflowY = "auto";
  container.textContent =
    "Chargement du PDF...";

  try {

    const pdf =
      await pdfjsLib
        .getDocument(url)
        .promise;

    if (version !== previewVersion) {
      return;
    }

    container.replaceChildren();

    for (
      let number = 1;
      number <= pdf.numPages;
      number++
    ) {

      const page =
        await pdf.getPage(number);

      const original =
        page.getViewport({
          scale: 1
        });

      const width =
        container.clientWidth || 350;

      const scale =
        Math.min(
          width / original.width,
          2
        );

      const viewport =
        page.getViewport({
          scale:
            scale *
            pdfZooms[containerId]
        });

      const canvas =
        document.createElement(
          "canvas"
        );

      const context =
        canvas.getContext("2d");

      canvas.width =
        Math.ceil(
          viewport.width
        );

      canvas.height =
        Math.ceil(
          viewport.height
        );

      canvas.style.width = `${Math.ceil(viewport.width)}px`;
      canvas.style.height = `${Math.ceil(viewport.height)}px`;
      canvas.style.maxWidth = "none";
      canvas.style.display = "block";
      canvas.style.margin = "0 auto 12px";

      container.appendChild(
        canvas
      );

      await page.render({
        canvasContext: context,
        viewport
      }).promise;
    }

  } catch (err) {

    console.error(err);

    container.textContent =
      "Impossible d'afficher le PDF";
  }
}

function clearPdfPreview() {
  previewVersion++;
  pdfUrls.pdfPreview = null;
  document.getElementById("pdfPreview").replaceChildren();
  document.getElementById("pdfPreview").style.display = "none";
}


function zoomPdf(
  step,
  containerId = "pdfPreview",
  labelId = "pdfZoomLabel"
) {

  pdfZooms[containerId] += step;

  pdfZooms[containerId] = Math.max(
    0.5,
    Math.min(3, pdfZooms[containerId])
  );

  const zoom =
    pdfZooms[containerId];

  const label =
    document.getElementById(labelId);

  if (label) {

    label.textContent =
      Math.round(
        zoom * 100
      ) + "%";

  }

  //
  // IMAGE
  //
  const image =
    document.getElementById(
      "imagePreview"
    );

  if (
    image &&
    image.style.display !== "none"
  ) {

    image.style.transform =
      `scale(${zoom})`;

    image.style.transformOrigin =
      "top center";

    return;

  }

  //
  // PDF
  //
  if (pdfUrls[containerId]) {
    renderPdfUrl(pdfUrls[containerId], containerId);
  } else if (typeof currentFile !== "undefined" && currentFile) {
    renderPdfPreview(currentFile, containerId);
  }

}