import React, { useMemo } from 'react';
import { Building2, FolderKanban, Layers, MapPin, CheckCircle2, FileText, Crosshair } from 'lucide-react';
import { Project, Task } from '../../../types';
import { extractAllProjectCodes } from '../../../lib/utils';

export const PRESET_INSPECTION_PINS = [
  { id: 'pin_entrance_facade', label: 'Pin #1 • Main Entrance & Shopfront Facade' },
  { id: 'pin_ceiling_mep', label: 'Pin #2 • Ceiling MEP, HVAC & Fire Sprinkler' },
  { id: 'pin_floor_waterproof', label: 'Pin #3 • Floor Tile, Leveling & Waterproofing' },
  { id: 'pin_carpentry_fixture', label: 'Pin #4 • Carpentry, Wall Cladding & Fixtures' },
  { id: 'pin_lighting_power', label: 'Pin #5 • Electrical DB, Lighting & Signage' },
  { id: 'pin_defect_snag', label: 'Pin #6 • Snag List / Defect Rectification Point' },
  { id: 'pin_handover_signoff', label: 'Pin #7 • Final Handover & Acceptance Sign-off' },
];

interface ShareTargetSelectorsPanelProps {
  selectedStore: string;
  setSelectedStore: (store: string) => void;
  selectedYear: string;
  setSelectedYear: (year: string) => void;
  selectedLocation: string;
  setSelectedLocation: (loc: string) => void;
  availableYears: string[];
  availableLocations: string[];
  filteredProjects: Project[];
  projectSearch: string;
  setProjectSearch: (val: string) => void;
  selectedProjectId: string;
  onSelectProject: (proj: Project | null) => void;
  unitCode: string;
  setUnitCode: (code: string) => void;
  suggestedUnits: string[];
  pinMode: 'preset' | 'task' | 'custom';
  setPinMode: (mode: 'preset' | 'task' | 'custom') => void;
  selectedPinId: string;
  setSelectedPinId: (id: string) => void;
  customPinLabel: string;
  setCustomPinLabel: (label: string) => void;
  selectedTaskId: string;
  setSelectedTaskId: (id: string) => void;
  projectTasks: Task[];
  pinCoords: { x: number; y: number } | null;
  setPinCoords: (coords: { x: number; y: number } | null) => void;
  titleInput: string;
  setTitleInput: (val: string) => void;
  captionInput: string;
  setCaptionInput: (val: string) => void;
}

export const ShareTargetSelectorsPanel: React.FC<ShareTargetSelectorsPanelProps> = React.memo(({
  selectedStore,
  setSelectedStore,
  selectedYear,
  setSelectedYear,
  selectedLocation,
  setSelectedLocation,
  availableYears,
  availableLocations,
  filteredProjects,
  projectSearch,
  setProjectSearch,
  selectedProjectId,
  onSelectProject,
  unitCode,
  setUnitCode,
  suggestedUnits,
  pinMode,
  setPinMode,
  selectedPinId,
  setSelectedPinId,
  customPinLabel,
  setCustomPinLabel,
  selectedTaskId,
  setSelectedTaskId,
  projectTasks,
  pinCoords,
  setPinCoords,
  titleInput,
  setTitleInput,
  captionInput,
  setCaptionInput,
}) => {
  const selectedProject = useMemo(
    () => filteredProjects.find((p) => p.id === selectedProjectId) || null,
    [filteredProjects, selectedProjectId]
  );

  return (
    <div className="flex flex-col gap-3.5">
      {/* Step 1: Store, Year & Floor Filter */}
      <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#222225] border border-slate-200/80 dark:border-[#36363a]">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">
          <Building2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>1. Select Store Branch, Year & Floor Location</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
              Store *
            </label>
            <select
              value={selectedStore}
              onChange={(e) => setSelectedStore(e.target.value)}
              className="w-full h-8 px-2 rounded-lg text-xs font-bold bg-white dark:bg-[#18181b] border border-slate-300 dark:border-[#444446] text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
            >
              <option value="HCM">HCM</option>
              <option value="HN">HN</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
              Fiscal Year *
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full h-8 px-2 rounded-lg text-xs font-bold bg-white dark:bg-[#18181b] border border-slate-300 dark:border-[#444446] text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
            >
              <option value="ALL">All Years</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  Year {y}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
              Floor / Area
            </label>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="w-full h-8 px-2 rounded-lg text-xs font-bold bg-white dark:bg-[#18181b] border border-slate-300 dark:border-[#444446] text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
            >
              <option value="ALL">All Floors</option>
              {availableLocations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Step 2: Project Selection (Composite Key Isolated) */}
      <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#222225] border border-slate-200/80 dark:border-[#36363a]">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
            <FolderKanban className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>2. Select Target Project</span>
          </div>
          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
            {filteredProjects.length} projects matched
          </span>
        </div>

        <input
          type="text"
          value={projectSearch}
          onChange={(e) => setProjectSearch(e.target.value)}
          placeholder="Search by Project Code, Name or Link Code (e.g. L1-101)..."
          className="w-full h-8 px-2.5 mb-2 rounded-lg text-xs bg-white dark:bg-[#18181b] border border-slate-300 dark:border-[#444446] text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
        />

        <div className="max-h-32 overflow-y-auto rounded-lg border border-slate-200 dark:border-[#38383c] bg-white dark:bg-[#18181b] divide-y divide-slate-100 dark:divide-[#2c2c30]">
          {filteredProjects.length === 0 ? (
            <div className="p-3 text-center text-xs text-slate-400">
              No projects match current filter. You can still save directly to a Layout Unit code below.
            </div>
          ) : (
            filteredProjects.map((p) => {
              const isSelected = p.id === selectedProjectId;
              const allCodes = extractAllProjectCodes(p).join(', ');
              return (
                <button
                  key={p.id || `${p.store}_${p.year}_${p.code}`}
                  type="button"
                  onClick={() => onSelectProject(isSelected ? null : p)}
                  className={`w-full text-left px-2.5 py-1.5 flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-bold'
                      : 'hover:bg-slate-50 dark:hover:bg-[#26262a] text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-xs truncate">
                      <span className="font-mono font-bold text-blue-600 dark:text-blue-400 shrink-0">
                        [{p.store} • {p.year}] {p.code}
                      </span>
                      <span className="truncate">{p.name}</span>
                    </div>
                    {allCodes && (
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                        Location: {p.location || 'N/A'} • Units: {allCodes}
                      </div>
                    )}
                  </div>
                  {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Step 3: Layout Unit (Lô mặt bằng) */}
      <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#222225] border border-slate-200/80 dark:border-[#36363a]">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
            <Layers className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>3. Select Layout Unit (Floor Plan Unit Code)</span>
          </div>
          {selectedProject && (
            <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
              Linked to {selectedProject.code}
            </span>
          )}
        </div>

        {suggestedUnits.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {suggestedUnits.map((u) => {
              const active = unitCode.trim().toLowerCase() === u.toLowerCase();
              return (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnitCode(u)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border transition-all cursor-pointer active:scale-95 ${
                    active
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                      : 'bg-white dark:bg-[#18181b] text-slate-700 dark:text-slate-300 border-slate-300 dark:border-[#444446] hover:border-emerald-500'
                  }`}
                >
                  {u}
                </button>
              );
            })}
          </div>
        )}

        <input
          type="text"
          value={unitCode}
          onChange={(e) => setUnitCode(e.target.value)}
          placeholder="Enter or select Layout Unit Code (e.g. L1-101, B1-BOH, COLOR_LEGEND_L1)..."
          className="w-full h-8 px-2.5 rounded-lg text-xs font-mono font-bold bg-white dark:bg-[#18181b] border border-slate-300 dark:border-[#444446] text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500"
        />
      </div>

      {/* Step 4: Pin / Inspection Point or Task */}
      <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#222225] border border-slate-200/80 dark:border-[#36363a]">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
            <MapPin className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
            <span>4. Select Inspection Pin (Point) or Project Task</span>
          </div>
          {pinCoords && (
            <button
              type="button"
              onClick={() => setPinCoords(null)}
              className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 cursor-pointer"
              title="Click to clear Pin X/Y coordinates"
            >
              <Crosshair className="w-3 h-3" />
              Pin @ {pinCoords.x.toFixed(0)}%, {pinCoords.y.toFixed(0)}% ×
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 mb-2">
          <button
            type="button"
            onClick={() => setPinMode('preset')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
              pinMode === 'preset'
                ? 'bg-rose-600 text-white'
                : 'bg-white dark:bg-[#18181b] text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-[#444446]'
            }`}
          >
            Standard Inspection Pins
          </button>
          <button
            type="button"
            onClick={() => setPinMode('task')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
              pinMode === 'task'
                ? 'bg-rose-600 text-white'
                : 'bg-white dark:bg-[#18181b] text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-[#444446]'
            }`}
          >
            Link to Project Task ({projectTasks.length})
          </button>
          <button
            type="button"
            onClick={() => setPinMode('custom')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
              pinMode === 'custom'
                ? 'bg-rose-600 text-white'
                : 'bg-white dark:bg-[#18181b] text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-[#444446]'
            }`}
          >
            Custom Pin Label
          </button>
        </div>

        {pinMode === 'preset' && (
          <select
            value={selectedPinId}
            onChange={(e) => setSelectedPinId(e.target.value)}
            className="w-full h-8 px-2.5 rounded-lg text-xs font-semibold bg-white dark:bg-[#18181b] border border-slate-300 dark:border-[#444446] text-slate-800 dark:text-slate-100 outline-none focus:border-rose-500"
          >
            {PRESET_INSPECTION_PINS.map((pin) => (
              <option key={pin.id} value={pin.id}>
                {pin.label}
              </option>
            ))}
          </select>
        )}

        {pinMode === 'task' && (
          <select
            value={selectedTaskId}
            onChange={(e) => setSelectedTaskId(e.target.value)}
            className="w-full h-8 px-2.5 rounded-lg text-xs font-semibold bg-white dark:bg-[#18181b] border border-slate-300 dark:border-[#444446] text-slate-800 dark:text-slate-100 outline-none focus:border-rose-500"
          >
            <option value="">-- Choose a Task in Selected Project --</option>
            {projectTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.start || 'N/A'} → {t.finish || 'N/A'})
              </option>
            ))}
          </select>
        )}

        {pinMode === 'custom' && (
          <input
            type="text"
            value={customPinLabel}
            onChange={(e) => setCustomPinLabel(e.target.value)}
            placeholder="e.g. Pillar B4 Ceiling Access Hatch / North Wall Signboard..."
            className="w-full h-8 px-2.5 rounded-lg text-xs font-semibold bg-white dark:bg-[#18181b] border border-slate-300 dark:border-[#444446] text-slate-800 dark:text-slate-100 outline-none focus:border-rose-500"
          />
        )}
      </div>

      {/* Step 5: Shared Title & Zalo Inspection Note */}
      <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#222225] border border-slate-200/80 dark:border-[#36363a]">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">
          <FileText className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span>5. Photo Title & Inspection Caption (Auto-filled from Zalo Share)</span>
        </div>
        <div className="grid grid-cols-1 gap-2">
          <input
            type="text"
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            placeholder="Photo title (optional - auto-generated from Unit & Pin if blank)..."
            className="w-full h-8 px-2.5 rounded-lg text-xs bg-white dark:bg-[#18181b] border border-slate-300 dark:border-[#444446] text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
          />
          <textarea
            rows={2}
            value={captionInput}
            onChange={(e) => setCaptionInput(e.target.value)}
            placeholder="Inspection notes or message shared from Zalo group..."
            className="w-full p-2 rounded-lg text-xs bg-white dark:bg-[#18181b] border border-slate-300 dark:border-[#444446] text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 resize-none"
          />
        </div>
      </div>
    </div>
  );
});
