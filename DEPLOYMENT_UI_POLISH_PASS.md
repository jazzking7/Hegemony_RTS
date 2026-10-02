# Deployment / Construction UI Polish Pass

## Deployment selector
- Replaced the text-heavy `GLOBAL OVERVIEW / FACILITIES` controls with two compact abstract icon buttons.
- Global Overview is presented as a stable four-category grid: Ground, Air, Drone, Superior Mobilization. Categories without an eligible facility remain visible but disabled.
- Ground keeps the broad ground aggregation across Military Bases and Superior Mobilization Complexes.
- Superior Mobilization provides a dedicated infantry/Exosuit-only view sourced from Superior Mobilization Complexes.
- Per-Facility mode now renders available deployment facilities as a responsive grid of readable facility cards instead of a horizontal chip strip.
- Deployment context/availability description has its own full-width row below the selector instead of sharing the control row.
- Unit rows use a consistent two-column layout with readable wrapping descriptions and a fixed-width control column.

## Construction sidebar
- Collapsed sidebar now exposes a dedicated 64px BUILD handle instead of exposing a slice of the scrollable menu/scrollbar.
- The scrollable menu body is hidden while collapsed and restored on hover/focus.
- Expanded construction panel width increased to 330px on desktop.
- Build descriptions wrap normally instead of being forcibly ellipsized to one line.
- Utility/Defense tabs and Continuous Build controls remain unchanged functionally.

## Compatibility
- Match-scoped deployment preferences remain intact.
- Global Ground multi-facility deployment remains intact.
- Superior Mobilization Complex continues to be a first-class ground facility.
- Existing doctrine, combat, automation, and architecture regression suites remain green.
