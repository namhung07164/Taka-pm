import React, { FC } from 'react';
import { Paperclip, Maximize2, ExternalLink, FileText } from 'lucide-react';
import { DelegationGroup } from '../../../types';
import { ensureUrlProtocol } from '../../../lib/utils';
import { useAppStore } from '../../../store/useAppStore';

interface TaskChatReportsListProps {
  linkedGroup: DelegationGroup | null | undefined;
}

export const TaskChatReportsList: React.FC<TaskChatReportsListProps> = ({ linkedGroup }) => {
  const setZoomableImageSrc = useAppStore((state) => state.setZoomableImageSrc);

  if (!linkedGroup) return null;

  return (
    <>
      {linkedGroup.subTasks.map(st => {
        const hasReport = !!st.report || !!st.childReport || (st.attachments && st.attachments.length > 0) || !!st.fileUrl || !!st.childFileUrl;
        if (!hasReport) return null;

        return (
          <div key={`report-${st.id}`} className="flex flex-col items-start mt-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-slate-500">{st.party} (Report)</span>
            </div>
            <div className="flex flex-col gap-1 bg-blue-50/40 dark:bg-[#28282a] rounded-xl rounded-tl-none border border-blue-100 p-3 max-w-[85%]">
              <span className="text-[9px] font-bold text-blue-600 dark:text-[#8ab4f8] uppercase tracking-wider">Report for {st.name || st.party}</span>
              <div className="text-sm text-slate-700 dark:text-[#c3c3c3] font-medium whitespace-pre-wrap">
                {st.report || st.childReport || <span className="italic text-slate-400 dark:text-[#838383] font-normal">No report yet</span>}
              </div>
              {st.attachments && st.attachments.length > 0 ? (
                <div className="mt-2 flex flex-col gap-1.5 text-[10px]">
                  {st.attachments.map((att, iIdx) => {
                    if (!att.url) return null;
                    const isPdf = att.url.match(/\.pdf($|\?|#)/i) || att.type === 'application/pdf';
                    return (
                      <div key={iIdx} className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setZoomableImageSrc(att.url);
                          }}
                          className="flex items-center gap-1.5 text-blue-700 dark:text-[#8ab4f8] hover:text-blue-800 font-bold bg-white dark:bg-[#1e1e20] border border-blue-200 shadow-sm rounded px-2.5 py-1.5 w-fit active:scale-95 transition"
                        >
                          {isPdf ? <FileText className="w-3.5 h-3.5 text-rose-500" /> : <Paperclip className="w-3.5 h-3.5 text-blue-500" />}
                          <span className="truncate max-w-[150px]">{att.name || att.url || 'Attached File'}</span>
                          <Maximize2 className="w-3 h-3 text-slate-400 ml-1" />
                        </button>
                        <a
                          onClick={(e) => e.stopPropagation()}
                          href={ensureUrlProtocol(att.url)}
                          target="_blank"
                          rel="noreferrer"
                          title="Open Link"
                          className="p-1.5 text-slate-400 hover:text-blue-500 bg-white dark:bg-[#1e1e20] border border-blue-200 rounded"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    );
                  })}
                </div>
              ) : (st.fileUrl || st.childFileUrl) && (
                <div className="mt-2 text-[10px]">
                  {(() => {
                    const fUrl = st.fileUrl || st.childFileUrl;
                    if (!fUrl) return null;
                    const isPdf = fUrl.match(/\.pdf($|\?|#)/i);
                    return (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setZoomableImageSrc(fUrl);
                          }}
                          className="flex items-center gap-1.5 text-blue-700 dark:text-[#8ab4f8] hover:text-blue-800 font-bold bg-white dark:bg-[#1e1e20] border border-blue-200 shadow-sm rounded px-2.5 py-1.5 w-fit active:scale-95 transition"
                        >
                          {isPdf ? <FileText className="w-3.5 h-3.5 text-rose-500" /> : <Paperclip className="w-3.5 h-3.5 text-blue-500" />}
                          <span className="truncate max-w-[150px]">{st.fileName || st.childFileName || 'Download file'}</span>
                          <Maximize2 className="w-3 h-3 text-slate-400 ml-1" />
                        </button>
                        <a
                          onClick={(e) => e.stopPropagation()}
                          href={ensureUrlProtocol(fUrl)}
                          target="_blank"
                          rel="noreferrer"
                          title="Open Link"
                          className="p-1.5 text-slate-400 hover:text-blue-500 bg-white dark:bg-[#1e1e20] border border-blue-200 rounded"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
};
