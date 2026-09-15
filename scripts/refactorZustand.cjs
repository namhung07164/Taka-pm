const fs = require('fs');

const code = fs.readFileSync('src/store/useAppStore.ts', 'utf8');

// Identify the object properties in the create call
const match = code.match(/export const useAppStore = create<AppState>\(\(set\) => \(\{([\s\S]*?)\}\)\);/);

if (!match) {
  console.log("No match found");
  process.exit(1);
}

const body = match[1];

// We will split the body into sections.
// Note: This is quite complex string manipulation, let's just create logical slices by searching for comments or keywords.

const uiSliceKeys = ['isFocusMode', 'setIsFocusMode', 'activeTab', 'setActiveTab', 'tabHistory', 'setTabHistory', 'theme', 'setTheme', 'toast', 'setToast', 'isLoginModalOpen', 'setIsLoginModalOpen', 'isProjectModalOpen', 'setIsProjectModalOpen', 'isTaskModalOpen', 'setIsTaskModalOpen', 'isUserModalOpen', 'setIsUserModalOpen', 'isCalendarSyncModalOpen', 'setIsCalendarSyncModalOpen', 'modalInitialTab', 'setModalInitialTab', 'focusCommentId', 'setFocusCommentId', 'isReadOnlyModal', 'setIsReadOnlyModal', 'showTour', 'setShowTour'];

const printSliceKeys = ['isPrintPreview', 'setIsPrintPreview', 'printOrientation', 'setPrintOrientation', 'printPaperSize', 'setPrintPaperSize', 'printDate', 'setPrintDate', 'printFilterHeader', 'setPrintFilterHeader', 'printScaleMode', 'setPrintScaleMode', 'printScaleCustom', 'setPrintScaleCustom', 'printDpi', 'setPrintDpi', 'printWatermark', 'setPrintWatermark', 'printTarget', 'setPrintTarget', 'isExportingPDF', 'setIsExportingPDF', 'printRangeType', 'setPrintRangeType', 'printStartDate', 'setPrintStartDate', 'printEndDate', 'setPrintEndDate'];

const filterSliceKeys = ['costTabSearchTerm', 'setCostTabSearchTerm', 'budgetTabSearchTerm', 'setBudgetTabSearchTerm', 'detailTabFilterCode', 'setDetailTabFilterCode', 'globalStoreFilter', 'setGlobalStoreFilter', 'globalYearFilter', 'setGlobalYearFilter', 'globalLocationFilter', 'setGlobalLocationFilter', 'pinnedProjects', 'setPinnedProjects', 'setDetailTabStoreFilter', 'detailTabFocusTaskId', 'setDetailTabFocusTaskId', 'detailReturnScrollId', 'setDetailReturnScrollId', 'ganttTabFocusTaskId', 'setGanttTabFocusTaskId', 'ganttTriggerToday', 'triggerGanttToday', 'layoutTabFilters', 'setLayoutTabFilters', 'notificationFilterId', 'setNotificationFilterId'];

const authSliceKeys = ['user', 'setUser', 'currentUser', 'setCurrentUser'];

// Rather than parsing JS, let's just insert the Slice definitions in the file manually or using a simpler replace.
// Actually, I can just replace the entire export const useAppStore = create... with a slice-based approach.

const newCode = code.replace(
  /export const useAppStore = create<AppState>\(\(set\) => \(\{([\s\S]*?)\}\)\);/,
  `import { StateCreator } from 'zustand';

// --- SLICES ---
export const createCombinedSlice: StateCreator<AppState> = (set) => ({
$1
});

export const useAppStore = create<AppState>((...args) => ({
  ...createCombinedSlice(...args)
}));`
);

fs.writeFileSync('src/store/useAppStore.new.ts', newCode);
console.log("Written to useAppStore.new.ts");
