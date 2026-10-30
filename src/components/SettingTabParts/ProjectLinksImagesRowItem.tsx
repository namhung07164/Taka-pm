import React from 'react';
import {
  Link2,
  MessageSquare,
  MapPin,
  Trash2,
  ExternalLink,
  Copy,
  Check,
  FileText,
  Cloud,
  Eye,
  Loader2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { ProjectMediaLinkItem } from './projectLinksImagesService';

interface ProjectLinksImagesRowItemProps {
  item: ProjectMediaLinkItem;
  isChecked: boolean;
  isDeleting: boolean;
  isCopied: boolean;
  canWrite: boolean;
  onToggleSelect: (key: string) => void;
  onPreview: (item: ProjectMediaLinkItem) => void;
  onCopyUrl: (key: string, url: string) => void;
  onDelete: (item: ProjectMediaLinkItem) => void;
}

export const ProjectLinksImagesRowItem: React.FC<ProjectLinksImagesRowItemProps> = React.memo(({
  item,
  isChecked,
  isDeleting,
  isCopied,
  canWrite,
  onToggleSelect,
  onPreview,
  onCopyUrl,
  onDelete,
}) => {
  const isHCM = item.store.toUpperCase() === 'HCM';

  return (
    <tr
      className={cn(
        'hover:bg-slate-50/90 dark:hover:bg-[#242428] transition-colors',
        isChecked && 'bg-blue-50/50 dark:bg-blue-950/20'
      )}
    >
      <td className="p-2.5 text-center align-top">
        <input
          type="checkbox"
          checked={isChecked}
          onChange={() => onToggleSelect(item.key)}
          className="rounded border-slate-300 cursor-pointer mt-1"
        />
      </td>

      {/* Year / Store */}
      <td className="p-2.5 align-top">
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 dark:bg-[#2a2a2e] text-slate-700 dark:text-slate-200 w-fit">
            {item.year}
          </span>
          <span
            className={cn(
              'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-extrabold w-fit',
              isHCM
                ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-[#8ab4f8]'
                : 'bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400'
            )}
          >
            {item.store}
          </span>
        </div>
      </td>

      {/* Project Code & Name */}
      <td className="p-2.5 align-top">
        <div className="font-mono font-extrabold uppercase text-blue-700 dark:text-[#8ab4f8] text-xs break-all">
          {item.projectCode}
        </div>
        {item.linkCodes && item.linkCodes !== item.projectCode && (
          <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
            Units: {item.linkCodes}
          </div>
        )}
        <div className="font-medium text-slate-800 dark:text-slate-200 line-clamp-1 mt-0.5">
          {item.projectName || '—'}
        </div>
        {item.location && (
          <div className="text-[10px] text-slate-400 font-semibold">Floor: {item.location}</div>
        )}
      </td>

      {/* Placement Badges */}
      <td className="p-2.5 align-top">
        <div className="flex flex-wrap gap-1 mb-1">
          {item.placements.includes('comment_modular') && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60">
              <MessageSquare className="w-3 h-3" />
              Comment Modular
            </span>
          )}
          {item.placements.includes('layout_picture') && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-100 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800/60">
              <MapPin className="w-3 h-3" />
              Layout Picture
            </span>
          )}
        </div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
          {item.placementDetails.map((d, i) => (
            <div key={i} className="truncate">
              • {d}
            </div>
          ))}
        </div>
      </td>

      {/* Media Preview & URL */}
      <td className="p-2.5 align-top">
        <div className="flex items-start gap-2.5">
          {item.mediaType === 'image' ? (
            <button
              type="button"
              onClick={() => onPreview(item)}
              className="w-12 h-12 rounded-lg border border-slate-200 dark:border-[#38383c] overflow-hidden bg-slate-100 dark:bg-[#141416] shrink-0 group relative cursor-pointer"
              title="Click to preview full image"
            >
              <img
                src={item.url}
                alt={item.title}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              />
            </button>
          ) : (
            <div className="w-12 h-12 rounded-lg border border-slate-200 dark:border-[#38383c] bg-slate-50 dark:bg-[#252528] flex items-center justify-center shrink-0 text-slate-500">
              {item.mediaType === 'pdf_drive' ? (
                <FileText className="w-5 h-5 text-amber-500" />
              ) : (
                <Link2 className="w-5 h-5 text-blue-500" />
              )}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-[#28282c] text-slate-600 dark:text-slate-300">
                <Cloud className="w-2.5 h-2.5" />
                {item.storageHost}
              </span>
              {item.authorName && (
                <span className="text-[10px] font-semibold text-slate-500">by {item.authorName}</span>
              )}
            </div>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block font-mono text-[11px] text-blue-600 dark:text-[#8ab4f8] hover:underline truncate mt-0.5"
              title={item.url}
            >
              {item.url}
            </a>
            {item.commentSnippet && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5 italic">
                "{item.commentSnippet}"
              </p>
            )}
          </div>
        </div>
      </td>

      {/* Actions */}
      <td className="p-2.5 align-top text-right">
        <div className="inline-flex items-center justify-end gap-1">
          {item.mediaType === 'image' && (
            <button
              type="button"
              onClick={() => onPreview(item)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-[#38383c] hover:bg-slate-100 dark:hover:bg-[#2c2c30] text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
              title="Preview Image"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onCopyUrl(item.key, item.url)}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-[#38383c] hover:bg-slate-100 dark:hover:bg-[#2c2c30] text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
            title="Copy URL"
          >
            {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-lg border border-slate-200 dark:border-[#38383c] hover:bg-slate-100 dark:hover:bg-[#2c2c30] text-slate-600 dark:text-slate-300 transition-colors"
            title="Open Link in New Tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          {canWrite && (
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => onDelete(item)}
              className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-400 transition-colors active:scale-95 cursor-pointer"
              title="Delete Link / Image from Project & Layout"
            >
              {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
});
ProjectLinksImagesRowItem.displayName = 'ProjectLinksImagesRowItem';
