import os
import re
import shutil
from pathlib import Path
from typing import List, Dict

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from pypdf import PdfReader

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


# =========================================================
# CONFIG
# =========================================================

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
STATIC_DIR = BASE_DIR / "static"

UPLOAD_DIR.mkdir(exist_ok=True)
STATIC_DIR.mkdir(exist_ok=True)

app = FastAPI(title="DocX-Ray AI")


# =========================================================
# GLOBAL DATA
# =========================================================

documents: Dict[str, Dict] = {}
chunks: List[Dict] = []

vectorizer = None
matrix = None


# =========================================================
# REQUEST MODEL
# =========================================================

class AskRequest(BaseModel):
    question: str


# =========================================================
# TEXT HELPERS
# =========================================================

def clean_text(text: str) -> str:
    text = text.replace("\x00", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def split_sentences(text: str) -> List[str]:
    text = clean_text(text)

    if not text:
        return []

    sentences = re.split(r"(?<=[.!?])\s+", text)

    return [
        sentence.strip()
        for sentence in sentences
        if sentence.strip()
    ]


def extract_numbers(text: str) -> List[str]:
    """
    Extract monetary and numeric values.

    Examples:
    ₹2,00,000
    ₹3,00,000
    2,50,000
    18 years
    """

    patterns = [
        r"₹\s?\d[\d,]*",
        r"Rs\.?\s?\d[\d,]*",
        r"\b\d[\d,]*\b"
    ]

    found = []

    for pattern in patterns:
        found.extend(re.findall(pattern, text, flags=re.IGNORECASE))

    # Remove duplicates while preserving order
    result = []

    for value in found:
        value = value.strip()

        if value not in result:
            result.append(value)

    return result


# =========================================================
# PDF EXTRACTION
# =========================================================

def extract_pdf(filename: str) -> List[Dict]:
    path = UPLOAD_DIR / filename

    reader = PdfReader(str(path))

    pages = []

    for page_number, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text() or ""
        except Exception:
            text = ""

        text = clean_text(text)

        if text:
            pages.append({
                "page": page_number,
                "text": text
            })

    return pages


# =========================================================
# CHUNKING
# =========================================================

def build_chunks_for_document(filename: str, pages: List[Dict]):
    result = []

    for page in pages:

        text = page["text"]
        page_number = page["page"]

        sentences = split_sentences(text)

        if not sentences:
            continue

        # Keep multiple sentences together for better retrieval
        current = []

        for sentence in sentences:

            current.append(sentence)

            if len(" ".join(current)) >= 450:

                result.append({
                    "doc": filename,
                    "page": page_number,
                    "text": " ".join(current)
                })

                current = []

        if current:

            result.append({
                "doc": filename,
                "page": page_number,
                "text": " ".join(current)
            })

    return result


# =========================================================
# INDEXING
# =========================================================

def rebuild_index():

    global chunks
    global vectorizer
    global matrix

    chunks = []

    for filename, info in documents.items():

        document_chunks = build_chunks_for_document(
            filename,
            info["pages"]
        )

        chunks.extend(document_chunks)

    if not chunks:
        vectorizer = None
        matrix = None
        return

    texts = [
        item["text"]
        for item in chunks
    ]

    vectorizer = TfidfVectorizer(
        lowercase=True,
        stop_words="english",
        ngram_range=(1, 2)
    )

    matrix = vectorizer.fit_transform(texts)


# =========================================================
# LOAD EXISTING DOCUMENTS
# =========================================================

def load_documents():

    documents.clear()

    for file in UPLOAD_DIR.iterdir():

        if file.is_file() and file.suffix.lower() == ".pdf":

            try:

                pages = extract_pdf(file.name)

                documents[file.name] = {
                    "filename": file.name,
                    "pages": pages,
                    "page_count": len(pages)
                }

            except Exception as error:

                print(
                    f"Could not load {file.name}: {error}"
                )

    rebuild_index()


# =========================================================
# QUESTION TYPE
# =========================================================

def detect_question_type(question: str) -> str:

    q = question.lower()

    if any(word in q for word in [
        "financial",
        "support",
        "assistance",
        "funding",
        "amount",
        "money",
        "maximum",
        "how much",
        "₹",
        "rupees"
    ]):
        return "financial"

    if any(word in q for word in [
        "conflict",
        "contradiction",
        "different",
        "difference",
        "disagree"
    ]):
        return "conflict"

    if any(word in q for word in [
        "eligibility",
        "eligible",
        "requirements",
        "requirement",
        "who can apply"
    ]):
        return "eligibility"

    if any(word in q for word in [
        "uncertainty",
        "uncertain",
        "confidence"
    ]):
        return "uncertainty"

    return "general"


# =========================================================
# RETRIEVAL
# =========================================================

def retrieve(question: str, limit: int = 8) -> List[Dict]:

    if vectorizer is None or matrix is None:
        return []

    query_vector = vectorizer.transform([question])

    scores = cosine_similarity(
        query_vector,
        matrix
    )[0]

    ranked_indexes = scores.argsort()[::-1]

    results = []

    for index in ranked_indexes:

        score = float(scores[index])

        if score <= 0:
            continue

        item = chunks[index].copy()

        item["score"] = score

        results.append(item)

        if len(results) >= limit:
            break

    return results


# =========================================================
# RELEVANCE FILTER
# =========================================================
def filter_results(results: List[Dict], question_type: str):

    if not results:
        return []

    filtered = []

    for item in results:

        sentences = split_sentences(item["text"])

        for sentence in sentences:

            lower = sentence.lower().strip()

            # ==========================================
            # FINANCIAL QUESTIONS
            # ==========================================

            if question_type == "financial":

                # For financial questions, ONLY keep
                # sentences that actually contain a
                # monetary/numeric amount.

                numbers = extract_numbers(sentence)

                has_large_amount = False

                for number in numbers:

                    clean_number = (
                        number
                        .replace("₹", "")
                        .replace("Rs.", "")
                        .replace("rs.", "")
                        .replace("Rs", "")
                        .replace("rs", "")
                        .replace(",", "")
                        .replace(" ", "")
                    )

                    try:
                        if int(clean_number) >= 10000:
                            has_large_amount = True
                            break
                    except ValueError:
                        pass

                if not has_large_amount:
                    continue


            # ==========================================
            # ELIGIBILITY QUESTIONS
            # ==========================================

            elif question_type == "eligibility":

                eligibility_keywords = [
                    "eligible",
                    "eligibility",
                    "applicant",
                    "must be",
                    "resident",
                    "maharashtra",
                    "aadhaar",
                    "age"
                ]

                if not any(
                    keyword in lower
                    for keyword in eligibility_keywords
                ):
                    continue


            # ==========================================
            # CONFLICT QUESTIONS
            # ==========================================

            elif question_type == "conflict":

                if not any(
                    keyword in lower
                    for keyword in [
                        "financial",
                        "assistance",
                        "support",
                        "amount",
                        "₹",
                        "rs.",
                        "rupees"
                    ]
                ):
                    continue


            filtered.append({
                "doc": item["doc"],
                "page": item["page"],
                "text": sentence.strip(),
                "score": item.get("score", 0)
            })


    return filtered
# =========================================================
# UNIQUE RESULTS
# =========================================================

def unique_results(results: List[Dict]):

    output = []
    seen = set()

    for item in results:

        key = (
            item["doc"],
            item["page"],
            item["text"].lower()
        )

        if key in seen:
            continue

        seen.add(key)
        output.append(item)

    return output


# =========================================================
# CREATE ANSWER
# =========================================================

def create_answer(question: str, results: List[Dict]):

    question_type = detect_question_type(question)

    results = unique_results(results)

    if not results:

        return {
            "answer": (
                "I could not find enough supporting evidence "
                "in the uploaded documents."
            ),
            "sources": [],
            "question_type": question_type
        }

    # -----------------------------------------------------
    # FINANCIAL
    # -----------------------------------------------------

    if question_type == "financial":

        financial_results = filter_results(
            results,
            "financial"
        )

        financial_results = unique_results(
            financial_results
        )

        if financial_results:

            lines = [
                "Financial information found:"
            ]

            for item in financial_results:

                lines.append(
                    f"• {item['text']} "
                    f"({item['doc']}, Page {item['page']})"
                )

            return {
                "answer": "\n".join(lines),
                "sources": financial_results,
                "question_type": "financial"
            }

    # -----------------------------------------------------
    # ELIGIBILITY
    # -----------------------------------------------------

    if question_type == "eligibility":

        eligibility_results = filter_results(
            results,
            "eligibility"
        )

        eligibility_results = unique_results(
            eligibility_results
        )

        if eligibility_results:

            lines = [
                "Eligibility requirements found:"
            ]

            for item in eligibility_results:

                lines.append(
                    f"• {item['text']} "
                    f"({item['doc']}, Page {item['page']})"
                )

            return {
                "answer": "\n".join(lines),
                "sources": eligibility_results,
                "question_type": "eligibility"
            }

    # -----------------------------------------------------
    # GENERAL
    # -----------------------------------------------------

    lines = [
        "Relevant information found:"
    ]

    selected = unique_results(results[:6])

    for item in selected:

        lines.append(
            f"• {item['text']} "
            f"({item['doc']}, Page {item['page']})"
        )

    return {
        "answer": "\n".join(lines),
        "sources": selected,
        "question_type": "general"
    }


# =========================================================
# FINANCIAL VALUE DETECTION
# =========================================================

def get_financial_values(results: List[Dict]):

    values_by_doc = {}

    for item in results:

        sentences = split_sentences(
            item["text"]
        )

        for sentence in sentences:

            lower = sentence.lower()

            if not any(keyword in lower for keyword in [
                "financial",
                "assistance",
                "support",
                "funding",
                "amount",
                "₹",
                "rs",
                "rupees"
            ]):
                continue

            numbers = extract_numbers(sentence)

            for number in numbers:

                clean_number = (
                    number
                    .replace("₹", "")
                    .replace("Rs.", "")
                    .replace("rs.", "")
                    .replace("Rs", "")
                    .replace("rs", "")
                    .replace(" ", "")
                    .replace(",", "")
                )

                # Ignore small numbers such as page numbers
                try:
                    numeric_value = int(clean_number)

                    if numeric_value < 10000:
                        continue

                except ValueError:
                    continue

                document = item["doc"]

                if document not in values_by_doc:
                    values_by_doc[document] = set()

                values_by_doc[document].add(
                    numeric_value
                )

    return values_by_doc


# =========================================================
# CONFLICT DETECTION
# =========================================================

def detect_conflicts(question: str, results: List[Dict]):

    question_type = detect_question_type(question)

    if question_type not in [
        "financial",
        "conflict"
    ]:
        return None

    values_by_doc = get_financial_values(
        results
    )

    all_values = set()

    for values in values_by_doc.values():
        all_values.update(values)

    if len(all_values) <= 1:
        return None

    sorted_values = sorted(all_values)

    formatted_values = []

    for value in sorted_values:

        formatted_values.append(
            f"₹{value:,}"
        )

    return {
        "type": "financial_conflict",
        "title": "Conflict detected",
        "message": (
            "Different financial support amounts were "
            "found across the uploaded documents."
        ),
        "values": formatted_values,
        "documents": {
            doc: [
                f"₹{value:,}"
                for value in sorted(values)
            ]
            for doc, values in values_by_doc.items()
        }
    }


# =========================================================
# UNCERTAINTY
# =========================================================

def detect_uncertainty(
    question: str,
    results: List[Dict]
):

    if not results:

        return {
            "title": "Uncertainty detected",
            "message": (
                "There is not enough evidence to answer "
                "this question confidently."
            )
        }

    best_score = max(
        item.get("score", 0)
        for item in results
    )

    if best_score < 0.12:

        return {
            "title": "Uncertainty detected",
            "message": (
                "The uploaded documents contain limited "
                "evidence directly related to this question."
            )
        }

    return None


# =========================================================
# DOCUMENTS API
# =========================================================

@app.get("/api/documents")
def list_documents():

    result = []

    for filename, info in documents.items():

        result.append({
            "filename": filename,
            "pages": info["page_count"]
        })

    return {
        "documents": result,
        "count": len(result)
    }


# =========================================================
# UPLOAD API
# =========================================================

@app.post("/api/upload")
async def upload_files(
    files: List[UploadFile] = File(default=[])
):
    uploaded = []

    if not files:
        raise HTTPException(
            status_code=400,
            detail="No PDF file received. Please select a PDF and try again."
        )

    for file in files:

        if not file.filename:
            continue

        if not file.filename.lower().endswith(".pdf"):
            raise HTTPException(
                status_code=400,
                detail=f"{file.filename} is not a PDF file."
            )

        safe_name = Path(file.filename).name
        destination = UPLOAD_DIR / safe_name

        try:

            with open(destination, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            pages = extract_pdf(safe_name)

            if not pages:
                if destination.exists():
                    destination.unlink()

                raise HTTPException(
                    status_code=400,
                    detail=f"Could not extract text from {safe_name}. The PDF may be scanned or empty."
                )

            documents[safe_name] = {
                "filename": safe_name,
                "pages": pages,
                "page_count": len(pages)
            }

            uploaded.append({
                "filename": safe_name,
                "pages": len(pages)
            })

        except HTTPException:
            raise

        except Exception as error:

            if destination.exists():
                destination.unlink()

            raise HTTPException(
                status_code=400,
                detail=f"Could not process {safe_name}: {str(error)}"
            )

    rebuild_index()

    return {
        "success": True,
        "uploaded": uploaded,
        "count": len(uploaded)
    }

    uploaded = []

    for file in files:

        if not file.filename:
            continue

        if not file.filename.lower().endswith(".pdf"):

            continue

        safe_name = Path(
            file.filename
        ).name

        destination = UPLOAD_DIR / safe_name

        with open(destination, "wb") as buffer:

            shutil.copyfileobj(
                file.file,
                buffer
            )

        try:

            pages = extract_pdf(
                safe_name
            )

            documents[safe_name] = {
                "filename": safe_name,
                "pages": pages,
                "page_count": len(pages)
            }

            uploaded.append({
                "filename": safe_name,
                "pages": len(pages)
            })

        except Exception as error:

            if destination.exists():
                destination.unlink()

            raise HTTPException(
                status_code=400,
                detail=f"Could not process {safe_name}: {error}"
            )

    rebuild_index()

    return {
        "success": True,
        "uploaded": uploaded,
        "count": len(uploaded)
    }


# =========================================================
# DELETE DOCUMENT
# =========================================================

@app.delete("/api/documents/{filename}")
def delete_document(filename: str):

    safe_name = Path(filename).name

    if safe_name not in documents:

        raise HTTPException(
            status_code=404,
            detail="Document not found"
        )

    file_path = UPLOAD_DIR / safe_name

    if file_path.exists():
        file_path.unlink()

    del documents[safe_name]

    rebuild_index()

    return {
        "success": True,
        "message": f"{safe_name} removed"
    }


# =========================================================
# RESET WORKSPACE
# =========================================================

@app.post("/api/reset")
def reset_workspace():

    for file in UPLOAD_DIR.iterdir():

        if file.is_file():
            file.unlink()

    documents.clear()

    rebuild_index()

    return {
        "success": True,
        "message": "Workspace cleared"
    }


# =========================================================
# ASK / INVESTIGATE API
# =========================================================

@app.post("/api/ask")
def ask_question(request: AskRequest):

    question = request.question.strip()

    if not question:

        raise HTTPException(
            status_code=400,
            detail="Question cannot be empty"
        )

    if not documents:

        return {
            "success": False,
            "result": {
                "answer": (
                    "No documents are uploaded yet. "
                    "Please upload PDF documents first."
                ),
                "sources": [],
                "conflict": None,
                "uncertainty": {
                    "title": "No evidence",
                    "message": (
                        "Upload documents before starting "
                        "an investigation."
                    )
                }
            }
        }

    results = retrieve(
        question,
        limit=12
    )

    answer_data = create_answer(
        question,
        results
    )

    conflict = detect_conflicts(
        question,
        results
    )

    uncertainty = detect_uncertainty(
        question,
        results
    )

    final_result = {
        "answer": answer_data.get(
            "answer",
            "No answer generated."
        ),
        "sources": answer_data.get(
            "sources",
            []
        ),
        "conflict": conflict,
        "uncertainty": uncertainty,
        "question_type": answer_data.get(
            "question_type",
            "general"
        )
    }

    # IMPORTANT:
    # Return result as an object, never null.
    return {
        "success": True,
        "result": final_result
    }


# =========================================================
# SERVE FRONTEND
# =========================================================

@app.get("/")
def home():

    index_file = STATIC_DIR / "index.html"

    if not index_file.exists():

        return {
            "message": "DocX-Ray AI backend is running."
        }

    return FileResponse(
        str(index_file)
    )


app.mount(
    "/static",
    StaticFiles(directory=str(STATIC_DIR)),
    name="static"
)


# =========================================================
# STARTUP
# =========================================================

@app.on_event("startup")
def startup_event():

    print("Loading documents...")

    load_documents()

    print(
        f"Loaded {len(documents)} document(s)"
    )

    print(
        f"Indexed {len(chunks)} text chunk(s)"
    )