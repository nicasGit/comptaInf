const express = require("express");
const multer = require("multer");

const app = express();

const upload = multer({
    dest: "uploads/"
});

app.get("/", (req, res) => {
    res.send("✅ Upload Server OK");
});

app.post(
    "/upload",
    upload.single("pdf"),
    (req, res) => {

        console.log(req.file);

        res.send("✅ PDF reçu");

    }
);

app.listen(3001, () => {
    console.log("🚀 Upload Server OK sur 3001");
});
