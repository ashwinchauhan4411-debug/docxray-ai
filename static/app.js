const $ = (id) => document.getElementById(id);

let currentDocuments = [];


/* =====================================================
   HELPERS
===================================================== */

function escapeHtml(value = "") {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function setQuestion(question) {
    const box = $("question");

    if (box) {
        box.value = question;
        box.focus();
    }
}


/* =====================================================
   DOCUMENT REFRESH
===================================================== */

async function refresh() {

    try {

        const response = await fetch("/api/documents");

        const data = await response.json();

        currentDocuments = data.documents || [];

        $("docCount").textContent =
            currentDocuments.length;

        renderDocuments();

        $("status").textContent = "Ready";

    } catch (error) {

        console.error("Refresh error:", error);

        $("status").textContent =
            "Server error";
    }
}


/* =====================================================
   RENDER DOCUMENTS
===================================================== */

function renderDocuments() {

    const container = $("docs");

    if (!container) return;


    if (!currentDocuments.length) {

        container.innerHTML = `
            <div class="empty">

                <div class="empty-icon">▤</div>

                <strong>No documents yet</strong>

                <span>
                    Upload PDFs to start investigating.
                </span>

            </div>
        `;

        return;
    }


    container.innerHTML =
        currentDocuments.map((doc) => {

            const filename =
                typeof doc === "string"
                    ? doc
                    : doc.filename;

            const pages =
                typeof doc === "object"
                    ? doc.pages || 0
                    : 0;

            return `
                <div class="doc">

                    <div class="doc-icon">
                        PDF
                    </div>

                    <div class="doc-meta">

                        <strong title="${escapeHtml(filename)}">
                            ${escapeHtml(filename)}
                        </strong>

                        <span>
                            ${pages} page(s) • Indexed and ready
                        </span>

                    </div>

                    <div class="doc-check">
                        ✓
                    </div>

                    <button
                        class="remove-doc"
                        onclick="removeDocument('${encodeURIComponent(filename)}')"
                    >
                        🗑 Remove
                    </button>

                </div>
            `;

        }).join("");
}


/* =====================================================
   REMOVE DOCUMENT
===================================================== */

async function removeDocument(encodedFilename) {

    const filename =
        decodeURIComponent(encodedFilename);


    if (!confirm(
        `Remove "${filename}"?`
    )) {
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
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.detail ||
                "Could not remove document."
            );
        }


        await refresh();


    } catch (error) {

        console.error(error);

        alert(error.message);
    }
}


/* =====================================================
   FILE SELECTION
===================================================== */

const filesInput =
    $("files");


if (filesInput) {

    filesInput.addEventListener(
        "change",
        () => {

            const files =
                [...filesInput.files];


            $("selectedFiles").textContent =
                files.length
                    ? files
                        .map(file => file.name)
                        .join(" • ")
                    : "";


            $("uploadMsg").textContent =
                files.length
                    ? `${files.length} PDF${files.length > 1 ? "s" : ""} selected`
                    : "No files selected";
        }
    );
}


/* =====================================================
   DRAG & DROP
===================================================== */

const dropzone =
    $("dropzone");


if (dropzone) {

    ["dragenter", "dragover"].forEach(
        eventName => {

            dropzone.addEventListener(
                eventName,
                (event) => {

                    event.preventDefault();

                    dropzone.classList.add("drag");
                }
            );

        }
    );


    ["dragleave", "drop"].forEach(
        eventName => {

            dropzone.addEventListener(
                eventName,
                (event) => {

                    event.preventDefault();

                    dropzone.classList.remove("drag");
                }
            );

        }
    );


    dropzone.addEventListener(
        "drop",
        (event) => {

            const droppedFiles =
                event.dataTransfer.files;


            if (
                droppedFiles &&
                droppedFiles.length
            ) {

                filesInput.files =
                    droppedFiles;


                filesInput.dispatchEvent(
                    new Event("change")
                );
            }
        }
    );
}


/* =====================================================
   UPLOAD / PROCESS DOCUMENTS
===================================================== */

const uploadButton =
    $("uploadBtn");


if (uploadButton) {

    uploadButton.onclick =
        async () => {

            const files =
                filesInput.files;


            if (!files.length) {

                alert(
                    "Please select PDF files first."
                );

                return;
            }


            uploadButton.disabled = true;

            $("status").textContent =
                "Processing...";

            $("uploadMsg").textContent =
                "Uploading and indexing documents...";


            const formData =
                new FormData();


            for (const file of files) {

                formData.append(
                    "files",
                    file
                );
            }


            try {

                const response =
                    await fetch(
                        "/api/upload",
                        {
                            method: "POST",
                            body: formData
                        }
                    );


                const data =
                    await response.json();


                if (!response.ok) {

                    throw new Error(
                        data.detail ||
                        "Upload failed."
                    );
                }


                const uploaded =
                    data.uploaded || [];


                $("uploadMsg").textContent =
                    `Processed ${uploaded.length} document(s) successfully.`;


                filesInput.value = "";

                $("selectedFiles").textContent =
                    "";


                await refresh();


            } catch (error) {

                console.error(
                    "Upload error:",
                    error
                );


                $("uploadMsg").textContent =
                    "Upload failed.";


                alert(
                    error.message
                );


            } finally {

                uploadButton.disabled = false;

                $("status").textContent =
                    "Ready";
            }
        };
}


/* =====================================================
   INVESTIGATION
===================================================== */

const askButton =
    $("askBtn");


if (askButton) {

    askButton.onclick =
        async () => {

            const question =
                $("question")
                    .value
                    .trim();


            if (!question) {

                alert(
                    "Please enter a question."
                );

                return;
            }


            askButton.disabled = true;

            $("status").textContent =
                "Investigating...";


            $("result").innerHTML = `

                <div class="answer">

                    <b>✦ INVESTIGATOR</b>

                    <p>
                        Searching your evidence library...
                    </p>

                </div>

            `;


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
                    await response.json();


                console.log(
                    "API RESPONSE:",
                    data
                );


                if (!response.ok) {

                    throw new Error(
                        data.detail ||
                        "Investigation failed."
                    );
                }


                /*
                 * Backend structure:
                 *
                 * {
                 *   success: true,
                 *   result: {
                 *      answer,
                 *      sources,
                 *      conflict,
                 *      uncertainty
                 *   }
                 * }
                 */

                const result =
                    data.result;


                if (!result) {

                    throw new Error(
                        "No investigation result returned."
                    );
                }


                renderResult(
                    result
                );


            } catch (error) {

                console.error(
                    "Investigation error:",
                    error
                );


                $("result").innerHTML = `

                    <div class="warn">

                        <b>
                            Investigation failed
                        </b>

                        <br><br>

                        ${escapeHtml(
                            error.message
                        )}

                    </div>

                `;


            } finally {

                askButton.disabled = false;

                $("status").textContent =
                    "Ready";
            }
        };
}


/* =====================================================
   RENDER RESULT
===================================================== */

function renderResult(result) {

    const answer =
        result.answer ||
        "No answer returned.";


    const sources =
        Array.isArray(result.sources)
            ? result.sources
            : [];


    let html = `

        <div class="answer">

            <b>✦ INVESTIGATOR ANSWER</b>

            <div style="
                margin-top:12px;
                line-height:1.8;
            ">

                ${formatAnswer(answer)}

            </div>

        </div>

    `;


    /* =================================================
       CONFLICT
    ================================================= */

    if (result.conflict) {

        const conflict =
            result.conflict;


        html += `

            <div class="warn">

                <b>
                    ⚠ ${escapeHtml(
                        conflict.title ||
                        "Conflict detected"
                    )}
                </b>

                <br><br>

                ${escapeHtml(
                    conflict.message ||
                    "Different values were found in the supporting documents."
                )}

        `;


        if (
            conflict.values &&
            conflict.values.length
        ) {

            html += `

                <div style="
                    display:flex;
                    flex-wrap:wrap;
                    gap:8px;
                    margin-top:12px;
                ">

            `;


            conflict.values.forEach(
                value => {

                    html += `

                        <span style="
                            padding:7px 11px;
                            border-radius:8px;
                            background:#3a2b13;
                            border:1px solid #6d4b18;
                            color:#f3d58d;
                            font-weight:700;
                        ">
                            ${escapeHtml(value)}
                        </span>

                    `;
                }
            );


            html += `</div>`;
        }


        if (conflict.documents) {

            html += `
                <div style="
                    margin-top:12px;
                    line-height:1.7;
                ">
            `;


            Object.entries(
                conflict.documents
            ).forEach(
                ([document, values]) => {

                    html += `

                        <div>
                            • ${escapeHtml(document)}
                            → ${escapeHtml(
                                values.join(", ")
                            )}
                        </div>

                    `;
                }
            );


            html += `</div>`;
        }


        html += `</div>`;
    }


    /* =================================================
       UNCERTAINTY
    ================================================= */

    if (result.uncertainty) {

        html += `

            <div class="warn">

                <b>
                    ◇ ${escapeHtml(
                        result.uncertainty.title ||
                        "Uncertainty detected"
                    )}
                </b>

                <br><br>

                ${escapeHtml(
                    result.uncertainty.message ||
                    "The available evidence may not be sufficient."
                )}

            </div>

        `;
    }


    /* =================================================
       SOURCES
    ================================================= */

    html += `

        <div class="answer">

            <b>
                ◈ EVIDENCE & SOURCES
            </b>

    `;


    if (!sources.length) {

        html += `

            <p class="muted">
                No matching evidence found.
            </p>

        `;

    } else {

        sources.forEach(
            source => {

                html += `

                    <div class="source">

                        <b>
                            ▣ ${escapeHtml(
                                source.doc ||
                                "Document"
                            )}
                        </b>

                        <span>
                            — Page ${escapeHtml(
                                source.page ||
                                "?"
                            )}
                        </span>

                        <br><br>

                        ${escapeHtml(
                            source.text ||
                            ""
                        )}

                    </div>

                `;
            }
        );
    }


    html += `</div>`;


    $("result").innerHTML =
        html;
}


/* =====================================================
   FORMAT ANSWER
===================================================== */

function formatAnswer(answer) {

    return String(answer)
        .split("\n")
        .filter(line => line.trim())
        .map(line => {

            const clean =
                line.replace(
                    /^•\s*/,
                    ""
                );


            return `

                <div style="
                    margin:8px 0;
                ">

                    <span style="
                        color:#a978ff;
                        font-weight:700;
                    ">
                        •
                    </span>

                    ${escapeHtml(clean)}

                </div>

            `;
        })
        .join("");
}


/* =====================================================
   INITIAL LOAD
===================================================== */

window.setQuestion =
    setQuestion;


window.removeDocument =
    removeDocument;


refresh();