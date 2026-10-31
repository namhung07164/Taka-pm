import React from 'react';
import { createPortal } from 'react-dom';
import {
  MousePointer2,
  Square,
  Circle as CircleIcon,
  Hexagon,
  Trash2,
  Magnet,
  Undo2,
  RotateCw,
  Download,
  FolderOpen,
  FileImage,
  Move,
  Copy,
} from 'lucide-react';
import { UnitShape, ShapeType } from '../types';
import { ToolButton } from './EditTabModals';

export { EditTabCanvasFloatingControls } from './EditTabCanvasFloatingControls';

interface EditTabLeftToolbarProps {
  activeTool: ShapeType | 'select' | 'edit-bg';
  setActiveTool: (tool: ShapeType | 'select' | 'edit-bg') => void;
  selectedId: string | null;
  selectedUnit: UnitShape | null;
  historyLength: number;
  handleRotate: () => void;
  handleUndo: () => void;
  handleDelete: () => void;
  portalNode: HTMLElement | null;
  magneticGrid: boolean;
  setMagneticGrid: (v: boolean) => void;
  handleExportUnits: () => void;
  handleImportUnits: (e: React.ChangeEvent<HTMLInputElement>) => void;
  activeVersionId: string | null;
  handleReplaceBackground: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleRotateBackground: () => void;
  isCopyBgModalOpen: boolean;
  setCopyBgSearchTerm: (v: string) => void;
  setIsCopyBgModalOpen: (v: boolean) => void;
}

export const EditTabLeftToolbar: React.FC<EditTabLeftToolbarProps> = React.memo(
  ({
    activeTool,
    setActiveTool,
    selectedId,
    selectedUnit,
    historyLength,
    handleRotate,
    handleUndo,
    handleDelete,
    portalNode,
    magneticGrid,
    setMagneticGrid,
    handleExportUnits,
    handleImportUnits,
    activeVersionId,
    handleReplaceBackground,
    handleRotateBackground,
    isCopyBgModalOpen,
    setCopyBgSearchTerm,
    setIsCopyBgModalOpen,
  }) => {
    return (
      <>
        <div className="w-7 sm:w-8 flex flex-col gap-0.5 py-1 items-center bg-slate-900/80 rounded-lg border border-slate-800/80 glass z-10 shrink-0 overflow-y-auto custom-scrollbar">
          <ToolButton
            icon={MousePointer2}
            active={activeTool === 'select'}
            onClick={() => setActiveTool('select')}
            title="Select"
          />
          <ToolButton
            icon={Move}
            active={activeTool === 'edit-bg'}
            onClick={() => setActiveTool('edit-bg')}
            title="Edit Background Image"
          />
          <div className="w-5 h-px bg-slate-800 my-0.5" />
          <ToolButton
            icon={Square}
            active={activeTool === 'rect'}
            onClick={() => setActiveTool('rect')}
            title="Rectangle"
          />
          <ToolButton
            icon={CircleIcon}
            active={activeTool === 'circle'}
            onClick={() => setActiveTool('circle')}
            title="Circle"
          />
          <ToolButton
            icon={Hexagon}
            active={activeTool === 'polygon'}
            onClick={() => setActiveTool('polygon')}
            title="Polygon (Double click to finish)"
          />
          <div className="w-5 h-px bg-slate-800 my-0.5" />
          <ToolButton
            icon={RotateCw}
            active={false}
            onClick={handleRotate}
            title="Rotate 90°"
            disabled={!selectedId || selectedUnit?.locked}
          />
          <ToolButton
            icon={Undo2}
            active={false}
            onClick={handleUndo}
            title="Undo (Ctrl+Z)"
            disabled={historyLength === 0}
          />
          <ToolButton
            icon={Trash2}
            active={false}
            onClick={handleDelete}
            title="Delete Selected"
            disabled={!selectedId || selectedUnit?.locked}
          />
        </div>

        {portalNode &&
          createPortal(
            <div className="flex items-center gap-0.5 pl-1 ml-1 border-l border-slate-700">
              <ToolButton
                icon={Magnet}
                active={magneticGrid}
                onClick={() => setMagneticGrid(!magneticGrid)}
                title="Magnetic Grid (0.1 Snap)"
              />
              <div className="w-px h-3 bg-slate-700 mx-0.5" />
              <ToolButton
                icon={Download}
                active={false}
                onClick={handleExportUnits}
                title="Save Units As File"
              />
              <div className="relative">
                <ToolButton
                  icon={FolderOpen}
                  active={false}
                  onClick={() => document.getElementById('import-units-input')?.click()}
                  title="Open Units From File"
                />
                <input
                  id="import-units-input"
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleImportUnits}
                />
              </div>
              {activeVersionId && (
                <>
                  <div className="relative">
                    <ToolButton
                      icon={FileImage}
                      active={false}
                      onClick={() => document.getElementById('replace-bg-input')?.click()}
                      title="Replace Background Image/PDF"
                    />
                    <input
                      id="replace-bg-input"
                      type="file"
                      accept=".pdf,image/*"
                      className="hidden"
                      onChange={handleReplaceBackground}
                    />
                  </div>
                  <ToolButton
                    icon={RotateCw}
                    active={false}
                    onClick={handleRotateBackground}
                    title="Rotate Background Image/PDF 90°"
                  />
                  <ToolButton
                    icon={Copy}
                    active={isCopyBgModalOpen}
                    onClick={() => {
                      setCopyBgSearchTerm('');
                      setIsCopyBgModalOpen(true);
                    }}
                    title="Copy Background & Alignment from Another Version"
                  />
                </>
              )}
            </div>,
            portalNode
          )}
      </>
    );
  }
);
