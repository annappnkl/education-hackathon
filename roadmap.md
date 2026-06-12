# Roadmap

## Status legend
- [ ] not started
- [~] in progress
- [x] done

---

## Phase 0 — Foundation (done)
- [x] Define design system from Dribbble reference screenshot
  - Rounded, minimal, lots of breathing room
  - Dark green primary `#2A5C45`, faded green background `#EAF4EE`
  - Material Symbols Rounded, weight 100 (thin)
  - Inter font
  - File-type accent bars: PDF red, Word blue, Excel green, Folder gold
- [x] Create `styles.css` with full token set and components:
  - CSS custom properties (colors, radius, spacing, shadow, typography)
  - `.icon` utility with `font-variation-settings` locked to wght 100
  - Cards (default, tinted, flat)
  - File rows with type accent bars
  - Pill buttons (5 variants × 3 sizes + icon-only)
  - Badges/chips
  - Input with leading icon
  - Avatar / icon badge
  - Bottom nav bar
  - Skeleton loader
- [x] Create `demo.html` to visually verify all components
- [x] Clone repo `https://github.com/annappnkl/education-hackathon.git`
- [x] Push `styles.css` + `demo.html` to `main`
- [x] Create `CLAUDE.md` with project + coding rules
- [x] Create `roadmap.md` (this file)

---

## Phase 1 — App screens & architecture [ ]

### App concept
Local web app for researching and writing academic work (thesis, paper, poster).
Single-page app, vanilla HTML/CSS/JS + lightweight open-source libraries.

### Flow
```
Chat onboarding → Paper discovery → Project workspace
                                        ├── Reading mode
                                        ├── Graph mode
                                        └── Writing mode
```

---

### Screen 1 — Chat onboarding
- [ ] Preset picker: Thesis / Paper / Poster / Other (pill chips, top of screen)
- [ ] Chat interface below preset picker
- [ ] Message input with subtle `+` icon (left) for file upload and link attach
- [ ] LLM back-and-forth to narrow broad topics into a researchable direction
- [ ] "Find papers" CTA once topic is confirmed
- Preset selection determines default tag set used throughout the project

**APIs:** LLM (user provides)

---

### Screen 2 — Paper discovery
- [ ] List of papers returned from Google Scholar
- [ ] Each card: title, ~2-line abstract snippet, authors, year, citation count
- [ ] Sorted chronologically (newest first)
- [ ] Expand card to read full abstract
- [ ] Checkbox to select/deselect papers for import
- [ ] "Import selected" primary button → enters workspace
- [ ] User can also manually add a paper (paste DOI / upload PDF) here

**APIs:** Google Scholar (user provides)

---

### Screen 3 — Project workspace

#### Reading mode (default)
- [ ] Left sidebar: imported papers, sorted chronologically, grouped (grouping TBD — clarify with user)
- [ ] Click paper → opens in main reading panel (slides in from right)
- [ ] Back/close always available
- [ ] Paper rendered as PDF (PDF.js) or extracted text — awaiting user decision
- [ ] Text selection → floating tooltip with:
  - **Explain** — LLM explains selected content
  - **Tag** — pick from preset tags (based on doc type) or create new tag
  - **Comment** — add a personal note to the marked section
- [ ] Highlights persist and are visible on re-open
- [ ] Paper-level takeaway note (location TBD — awaiting user decision)

**Tags by doc type (defaults, user can add custom):**
- Thesis: Abstract · Gap · Methodology · Results · Discussion · Citation · Limitation
- Paper: Abstract · Gap · Related Work · Methodology · Citation · Limitation
- Poster: Key Finding · Visual Candidate · Methodology · Citation

**APIs:** LLM (Explain action), PDF.js (CDN, free)

#### Graph mode
- [ ] Force-directed node graph (Cytoscape.js or D3, CDN)
- [ ] Each node = one paper (label = short title)
- [ ] Edges drawn when two papers share ≥1 tag
- [ ] Edge weight / thickness = number of shared tags
- [ ] Hover node → shows paper's tags + user comments snippet
- [ ] Click node → opens paper in reading panel
- [ ] Semantic/LLM-inferred edges = v2 (after embeddings API is available)

**APIs:** Cytoscape.js or D3 (CDN, free)

#### Writing mode
- [ ] Left panel: tag list (preset + custom), each expandable
- [ ] Under each tag: all marked excerpts from all papers that carry that tag
- [ ] Sorting within a tag: theme/topic grouping first (manual drag or LLM cluster), then chronological
- [ ] Each excerpt shows: paper title · year · the marked text · user comment beneath it
- [ ] Right panel: TBD — awaiting user decision (live text editor vs. synthesis view only)

---

### Open questions (awaiting user answers)
1. After picking a preset, does the LLM's onboarding chat adapt to the type?
2. Files uploaded at onboarding — are they always papers? Same downstream treatment?
3. Pasted links — always paper URLs (DOI/arXiv/Scholar), or anything?
4. Can the user re-trigger paper discovery from inside the workspace?
5. Can users add more papers manually once inside reading mode?
6. PDFs or extracted plain text in the reading panel? (Affects annotation complexity significantly)
7. Tooltip inline vs. side panel for tag/comment interaction?
8. Paper-level takeaway — where does it live visually?
9. Left sidebar grouping logic — by applied tags, or LLM topic inference?
10. Writing mode right panel — live text editor or reference/outline view only?
11. Excerpt grouping in writing mode — manual drag or LLM clustering?

---

### Libraries (no API keys needed)
| Library | Use |
|---|---|
| PDF.js (CDN) | PDF rendering in reading mode |
| Cytoscape.js or D3.js (CDN) | Knowledge graph |

---

## Assets pending (user will provide)
- PDF logo image
- Word logo image
- Excel logo image
- Any other brand/file-type icons

---

## Notes
- User runs Claude with `claude --dangerously-skip-permissions` for autonomous sessions
- No frameworks — vanilla HTML/CSS/JS for now
- All work lives in `/Users/anna.papanakli/Documents/Projects/education-hackathon/`
