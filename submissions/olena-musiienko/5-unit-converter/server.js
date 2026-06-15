const express = require("express");
const path = require("path");

const { renderForm } = require("./src/views/renderForm");
const { renderResult } = require("./src/views/renderResult");

const {
    convertLength,
    convertWeight,
    convertTemperature,
    convertArea,
    convertVolume,
} = require("./src/utils/convert");

const app = express();
const PORT = 3000;

// this serves static files like CSS and client-side JavaScript
app.use(express.static(path.join(__dirname, "src")));
// this is needed to parse form data from POST requests
app.use(express.urlencoded({ extended: false }));

const converters = {
    length: convertLength,
    weight: convertWeight,
    temperature: convertTemperature,
    area: convertArea,
    volume: convertVolume,
};

const allowedTypes = ["length", "weight", "temperature", "area", "volume"];

app.get("/", (req, res) => {
    res.redirect("/length");
});

app.get("/:type", (req, res, next) => {
    const { type } = req.params;

    if (!allowedTypes.includes(type)) {
        res.status(404).send(renderErrorPage("Converter not found"));
        return;
    }

    try {
        res.send(renderForm(type));
    } catch (error) {
        next(error);
    }
});

app.post("/:type", (req, res, next) => {
    const { type } = req.params;

    if (!allowedTypes.includes(type)) {
        res.status(404).send(renderErrorPage("Converter not found"));
        return;
    }

    try {
        const rawValue = req.body.value;
        const value = Number(rawValue);
        const from = req.body.from;
        const to = req.body.to;

        if (rawValue.trim() === "" || Number.isNaN(value)) {
            res.redirect(`/${type}`);
            return;
        }

        if (type !== "temperature" && value < 0) {
            res.redirect(`/${type}`);
            return;
        }

        const converter = converters[type];
        const result = converter(value, from, to);

        res.send(renderResult(value, from, result, to, type));
    } catch (error) {
        next(error);
    }
});

function renderErrorPage(message = "Something went wrong") {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Unit Converter - Error</title>
      <link rel="stylesheet" href="/styles.css" />
    </head>
    <body>
      <div class="page">
        <h1>Unit Converter</h1>

        <main class="result-card">
          <h2>Error</h2>
          <p class="result-text">${message}</p>
          <a class="reset-link" href="/length">Back to converter</a>
        </main>
      </div>
    </body>
    </html>
  `;
}

app.use((req, res) => {
    res.status(404).send(renderErrorPage("Page not found"));
});

app.use((error, req, res, next) => {
    console.error(error);

    res.status(500).send(renderErrorPage("Something went wrong"));
});

app.listen(PORT, () => {
    console.log(`Open http://localhost:${PORT}/length`);
});
