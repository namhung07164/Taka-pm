# Implementation Plan - Hard Task ID Connection for Predecessors

## User Intent & Requirements
1. **Hard Task ID Binding**: When a predecessor is entered or selected in a task, store the matched target task's exact `taskId` directly (via a new field `predecessorTaskIds`) to create an unbreakable connection.
2. **Primary Task ID Resolution**: In all dependency calculations (Gantt scheduling, predecessor resolution, date syncing), resolve the predecessor task by `taskId` first. Fall back to code/string matching only if the `taskId` is no longer available.
3. **Data Integrity**: Ensure existing dependency strings remain in sync with hard-linked task IDs so renaming or reordering does not break predecessor links.

## Proposed Changes & File Architecture

### 1. Data Schema Update (`src/types.ts`)
- Extend the `Task` interface with `predecessorTaskIds?: string[]`.
- This array will map 1-to-1 with the parts in the `predecessor` string.

### 2. Dependency Resolution Logic (`src/lib/predecessorMatchUtils.ts`)
- Update `findClosestTaskMatch` and `resolvePredecessorString` to accept an optional array of `taskIds`.
- Implement logic to attempt lookup via ID before falling back to fuzzy string matching.

### 3. Scheduling & Logic Updates (`src/lib/ganttUtils.ts`)
- Update `parsePredecessors` to return both the code and the target task's ID if available.
- Update `calculateTaskDatesFromPredecessors` to use the ID-linked task for more accurate date calculation.
- Ensure `getPredecessorCodeUpdates` maintains the ID link when codes change.

### 4. UI Interaction (`src/components/PredecessorMultiInput.tsx`)
- When a task is matched from the search results or via typing, append its `id` to the `predecessorTaskIds` collection of the task being edited.
- Display a "linked" icon or status in the predecessor input if a hard ID match is confirmed.

### 5. State Management & Persistence (`src/lib/taskStateService.ts`)
- Ensure `predecessorTaskIds` is handled during batch updates and soft deletions (if a predecessor is deleted, the ID link should ideally signal a warning).

## Verification Plan
1. **Compilation**: Run `compile_applet` to ensure no breaking changes in types or imports.
2. **Automated Testing**: Run `npm test` focusing on `src/lib/predecessorMatchUtils.test.ts` and `src/lib/ganttUtils.test.ts`.
3. **Manual Verification**: 
    - Create Task A and Task B.
    - Set Task A as predecessor for Task B.
    - Rename Task A (change its code).
    - Verify Task B still follows Task A's dates because of the hard Task ID link.
