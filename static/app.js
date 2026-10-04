const $ = (id) => document.getElementById(id);

let currentDocuments = [];
let investigationHistory = [];

/* =========================
   BASIC HELPERS
========================= */

function escapeHtml(value = "") {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function setStatus(message) {
    const status = $("investigationStatus");
    if (status) {
        status.textContent = message;
    }
}

function setQuestion(question) {
    const input = $("question");
    if (input) {
        input.value = question;
        input.focus();
    }

    showSection("investigation");
}

/* =========================
   SIDEBAR NAVIGATION
========================= */

function showSection(targetId) {
    const target = document.getElementById(targetId);

    if (!target) {
        console.warn("Section not found:", targetId);
        return;
    }

    // Remove active state
    document.querySelectorAll(".nav").forEach((button) => {
        button.classList.remove("active");
    });

    // Activate correct sidebar button
    const activeButton = document.querySelector(
        `.nav[data-target="${targetId}"]`
    );

    if (activeButton) {
        activeButton.classList.add("active");
    }

    // Scroll to section
    target.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

/* Sidebar buttons */
document.querySelectorAll(".nav").forEach((button) => {
    button.addEventListener("click", function (event) {
        event.preventDefault();

        const target = this.dataset.target;

        if (target) {
            showSection(target);
        }
    });
});

/* =========================
   QUICK QUESTION BUTTONS
========================= */

document.querySelectorAll(".quick-action").forEach((button) => {
    button.addEventListener("click", () => {
        const question = button.dataset.question;

        if (question) {
            setQuestion(question);
        }
    });
});

/* =========================
   DOCUMENTS
========================= */

async function refresh() {
    try {
        const response = await fetch("/api/documents");

        if (!response.ok) {
            throw new Error("Could not load documents");
        }

        const data = await response.json();

        currentDocuments = data.documents || data || [];

        renderDocuments(currentDocuments);

        const count = $("documentCount");

        if (count) {
            count.textContent = currentDocuments.length;
        }

    } catch (error) {
        console.error("Document refresh error:", error);
        renderDocuments([]);
    }
}

function renderDocuments(documents) {

    const container = $("documentsList");

    if (!container) {
        console.warn("documentsList not found");
        return;
    }

    if (!documents || documents.length === 0) {

        container.innerHTML = `
            <div class="empty">
                <div class="empty-icon">▤</div>
                <strong>No documents yet</strong>
                <span>Upload PDFs to start investigating.</span>
            </div>
        `;

        return;
    }

    container.innerHTML = documents.map((doc) => {

        const name =
            typeof doc === "string"
                ? doc
                : doc.filename || doc.name || "Document";

        const safeName = escapeHtml(name);

        const encodedName = encodeURIComponent(name);

        return `
            <div class="doc">

                <div class="doc-icon">
                    ▤
                </div>

                <div class="doc-meta">
                    <strong>${safeName}</strong>
                    <span>PDF document</span>
                </div>

                <div class="doc-check">
                    ✓
                </div>

                <button
                    class="remove-doc"
                    type="button"
                    onclick="removeDocument('${encodedName}')"
                    title="Remove document"
                >
                    🗑 Remove
                </button>

            </div>
        `;

    }).join("");
}

/* =========================
   DOCUMENT SEARCH
========================= */

const documentSearch = $("documentSearch");

if (documentSearch) {

    documentSearch.addEventListener("input", () => {

        const query = documentSearch.value
            .toLowerCase()
            .trim();

        if (!query) {
            renderDocuments(currentDocuments);
            return;
        }

        const filtered = currentDocuments.filter((doc) => {

            const name =
                typeof doc === "string"
                    ? doc
                    : doc.filename || doc.name || "";

            return name.toLowerCase().includes(query);

        });

        renderDocuments(filtered);
    });
}

/* =========================
   REMOVE DOCUMENT
========================= */

async function removeDocument(encodedFilename) {

    const filename = decodeURIComponent(encodedFilename);

    const confirmed = confirm(
        `Remove "${filename}" from the workspace?`
    );

    if (!confirmed) {
        return;
    }

    try {

        const response = await fetch(
            `/api/documents/${encodeURIComponent(filename)}`,
            {
                method: "DELETE"
            }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                data.detail || "Could not remove document"
            );
        }

        await refresh();

        setStatus("Document removed");

    } catch (error) {

        console.error("Remove document error:", error);

        alert(
            "Could not remove the document.\n\n" +
            error.message
        );
    }
}

/* =========================
   UPLOAD
========================= */

const fileInput = $("fileInput");
const dropzone = $("dropzone");
const selectedFiles = $("selectedFiles");

if (fileInput) {

    fileInput.addEventListener("change", () => {

        const files = Array.from(fileInput.files || []);

        if (!selectedFiles) return;

        if (files.length === 0) {
            selectedFiles.textContent = "No files selected";
            return;
        }

        selectedFiles.textContent =
            files.map(file => file.name).join(", ");
    });
}

/* Drag and drop */

if (dropzone) {

    ["dragenter", "dragover"].forEach(eventName => {

        dropzone.addEventListener(eventName, (event) => {

            event.preventDefault();

            dropzone.classList.add("drag");
        });
    });

    ["dragleave", "drop"].forEach(eventName => {

        dropzone.addEventListener(eventName, (event) => {

            event.preventDefault();

            dropzone.classList.remove("drag");
        });
    });

    dropzone.addEventListener("drop", (event) => {

        const files = Array.from(
            event.dataTransfer.files || []
        );

        if (!fileInput || !files.length) {
            return;
        }

        const pdfFiles = files.filter(
            file => file.type === "application/pdf" ||
                    file.name.toLowerCase().endsWith(".pdf")
        );

        try {
            const dataTransfer = new DataTransfer();

            pdfFiles.forEach(file => {
                dataTransfer.items.add(file);
            });

            fileInput.files = dataTransfer.files;

            if (selectedFiles) {
                selectedFiles.textContent =
                    pdfFiles.map(file => file.name).join(", ");
            }

        } catch (error) {
            console.error("Drop error:", error);
        }
    });
}

/* =========================
   PROCESS DOCUMENTS
========================= */

const uploadForm = $("uploadForm");

if (uploadForm) {

    uploadForm.addEventListener("submit", async (event) => {

        event.preventDefault();

        if (!fileInput || !fileInput.files.length) {

            alert("Please select at least one PDF.");

            return;
        }

        const files = Array.from(fileInput.files);

        setStatus("Processing documents...");

        try {

            for (const file of files) {

                const formData = new FormData();

                formData.append("file", file);

                const response = await fetch(
                    "/api/upload",
                    {
                        method: "POST",
                        body: formData
                    }
                );

                const data =
                    await response.json().catch(() => ({}));

                if (!response.ok) {

                    throw new Error(
                        data.detail ||
                        `Failed to upload ${file.name}`
                    );
                }
            }

            await refresh();

            setStatus("Documents processed successfully");

            if (fileInput) {
                fileInput.value = "";
            }

            if (selectedFiles) {
                selectedFiles.textContent = "No files selected";
            }

        } catch (error) {

            console.error("Upload error:", error);

            setStatus("Upload failed");

            alert(
                "Upload failed.\n\n" +
                error.message
            );
        }
    });
}

/* =========================
   INVESTIGATION
========================= */

const askButton = $("askButton");

if (askButton) {

    askButton.addEventListener("click", askQuestion);
}

async function askQuestion() {

    const questionInput = $("question");

    if (!questionInput) {
        return;
    }

    const question = questionInput.value.trim();

    if (!question) {

        alert("Please enter a question.");

        questionInput.focus();

        return;
    }

    showSection("investigation");

    setStatus("Investigating...");

    const answerContainer = $("answer");

    if (answerContainer) {

        answerContainer.innerHTML = `
            <div class="muted">
                Investigating your documents...
            </div>
        `;
    }

    try {

        const response = await fetch(
            "/api/ask",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    question: question
                })
            }
        );

        const data =
            await response.json().catch(() => null);

        if (!response.ok) {

            throw new Error(
                data?.detail ||
                data?.message ||
                "Investigation failed"
            );
        }

        if (!data) {
            throw new Error("No response received from server");
        }

        renderInvestigation(data);

        saveHistory(question, data);

        setStatus("Investigation complete");

    } catch (error) {

        console.error("Investigation error:", error);

        setStatus("Investigation failed");

        if (answerContainer) {

            answerContainer.innerHTML = `
                <div class="warn">
                    <strong>Investigation failed</strong>
                    <p>${escapeHtml(error.message)}</p>
                    <span>
                        Make sure the server is running and documents have been uploaded.
                    </span>
                </div>
            `;
        }
    }
}

/* =========================
   RENDER INVESTIGATION
========================= */

function renderInvestigation(data) {

    const answerContainer = $("answer");

    if (!answerContainer) {
        return;
    }

    const answer =
        data.answer ||
        data.result ||
        "No answer returned.";

    answerContainer.innerHTML = `
        <div class="answer-title">
            ✦ INVESTIGATOR ANSWER
        </div>

        <div class="answer-body">
            ${formatAnswer(answer)}
        </div>
    `;

    renderSources(data);

    renderConflict(data);

    renderUncertainty(data);
}

/* =========================
   ANSWER FORMATTER
========================= */

function formatAnswer(answer) {

    if (!answer) {
        return "No answer returned.";
    }

    const text = String(answer);

    const lines = text
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean);

    if (lines.length === 1) {
        return `<p>${escapeHtml(lines[0])}</p>`;
    }

    return lines.map(line => {

        if (
            line.startsWith("•") ||
            line.startsWith("-") ||
            line.startsWith("*")
        ) {

            return `
                <div class="answer-point">
                    ${escapeHtml(line)}
                </div>
            `;
        }

        return `
            <p>${escapeHtml(line)}</p>
        `;

    }).join("");
}

/* =========================
   SOURCES
========================= */

function renderSources(data) {

    const sourceContainer =
        $("sources");

    if (!sourceContainer) {
        return;
    }

    const results =
        data.sources ||
        data.evidence ||
        data.results ||
        [];

    if (!Array.isArray(results) || results.length === 0) {

        sourceContainer.innerHTML = `
            <div class="muted">
                No matching evidence found.
            </div>
        `;

        return;
    }

    sourceContainer.innerHTML = results
        .slice(0, 10)
        .map(item => {

            const document =
                item.doc ||
                item.document ||
                item.filename ||
                "Unknown document";

            const page =
                item.page ||
                item.page_number ||
                "?";

            const text =
                item.text ||
                item.content ||
                "";

            return `
                <div class="source">

                    <b>
                        ${escapeHtml(document)}
                    </b>

                    <span>
                        Page ${escapeHtml(page)}
                    </span>

                    ${
                        text
                            ? `<p>${escapeHtml(text)}</p>`
                            : ""
                    }

                </div>
            `;

        })
        .join("");
}

/* =========================
   CONFLICT
========================= */

function renderConflict(data) {

    const container =
        $("conflict");

    if (!container) {
        return;
    }

    const conflict =
        data.conflict ||
        data.conflicts;

    if (!conflict) {

        container.innerHTML = "";

        return;
    }

    if (typeof conflict === "string") {

        container.innerHTML = `
            <div class="warn">
                ⚠ ${escapeHtml(conflict)}
            </div>
        `;

        return;
    }

    const message =
        conflict.message ||
        "Different values or statements were found across the uploaded documents.";

    const values =
        conflict.values ||
        conflict.amounts ||
        [];

    const documents =
        conflict.documents ||
        conflict.by_document ||
        {};

    container.innerHTML = `
        <div class="warn">

            <strong>⚠ Conflict detected</strong>

            <p>
                ${escapeHtml(message)}
            </p>

            ${
                values.length
                    ? `
                        <div class="conflict-values">
                            ${values.map(value => `
                                <span>
                                    ${escapeHtml(value)}
                                </span>
                            `).join("")}
                        </div>
                    `
                    : ""
            }

            ${
                Object.keys(documents).length
                    ? `
                        <div class="conflict-documents">
                            ${Object.entries(documents)
                                .map(([doc, value]) => `
                                    <div>
                                        • ${escapeHtml(doc)}
                                        → ${escapeHtml(value)}
                                    </div>
                                `)
                                .join("")}
                        </div>
                    `
                    : ""
            }

        </div>
    `;
}

/* =========================
   UNCERTAINTY
========================= */

function renderUncertainty(data) {

    const container =
        $("uncertainty");

    if (!container) {
        return;
    }

    const uncertainty =
        data.uncertainty ||
        data.warning;

    if (!uncertainty) {

        container.innerHTML = "";

        return;
    }

    const message =
        typeof uncertainty === "string"
            ? uncertainty
            : uncertainty.message ||
              "The available evidence may be incomplete.";

    container.innerHTML = `
        <div class="warn">
            <strong>⚠ Uncertainty</strong>
            <p>${escapeHtml(message)}</p>
        </div>
    `;
}

/* =========================
   HISTORY
========================= */

function saveHistory(question, data) {

    const item = {
        question,
        answer:
            data?.answer ||
            data?.result ||
            "No answer returned.",
        timestamp: new Date().toLocaleString()
    };

    investigationHistory.unshift(item);

    investigationHistory =
        investigationHistory.slice(0, 20);

    localStorage.setItem(
        "docxray_history",
        JSON.stringify(investigationHistory)
    );

    renderHistory();
}

function loadHistory() {

    try {

        investigationHistory =
            JSON.parse(
                localStorage.getItem(
                    "docxray_history"
                ) || "[]"
            );

    } catch {

        investigationHistory = [];
    }

    renderHistory();
}

function renderHistory() {

    const container =
        $("historyList");

    if (!container) {
        return;
    }

    if (!investigationHistory.length) {

        container.innerHTML = `
            <div class="empty">
                <div class="empty-icon">◷</div>
                <strong>No investigations yet</strong>
                <span>Your recent questions will appear here.</span>
            </div>
        `;

        return;
    }

    container.innerHTML =
        investigationHistory
            .map((item, index) => `
                <div class="history-item">

                    <div>
                        <strong>
                            ${escapeHtml(item.question)}
                        </strong>

                        <span>
                            ${escapeHtml(item.timestamp)}
                        </span>
                    </div>

                    <button
                        type="button"
                        onclick="reuseHistory(${index})"
                    >
                        Reuse
                    </button>

                </div>
            `)
            .join("");
}

function reuseHistory(index) {

    const item =
        investigationHistory[index];

    if (!item) {
        return;
    }

    setQuestion(item.question);
}

/* =========================
   CLEAR WORKSPACE
========================= */

const clearButton = $("clearWorkspace");

if (clearButton) {

    clearButton.addEventListener(
        "click",
        async () => {

            const confirmed = confirm(
                "Clear all uploaded documents and workspace data?"
            );

            if (!confirmed) {
                return;
            }

            try {

                const response =
                    await fetch(
                        "/api/reset",
                        {
                            method: "POST"
                        }
                    );

                if (!response.ok) {
                    throw new Error(
                        "Could not clear workspace"
                    );
                }

                await refresh();

                setStatus(
                    "Workspace cleared"
                );

            } catch (error) {

                console.error(error);

                alert(
                    "Could not clear workspace.\n\n" +
                    error.message
                );
            }
        }
    );
}

/* =========================
   KEYBOARD SHORTCUT
========================= */

const questionInput =
    $("question");

if (questionInput) {

    questionInput.addEventListener(
        "keydown",
        (event) => {

            if (
                event.ctrlKey &&
                event.key === "Enter"
            ) {

                event.preventDefault();

                askQuestion();
            }
        }
    );
}

/* =========================
   GLOBAL FUNCTIONS
========================= */

window.setQuestion = setQuestion;
window.showSection = showSection;
window.removeDocument = removeDocument;
window.reuseHistory = reuseHistory;
window.askQuestion = askQuestion;

/* =========================
   INITIAL LOAD
========================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        loadHistory();
        refresh();

        // Set Overview active initially
        const overviewButton =
            document.querySelector(
                '.nav[data-target="overview"]'
            );

        if (overviewButton) {
            overviewButton.classList.add("active");
        }
    }
);