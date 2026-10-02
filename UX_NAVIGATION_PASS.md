# Research / Targeting / Input UX Pass

## Research navigation
- Replaced the long doctrine/tech-tree document with a doctrine sidebar + selected-doctrine workspace.
- All doctrines remain visible. Researched/running doctrines are clearly marked; locked/future doctrines are dimmed but selectable for DR information.
- Only the selected doctrine's tech tree is displayed.
- Doctrine monograms provide compact visual identity in the sidebar.
- Missile & Advanced Battery now uses the same fork-row presentation as the other research trees; A/B/C/D/E/F/G labels were removed.
- Horizontal tech-tree lanes support transparent hover-edge auto-scroll without consuming layout width or intercepting tech-node clicks.

## Missile fire-control shortcut
- `T` enters Missile Launch Site aiming mode.
- Site selection prioritizes the friendly MLS with the most active/loaded READY silos.
- Ties prefer the currently selected MLS, then the MLS closest to the camera center.

## Automated Warfare map targeting
- Theater and Aerial Automated Warfare coordinate editors now include `PICK ON MAP`.
- Coordinate-picking mode hides the normal HUD/minimap and displays only targeting essentials.
- Click places/moves the target marker.
- `Space` or `CONFIRM` writes the coordinates back into the existing form.
- `Esc` or `CANCEL` exits without changing the existing coordinates.
- The underlying editor DOM is preserved while picking; no form data is rebuilt or lost.

## Input/readability
- First click into numeric fields arms immediate replacement: typing starts a new value without requiring repeated clicking/caret placement.
- Text configuration fields select their value on first focus where supported.
- Shared input heights and font sizes were increased.
- Research cards, command automation controls, MLS status copy, and small labels received modest readability increases.

## Regression coverage
- Added `tests/ux-navigation-smoke.js`.
- Existing UI live-refresh, Missile Battery, EW, Command Automation, and architecture regression suites remain passing.

## UX polish follow-up
- Research tree viewport position is preserved per doctrine across research-start rerenders, including the main vertical workspace position and each lane's horizontal position.
- Research workspace is a large centered window (desktop cap around 1320×860) with larger research/navigation typography, leaving visible game space around it.
- Tech cards are taller to accommodate the larger copy without overflow.
- Automated Warfare coordinate inputs retain full width; `PICK ON MAP` now occupies its own row beneath the X/Y fields.
