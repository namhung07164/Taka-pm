import React from 'react';
import { Map } from 'lucide-react';
import { PdfOrImageViewer } from './PdfOrImageViewer';

interface LayoutTabStaticViewerProps {
  url: string;
  getCleanUrl: (u: string | undefined | null) => string | undefined;
  fallbackSvg: string;
  cacheBuster: number;
  isAdmin: boolean;
  onOpenFullscreen: () => void;
}

export function LayoutTabStaticViewer({
  url,
  getCleanUrl,
  fallbackSvg,
  cacheBuster,
  isAdmin,
  onOpenFullscreen,
}: LayoutTabStaticViewerProps) {
  if (!url) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-900">
        <Map className="w-12 h-12 mb-3 opacity-20" />
        <p className="text-sm font-medium">No floor plan layout available for this location</p>
        {isAdmin && <p className="text-xs mt-1">Click "Edit URL" to configure layout link</p>}
      </div>
    );
  }

  if (url.includes('drive.google.com')) {
    return (
      <iframe 
        key={cacheBuster}
        src={getCleanUrl(url)} 
        width="100%" 
        style={{ height: '100%', minHeight: '600px', border: 'none' }}
        allow="autoplay"
      />
    );
  }

  return (
    <PdfOrImageViewer
      url={url}
      getCleanUrl={getCleanUrl}
      fallbackSvg={fallbackSvg}
      isFullscreen={false}
      onOpenFullscreen={onOpenFullscreen}
    />
  );
}
