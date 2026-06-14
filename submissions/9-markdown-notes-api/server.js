const {
    saveNotes,
    updateNoteIndex,
    listNotes,
    getNoteById,
    deleteNote,
    uploadFile,
    putNote,
    uploadMemory,
} = require("./noteStore.js")

const marked = require("marked")
const writeGood = require('write-good');
const fs = require("fs");

const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.text());
app.use(express.urlencoded({extended: true}));

// Middleware to check content type
function onlyContentType(type) {
    return function (req, res, next) {
        if (req.is(type)) {
            return next();
        }

        return next("route");
    };
}

// This function takes the original markdown text and an array of grammar suggestions from write-good, and returns the
// markdown text with <mark> tags around the flagged phrases, including a title attribute with the reason for the
// suggestion.
function markGrammarSuggestions(markdownText, suggestions) {
    if (!Array.isArray(suggestions) || suggestions.length === 0) {
        return markdownText;
    }
    const sortedSuggestions = [...suggestions].sort((a, b) => b.index - a.index);
    let markedText = markdownText;

    for (const suggestion of sortedSuggestions) {
        const start = suggestion.index;
        const end = suggestion.index + suggestion.offset;
        const before = markedText.slice(0, start);
        const flaggedPhrase = markedText.slice(start, end);
        const after = markedText.slice(end);

        markedText = `${before}<mark title="${suggestion.reason}">${flaggedPhrase}</mark>${after}`;
    }

    return markedText;
}

//handle post raw text body
app.post("/notes", onlyContentType("text/plain"), express.text({type: ["text/plain"]}), (req, res) => {
    const name = req.query.name || "Untitled note";
    const content = req.body;

    const saveResult = saveNotes(content);

    if (!saveResult.success) {
        return res.status(400).send(saveResult);
    }

    const result = updateNoteIndex(saveResult.file, name);

    if (!result.success) {
        return res.status(400).json(result);
    }

    res.status(201).send(result);
});

//"text/markdown"
//handle post file
app.post(
    "/notes",
    onlyContentType("multipart/form-data"),
    (req, res) => {
        uploadFile.single("data")(req, res, (err) => {
            if (err) {
                return res.status(400).json({
                    success: false,
                    error: err.message,
                });
            }

            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: "File is required. Use field name: data",
                });
            }

            if (req.file && req.file.size === 0) {
                fs.unlinkSync(req.file.path);

                return res.status(400).json({
                    success: false,
                    error: "File must not be empty",
                });
            }

            const name = req.body.name;

            const result = updateNoteIndex(req.file, name);

            if (!result.success) {
                return res.status(400).json(result);
            }

            res.status(201).json(result);
        });
    }
);

app.get('/notes', (req, res) => {
    const result = listNotes({
        search: req.query.search,
    });

    if (!result.success) {
        return res.status(400).json(result);
    }

    res.status(200).json(result);
});

app.get('/notes/:id/render', (req, res) => {
    const result = getNoteById(req.params.id);

    if (!result.success) {
        return res.status(400).json(result);
    }

    try {
        const suggestions = writeGood(result.fileContent);
        const markedMarkdown = markGrammarSuggestions(result.fileContent, suggestions);
        const html = marked.parse(markedMarkdown);

        res.status(200).send(html);
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message,
        });
    }
});
app.get('/notes/:id/check', (req, res) => {
    const result = getNoteById(req.params.id);
    if (!result.success) {
        return res.status(400).json(result);
    }

    try {
        const check = writeGood(result.fileContent);
        res.status(200).json(check);
    } catch (err) {
        res.status(404).send(err);
    }
});

app.get('/notes/:id', (req, res) => {
    const result = getNoteById(req.params.id);
    if (!result.success) {
        return res.status(400).json(result);
    }

    res.status(200).send(result.fileContent);
});

app.put(
    "/notes/:id",
    onlyContentType("multipart/form-data"),
    uploadMemory.single("data"),
    (req, res) => {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: "File is required. Use field name: data",
            });
        }

        if (req.file.size === 0) {
            return res.status(400).json({
                success: false,
                error: "File must not be empty",
            });
        }

        const name = req.body.name || req.file.originalname;
        // multer's memory storage gives us the file content in a buffer, we need to convert it to string
        const content = req.file.buffer.toString("utf-8");

        const result = putNote(req.params.id, {name, content,});

        if (!result.success) {
            return res.status(400).json(result);
        }

        res.status(200).json(result);
    }
);

app.delete("/notes/:id", (req, res) => {
    const result = deleteNote(req.params.id);

    if (!result.success) {
        if (result.error.includes("does not exist")) {
            return res.status(404).json(result);
        }

        return res.status(400).json(result);
    }

    res.status(204).end();
})



app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
})