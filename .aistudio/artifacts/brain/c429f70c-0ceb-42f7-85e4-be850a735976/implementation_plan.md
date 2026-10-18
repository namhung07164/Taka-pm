# Implementation Plan: Firestore Read Optimization & Multi-Device Sync Shield

## 1. Standardize `deltaInvalidateService.ts`
- **Objective:** Ensure no invalidation signals are dropped, even when the user is not actively viewing a tab.
- **Key Changes:** 
  - Update `isRelevant()` to always include `taka_projects` and `taka_tasks`.
  - Use `getDocFromServer` when a delta signal is received to ensure fresh data without a full collection scan.
  - Implement a fallback to `pullAndApplyDeltas` if the local document is missing or marked as deleted.

## 2. Optimize Task Resolution (Detail/Modal)
- **Objective:** Prevent redundant Firestore reads when resolving temporary tasks (`ts_` IDs) or project identity changes.
- **Key Changes:**
  - Replace raw `getDocs` calls in `useDetailTaskMutations.ts`, `taskModalSaveService.ts`, and `projectModalIdentityService.ts` with `ensureProjectTasksLoaded(projectCode)`.
  - Prioritize data retrieval from Zustand (RAM), then Dexie (Local DB), and only then Firestore.

## 3. Local Caching for R2 Configuration
- **Objective:** Avoid Firestore reads for Cloudflare R2 credentials on every layout tab switch.
- **Key Changes:**
  - Update `useLiveLayoutR2Config.ts` to use `localStorage` key `taka_r2_config_cache_v1`.
  - `loadConfig` now reads from cache first; `handleSaveR2Config` updates the cache.

## 4. Zero-Read Notification Task Loading
- **Objective:** Provide a lightweight task list for notifications without triggering Firestore collection reads.
- **Key Changes:**
  - Update `loadNotificationTasks` in `notificationTaskService.ts`.
  - Algorithm: Check Zustand RAM -> Check Dexie Local DB -> Check `project.taskSummaries`.
  - Only query Firestore if all local sources are empty.

## 5. Enable and Optimize Hydration (Delta-First)
- **Objective:** Activate the `DELTA_FIRST` mode across all data types while ensuring sync consistency.
- **Key Changes:**
  - Set `DELTA_FIRST = { projects: true, tasks: true, costs: true, delegations: true }` in all hydration hooks.
  - Strengthen `deltaManaged` condition: Require `hasLocalData` presence before entering Delta-First mode to prevent data gaps.
  - Always call `pullAndApplyDeltas(year, true)` with the `force` parameter to catch up on missed deltas during sleep/backgrounding.
  - Export `clearAllLoadedMarkers` in `loadedMarkers.ts` for deep sync resets.
