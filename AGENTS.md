# Project Architecture & Coding Conventions

> ⛔ **INVIOLABLE RULE**: Never delete, disable, or degrade existing business logic, UI/UX, features, or data flows unless explicitly requested. All changes must be additive or optimizations.
> ⚡ **AGENTS.MD MAINTENANCE**: Whenever updating `AGENTS.md`, preserve 100% rule integrity and write strictly in **Telegraphic Imperative English** to minimize token usage.

## 0. Core Operating Mindset
1. **Think Before Coding & Clarify Ambiguity**: Cross-check `ARCHITECTURE.md` and `src/api-contracts.ts` before coding to assess impact (Dynamic Hierarchy, Rule-Based Groups, Gantt Predecessors, Cloud R2, Delta Sync). **If any requirement, scope, or edge case is unclear or uncertain, ask the user to clarify for 100% accuracy before writing code.**
2. **Simplicity First**: Reuse existing helpers in `src/lib/` and hooks in `src/hooks/`. Strictly enforce `< 500` lines/file, write via `firestoreWrites.ts` / `saveTaskStateUnified`, and preserve 0ms Optimistic UI.
3. **Surgical Changes**: Modify only the exact file/function required. Never rewrite entire files, strip business comments, or touch unrelated modules.
4. **Goal-Driven Execution**: Implement -> Verify (`lint_applet` / `tsc --noEmit` & `compile_applet`) -> Fix until 0 syntax/logic errors.

## 1. Single Source of Truth (SSoT) & 3-Step Workflow
- **SSoT Lookup Order**:
  1. `ARCHITECTURE.md`: Folder map, `*Parts/` submodules, `src/lib/` & `src/hooks/` catalog. Never create non-conforming folders.
  2. `src/api-contracts.ts`: Interfaces, types, enums, Zustand store & API signatures. Check signatures here without reading full implementation files. Never hallucinate names/props.
  3. `BUSINESS_LOGIC.md`: Read on-demand via `view_file` (Navigation Index) when modifying Budget, Gantt, RBAC, or financial formulas. Never modify `BUSINESS_LOGIC.md`.
- **3-Step Workflow**:
  1. **Check Map & Contracts**: Locate submodule in `ARCHITECTURE.md` and verify types/actions in `src/api-contracts.ts`.
  2. **Implement**: Keep files `< 500` lines, strict TypeScript (no `any`), decouple UI from Zustand Store.
  3. **Selective Sync & Validate**: Update `src/api-contracts.ts` ONLY when types/store/signatures change; update `ARCHITECTURE.md` ONLY when adding modules/folders. **NEVER** auto-write logs or update docs (`manual_usual.md`, `README.md`, etc.) on bug fixes/UI edits. Co-run `lint_applet` and `compile_applet` (0 errors) before finishing.

## 2. Core Architecture, State & Build Constraints
- **Safe Boot & NPM**: Always boot at `'general'` tab (never save `taka_last_tab` in `localStorage`). Use **NPM ONLY** (remove Bun/Yarn/Pnpm lockfiles); build outputs to `dist/`.
- **Zustand (`useAppStore.ts`)**: Use atomic selectors (`state => state.projects`) and shallow hooks (`useUISlice`, `useDataSlice`) to prevent re-renders; no deep prop drilling.
- **0ms Optimistic UI & Offline Queue**: Apply create/update/delete to Zustand immediately (0ms) and sync Firestore in background; wrap in `try/catch` to enqueue failures into `src/lib/syncQueue.ts`. Buttons require `active:scale-95 touch-manipulation`.
- **Schema Integrity**: Never add junk fields or rename schemas outside `src/types.ts`. Preserve 100% export, watermark, delegation, and file import/export features.
- **Safe Module Integration**: Isolate new features/ZIP imports in `src/components/<FeatureName>/` with independent Zustand slices and types appended to `src/types.ts` (plug-and-play via 1 nav tab/button).

## 3. Local-First Dexie, Firebase Guards & Realtime Delta Sync
- **Primary Storage (`src/lib/localDb.ts` - `TakaLocalDB`)**: `bootstrapLocalStore()` hydrates Zustand from Dexie in 5–10ms (0 loading spinner; auto-fallback to Firestore if IDB blocked/empty). Offload heavy sync/writes (`offloadPersistSnapshot`, `bulkPut`, `applyDeltasToLocalDatabase`) to microtasks (`setTimeout(..., 0)`). Skip self-echoes (`delta.updatedBy === currentUser.email`).
- **Tri-Gate Lazy Loading & Pooling**: Respect `isTasksRequested`, `isCostsRequested`, `isDelegationsRequested`. Pool per-year listeners in `useRef<Map>` (no unmount on year switch for Zero-Read cache hits). Never pass object literals in `useEffect` deps.
- **IDB Locks & iOS 40MB Cap**: Use `persistentSingleTabManager({ forceOwnership: true })` for Iframe/PWA and `persistentMultipleTabManager` for Desktop. Cap iOS cache at 40MB (`cacheSizeBytes: isIOS ? 41943040 : CACHE_SIZE_UNLIMITED`).
- **Mandatory Write Wrapper & Delta Channel**: Maintain a single `onSnapshot` on `taka_deltas` via `deltaRealtimeListener.ts` (5m polling safety net only), ordered by `serverTimestamp()` (`serverTime`, never local `numericTime`). Ignore partial `update` deltas for missing local records (Ghost Record Guard). **ALL** writes to `taka_projects`, `taka_tasks`, `taka_costs`, `taka_delegation_groups`, `taka_users` **MUST** import `setDoc`, `updateDoc`, `deleteDoc`, `writeBatch` from `src/lib/firestoreWrites.ts` (or `src/lib/firebase.ts`) to trigger `autoDeltaQueue.ts` (**NEVER** import write functions directly from `firebase/firestore`).
- **Atomic Financials & Realtime Economy**: Deep financial updates must use dot-notation (`'financial.byStore...'` + `increment()`), 1 update/doc/batch. Modals read from Zustand (0 Firestore queries). Use `arrayUnion()` for comments/chat/activity logs. Debounce quick inputs 400ms before `syncQueue`.

## 4. Multi-Device Sync, 4-Key Isolation & Rollup Engine
- **4-Key Composite Isolation (`projectId` + `projectCode` + `year` + `store`)**: Never link/group/query by `projectCode` alone. Persist all 4 fields (`projectId`, `projectCode`, `projectYear`/`year`, `projectStore`/`store`) across Firestore, Dexie, and Zustand.
- **Entity Matching Priority** (`isTaskBelongsToProject`, `isDelegationGroupBelongsToProject`, `getTasksForProject`, `computeProjectActStatus`, `resolveProjectContext`, `computeTaskCode`, `buildTaskNoMap`, `resolvePredecessorString`):
  1. Exclude deleted (`isDeleted: true` or in `taskDeletedTracker`).
  2. **Project ID (#1)**: `task.projectId === project.id`. If both have IDs and differ -> immediately `return false` (no `projectCode` fallback).
  3. **Store (#2)**: Normalized `toLowerCase().trim()`. Mismatch -> `return false`.
  4. **Year (#3)**: Normalized `String(year).trim()`. Mismatch -> `return false`.
  5. **Legacy Fallback**: Only if `projectId` is missing on legacy data, match `projectCode` + `store` + `year` simultaneously.
- **Overnight Wake-up Guard**: Listen to `visibilitychange`, `pageshow`, `online`, `focus` + 15–30s Heartbeat Gap Detection (>60s sleep gap -> reset stalled Firestore socket, run `pullAndApplyDeltas(undefined, true)`, and reconcile).
- **Bi-directional Reconciliation (Patch 1L)**: On clean server snapshots (`!fromCache && !hasPendingWrites`), apply `docChanges()` forward and purge local zombies (`buildZombieRemovalsForYear`, `buildZombieRemovalsForProject`) with a 30s edit guard (`RECENT_EDIT_GUARD_MS = 30000`), strictly scoped to query `projectYear`/`projectStore`/`projectId`, deleting locally only (never write deletes back to Firestore).
- **In-Memory Rollup & Deletion Flow**: Compute parent task and project dates/duration/progress 100% client-side (`taskRollupService.ts`, `projectDatesService.ts`, `calculateProjectComputedDates`) with a `visited` Set circular guard (no Cloud Functions). On task delete: purge from `localDb.tasks` & Zustand -> add `id` to `taskDeletedTracker` -> prune `p.taskSummaries` -> run `calculateProjectComputedDates`.

## 5. UI/UX, Modular Splitting, Draggable Modals & Konva Guards
- **100% Enterprise English UI**: All titles, labels, tooltips, descriptions, alerts/toasts, and badges must use professional English.
- **500-Line Ceiling & JIT Code Splitting**: Max `500` lines/file; split submodules into `src/components/<TabName>Parts/` while keeping `<TabName>.tsx` (`< 300–400` lines) as a pure orchestrator. Wrap form sub-components in `React.memo`. Mount heavy modals JIT (`{isOpen && <Modal />}`) with `React.lazy`/`lazyWithRetry` & `<Suspense fallback={null}>`. Dynamically `await import(...)` heavy libs (`xlsx`, `html2canvas`, `konva`, `jspdf`) to keep main bundle `< 1MB`.
- **Draggable Modals & Responsive Toolbars**: Every modal (`ProjectModal`, `TaskModal`, `UserModal`, `ConfirmModal`, `CalendarSync`, `QuickNav`...) and modular tooltip must support dragging (`dragControls` / `.modal-handle`, `cursor-grab active:cursor-grabbing`, `GripHorizontal`). Manage toolbars via `UISlice`, hide complex ribbons on mobile (`hidden lg:inline-flex`) into Drawer, use `sticky top-0 z-[100] backdrop-blur-md`, and clean up `Escape` listeners on unmount.
- **Konva & SVG Performance**: Static Konva elements require `listening={false}` and `perfectDrawEnabled={false}`. Throttle wheel/pan/pinch/drag in `requestAnimationFrame` (Direct Node Transform + `batchDraw()`) and `cancelAnimationFrame` on unmount. Decode floorplans via `useOffscreenImage` (no reload on filter/floor change). Pre-index data into `O(1)` `Map<string, T[]>` inside `useMemo` (never nest `.filter()` inside `.map()`).

## 6. Hardware, Storage & Financial Audit Safety
- **Camera/Scanner**: Verify `getUserMedia`, call `track.stop()` on unmount, and cap QR/Face scanning at 3–5 FPS.
- **Storage Deep Clean**: When soft/hard deleting Task/Project/Cost, call `extractStorageUrls` & `deleteStorageFiles` (`src/lib/storageUtils.ts`) for Firebase Storage and `deleteR2ImageCleanly` for Cloudflare R2.
- **Realtime Config & Audit Log**: Subscribe to `taka_users` and `taka_config` via `onSnapshot`. Record all Budget/Cost or RBAC mutations append-only to `audit_logs` via `auditLogService.ts`.

