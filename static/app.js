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
   NAVIGATION
========================= */

function showSection(targetId) {

    const target = $(targetId);

    if (!target) {
        console.warn("Section not found:", targetId);
        return;
    }

    document.querySelectorAll(".nav").forEach((button) => {

        button.classList.remove("active");

        if (button.dataset.target === targetId) {
            button.classList.add("active");
        }
    });

    target.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

window.showSection = showSection;
window.setQuestion = setQuestion;

/* =========================
   QUICK QUESTIONS
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

        currentDocuments = Array.isArray(data.documents)
            ? data.documents
            : [];

        renderDocuments(currentDocuments);

        const count = $("docCount");

        if (count) {
            count.textContent = currentDocuments.length;
        }

    } catch (error) {

        console.error("Document refresh error:", error);

        currentDocuments = [];

        renderDocuments([]);
    }
}

function renderDocuments(documents) {

    const container = $("docs");

    if (!container) {
        console.warn("Element #docs not found");
        return;
    }

    if (!documents.length) {

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

        const encodedName =
            encodeURIComponent(name);

        const pages =
            doc.pages
                ? `${doc.pages} page${doc.pages > 1 ? "s" : ""}`
                : "PDF document";

        return `
            <div class="doc">

                <div class="doc-icon">
                    ▤
                </div>

                <div class="doc-meta">
                    <strong>${safeName}</strong>
                    <span>${pages}</span>
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

        const query =
            documentSearch.value
                .toLowerCase()
                .trim();

        if (!query) {
            renderDocuments(currentDocuments);
            return;
        }

        const filtered =
            currentDocuments.filter((doc) => {

                const name =
                    typeof doc === "string"
                        ? doc
                        : doc.filename || doc.name || "";

                return name
                    .toLowerCase()
                    .includes(query);
            });

        renderDocuments(filtered);
    });
}

/* =========================
   REMOVE DOCUMENT
========================= */

async function removeDocument(encodedFilename) {

    const filename =
        decodeURIComponent(encodedFilename);

    const confirmed =
        confirm(
            `Remove "${filename}" from the workspace?`
        );

    if (!confirmed) {
        return;
    }

    try {

        const response =
            await fetch(
                `/api/documents/${encodeURIComponent(filename)}`,
                {
                    method: "DELETE"
                }
            );

        const data =
            await response
                .json()
                .catch(() => ({}));

        if (!response.ok) {

            throw new Error(
                data.detail ||
                "Could not remove document"
            );
        }

        await refresh();

        setStatus("Document removed");

    } catch (error) {

        console.error(
            "Remove document error:",
            error
        );

        alert(
            "Could not remove the document.\n\n" +
            error.message
        );
    }
}

window.removeDocument = removeDocument;

/* =========================
   UPLOAD
========================= */

const fileInput = $("files");

const uploadButton =
    $("uploadBtn");

const dropzone =
    $("dropzone");

const selectedFiles =
    $("selectedFiles");

if (fileInput) {

    fileInput.addEventListener(
        "change",
        () => {

            const files =
                Array.from(
                    fileInput.files || []
                );

            if (!selectedFiles) {
                return;
            }

            if (!files.length) {

                selectedFiles.textContent =
                    "No files selected";

                return;
            }

            selectedFiles.textContent =
                files
                    .map(file => file.name)
                    .join(", ");
        }
    );
}

/* =========================
   DRAG AND DROP
========================= */

if (dropzone) {

    ["dragenter", "dragover"]
        .forEach(eventName => {

            dropzone.addEventListener(
                eventName,
                (event) => {

                    event.preventDefault();

                    dropzone.classList.add(
                        "drag"
                    );
                }
            );
        });

    ["dragleave", "drop"]
        .forEach(eventName => {

            dropzone.addEventListener(
                eventName,
                (event) => {

                    event.preventDefault();

                    dropzone.classList.remove(
                        "drag"
                    );
                }
            );
        });

    dropzone.addEventListener(
        "drop",
        (event) => {

            const files =
                Array.from(
                    event.dataTransfer.files || []
                );

            const pdfFiles =
                files.filter(
                    file =>
                        file.type ===
                            "application/pdf" ||
                        file.name
                            .toLowerCase()
                            .endsWith(".pdf")
                );

            if (
                !fileInput ||
                !pdfFiles.length
            ) {
                return;
            }

            try {

                const dataTransfer =
                    new DataTransfer();

                pdfFiles.forEach(file => {

                    dataTransfer.items.add(
                        file
                    );
                });

                fileInput.files =
                    dataTransfer.files;

                if (selectedFiles) {

                    selectedFiles.textContent =
                        pdfFiles
                            .map(
                                file => file.name
                            )
                            .join(", ");
                }

            } catch (error) {

                console.error(
                    "Drop error:",
                    error
                );
            }
        }
    );
}

/* =========================
   PROCESS DOCUMENTS
========================= */

if (uploadButton) {

    uploadButton.addEventListener(
        "click",
        async () => {

            if (
                !fileInput ||
                !fileInput.files.length
            ) {

                alert(
                    "Please select at least one PDF."
                );

                return;
            }

            const files =
                Array.from(
                    fileInput.files
                );

            setStatus(
                "Processing documents..."
            );

            uploadButton.disabled = true;

            try {

                for (const file of files) {

                    const formData =
                        new FormData();

                    formData.append(
                        "files",
                        file
                    );

                    const response =
                        await fetch(
                            "/api/upload",
                            {
                                method: "POST",
                                body: formData
                            }
                        );

                    const data =
                        await response
                            .json()
                            .catch(
                                () => ({})
                            );

                    if (!response.ok) {

                        const errorMessage =
                            typeof data.detail ===
                            "string"
                                ? data.detail
                                : data.detail
                                    ? JSON.stringify(
                                        data.detail
                                    )
                                    : `Failed to upload ${file.name}`;

                        throw new Error(
                            errorMessage
                        );
                    }
                }

                await refresh();

                setStatus(
                    "Documents processed successfully"
                );

                fileInput.value = "";

                if (selectedFiles) {

                    selectedFiles.textContent =
                        "No files selected";
                }

                alert(
                    "Documents uploaded successfully!"
                );

            } catch (error) {

                console.error(
                    "Upload error:",
                    error
                );

                setStatus(
                    "Upload failed"
                );

                alert(
                    "Upload failed.\n\n" +
                    error.message
                );

            } finally {

                uploadButton.disabled = false;
            }
        }
    );
}

/* =========================
   INVESTIGATION
========================= */

const askButton =
    $("askBtn");

if (askButton) {

    askButton.addEventListener(
        "click",
        askQuestion
    );
}

/* =========================
   ASK QUESTION
========================= */

async function askQuestion() {

    const questionInput =
        $("question");

    if (!questionInput) {

        alert(
            "Question input not found."
        );

        return;
    }

    const question =
        questionInput.value.trim();

    if (!question) {

        alert(
            "Please enter a question."
        );

        questionInput.focus();

        return;
    }

    showSection(
        "investigation"
    );

    setStatus(
        "Investigating..."
    );

    const resultContainer =
        $("result");

    if (resultContainer) {

        resultContainer.innerHTML = `
            <div class="muted">
                Investigating your documents...
            </div>
        `;
    }

    try {

        const response =
            await fetch(
                "/api/ask",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        question: question
                    })
                }
            );

        const data =
            await response
                .json()
                .catch(() => null);

        if (!response.ok) {

            throw new Error(
                data?.detail ||
                data?.message ||
                "Investigation failed"
            );
        }

        if (!data) {

            throw new Error(
                "No response received from server"
            );
        }

        /*
         * BACKEND RESPONSE:
         *
         * {
         *   "success": true,
         *   "result": {
         *      "answer": "...",
         *      "sources": [],
         *      "conflict": {},
         *      "uncertainty": {}
         *   }
         * }
         */

        const result =
            data.result || data;

        renderInvestigation(
            result
        );

        saveHistory(
            question,
            result
        );

        setStatus(
            "Investigation complete"
        );

    } catch (error) {

        console.error(
            "Investigation error:",
            error
        );

        setStatus(
            "Investigation failed"
        );

        if (resultContainer) {

            resultContainer.innerHTML = `
                <div class="warn">

                    <strong>
                        Investigation failed
                    </strong>

                    <p>
                        ${escapeHtml(
                            error.message
                        )}
                    </p>

                    <span>
                        Make sure documents have been uploaded and try again.
                    </span>

                </div>
            `;
        }
    }
}

/* =========================
   RENDER INVESTIGATION
========================= */

function renderInvestigation(
    result
) {

    const container =
        $("result");

    if (!container) {

        console.warn(
            "Element #result not found"
        );

        return;
    }

    const answer =
        result?.answer ||
        "No answer returned.";

    const sources =
        Array.isArray(
            result?.sources
        )
            ? result.sources
            : [];

    const conflict =
        result?.conflict;

    const uncertainty =
        result?.uncertainty;

    let html = `

        <div class="investigation-result">

            <div class="answer-title">
                ✦ INVESTIGATOR ANSWER
            </div>

            <div class="answer-body">
                ${formatAnswer(answer)}
            </div>

    `;

    /* =========================
       SOURCES
    ========================= */

    html += `

        <div class="result-block">

            <h4>
                📄 Sources & Evidence
            </h4>

    `;

    if (!sources.length) {

        html += `

            <div class="muted">
                No matching evidence found.
            </div>

        `;

    } else {

        html +=
            sources
                .slice(0, 10)
                .map(item => {

                    const documentName =
                        item?.doc ||
                        item?.document ||
                        item?.filename ||
                        "Unknown document";

                    const page =
                        item?.page ||
                        item?.page_number ||
                        "?";

                    const text =
                        item?.text ||
                        item?.content ||
                        "";

                    return `

                        <div class="source">

                            <b>
                                ${escapeHtml(
                                    documentName
                                )}
                            </b>

                            <span>
                                Page
                                ${escapeHtml(page)}
                            </span>

                            ${
                                text
                                    ? `
                                        <p>
                                            ${escapeHtml(
                                                text
                                            )}
                                        </p>
                                      `
                                    : ""
                            }

                        </div>

                    `;

                })
                .join("");
    }

    html += `</div>`;

    /* =========================
       CONFLICT
    ========================= */

    if (conflict) {

        const message =
            typeof conflict === "string"
                ? conflict
                : conflict.message ||
                  "Different values or statements were found across the uploaded documents.";

        let conflictDetails = "";

        if (
            typeof conflict ===
            "object"
        ) {

            const values =
                conflict.values ||
                conflict.amounts ||
                [];

            const documents =
                conflict.documents ||
                conflict.by_document ||
                {};

            if (values.length) {

                conflictDetails += `

                    <div class="conflict-values">

                        ${values
                            .map(
                                value => `
                                    <span>
                                        ${escapeHtml(
                                            value
                                        )}
                                    </span>
                                `
                            )
                            .join("")}

                    </div>

                `;
            }

            if (
                Object.keys(
                    documents
                ).length
            ) {

                conflictDetails += `

                    <div class="conflict-documents">

                        ${
                            Object.entries(
                                documents
                            )
                                .map(
                                    ([doc, value]) => `
                                        <div>
                                            •
                                            ${escapeHtml(
                                                doc
                                            )}
                                            →
                                            ${escapeHtml(
                                                value
                                            )}
                                        </div>
                                    `
                                )
                                .join("")
                        }

                    </div>

                `;
            }
        }

        html += `

            <div class="result-block">

                <div class="warn">

                    <strong>
                        ⚠ Conflict detected
                    </strong>

                    <p>
                        ${escapeHtml(
                            message
                        )}
                    </p>

                    ${conflictDetails}

                </div>

            </div>

        `;
    }

    /* =========================
       UNCERTAINTY
    ========================= */

    if (uncertainty) {

        const message =
            typeof uncertainty === "string"
                ? uncertainty
                : uncertainty.message ||
                  "The available evidence may be incomplete.";

        html += `

            <div class="result-block">

                <div class="warn">

                    <strong>
                        ⚠ Uncertainty
                    </strong>

                    <p>
                        ${escapeHtml(
                            message
                        )}
                    </p>

                </div>

            </div>

        `;
    }

    html += `</div>`;

    container.innerHTML =
        html;
}

/* =========================
   ANSWER FORMATTER
========================= */

function formatAnswer(
    answer
) {

    if (!answer) {

        return "No answer returned.";
    }

    const lines =
        String(answer)
            .split("\n")
            .map(
                line =>
                    line.trim()
            )
            .filter(Boolean);

    if (lines.length === 1) {

        return `
            <p>
                ${escapeHtml(
                    lines[0]
                )}
            </p>
        `;
    }

    return lines
        .map(line => {

            if (
                line.startsWith("•") ||
                line.startsWith("-") ||
                line.startsWith("*")
            ) {

                return `

                    <div class="answer-point">
                        ${escapeHtml(
                            line
                        )}
                    </div>

                `;
            }

            return `

                <p>
                    ${escapeHtml(
                        line
                    )}
                </p>

            `;
        })
        .join("");
}

/* =========================
   HISTORY
========================= */

/*
 * IMPORTANT:
 * History stores ONLY:
 * - question
 * - timestamp
 *
 * It does NOT store the full answer.
 * This prevents the history card from becoming
 * a long mixture of answer + sources + citations.
 */

function saveHistory(
    question,
    result
) {

    const item = {

        question: question,

        timestamp:
            new Date()
                .toLocaleString()
    };

    investigationHistory.unshift(
        item
    );

    investigationHistory =
        investigationHistory.slice(
            0,
            20
        );

    /*
     * New storage key so old broken
     * history data is ignored.
     */
    localStorage.setItem(
        "docxray_history_v2",
        JSON.stringify(
            investigationHistory
        )
    );

    renderHistory();
}


function loadHistory() {

    try {

        investigationHistory =
            JSON.parse(
                localStorage.getItem(
                    "docxray_history_v2"
                ) || "[]"
            );

        if (
            !Array.isArray(
                investigationHistory
            )
        ) {

            investigationHistory = [];
        }

    } catch (error) {

        console.error(
            "History loading error:",
            error
        );

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

    if (
        !investigationHistory.length
    ) {

        container.innerHTML = `

            <div class="empty">

                <div class="empty-icon">
                    ◷
                </div>

                <strong>
                    No investigations yet
                </strong>

                <span>
                    Your recent questions will appear here.
                </span>

            </div>

        `;

        return;
    }

    container.innerHTML =
        investigationHistory
            .map(
                (item, index) => `

                    <div class="history-item">

                        <div>

                            <strong>
                                ${escapeHtml(
                                    item.question
                                )}
                            </strong>

                            <span>
                                ${escapeHtml(
                                    item.timestamp
                                )}
                            </span>

                        </div>

                        <button
                            type="button"
                            onclick="reuseHistory(${index})"
                        >
                            Reuse
                        </button>

                    </div>

                `
            )
            .join("");
}


function reuseHistory(
    index
) {

    const item =
        investigationHistory[index];

    if (!item) {
        return;
    }

    setQuestion(
        item.question
    );
}

window.reuseHistory =
    reuseHistory;

/* =========================
   CLEAR WORKSPACE
========================= */

const clearButton =
    $("clearWorkspace");

if (clearButton) {

    clearButton.addEventListener(
        "click",
        async () => {

            const confirmed =
                confirm(
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

                console.error(
                    error
                );

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
   INITIAL LOAD
========================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        loadHistory();

        refresh();

        const overviewButton =
            document.querySelector(
                '.nav[data-target="overview"]'
            );

        if (overviewButton) {

            overviewButton.classList.add(
                "active"
            );
        }
    }
);