import React, { Dispatch, SetStateAction, memo } from 'react';
import { Target, Plus } from 'lucide-react';
import { Project, AppUser } from '../../types';
import { FastInput } from '../FastInput';
import { FastTextarea } from './FastTextarea';
import { MultiSelect } from '../MultiSelect';
import { getStatus, cn } from '../../lib/utils';
import { useLanguage } from '../../lib/LanguageContext';
import { LinkCodesValidationError } from './projectModalTypes';

interface ProjectDetailsFormProps {
  formData: Partial<Project>;
  setFormData: React.Dispatch<React.SetStateAction<Partial<Project>>>;
  linkCodesError: LinkCodesValidationError | null;
  canWrite: boolean;
  currentUser: AppUser | null;
  locations: string[];
  parties: string[];
  isAddingLocation: boolean;
  setIsAddingLocation: (v: boolean) => void;
  newLocation: string;
  setNewLocation: (v: string) => void;
  handleAddNewLocation: () => Promise<void>;
  enrichedProject: any;
  project: Project | null;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  handleDelete: () => Promise<void>;
  onClose: () => void;
  yearRef: React.RefObject<HTMLInputElement | null>;
}

export const ProjectDetailsForm = memo(function ProjectDetailsForm({
  formData,
  setFormData,
  linkCodesError,
  canWrite,
  currentUser,
  locations,
  parties,
  isAddingLocation,
  setIsAddingLocation,
  newLocation,
  setNewLocation,
  handleAddNewLocation,
  enrichedProject,
  project,
  handleSubmit,
  handleDelete,
  onClose,
  yearRef
}: ProjectDetailsFormProps) {
  const { t } = useLanguage();

  return (
    <form onSubmit={handleSubmit} className="flex flex-col flex-grow overflow-hidden">
      <div className="p-4 md:p-6 overflow-y-auto flex-grow">
        {/* Row 1: Store, Location, Year */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">
              Store *
            </label>
            <select
              value={formData.store || ""}
              onChange={(e) => setFormData({ ...formData, store: e.target.value })}
              required
              disabled={!canWrite}
              className="w-full p-2.5 border border-slate-200 dark:border-[#444446] rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white dark:bg-[#1e1e20]"
            >
              <option value="" disabled hidden>Select Store</option>
              <option value="HCM">HCM</option>
              <option value="HN">HN</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1 flex items-center justify-between">
              <span>Location *</span>
              {currentUser?.role === 'admin' && !isAddingLocation && (
                <button
                  type="button"
                  onClick={() => setIsAddingLocation(true)}
                  className="text-blue-500 hover:text-blue-600 dark:text-blue-400 font-medium text-[10px] flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> Add New
                </button>
              )}
            </label>
            {isAddingLocation ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  placeholder="Enter new location"
                  className="flex-grow p-2.5 border border-slate-200 dark:border-[#444446] rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white dark:bg-[#1e1e20]"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleAddNewLocation}
                  className="px-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-bold cursor-pointer"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => { setIsAddingLocation(false); setNewLocation(''); }}
                  className="px-3 bg-slate-200 dark:bg-[#333336] text-slate-700 dark:text-[#e3e3e3] rounded-lg hover:bg-slate-300 dark:hover:bg-[#444446] text-sm font-bold cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <select
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                required
                disabled={!canWrite}
                className="w-full p-2.5 border border-slate-200 dark:border-[#444446] rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white dark:bg-[#1e1e20]"
              >
                <option value="">Select Location</option>
                {Array.from(new Set([...locations]))
                  .filter((loc) => String(loc).toLowerCase() !== "all")
                  .filter((loc) => {
                    if (currentUser?.role === 'admin') return true;
                    let permLoc = (loc as string).toLowerCase();
                    if (["md-b1", "md-l1", "md-l2", "md-l3", "md-l4"].includes(permLoc)) {
                      permLoc = permLoc.replace("md-", "");
                    }
                    return currentUser?.locationPermissions?.["all"] || currentUser?.locationPermissions?.[permLoc];
                  })
                  .map((loc) => (
                    <option key={loc as string} value={loc as string}>{loc as string}</option>
                  ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">
              Year *
            </label>
            <input
              ref={yearRef as any}
              type="number"
              inputMode="numeric"
              value={formData.year || ''}
              onChange={(e) => setFormData({ ...formData, year: e.target.value ? parseInt(e.target.value) : '' })}
              required
              readOnly={!canWrite}
              className="w-full p-2.5 border border-slate-200 dark:border-[#444446] rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
            />
          </div>
        </div>

        {/* Row 2: Project Code & Project Code Link */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 mb-4">
          <div className="sm:col-span-5">
            <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">
              Project Code *
            </label>
            <FastInput
              type="text"
              inputMode="text"
              value={formData.code || ''}
              onChange={(val) => {
                const cleanCode = val.replace(/\s+/g, '');
                setFormData((prev) => {
                  const newCode = cleanCode;
                  const currentLink = prev.linkCodes;
                  const oldCode = prev.code || '';
                  const shouldSync = !currentLink || currentLink.trim() === '' || currentLink.trim() === oldCode.trim();
                  return {
                    ...prev,
                    code: newCode,
                    linkCodes: shouldSync ? newCode : currentLink
                  };
                });
              }}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.code === 'Space') {
                  e.preventDefault();
                }
              }}
              required
              readOnly={!canWrite}
              placeholder="e.g. PM-L1-HCM-2026-01"
              className="w-full p-2.5 border border-slate-200 dark:border-[#444446] rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono font-bold uppercase"
            />
          </div>

          <div className="sm:col-span-7">
            <label className="block text-[11px] font-bold text-slate-400 dark:text-[#838383] uppercase mb-1 flex items-center justify-between">
              <span>Project Code Link</span>
              <span className="text-[10px] text-slate-400 font-normal lowercase">(multi, separated by ",")</span>
            </label>
            <FastInput
              type="text"
              inputMode="text"
              value={formData.linkCodes ?? (formData.code || '')}
              onChange={(val) => setFormData({ ...formData, linkCodes: val })}
              placeholder="e.g. L3-303-1, L3-303-2"
              readOnly={!canWrite}
              className={cn(
                "w-full p-2.5 border rounded-lg focus:ring-2 outline-none text-xs bg-slate-50 dark:bg-[#1a1a1c]",
                linkCodesError
                  ? "border-rose-500 text-rose-600 dark:text-rose-400 focus:ring-rose-500"
                  : "border-slate-200 dark:border-[#444446] focus:ring-blue-500"
              )}
            />
            {linkCodesError && (
              <p className="mt-1.5 text-[11px] text-rose-500 dark:text-rose-400 font-medium flex items-start gap-1 leading-tight">
                <span className="shrink-0">⚠️</span>
                <span>Code "<strong>{linkCodesError.invalidCode}</strong>" already belongs to project "<strong>{linkCodesError.duplicateProjectCode}</strong>"{linkCodesError.duplicateProjectYear ? ` (${linkCodesError.duplicateProjectYear})` : ''} - {linkCodesError.duplicateProjectName}. Cannot be used as link.</span>
              </p>
            )}
          </div>
        </div>

        {/* Project Name */}
        <div className="mb-5">
          <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">
            Project Name *
          </label>
          <FastInput
            type="text"
            inputMode="text"
            value={formData.name || ''}
            onChange={(val) => setFormData({ ...formData, name: val })}
            required
            readOnly={!canWrite}
            className="w-full p-2.5 border border-slate-200 dark:border-[#444446] rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
          />
        </div>

        {/* Baseline Start & Finish */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="flex items-center justify-between text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">
              <span>{t("Baseline Start")}</span>
              {canWrite && (
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, baselineStart: enrichedProject?.computedTakStart || '' })}
                  className="text-blue-500 hover:text-blue-600 outline-none transition-colors cursor-pointer"
                  title="Copy from Plan"
                >
                  <Target className="w-3.5 h-3.5"/>
                </button>
              )}
            </label>
            <input
              type="datetime-local"
              value={formData.baselineStart || ''}
              readOnly={!canWrite}
              onChange={(e) => setFormData({ ...formData, baselineStart: e.target.value })}
              className="w-full p-2 border border-slate-200 dark:border-[#444446] rounded-lg text-sm group-hover:border-slate-300 dark:group-hover:border-[#555557] focus:border-blue-500 outline-none read-only:bg-slate-50 read-only:text-slate-500"
            />
          </div>
          <div>
            <label className="flex items-center justify-between text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">
              <span>{t("Baseline Finish")}</span>
              {canWrite && (
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, baselineFinish: enrichedProject?.computedTakCompl || '' })}
                  className="text-blue-500 hover:text-blue-600 outline-none transition-colors cursor-pointer"
                  title="Copy from Plan"
                >
                  <Target className="w-3.5 h-3.5"/>
                </button>
              )}
            </label>
            <input
              type="datetime-local"
              value={formData.baselineFinish || ''}
              readOnly={!canWrite}
              onChange={(e) => setFormData({ ...formData, baselineFinish: e.target.value })}
              className="w-full p-2 border border-slate-200 dark:border-[#444446] rounded-lg text-sm group-hover:border-slate-300 dark:group-hover:border-[#555557] focus:border-blue-500 outline-none read-only:bg-slate-50 read-only:text-slate-500"
            />
          </div>
        </div>

        {/* Party MultiSelect */}
        <div className="mb-5">
          <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">
            {t("Party")}
          </label>
          <MultiSelect
            value={formData.party || ''}
            onChange={(val) => setFormData({ ...formData, party: val })}
            options={parties}
            placeholder="Contractor A, Contractor B"
            disabled={!canWrite}
            className="w-full text-sm"
          />
        </div>

        {/* MD Status & Description */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4 mb-5">
          <div>
            <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">
              MD Status
            </label>
            <select
              value={formData.mdStatus || ''}
              onChange={(e) => setFormData({ ...formData, mdStatus: e.target.value })}
              disabled={!canWrite}
              className="w-full p-2.5 border border-slate-200 dark:border-[#444446] rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white dark:bg-[#1e1e20]"
            >
              <option value="">-- None --</option>
              <option value="approached">approached</option>
              <option value="negotiation">negotiation</option>
              <option value="Verbally agreed">Verbally agreed</option>
              <option value="MOU signed">MOU signed</option>
              <option value="Signed agreement">Signed agreement</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">
              Description
            </label>
            <FastTextarea
              inputMode="text"
              value={formData.detail || ''}
              onChange={(val) => setFormData({ ...formData, detail: val })}
              rows={3}
              readOnly={!canWrite}
              className="w-full p-2.5 border border-slate-200 dark:border-[#444446] rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none"
            />
          </div>
        </div>

        {/* Read-only Computed Dates & Status */}
        <div className="grid grid-cols-1 lg:grid-cols-4 md:grid-cols-2 gap-4 mb-8">
          <div>
            <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">Pj Start</label>
            <input
              type="datetime-local"
              value={enrichedProject?.computedTakStart || ''}
              readOnly
              disabled
              className="w-full p-2 border border-slate-200 dark:border-[#444446] rounded-lg text-sm bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-400 dark:text-[#838383] cursor-not-allowed font-medium"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">Pj Compl</label>
            <input
              type="datetime-local"
              value={enrichedProject?.computedTakCompl || ''}
              readOnly
              disabled
              className="w-full p-2 border border-slate-200 dark:border-[#444446] rounded-lg text-sm bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-400 dark:text-[#838383] cursor-not-allowed font-medium"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">Opening</label>
            <input
              type="datetime-local"
              value={enrichedProject?.computedOpening || ''}
              readOnly
              disabled
              className="w-full p-2 border border-slate-200 dark:border-[#444446] rounded-lg text-sm bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-400 dark:text-[#838383] cursor-not-allowed font-medium"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">{t("Status")}</label>
            <input
              type="text"
              value={getStatus(enrichedProject?.computedTakStart || '', enrichedProject?.computedTakCompl || '', enrichedProject?.computedOpening || '', formData.code || '')}
              disabled
              className="w-full p-2 border border-slate-100 dark:border-[#333336] bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-400 dark:text-[#838383] rounded-lg font-bold text-sm"
            />
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="px-4 md:px-6 py-4 border-t border-slate-100 dark:border-[#333336] flex items-center justify-between shrink-0 bg-white dark:bg-[#1e1e20] pb-[env(safe-area-inset-bottom)]">
        {project && canWrite && (
          <button
            title="Delete from Cloud"
            type="button"
            onClick={handleDelete}
            className="px-4 py-2 text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg cursor-pointer"
          >
            Delete from Cloud
          </button>
        )}
        <div className="flex gap-3 ml-auto">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 text-sm font-bold text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-100 dark:hover:bg-[#28282a] rounded-lg cursor-pointer"
          >
            Close
          </button>
          {canWrite && (
            <button
              title="Save to Cloud"
              type="submit"
              className="px-8 py-2 bg-slate-900 dark:bg-blue-600 text-white rounded-lg font-bold text-sm shadow-xl active:scale-95 transition-all cursor-pointer"
            >
              Save to Cloud
            </button>
          )}
        </div>
      </div>
    </form>
  );
});
