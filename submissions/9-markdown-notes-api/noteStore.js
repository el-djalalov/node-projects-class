const path = require("path");
const fs = require("fs");

const multer = require('multer');

const notesPath = path.resolve(__dirname, "./notes");
const notesIndexPath = path.resolve(notesPath, "./index.json");

let notes;


function getNextId() {
    return notes.length === 0 ? 1 : Math.max(...notes.map(note => note.id)) + 1;
}

function getNotePath(id) {
    return `note-${id}.md`;
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, notesPath)
    },
    filename: function (req, file, cb) {
        const fileId = getNextId();
        const fileName = getNotePath(fileId);
        cb(null, fileName);
    }
})

function markdownFileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();

    if (ext !== ".md") {
        return cb(new Error("Only .md files are allowed"));
    }

    cb(null, true);
}

const uploadFile = multer({
    storage,
    fileFilter: markdownFileFilter,
});

// For cases where we want to handle the file content directly without saving to disk
const uploadMemory = multer({
    storage: multer.memoryStorage(),
    fileFilter: markdownFileFilter,
});

ensureNotesData();

function ensureNotesData() {
    if (!fs.existsSync(notesPath)) {
        fs.mkdirSync(notesPath, { recursive: true });
    }

    if (!fs.existsSync(notesIndexPath)) {
        notes = [];
        saveNotesData();
        return notes;
    }

    try {
        const raw = fs.readFileSync(notesIndexPath, "utf-8");

        if (raw.trim() === "") {
            notes = [];
            saveNotesData();
            return notes;
        }

        const parsedNotes = JSON.parse(raw);

        if (!Array.isArray(parsedNotes)) {
            notes = [];
            saveNotesData();
            return notes;
        }

        notes = parsedNotes;
        return notes;
    } catch {
        notes = [];
        saveNotesData();
        return notes;
    }
}

function saveNotesData() {
    fs.writeFileSync(notesIndexPath, JSON.stringify(notes, null, 2));
}

function saveNotes(content) {

    if (!content || content.trim() === "") {
        return {
            success: false,
            error: "No data to save",
        }
    }

    const fileId = getNextId();
    const fileName = getNotePath(fileId);
    const encoding = 'utf-8'
    const mimetype = 'text/markdown';
    const destination = path.resolve(notesPath, fileName);
    fs.writeFileSync(destination, content, {encoding: encoding});

    return {
        success: true,
        file: {
            fieldname: fileName,
            originalname: fileName,
            encoding: encoding,
            mimetype: mimetype,
            destination: notesPath,
            filename: fileName,
            path: destination,
            size: 0
        }
    }
}

function validateId(id) {
    if (!id) {
        return {
            valid: false,
            error: "Missing ID",
        };
    }

    const noteId = Number(id);

    if (Number.isNaN(noteId)) {
        return {
            valid: false,
            error: `ID must be a number. Received: "${id}"`,
        };
    }

    return {
        valid: true,
        noteId,
    };
}

/**
 *
 * @param file {{fieldname: string, originalname: string, encoding: string, mimetype: string, destination: string, filename: string, path: string, size: number}}
 * @param name
 * @returns {{success: boolean, note: {id: number, name: any, createdAt: string, updatedAt: string}}}
 */
function updateNoteIndex(file, name) {
    if (!file) {
        return {
            success: false,
            error: "Missing file",
        };
    }
    //
    // if (!name) {
    //     return {
    //         success: false,
    //         error: "Missing name",
    //     }
    // }

    const now = new Date().toISOString();

    const note = {
        id: getNextId(),
        name: name || file.originalname,
        createdAt: now,
        updatedAt: now,
    };

    notes.push(note);

    saveNotesData();

    return {
        success: true,
        note,
    };
}

function listNotes(options = {}) {

    const {search} = options;
    const filteredNotes = [];

    if (search && search.trim()) {

        const normalizedSearch = search.trim().toLowerCase();

        for (const note of notes) {
            if (note.name && note.name.toLowerCase().includes(normalizedSearch)) {
                filteredNotes.push(note);
                continue;
            }
            const content = getNoteContentById(note.id).toLowerCase();
            if (content.includes(normalizedSearch)) {
                filteredNotes.push(note);
            }
        }

        return {
            success: true,
            notes: filteredNotes,
        }
    }
    return {
        success: true,
        notes,
    };

}

function getNoteById(id) {
    const idCheck = validateId(id);

    if (!idCheck.valid) {
        return idCheck;
    }

    const idAsNumber = idCheck.noteId;

    const fileMetadata = notes.find(note => note.id === idAsNumber);

    if (!fileMetadata) {
        return {
            success: false,
            error: "Missing file",
        }
    }

    const text = getNoteContentById(idAsNumber);

    return {...fileMetadata, success: true, fileContent: text};
}

function getNoteContentById(id) {
    const fileContent = fs.readFileSync(path.resolve(notesPath, getNotePath(id)));
    const decoder = new TextDecoder("utf-8");
    return  decoder.decode(fileContent);
}

function deleteNote(id) {
    const idCheck = validateId(id);

    if (!idCheck.valid) {
        return idCheck;
    }


    const note = notes.find(note => note.id === idCheck.noteId);

    if (!note) {
        return {
            success: false,
            error: `Note with ID ${id} does not exist.`,
        };
    }

    const notePath = path.resolve(notesPath, getNotePath(idCheck.noteId));

    if (fs.existsSync(notePath)) {
        fs.unlinkSync(notePath);
    }

    // remove the note with the specified ID
    notes = notes.filter(note => note.id !== idCheck.noteId);

    saveNotesData();

    return {
        success: true,
        notes,
    };
}

function putNote(id, newNote) {
    const idCheck = validateId(id);

    if (!idCheck.valid) {
        return {
            success: false,
            error: idCheck.error,
        };
    }

    if (!newNote.name || newNote.name.trim() === "") {
        return {
            success: false,
            error: "Name is required",
        };
    }

    if (typeof newNote.content !== "string" || newNote.content.trim() === "") {
        return {
            success: false,
            error: "Content is required",
        };
    }

    const existingNote = notes.find(note => note.id === idCheck.noteId);

    if (!existingNote) {
        return {
            success: false,
            error: `Note with ID ${id} does not exist.`,
        };
    }

    const updatedNote = {
        ...existingNote,
        name: newNote.name.trim(),
        updatedAt: new Date().toISOString(),
    };

     // update the content of the note file
    fs.writeFileSync(
        path.resolve(notesPath, getNotePath(idCheck.noteId)),
        newNote.content
    );


    notes = notes.map(note =>
        note.id === idCheck.noteId ? updatedNote : note
    );

    saveNotesData();

    return {
        success: true,
        note: updatedNote,
    };
}

module.exports = {
    updateNoteIndex,
    listNotes,
    getNoteById,
    uploadFile,
    saveNotes,
    putNote,
    deleteNote,
    uploadMemory,
}

