# High-Performance Gantt & Table Rendering with Offscreen Asset Caching

Optimize rendering speed, scroll fluidity, and memory footprint in the Takashimaya Project Management application—focusing specifically on large Gantt charts, heavy table views, offscreen Canvas rendering, and memoized asset caching.

> [!IMPORTANT] User Preferences Confirmed in Phase 1
> - **Primary Performance Bottleneck**: Rendering and scrolling large Gantt charts and table views.
> - **Primary Optimization Focus**: Image & file asset caching combined with offscreen Canvas rendering for drawing-heavy UI elements (Konva / Canvas).

---

## 1. Overview & Core Concept

### What It Does
This optimization package introduces row virtualization for long table views and heavy Gantt task lists, offscreen Canvas pre-rendering for heavy graphics (site maps, ring badges, grid timelines), and memoized asset caching for project files, attachments, and thumbnails.

### Target Audience & Persona
Project managers, construction site supervisors, and store planners operating on desktop PCs, iPads, and smartphones who require smooth 60 FPS scrolling and instantaneous view rendering across large datasets without UI stutter or memory crashes.

### Key Value Delivered
- **Smooth 60 FPS Gantt & Table Scrolling**: Virtualization renders only visible DOM nodes (viewport bounds), drastically reducing DOM nodes from thousands to ~20-30.
- **Zero-Lag Offscreen Canvas Graphics**: Offscreen pre-rendered maps and badges eliminate hit-graph recalculations on every frame wheel/pinch event.
- **Smart Asset & File Caching**: Image thumbnails and floor plan assets are decoded once in background microtasks and cached in LRU memory.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Gantt / Table Navigation**: User opens a large project with hundreds of tasks. The view renders instantly (< 50ms) using windowed DOM virtualization.
2. **Smooth Pan & Zoom on Gantt Timeline**: Panning or zooming on the timeline canvas draws smoothly from pre-rendered offscreen bitmaps without triggering React re-renders.
3. **Modal & Form Speed**: Opening task detail modals or filtering tasks executes in < 16ms without dropping frames.

### Visual Identity & Theme
- **Clean Enterprise Aesthetics**: Clean, high-density tabular typography (`tabular-nums font-mono`) for dates, IDs, and financial metrics.
- **Viewport Presence**: Unbroken sticky table headers and timeline scales (`sticky top-0 z-20 backdrop-blur-md`) with zero layout reflow or scroll jumps.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Row Virtualization for Tables & Gantt Charts
- **Chosen Approach**: Lightweight, zero-dependency custom windowing hook (`useVirtualizer` pattern) calculating `scrollTop`, row heights, and buffered padding items.
- **Why**: Eliminates 90%+ of React DOM nodes in large projects while ensuring zero external bundle overhead and full compatibility with existing drag-and-drop & inline editing.
- **Alternatives Considered**: Modifying full table DOM directly (causes high DOM node count and jank during fast scrolling).

### Decision 2: Offscreen Canvas Pre-Rendering (`useOffscreenImage` & Konva Listening Discipline)
- **Chosen Approach**: Render complex floorplan overlays, background grids, and status rings onto offscreen HTMLCanvasElement / memoized HTMLImageElement with `listening={false}` and `perfectDrawEnabled={false}`.
- **Why**: Eliminates Konva hit-graph calculation overhead during mouse move, pinch-zoom, and wheel events.
- **Alternatives Considered**: Re-drawing raw vector paths on every React render frame (causes 100% CPU spikes and battery drain on mobile/iPads).

### Decision 3: LRU Microtask Asset Caching
- **Chosen Approach**: In-memory `Map` with weak/bounded reference cache and background image decoding (`img.decode()`) in microtasks.
- **Why**: Prevents UI freeze when decoding high-resolution floor plans and attachment previews.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Zustand State & Dexie localDB                         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                      ┌────────────────┴────────────────┐
                      │  Memoized Computed Data Slices │
                      └────────────────┬────────────────┘
                                       │
          ┌────────────────────────────┼────────────────────────────┐
          ▼                            ▼                            ▼
┌───────────────────┐        ┌───────────────────┐        ┌───────────────────┐
│ Virtualized Table │        │ Virtualized Gantt │        │ Offscreen Canvas  │
│ Windowing Hook    │        │ Timeline View    │        │ Asset Cache Engine│
│ (Visible Rows)    │        │ (Canvas Windowing)│        │ (Konva Pre-render)│
└───────────────────┘        └───────────────────┘        └───────────────────┘
```

### Virtualization & Asset Cache Flow
1. **Viewport Detection**: Calculate visible item index bounds `[startIndex, endIndex]` based on container height and `scrollTop`.
2. **Offscreen Drawing**: Offscreen canvas renders heavy graphics once; main viewport draws cached bitmap context.
3. **Memoized Calculations**: Task status rollups and project taskSummaries are computed using memoized background microtasks (`useMemo` + `setTimeout(..., 0)`).
