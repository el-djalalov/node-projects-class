const {
    lengthUnits,
    weightUnits,
    areaUnits,
    volumeUnits,
    temperatureUnits,
} = require("../data/units");

const { renderTabs } = require("./renderTabs");

function getFormConfig(type) {
    switch (type) {
        case "weight":
            return {
                action: "/weight",
                label: "Enter the weight to convert",
                units: weightUnits,
                allowNegative: false,
                defaultFrom: "kg",
                defaultTo: "g",
            };

        case "length":
            return {
                action: "/length",
                label: "Enter the length to convert",
                units: lengthUnits,
                allowNegative: false,
                defaultFrom: "mm",
                defaultTo: "cm",
            };

        case "area":
            return {
                action: "/area",
                label: "Enter the area to convert",
                units: areaUnits,
                allowNegative: false,
                defaultFrom: "m2",
                defaultTo: "cm2",
            };

        case "volume":
            return {
                action: "/volume",
                label: "Enter the volume to convert",
                units: volumeUnits,
                allowNegative: false,
                defaultFrom: "l",
                defaultTo: "ml",
            };

        case "temperature":
            return {
                action: "/temperature",
                label: "Enter the temperature to convert",
                units: temperatureUnits,
                allowNegative: true,
                defaultFrom: "C",
                defaultTo: "F",
            };

        default:
            throw new Error(`Unknown converter type: ${type}`);
    }
}

function renderOptions(units, selectedValue) {
    return units
        .map(unit => {
            const selected = unit.value === selectedValue ? "selected" : "";

            return `<option value="${unit.value}" ${selected}>${unit.label}</option>`;
        })
        .join("");
}
function renderForm(type, state = {}) {
    const config = getFormConfig(type);

    const value = state.value ?? "";
    const from = state.from ?? config.defaultFrom;
    const to = state.to ?? config.defaultTo;
    const result = state.result;

    const fromOptions = renderOptions(config.units, from);
    const toOptions = renderOptions(config.units, to);

    const minAttribute = config.allowNegative ? "" : 'min="0"';

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Unit Converter</title>
      <link rel="stylesheet" href="/styles.css" />
    </head>
    <body>
      <div class="page">
        <h1>Unit Converter</h1>

        <nav class="tabs">
          ${renderTabs(type)}
        </nav>

        <form method="POST" action="${config.action}">
          <label>${config.label}</label>
          <input 
            type="number" 
            name="value" 
            step="any" 
            value="${value}" 
            ${minAttribute} 
          />

          <label>Unit to Convert from</label>
          <select id="from" name="from">
            ${fromOptions}
          </select>

          <button class="swap-button" type="button" onclick="swapUnits()">⇄</button>

          <label>Unit to Convert to</label>
          <select id="to" name="to">
            ${toOptions}
          </select>

          <button type="submit">Convert</button>
        </form>

        ${
        result !== undefined
            ? `
                  <main class="result-card">
                    <h2>Result</h2>
                    <p class="result-text">
                      <strong>${value} ${from} = ${result} ${to}</strong>
                    </p>
                    <a class="reset-link" href="/${type}">Reset</a>
                  </main>
                `
            : ""
    }
      </div>

      <script>
        function swapUnits() {
          const fromSelect = document.getElementById("from");
          const toSelect = document.getElementById("to");

          const oldFrom = fromSelect.value;
          fromSelect.value = toSelect.value;
          toSelect.value = oldFrom;
        }
      </script>
    </body>
    </html>
  `;
}

module.exports = { renderForm };