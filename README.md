## Hackathon submission for Claude Builders Club Munich - **winning 3rd Place**.

# papertrail

A local, offline-first web app for academic research — find papers, read and annotate PDFs, explore connections between ideas, and draft your thesis or paper in one place.

Built with vanilla HTML/CSS/JS. No frameworks. No accounts. Runs entirely in your browser via a lightweight local proxy server.

---

## What it does

**Onboarding** — Chat with an LLM to narrow your research topic. Select a document type (Thesis, Paper, Poster) and let the assistant help you define a focused research direction before fetching papers.

**Paper Discovery** — Searches OpenAlex and arXiv for papers with full open-access PDFs. Every result shown has a downloadable PDF. Import the ones you want into your project.

**Reading Mode** — Open any imported paper. PDFs render page-by-page with a text layer. Select any passage to either annotate it (tag it to a thesis section) or get an instant LLM explanation. Drag and drop a downloaded PDF directly onto the abstract page to attach it.

**Knowledge Graph** — Force-directed graph (Cytoscape.js) showing only papers you've annotated or uploaded. Two edge types:
- **Cited** — drawn from OpenAlex citation metadata
- **Contextual** — LLM-inferred topic clusters, shown as dashed lines with a hover reason

**Writing Mode** — All your tagged excerpts organised by thesis section (Introduction, Methodology, Results, etc.), sorted by LLM inference. A live rich-text editor on the right. Citations auto-generated in APA 7th edition from your annotated papers. Delete any excerpt and it's removed from the editor too.

---

## Stack

| Layer | Technology |
|---|---|
| UI | Vanilla HTML / CSS / JS |
| PDF rendering | PDF.js 3.11.174 (CDN) |
| Knowledge graph | Cytoscape.js 3.30.2 (CDN) |
| Paper search | OpenAlex API + arXiv API |
| LLM | OpenAI-compatible API (gpt-4o) |
| PDF storage | IndexedDB (in-browser) |
| Project storage | localStorage |
| Proxy server | Node.js (`server.js`) — CORS bypass for arXiv + PDF fetching |

---

## Setup

**Requirements:** Node.js 18+

1. Clone the repo
2. Copy `js/api.js.example` to `js/api.js` and add your OpenAI API key (or compatible endpoint)
3. Start the proxy server:
   ```bash
   node server.js
   ```
4. Open `http://localhost:3000` in your browser

> `js/api.js` is gitignored — your API key never leaves your machine.

---

## Project structure

```
index.html          Main SPA shell
styles.css          Design system + all component styles
server.js           Local proxy (PDF fetch, arXiv CORS bypass)
js/
  app.js            Screen router
  state.js          localStorage + IndexedDB state management
  api.js            LLM + paper search API calls (gitignored)
  onboarding.js     Chat onboarding screen
  discovery.js      Paper discovery + import
  workspace.js      Workspace shell, mode switching
  reader.js         PDF viewer, annotations, drag-and-drop upload
  graph.js          Knowledge graph (Cytoscape.js)
  writer.js         Writing mode, outline, citations
```

---

## Features at a glance

- Full PDF reading with text selection and annotations
- Drag-and-drop PDF upload onto the abstract page
- LLM-powered text explanation inline while reading
- Tag excerpts to thesis sections; LLM assigns the right section automatically
- Knowledge graph with cited + contextual edges, hover tooltips
- Auto-generated APA 7th edition reference list
- Annotation deletion synced between sidebar and editor
- Persistent projects — reopen where you left off
