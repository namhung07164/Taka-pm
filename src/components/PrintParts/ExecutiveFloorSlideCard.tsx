import React from 'react';
import {
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  TrendingUp,
  FileWarning,
  Building2,
} from 'lucide-react';
import { ExecutiveFloorSlideData } from './executiveDeckTypes';
import { ExecutiveFloorPlanCanvas } from './ExecutiveFloorPlanCanvas';

interface ExecutiveFloorSlideCardProps {
  floorSlide: ExecutiveFloorSlideData;
  slideIndex: number;
  totalSlides: number;
}

export const ExecutiveFloorSlideCard: React.FC<ExecutiveFloorSlideCardProps> = React.memo(({
  floorSlide,
  slideIndex,
  totalSlides,
}) => {
  const {
    store,
    location,
    year,
    floorBgUrl,
    floorVersionName,
    floorBgScale,
    floorBgPos,
    allFloorUnits,
    matchedUnits,
    projects,
    totalProjects,
    totalAreaM2,
    avgPlanProgress,
    avgActProgress,
    completedCount,
    onProcessCount,
    delayedCount,
    upcomingCount,
    financials,
    topRisks,
  } = floorSlide;

  return (
    <div
      data-executive-slide="true"
      className="w-[1122px] h-[794px] bg-white text-slate-800 rounded-xl shadow-xl border border-slate-200 overflow-hidden flex flex-col shrink-0 select-none print:shadow-none print:rounded-none print:border-none"
    >
      {/* 1. Floor Executive Header Banner */}
      <div className="h-[74px] bg-slate-900 text-white px-6 flex items-center justify-between shrink-0 border-b-2 border-red-600">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shrink-0 shadow-xs">
            <span className="text-red-600 font-black text-xl leading-none border-2 border-red-600 rounded-full w-8 h-8 flex items-center justify-center">
              高
            </span>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-0.5 rounded bg-red-600 text-white font-mono font-black text-xs tracking-wide shrink-0">
                {store} • {location}
              </span>
              <h1 className="text-lg font-extrabold tracking-tight text-white truncate">
                Floor Executive Summary — Level {location} (FY {year})
              </h1>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-300 mt-1 font-medium">
              <span>Total Projects: <strong className="text-white">{totalProjects}</strong></span>
              <span>•</span>
              <span>Total Area: <strong className="text-emerald-400">{totalAreaM2.toLocaleString('en-US')} m²</strong></span>
              <span>•</span>
              <span className="text-emerald-400">Done: <strong>{completedCount}</strong></span>
              <span>•</span>
              <span className="text-blue-400">On Process: <strong>{onProcessCount}</strong></span>
              <span>•</span>
              <span className="text-amber-300">Upcoming: <strong>{upcomingCount}</strong></span>
              {delayedCount > 0 && (
                <>
                  <span>•</span>
                  <span className="text-rose-400 font-bold">Delayed: {delayedCount}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Header KPIs */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-3 bg-slate-800/90 border border-slate-700 rounded-xl px-3.5 py-1.5">
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Floor Avg Progress</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-mono font-bold text-blue-400">Plan: {avgPlanProgress}%</span>
                <span className="text-slate-600">|</span>
                <span className="text-sm font-mono font-black text-emerald-400">Act: {avgActProgress}%</span>
              </div>
            </div>
          </div>

          <div className="text-right text-[10px] font-mono text-slate-400 leading-tight">
            <div className="font-bold text-slate-200 uppercase">Floor One-Pager</div>
            <div>Slide {slideIndex + 1} / {totalSlides}</div>
            <div>{new Date().toISOString().slice(0, 10)}</div>
          </div>
        </div>
      </div>

      {/* 2. Main 2-Column Body */}
      <div className="flex-1 grid grid-cols-12 gap-4 p-4 min-h-0 bg-slate-50/60">
        {/* LEFT COLUMN (5 cols): Floor Layout with Multi-Unit Highlights */}
        <div className="col-span-5 flex flex-col gap-3 min-h-0">
          <div className="flex-1 bg-white rounded-xl border border-slate-200 p-2.5 shadow-2xs flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-red-600" />
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  1. Floor Plan & Active Units ({location})
                </h2>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                {matchedUnits.length} Mapped Units
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
                locationLabel={`${store} - ${location}`}
                zoomToUnit={false}
              />
            </div>
          </div>

          {/* Floor Status Breakdown Bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs shrink-0">
            <div className="text-[10px] font-bold uppercase text-slate-500 mb-2 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-slate-700" />
              Floor Portfolio Status Breakdown
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-1.5">
                <div className="text-sm font-mono font-black text-emerald-700">{completedCount}</div>
                <div className="text-[9px] font-bold uppercase text-emerald-600">Completed</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-1.5">
                <div className="text-sm font-mono font-black text-blue-700">{onProcessCount}</div>
                <div className="text-[9px] font-bold uppercase text-blue-600">On Process</div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-1.5">
                <div className="text-sm font-mono font-black text-amber-700">{upcomingCount}</div>
                <div className="text-[9px] font-bold uppercase text-amber-600">Upcoming</div>
              </div>
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-1.5">
                <div className="text-sm font-mono font-black text-rose-700">{delayedCount}</div>
                <div className="text-[9px] font-bold uppercase text-rose-600">Delayed Risk</div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (7 cols): Floor Financials + Floor Projects Milestones + Risks */}
        <div className="col-span-7 flex flex-col gap-3 min-h-0">
          {/* 2. Floor Aggregated Financial Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  2. Floor Total Budget & Actual Cost ({financials.currencyLabel})
                </h2>
              </div>
              <span className="text-[10px] font-mono font-bold text-slate-600">
                {financials.utilizationPercent}% Floor Budget Utilized
              </span>
            </div>

            <div className="grid grid-cols-5 gap-2">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
                <div className="text-[9px] font-bold uppercase text-slate-500">Floor Budget</div>
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
                <div className="text-[9px] font-bold uppercase opacity-80">Remaining</div>
                <div className="text-sm font-mono font-black mt-0.5">
                  {financials.formattedRemaining}
                </div>
              </div>
            </div>
          </div>

          {/* 3. Floor Units & Key Milestones Schedule */}
          <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  3. Floor Units, Key Milestones & Budget Schedule
                </h2>
              </div>
              <span className="text-[10px] text-slate-500 font-semibold">
                Showing top {Math.min(8, projects.length)} of {projects.length} units
              </span>
            </div>

            <div className="overflow-hidden border border-slate-200 rounded-lg flex-1">
              <table className="w-full text-left border-collapse text-[10.5px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 border-b border-slate-200 text-[9.5px] uppercase font-bold">
                    <th className="py-1.5 px-2 w-20">Code</th>
                    <th className="py-1.5 px-2">Brand / Project</th>
                    <th className="py-1.5 px-1.5 w-14 text-right">Area</th>
                    <th className="py-1.5 px-2 w-20">Handover</th>
                    <th className="py-1.5 px-2 w-20">Opening</th>
                    <th className="py-1.5 px-2 w-24 text-right">Budget / Act</th>
                    <th className="py-1.5 px-2 w-20 text-right">Progress</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {projects.slice(0, 8).map((ps) => (
                    <tr key={ps.project.id} className="hover:bg-slate-50/70">
                      <td className="py-1.5 px-2 font-mono font-bold text-purple-700 truncate">
                        {ps.project.code}
                      </td>
                      <td className="py-1.5 px-2 font-semibold text-slate-800 truncate max-w-[160px]">
                        {ps.project.name}
                      </td>
                      <td className="py-1.5 px-1.5 font-mono text-right text-slate-600">
                        {ps.effectiveSizeM2 > 0 ? `${ps.effectiveSizeM2}` : '-'}
                      </td>
                      <td className="py-1.5 px-2 font-mono text-[10px] text-slate-600">
                        {ps.takCompl !== '-' ? String(ps.takCompl).slice(0, 10) : '-'}
                      </td>
                      <td className="py-1.5 px-2 font-mono text-[10px] text-emerald-700 font-semibold">
                        {ps.openingDate !== '-' ? String(ps.openingDate).slice(0, 10) : '-'}
                      </td>
                      <td className="py-1.5 px-2 font-mono text-[10px] text-right">
                        <span className="text-slate-700">{ps.financials.formattedBudget}</span>
                        <span className="text-slate-400"> / </span>
                        <span className="text-blue-700 font-bold">{ps.financials.formattedActual}</span>
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono font-bold">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9.5px] ${
                            ps.delayedTaskCount > 0
                              ? 'bg-rose-100 text-rose-800'
                              : ps.overallStatus === 'Completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {ps.actProgress}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. Floor Key Risks & Escalations */}
          <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs shrink-0 h-[135px] flex flex-col">
            <div className="flex items-center gap-1.5 mb-1.5 shrink-0">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                4. Latest Floor Risk Notes & Delayed Tasks
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-2 overflow-y-auto flex-1">
              {topRisks.length === 0 ? (
                <div className="col-span-2 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50/70 border border-emerald-200 rounded-lg p-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>All projects on floor {location} are progressing without critical risk alerts.</span>
                </div>
              ) : (
                topRisks.slice(0, 4).map((r) => (
                  <div
                    key={r.id}
                    className={`px-2.5 py-1.5 rounded-lg border text-[10.5px] leading-snug flex items-start gap-1.5 ${
                      r.severity === 'high'
                        ? 'bg-rose-50/80 border-rose-200 text-rose-900'
                        : 'bg-amber-50/80 border-amber-200 text-amber-900'
                    }`}
                  >
                    <FileWarning className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-600" />
                    <div className="min-w-0 flex-1 line-clamp-2 font-medium">{r.content}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

ExecutiveFloorSlideCard.displayName = 'ExecutiveFloorSlideCard';
