# Claude Code — Project Instructions

## Project
Education hackathon app. Mobile-first, document/file management focus for students.

## Repo
https://github.com/annappnkl/education-hackathon.git

## Style system
- `styles.css` — single source of truth for all design tokens, components, and utilities
- `demo.html` — visual reference for all components
- Do NOT add inline styles; use CSS variables and existing classes
- Do NOT create new component classes unless there is no existing one that fits

## Design rules
- Primary color: dark green `#2A5C45`
- Background: faded green `#EAF4EE`
- Icons: Material Symbols Rounded, weight 100 (thin) — `<span class="icon">icon_name</span>`
- Rounded, minimal, lots of whitespace — no clutter
- File/logo images (PDF, Word, Excel) will be provided by the user — never use placeholder emoji or text for these, use the `.file-row__icon` container and leave a comment
- Font: Inter from Google Fonts

## Coding rules
- Mobile-first, max-width 480px canvas (`.page` class)
- No frameworks — vanilla HTML/CSS/JS unless explicitly agreed
- Keep files slim; no unnecessary abstractions
- Commit every meaningful chunk of work with a clear message
