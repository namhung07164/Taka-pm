import React, { Suspense, memo } from "react";
import { lazyWithRetry } from "../../lib/lazyWithRetry";
import { Toast } from "../Toast";

const AppTour = lazyWithRetry(
  () => import("../AppTour").then((m) => ({ default: m.AppTour })),
  "AppTour"
);
const CommandPaletteModal = lazyWithRetry(
  () =>
    import("../CommandPaletteModal").then((m) => ({
      default: m.CommandPaletteModal,
    })),
  "CommandPaletteModal"
);
const ProjectQuickNavModal = lazyWithRetry(
  () =>
    import("../ProjectQuickNavModal").then((m) => ({
      default: m.ProjectQuickNavModal,
    })),
  "ProjectQuickNavModal"
);
const FaqChatbotModal = lazyWithRetry(
  () =>
    import("../FaqBot/FaqChatbotModal").then((m) => ({
      default: m.FaqChatbotModal,
    })),
  "FaqChatbotModal"
);
const ExecutiveDeckModal = lazyWithRetry(
  () =>
    import("../PrintParts/ExecutiveDeckModal").then((m) => ({
      default: m.ExecutiveDeckModal,
    })),
  "ExecutiveDeckModal"
);
const StemTaskLibraryModal = lazyWithRetry(
  () =>
    import("../StemLibrary/StemTaskLibraryModal").then((m) => ({
      default: m.StemTaskLibraryModal,
    })),
  "StemTaskLibraryModal"
);
const StemCapturePresetModal = lazyWithRetry(
  () =>
    import("../StemLibrary/StemCapturePresetModal").then((m) => ({
      default: m.StemCapturePresetModal,
    })),
  "StemCapturePresetModal"
);

interface AppGlobalOverlaysProps {
  quickNavTarget: any;
  setQuickNavTarget: (target: any) => void;
  handleQuickNavigate: (tab: string, target: any) => void;
  isCommandPaletteOpen: boolean;
  setIsCommandPaletteOpen: (open: boolean) => void;
  handleTabChange: (tab: string) => void;
  toggleTheme: () => void;
  isFocusMode: boolean;
  setIsFocusMode: (focus: boolean) => void;
  isPrintPreview: boolean;
  setIsPrintPreview: (preview: boolean) => void;
  toast: { title: string; message: string; type?: "info" | "success" | "warning" | "error" } | null;
  setToast: (toast: any) => void;
  showTour: boolean;
  handleCloseTour: () => void;
  isExportingPDF: boolean;
}

export const AppGlobalOverlays: React.FC<AppGlobalOverlaysProps> = memo(
  ({
    quickNavTarget,
    setQuickNavTarget,
    handleQuickNavigate,
    isCommandPaletteOpen,
    setIsCommandPaletteOpen,
    handleTabChange,
    toggleTheme,
    isFocusMode,
    setIsFocusMode,
    isPrintPreview,
    setIsPrintPreview,
    toast,
    setToast,
    showTour,
    handleCloseTour,
    isExportingPDF,
  }) => {
    const [execDeckPayload, setExecDeckPayload] = React.useState<any | null>(null);
    const [isExecDeckOpen, setIsExecDeckOpen] = React.useState(false);
    const [stemWorkbenchPayload, setStemWorkbenchPayload] = React.useState<{
      projectId?: string;
      projectCode?: string;
    } | null>(null);
    const [isStemWorkbenchOpen, setIsStemWorkbenchOpen] = React.useState(false);
    const [stemCaptureTaskIds, setStemCaptureTaskIds] = React.useState<string[] | undefined>(
      undefined
    );
    const [isStemCaptureOpen, setIsStemCaptureOpen] = React.useState(false);

    React.useEffect(() => {
      const handleOpenExecDeck = (e: Event) => {
        const detail = (e as CustomEvent).detail || {};
        setExecDeckPayload(detail);
        setIsExecDeckOpen(true);
      };
      const handleOpenStemWorkbench = (e: Event) => {
        const detail = (e as CustomEvent).detail || {};
        setStemWorkbenchPayload(detail);
        setIsStemWorkbenchOpen(true);
      };
      const handleCaptureStemPreset = (e: Event) => {
        const detail = (e as CustomEvent).detail || {};
        setStemCaptureTaskIds(Array.isArray(detail.taskIds) ? detail.taskIds : undefined);
        setIsStemCaptureOpen(true);
      };
      window.addEventListener("taka_open_executive_deck", handleOpenExecDeck);
      window.addEventListener("taka_open_stem_workbench", handleOpenStemWorkbench);
      window.addEventListener("taka_capture_stem_preset", handleCaptureStemPreset);
      return () => {
        window.removeEventListener("taka_open_executive_deck", handleOpenExecDeck);
        window.removeEventListener("taka_open_stem_workbench", handleOpenStemWorkbench);
        window.removeEventListener("taka_capture_stem_preset", handleCaptureStemPreset);
      };
    }, []);

    return (
      <>
        {isStemWorkbenchOpen && (
          <Suspense fallback={null}>
            <StemTaskLibraryModal
              isOpen={isStemWorkbenchOpen}
              onClose={() => setIsStemWorkbenchOpen(false)}
              initialProjectId={stemWorkbenchPayload?.projectId}
              initialProjectCode={stemWorkbenchPayload?.projectCode}
            />
          </Suspense>
        )}

        {isStemCaptureOpen && (
          <Suspense fallback={null}>
            <StemCapturePresetModal
              isOpen={isStemCaptureOpen}
              onClose={() => setIsStemCaptureOpen(false)}
              taskIds={stemCaptureTaskIds}
              onSaved={(preset) =>
                setToast({
                  title: "Đã đóng gói vào Thư viện STEM",
                  message: `Đã lưu gói "${preset.emoji} ${preset.title}" (${preset.blocks.length} khối) vào taka_config.`,
                  type: "success",
                })
              }
            />
          </Suspense>
        )}

        {isExecDeckOpen && (
          <Suspense fallback={null}>
            <ExecutiveDeckModal
              isOpen={isExecDeckOpen}
              initialPayload={execDeckPayload}
              onClose={() => setIsExecDeckOpen(false)}
            />
          </Suspense>
        )}

        {quickNavTarget && (
          <Suspense fallback={null}>
            <ProjectQuickNavModal
              target={quickNavTarget}
              isOpen={!!quickNavTarget}
              onClose={() => setQuickNavTarget(null)}
              onNavigate={handleQuickNavigate}
            />
          </Suspense>
        )}

        {isCommandPaletteOpen && (
          <Suspense fallback={null}>
            <CommandPaletteModal
              isOpen={isCommandPaletteOpen}
              onClose={() => setIsCommandPaletteOpen(false)}
              onTabChange={handleTabChange}
              onToggleTheme={toggleTheme}
              onToggleFocusMode={() => setIsFocusMode(!isFocusMode)}
              onPrintPreviewToggle={() => setIsPrintPreview(!isPrintPreview)}
            />
          </Suspense>
        )}

        {toast && (
          <Toast
            title={toast.title}
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}

        <Suspense fallback={null}>
          <FaqChatbotModal />
        </Suspense>

        <div className="fixed bottom-1 right-3 text-[10px] text-slate-400 z-50 pointer-events-none">
          copyright by Nam Hung CP
        </div>

        {showTour && (
          <Suspense fallback={null}>
            <AppTour onClose={handleCloseTour} />
          </Suspense>
        )}

        {isExportingPDF && (
          <div className="fixed inset-0 z-[99999] bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center text-white print:hidden hide-on-actual-print">
            <svg
              className="w-12 h-12 animate-spin text-blue-500 mb-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <h2 className="text-xl font-bold tracking-tight">
              Generating High Quality Document...
            </h2>
            <p className="text-slate-300 mt-2 text-sm text-center max-w-sm">
              Please wait while we render your chart. This may take a moment depending on the
              project size.
            </p>
          </div>
        )}
      </>
    );
  }
);

AppGlobalOverlays.displayName = "AppGlobalOverlays";
