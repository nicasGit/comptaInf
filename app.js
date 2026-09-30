
const response = await fetch(
    'http://localhost:3001/upload',
    {
        method: 'POST',
        body: formData
    }
);


const zone = document.getElementById('dropzone');

zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('dragover');
});

zone.addEventListener('dragleave', () => {
    zone.classList.remove('dragover');
});

zone.addEventListener('drop', async e => {

    e.preventDefault();

    zone.classList.remove('dragover');

    const file = e.dataTransfer.files[0];

    if (!file)
        return;

    const formData = new FormData();

    formData.append("pdf", file);

    const response = await fetch('/upload', {
        method: 'POST',
        body: formData
    });

    alert(await response.text());

});