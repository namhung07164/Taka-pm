import React, { FC, useEffect, useState } from 'react';
import { QrCode, X, Copy, Check } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface QRCodeButtonProps {
  url: string;
  title: string;
}

export const QRCodeButton: React.FC<QRCodeButtonProps> = ({ url, title }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <button 
        type="button" 
        onClick={() => setIsOpen(true)}
        className="p-2 text-slate-500 hover:text-blue-600 dark:text-[#a3a3a3] dark:hover:text-blue-400 rounded-md hover:bg-slate-100 dark:hover:bg-[#333336] transition-colors flex items-center gap-2"
        title="Generate QR Code"
      >
        <QrCode className="w-5 h-5" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-[#1a1a1c] rounded-xl shadow-xl p-6 max-w-sm w-full relative">
            <button 
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-[#c3c3c3]"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-slate-800 dark:text-[#f3f3f3] mb-4 text-center">
              QR Code: {title}
            </h3>
            <div className="flex justify-center bg-white p-4 rounded-lg mb-4">
              <QRCodeSVG value={url} size={200} />
            </div>
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-[#2a2a2c] p-2 rounded-lg">
              <span className="text-sm text-slate-600 dark:text-[#a3a3a3] flex-1 font-mono break-all text-center">
                {url}
              </span>
              <button
                onClick={handleCopy}
                className="p-2 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors shrink-0"
                title="Copy URL"
              >
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
