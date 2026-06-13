const express = require("express");
const path = require("path");

const {
    createURL,
    getURLByShortCode,
    incrementAccessCount,
    getURLsPaginated,
    getURLStatsByShortCode,
    deleteURL,
    putURL,
} = require("./src/stores/sqlitePostStore")

const app = express();
const PORT = 3000;
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/shorten", (req, res, next) => {
    const errors = validateURL(req.body)

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            errors,
        });
    }

    try {
        const urlShorten = createURL(req.body.url.trim(),  req.body.ttlSeconds);

        res.status(201).json({
            success: true,
            data: urlShorten,
        });
    } catch (error) {
        next(error);
    }
});

app.get("/shorten", (req, res, next) => {
    try {
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 10);

        if (!Number.isInteger(page) || page < 1) {
            return res.status(400).json({
                success: false,
                error: "page must be a positive integer",
            });
        }

        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
            return res.status(400).json({
                success: false,
                error: "limit must be an integer between 1 and 100",
            });
        }

        const result = getURLsPaginated(page, limit);

        res.status(200).json({
            success: true,
            ...result,
        });
    } catch (error) {
        next(error);
    }
});

app.get("/shorten/:shortCode/stats", (req, res, next) => {
    try {
        const { shortCode } = req.params;
        const stats = getURLStatsByShortCode(shortCode);

        if (!stats) {
            return res.status(404).json({
                success: false,
                error: "Short URL not found",
            });
        }

        res.status(200).json({
            success: true,
            data: stats,
        });
    } catch (error) {
        next(error);
    }
});
app.get("/shorten/:shortCode", (req, res, next) => {
    try {
        const { shortCode } = req.params;
        const urlRecord = getURLByShortCode(shortCode);

        if (!urlRecord) {
            return res.status(404).json({
                success: false,
                error: "Short URL not found",
            });
        }

        if (isExpired(urlRecord.expiresAt)) {
            return res.status(410).json({
                success: false,
                error: "Short URL has expired",
            });
        }

        incrementAccessCount(shortCode);

        res.redirect(302, urlRecord.originalUrl);
    } catch (error) {
        next(error);
    }
});

app.put("/shorten/:shortCode", (req, res, next) => {
    const errors = validateURL(req.body);

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            errors,
        });
    }

    try {
        const { shortCode } = req.params;

        const updatedURL = putURL(shortCode, req.body.url.trim());

        if (!updatedURL) {
            return res.status(404).json({
                success: false,
                error: "Short URL not found",
            });
        }

        res.status(200).json({
            success: true,
            data: updatedURL,
        });
    } catch (error) {
        next(error);
    }
});

app.delete("/shorten/:shortCode", (req, res, next) => {
    try {
        const { shortCode } = req.params;

        const success = deleteURL(shortCode);

        if (!success) {
            return res.status(404).json({
                success: false,
                error: "Short URL not found",
            });
        }

        res.status(204).end();
    } catch (error) {
        next(error);
    }
})


function validateJSON(error, req, res, next) {
    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
        return res.status(400).json({
            success: false,
            error: "Invalid JSON body",
        });
    }

    next(error);
}

function validateURL(body) {
    const errors = [];

    if (!body || typeof body !== "object" || Array.isArray(body)) {
        errors.push("Body must be a JSON object");
        return errors;
    }

    if (!Object.hasOwn(body, "url")) {
        errors.push("URL is required");
        return errors;
    }

    if (typeof body.url !== "string") {
        errors.push("URL must be a string");
        return errors;
    }

    if (body.ttlSeconds !== undefined && (typeof body.ttlSeconds !== "number"  ||
        !Number.isInteger(body.ttlSeconds) || body.ttlSeconds <= 0)){
        errors.push("ttlSeconds must be a positive integer");
    }

    const url = body.url.trim();

    if (url.length === 0) {
        errors.push("URL must not be empty");
        return errors;
    }

    try {
        const parsedUrl = new URL(url);

        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
            errors.push("URL must start with http:// or https://");
        }
    } catch {
        errors.push("URL must be valid");
    }

    return errors;
}

function isExpired(expiresAt) {
    if (!expiresAt) {
        return false;
    }

    return Date.now() > new Date(expiresAt).getTime();
}

app.use(validateJSON);

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: "Route not found",
    });
});

app.use((error, req, res, next) => {
    console.error(error);

    res.status(500).json({
        success: false,
        error: "Internal server error",
    });
});


app.listen(PORT, () => {
    console.log(`URL Shortener API is running on http://localhost:${PORT}`);
});



// Invoke-RestMethod `
//   -Uri "http://localhost:3000/shorten" `
//   -Method POST `
//   -ContentType "application/json" `
//   -Body '{"url":"not-a-url"}'
// Invoke-RestMethod : {"success":false,"errors":["URL must be valid"]}

// Invoke-WebRequest `
//   -Uri "http://localhost:3000/shorten" `
// -Method POST `
//   -ContentType "application/json" `
// -Body '{}'
// Invoke-WebRequest : {"success":false,"errors":["URL is required"]}

// Invoke-WebRequest `
//   -Uri "http://localhost:3000/shorten" `
// -Method POST `
//   -ContentType "application/json" `
// -Body '{"url":123}'
// Invoke-WebRequest : {"success":false,"errors":["URL must be a string"]}

// Invoke-WebRequest `
//   -Uri "http://localhost:3000/shorten" `
// -Method POST `
//   -ContentType "application/json" `
// -Body '{"url":""}'
// Invoke-WebRequest : {"success":false,"errors":["URL must not be empty"]}

// Invoke-WebRequest `
//   -Uri "http://localhost:3000/shorten" `
// -Method POST `
//   -ContentType "application/json" `
// -Body '{"url":"ftp://example.com"}'
// Invoke-WebRequest : {"success":false,"errors":["URL must start with http:// or https://"]}

// Invoke-WebRequest `
//   -Uri "http://localhost:3000/shorten" `
// -Method POST `
//   -ContentType "application/json" `
// -Body '{"url":"https://example.com"'
// Invoke-WebRequest : {"success":false,"error":"Invalid JSON body"}

// Invoke-RestMethod `
//   -Uri "http://localhost:3000/shorten" `
// -Method POST `
//   -ContentType "application/json" `
// -Body '{"url":"https://example.com/test9"}'
// success data

// Invoke-WebRequest `
//   -Uri "http://localhost:3000/not-existing-code" `
// -Method GET
// Invoke-WebRequest : {"success":false,"error":"Route not found"}



// Invoke-WebRequest `
// -Uri "http://localhost:3000/shorten/efc223fa" `
// -Method GET `
// -MaximumRedirection 0
// -UseBasicParsing


// $response = Invoke-RestMethod `
//   -Uri "http://localhost:3000/shorten/6cc21e3c/stats" `
//     -Method GET
// $response.data | Where-Object { $_.shortCode -eq "9474dc70" }


// Invoke-WebRequest `
//   -Uri "http://localhost:3000/shorten/efc223fa" `
// -Method DELETE

//
// Invoke-RestMethod `
//   -Uri "http://localhost:3000/shorten/$($response.data.shortCode)" `
// -Method PUT `
//   -ContentType "application/json" `
// -Body '{"url":"https://example.com/new"}'

// Invoke-WebRequest `
//   -Uri "http://localhost:3000/shorten/$($response.data.shortCode)" `
// -Method GET `
//   -MaximumRedirection 0 `
// -UseBasicParsing