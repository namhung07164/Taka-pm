import React from 'react';
import {
  DollarSign,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  MapPin,
  TrendingUp,
  FileWarning,
  Layers,
} from 'lucide-react';
import { ExecutiveProjectSlideData } from './executiveDeckTypes';
import { ExecutiveFloorPlanCanvas } from './ExecutiveFloorPlanCanvas';

interface ExecutiveProjectSlideCardProps {
  slide: ExecutiveProjectSlideData;
  slideIndex: number;
  totalSlides: number;
  zoomToUnit: boolean;
  customRiskNote: string;
  onUpdateRiskNote?: (projectId: string, val: string) => void;
}

export const ExecutiveProjectSlideCard: React.FC<ExecutiveProjectSlideCardProps> = React.memo(({
  slide,
  slideIndex,
  totalSlides,
  zoomToUnit,
  customRiskNote,
  onUpdateRiskNote,
}) => {
  const {
    project,
    store,
    year,
    location,
    effectiveSizeM2,
    overallStatus,
    planProgress,
    actProgress,
    takStart,
    takCompl,
    openingDate,
    floorBgUrl,
    floorVersionName,
    floorBgScale,
    floorBgPos,
    allFloorUnits,
    matchedUnits,
    financials,
    milestones,
    risks,
    totalTaskCount,
    completedTaskCount,
    delayedTaskCount,
  } = slide;

  const statusBadgeClass =
    overallStatus === 'Completed' || overallStatus === 'Handover'
      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
      : delayedTaskCount > 0 || overallStatus === 'Delayed'
      ? 'bg-rose-500/20 text-rose-300 border-rose-400/40'
      : overallStatus === 'On process'
      ? 'bg-blue-500/20 text-blue-300 border-blue-400/40'
      : 'bg-amber-500/20 text-amber-300 border-amber-400/40';

  const healthColor =
    financials.healthStatus === 'danger'
      ? 'text-rose-600 bg-rose-50 border-rose-200'
      : financials.healthStatus === 'warning'
      ? 'text-amber-700 bg-amber-50 border-amber-200'
      : 'text-emerald-700 bg-emerald-50 border-emerald-200';

  return (
    <div
      data-executive-slide="true"
      className="w-[1122px] h-[794px] bg-white text-slate-800 rounded-xl shadow-xl border border-slate-200 overflow-hidden flex flex-col shrink-0 select-none print:shadow-none print:rounded-none print:border-none"
    >
      {/* 1. Executive Header Banner */}
      <div className="h-[74px] bg-slate-900 text-white px-6 flex items-center justify-between shrink-0 border-b-2 border-red-600">
        <div className="flex items-center gap-3.5 min-w-0">
          {/* Takashimaya Emblem */}
          <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shrink-0 shadow-xs">
            <span className="text-red-600 font-black text-xl leading-none border-2 border-red-600 rounded-full w-8 h-8 flex items-center justify-center">
              高
            </span>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-red-600 text-white font-mono font-black text-xs tracking-wide shrink-0">
                {project.code}
              </span>
              <h1 className="text-lg font-extrabold tracking-tight text-white truncate max-w-[460px]">
                {project.name || 'Untitled Project'}
              </h1>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border shrink-0 ${statusBadgeClass}`}>
                {overallStatus}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-300 mt-1 font-medium">
              <span>Store: <strong className="text-white">{store}</strong></span>
              <span>•</span>
              <span>Floor: <strong className="text-white">{location}</strong></span>
              <span>•</span>
              <span>FY: <strong className="text-white">{year}</strong></span>
              <span>•</span>
              <span>Area: <strong className="text-emerald-400">{effectiveSizeM2 > 0 ? `${effectiveSizeM2.toLocaleString('en-US')} m²` : 'N/A'}</strong></span>
              {project.shopType && (
                <>
                  <span>•</span>
                  <span>Type: <strong className="text-white">{project.shopType}</strong></span>
                </>
              )}
              {project.mdStatus && (
                <>
                  <span>•</span>
                  <span>MD: <strong className="text-amber-300">{project.mdStatus}</strong></span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Header KPIs: Plan vs Actual Progress */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-3 bg-slate-800/90 border border-slate-700 rounded-xl px-3.5 py-1.5">
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Plan vs Actual</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-mono font-bold text-blue-400">Plan: {planProgress}%</span>
                <span className="text-slate-600">|</span>
                <span className="text-sm font-mono font-black text-emerald-400">Act: {actProgress}%</span>
              </div>
            </div>
            <div className="w-20 bg-slate-700 h-2.5 rounded-full overflow-hidden flex flex-col gap-0.5 p-0.5">
              <div className="bg-blue-400 h-1 rounded-full" style={{ width: `${Math.min(100, planProgress)}%` }} />
              <div className="bg-emerald-400 h-1 rounded-full" style={{ width: `${Math.min(100, actProgress)}%` }} />
            </div>
          </div>

          <div className="text-right text-[10px] font-mono text-slate-400 leading-tight">
            <div className="font-bold text-slate-200 uppercase">Executive One-Pager</div>
            <div>Slide {slideIndex + 1} / {totalSlides}</div>
            <div>{new Date().toISOString().slice(0, 10)}</div>
          </div>
        </div>
      </div>

      {/* 2. Main 2-Column Body */}
      <div className="flex-1 grid grid-cols-12 gap-4 p-4 min-h-0 bg-slate-50/60">
        {/* LEFT COLUMN (5 cols): Floor Plan with Highlighted Unit + Unit Metadata */}
        <div className="col-span-5 flex flex-col gap-3 min-h-0">
          <div className="flex-1 bg-white rounded-xl border border-slate-200 p-2.5 shadow-2xs flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-red-600" />
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  1. Floor Layout & Unit Location
                </h2>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                {matchedUnits.length > 0
                  ? `Highlighted: ${matchedUnits.map((m) => m.unit.name).join(', ')}`
                  : `${store} • ${location}`}
              </span>
            </div>

            <div className="flex-1 min-h-0">
              <ExecutiveFloorPlanCanvas
                floorBgUrl={floorBgUrl}
                floorVersionName={floorVersionName}
                floorBgScale={floorBgScale}
                floorBgPos={floorBgPos}
                allFloorUnits={allFloorUnits}
                matchedUnits={matchedUnits}
                projectCode={project.code}
                locationLabel={`${store} - ${location}`}
                zoomToUnit={zoomToUnit}
              />
            </div>
          </div>

          {/* Key Project Dates & Profile Strip */}
          <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs shrink-0">
            <div className="grid grid-cols-3 gap-2 mb-2.5">
              <div className="bg-blue-50/70 border border-blue-200/80 rounded-lg p-2">
                <div className="text-[9px] font-bold uppercase text-blue-600 flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Start Date
                </div>
                <div className="text-xs font-mono font-black text-slate-900 mt-0.5">{takStart}</div>
              </div>
              <div className="bg-amber-50/70 border border-amber-200/80 rounded-lg p-2">
                <div className="text-[9px] font-bold uppercase text-amber-700 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Handover
                </div>
                <div className="text-xs font-mono font-black text-slate-900 mt-0.5">{takCompl}</div>
              </div>
              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-lg p-2">
                <div className="text-[9px] font-bold uppercase text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Opening
                </div>
                <div className="text-xs font-mono font-black text-slate-900 mt-0.5">{openingDate}</div>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-600 pt-2 border-t border-slate-100">
              <div>
                PIC / Party: <strong className="text-slate-900">{project.party || 'PMO'}</strong>
              </div>
              <div>
                Tasks: <strong className="text-emerald-600">{completedTaskCount}</strong>/{totalTaskCount} Done
                {delayedTaskCount > 0 && (
                  <span className="ml-1.5 text-rose-600 font-bold">({delayedTaskCount} Delayed)</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (7 cols): Budget/Actual + Milestones + Latest Risk Notes */}
        <div className="col-span-7 flex flex-col gap-3 min-h-0">
          {/* 2. Budget & Actual Cost Metrics Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  2. Budget & Actual Cost Summary ({financials.currencyLabel})
                </h2>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${healthColor}`}>
                {financials.healthStatus === 'danger'
                  ? 'Over Budget Alert'
                  : financials.healthStatus === 'warning'
                  ? 'Near Budget Limit (<20%)'
                  : 'Budget On Track'}
                {' • '}
                {financials.utilizationPercent}% Used
              </span>
            </div>

            <div className="grid grid-cols-5 gap-2">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
                <div className="text-[9px] font-bold uppercase text-slate-500">Approved Budget</div>
                <div className="text-sm font-mono font-black text-slate-900 mt-0.5">
                  {financials.formattedBudget}
                </div>
              </div>
              <div className="bg-blue-50/60 border border-blue-200 rounded-lg p-2">
                <div className="text-[9px] font-bold uppercase text-blue-700">Actual Paid</div>
                <div className="text-sm font-mono font-black text-blue-900 mt-0.5">
                  {financials.formattedActual}
                </div>
              </div>
              <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-2">
                <div className="text-[9px] font-bold uppercase text-amber-700">Forecast Cost</div>
                <div className="text-sm font-mono font-black text-amber-900 mt-0.5">
                  {financials.formattedForecast}
                </div>
              </div>
              <div className="bg-purple-50/60 border border-purple-200 rounded-lg p-2">
                <div className="text-[9px] font-bold uppercase text-purple-700">Supporting Fee</div>
                <div className="text-sm font-mono font-black text-purple-900 mt-0.5">
                  {financials.formattedSupportingFee}
                </div>
              </div>
              <div
                className={`border rounded-lg p-2 ${
                  financials.remainingBalance < 0
                    ? 'bg-rose-50 border-rose-300 text-rose-900'
                    : 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                }`}
              >
                <div className="text-[9px] font-bold uppercase opacity-80">Remaining Balance</div>
                <div className="text-sm font-mono font-black mt-0.5">
                  {financials.formattedRemaining}
                </div>
              </div>
            </div>

            {/* Budget Utilization Bar */}
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                <div
                  className={`h-full rounded-full ${
                    financials.healthStatus === 'danger'
                      ? 'bg-rose-500'
                      : financials.healthStatus === 'warning'
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, financials.utilizationPercent))}%` }}
                />
              </div>
              <span className="text-[10px] font-mono font-bold text-slate-600 shrink-0">
                {financials.utilizationPercent}% Committed
              </span>
            </div>
          </div>

          {/* 3. Key Progress Milestones Table */}
          <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  3. Key Progress Milestones & Critical Path
                </h2>
              </div>
              <span className="text-[10px] font-semibold text-slate-500">
                Showing {milestones.length} key milestones
              </span>
            </div>

            <div className="overflow-hidden border border-slate-200 rounded-lg flex-1">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 border-b border-slate-200 text-[10px] uppercase font-bold">
                    <th className="py-1.5 px-2.5">Milestone / Task</th>
                    <th className="py-1.5 px-2 w-20">Party</th>
                    <th className="py-1.5 px-2 w-24">Start</th>
                    <th className="py-1.5 px-2 w-24">Finish</th>
                    <th className="py-1.5 px-2 w-24">Status</th>
                    <th className="py-1.5 px-2.5 w-24 text-right">Progress</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {milestones.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-400 italic">
                        No milestones or tasks recorded for this project yet.
                      </td>
                    </tr>
                  ) : (
                    milestones.map((ms) => {
                      const isDelayed = ms.status === 'Delayed';
                      const isDone = ms.status === 'Completed' || ms.status === 'Handover';
                      const isProcess = ms.status === 'On process';
                      return (
                        <tr
                          key={ms.id}
                          className={
                            ms.isPrimaryMilestone
                              ? 'bg-slate-50/80 font-semibold'
                              : 'hover:bg-slate-50/50'
                          }
                        >
                          <td className="py-1.5 px-2.5 truncate max-w-[230px]">
                            <div className="flex items-center gap-1.5 truncate">
                              {ms.isPrimaryMilestone && (
                                <Layers className="w-3 h-3 text-blue-600 shrink-0" />
                              )}
                              {ms.code && (
                                <span className="font-mono text-[10px] text-slate-500 shrink-0">
                                  [{ms.code}]
                                </span>
                              )}
                              <span className="truncate text-slate-800">{ms.name}</span>
                            </div>
                          </td>
                          <td className="py-1.5 px-2 text-slate-600 truncate max-w-[80px]">
                            {ms.party || '-'}
                          </td>
                          <td className="py-1.5 px-2 font-mono text-[10px] text-slate-600">
                            {ms.start ? String(ms.start).slice(0, 10) : '-'}
                          </td>
                          <td className="py-1.5 px-2 font-mono text-[10px] text-slate-600">
                            {ms.finish ? String(ms.finish).slice(0, 10) : '-'}
                          </td>
                          <td className="py-1.5 px-2">
                            <span
                              className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                isDone
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : isDelayed
                                  ? 'bg-rose-100 text-rose-800'
                                  : isProcess
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {ms.status}
                            </span>
                          </td>
                          <td className="py-1.5 px-2.5">
                            <div className="flex items-center justify-end gap-1.5">
                              <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    isDone
                                      ? 'bg-emerald-500'
                                      : isDelayed
                                      ? 'bg-rose-500'
                                      : 'bg-blue-500'
                                  }`}
                                  style={{ width: `${ms.progress}%` }}
                                />
                              </div>
                              <span className="font-mono text-[10px] font-bold text-slate-700 w-7 text-right">
                                {ms.progress}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. Latest Risk Notes & Executive Commentary */}
          <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs shrink-0 h-[168px] flex flex-col">
            <div className="flex items-center justify-between mb-1.5 shrink-0">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  4. Latest Risk Notes & Management Escalations
                </h2>
              </div>
              <span className="text-[10px] text-slate-400 font-medium hide-on-actual-print print:hidden">
                Click box below to add/override meeting risk note
              </span>
            </div>

            <div className="grid grid-cols-12 gap-2.5 flex-1 min-h-0">
              {/* Left 7 cols: Auto-aggregated risk & comment feed */}
              <div className="col-span-7 flex flex-col gap-1 overflow-y-auto pr-1">
                {risks.length === 0 ? (
                  <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50/70 border border-emerald-200 rounded-lg p-2.5 h-full">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>No critical risks, overdue blockers, or escalations reported.</span>
                  </div>
                ) : (
                  risks.map((r) => (
                    <div
                      key={r.id}
                      className={`px-2.5 py-1.5 rounded-lg border text-[11px] leading-snug flex items-start gap-1.5 ${
                        r.severity === 'high'
                          ? 'bg-rose-50/80 border-rose-200 text-rose-900'
                          : r.severity === 'medium'
                          ? 'bg-amber-50/80 border-amber-200 text-amber-900'
                          : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    >
                      <FileWarning
                        className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                          r.severity === 'high'
                            ? 'text-rose-600'
                            : r.severity === 'medium'
                            ? 'text-amber-600'
                            : 'text-slate-500'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1 text-[9px] font-bold uppercase opacity-75">
                          <span>{r.source}{r.author ? ` • ${r.author}` : ''}</span>
                          {r.timestamp && <span className="font-mono">{r.timestamp}</span>}
                        </div>
                        <div className="font-medium line-clamp-2 break-words">{r.content}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Right 5 cols: Editable Executive Action / Risk Note */}
              <div className="col-span-5 flex flex-col h-full">
                <div className="text-[9px] font-bold uppercase text-slate-500 mb-1">
                  PM Meeting Note / Action Plan
                </div>
                <textarea
                  value={customRiskNote !== undefined ? customRiskNote : project.note || ''}
                  onChange={(e) => onUpdateRiskNote?.(String(project.id || project.code), e.target.value)}
                  placeholder="Enter key risk mitigation or executive decision for this project..."
                  className="w-full flex-1 resize-none rounded-lg border border-amber-200 bg-amber-50/40 p-2 text-[11px] font-medium text-slate-800 placeholder-slate-400 outline-none focus:border-amber-500 leading-snug"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

ExecutiveProjectSlideCard.displayName = 'ExecutiveProjectSlideCard';
