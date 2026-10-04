# DocX-Ray AI — ALGOTHON'26 ALG-AI-02

An MVP for the **Intelligent Document Investigator** problem statement.

## Features
- Multiple PDF upload
- Page-aware text extraction
- Retrieval over uploaded evidence
- Natural-language question interface
- Source document + page references
- Basic conflict detection
- Optional LLM answer generation via OpenAI
- Clean investigation dashboard

## Run
```bash
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env   # Windows
# cp .env.example .env   # macOS/Linux
uvicorn app:app --reload
```
Open http://127.0.0.1:8000

If `OPENAI_API_KEY` is empty, the app still runs in retrieval-only demo mode. For the strongest hackathon demo, set an API key and test with your own documents.

## PS mapping
The implementation targets ALG-AI-02 requirements: multiple documents, extraction/indexing, natural-language Q&A, source references, conflict detection and uncertainty handling.
