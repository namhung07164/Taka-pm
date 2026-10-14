# Implementation Plan - Takashimaya Sync & Task Summarize Optimization (Patch 1E & Realtime Delta)

## Overview
This plan addresses data consistency and performance issues when expanding projects or receiving task updates across devices:
1. **Patch 1E (Safe Self-Healing Guard)**: Fixes `useTasksHydration.ts` so partial task hydration or local cache clearing does not erroneously reset a project's `taskCount` or `taskSummaries` to lower values or 0.
2. **Hybrid Realtime Delta Sync (200ms Debounced Auto-Batching)**: Speeds up cross-device sync without read storms by batching delta invalidation pulses every 200ms.
3. **Background Microtask & Memoized Task Summaries**: Offloads `taskSummaries` re-computation and project date rollups to asynchronous microtasks (`queueMicrotask`), ensuring 60 FPS UI responsiveness on iOS and mobile devices.

---

## Proposed Changes

### 1. Apply Patch 1E Guard in `src/hooks/useFirebaseDataParts/useTasksHydration.ts`
- **File**: `/src/hooks/useFirebaseDataParts/useTasksHydration.ts`
- **Actions**:
  - Verify import of `getAppBootAgeMs` and `BOOT_SYNC_GUARD_MS` from `../../lib/projectDatesService`.
  - Replace legacy O(P × T) self-healing loop in `batchTasksUpdate` with the safe scoped version:
    - Only evaluate projects with touched tasks in `pendingTasksChanged.current`.
    - Group tasks once into `Map<string, Task[]>` by `projectId` and `projectCode` in O(T) time.
    - Ignore cache snapshots (`fromCache`) and boot window (< 15 seconds).
    - Skip healing if local task count is strictly less than stored `taskCount` (`pTasks.length < (p.taskCount || 0)`), preventing partial data overwrites.

### 2. Hybrid Realtime Delta Sync Optimization (200ms Debounced Auto-Batching)
- **Files**: `/src/lib/deltaSyncService.ts`, `/src/lib/deltaRealtimeListener.ts`, `/src/lib/autoDeltaQueue.ts`
- **Actions**:
  - Configure a 200ms debouncing window for outgoing local mutations before flushing deltas to `taka_deltas`.
  - Optimize `deltaRealtimeListener.ts` to instantly process incoming deltas with low latency while avoiding redundant full re-queries.

### 3. Background Microtask & Memoized Calculation for `taskSummaries`
- **Files**: `/src/lib/projectDatesService.ts`, `/src/hooks/useFirebaseDataParts/useTasksHydration.ts`
- **Actions**:
  - Wrap `calculateProjectComputedDates` and `syncProjectDatesToFirestore` triggers in `queueMicrotask` / background worker tasks.
  - Memoize `summaryItems` mapping (`pTasks.map(...)`) and date extraction (`validStarts`, `validFinishes`) to eliminate main-thread stutter on UI interaction or project expansion.

---

## Verification & Testing Plan

1. **Compilation Check**: Run `compile_applet` to confirm no build or syntax errors.
2. **Lint & Type Check**: Run `lint_applet` to verify TypeScript compliance.
3. **Functional Verification**:
   - Test expanding projects with missing/partial tasks locally; verify `taskCount` and `taskSummaries` never drop to 0 or diminish on Firestore.
   - Verify task updates reflect across multi-device listeners smoothly with sub-second latency.
