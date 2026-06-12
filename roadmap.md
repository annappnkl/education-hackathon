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

## Phase 1 — App screens [ ]
> To be defined next session. Discuss what screens/flows the app needs.

Likely candidates based on the reference design:
- [ ] Home / dashboard screen
- [ ] File list / library screen
- [ ] Document viewer screen
- [ ] Upload flow
- [ ] Search results screen
- [ ] Profile / settings screen

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
