const tabsView = require("./renderTabs");

function renderResult(value, from, result, to, type) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>Unit Converter - Result</title>
      <link rel="stylesheet" href="/styles.css" />
    </head>
    <body>
      <div class="page">
        <h1>Unit Converter</h1>

        <nav class="tabs">
          ${tabsView.renderTabs(type)}
        </nav>

        <main class="result-card">
          <h2>Result</h2>
          <p class="result-text">
            <strong>${value} ${from} = ${result} ${to}</strong>
          </p>
          <a class="reset-link" href="/${type}">Reset</a>
        </main>
      </div>
    </body>
    </html>
  `;
}

module.exports = { renderResult };