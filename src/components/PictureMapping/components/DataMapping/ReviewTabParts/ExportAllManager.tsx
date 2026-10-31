import React, { useState, useEffect, useRef } from 'react';
import type { jsPDF } from 'jspdf';
import { uploadFileToDrive } from '../../../lib/drive';
import { getAccessToken } from '../../../lib/auth';
import { HiddenExportStage } from './HiddenExportStage';

export async function captureStageBlob(
  stage: any,
  pixelRatio: number,
  quality: number
): Promise<Blob | null> {
  try {
    const canvas = stage.toCanvas({ pixelRatio });
    if (canvas && typeof canvas.toBlob === 'function') {
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b: Blob | null) => resolve(b), 'image/jpeg', quality);
      });
      if (blob && blob.size > 0) return blob;
    }
  } catch (err) {
    console.warn('[captureStageBlob] stage.toCanvas failed, falling back to toDataURL', err);
  }

  try {
    const dataURL = stage.toDataURL({ pixelRatio, mimeType: 'image/jpeg', quality });
    const parts = dataURL.split(',');
    if (parts.length === 2) {
      const byteString = atob(parts[1]);
      const mimeString = parts[0].split(':')[1]?.split(';')[0] || 'image/jpeg';
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      return new Blob([ab], { type: mimeString });
    }
  } catch (dataUrlErr) {
    console.error('[captureStageBlob] Failed to convert dataURL to Blob', dataUrlErr);
  }
  return null;
}

export const ExportAllManager = ({
  versions,
  units,
  summaryData,
  dynamicSummaryMap,
  format,
  paperSize,
  quality,
  selectedLabels,
  reviewLabelColors,
  onComplete,
}: any) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const isProcessingRef = useRef(false);
  const pdfRef = useRef<jsPDF | null>(null);
  const collectedImagesRef = useRef<{ blob: Blob; name: string }[]>([]);
  const hasFinishedRef = useRef(false);

  useEffect(() => {
    if (!versions || versions.length === 0) {
      onComplete?.(false);
    }
  }, [versions, onComplete]);

  const handleCurrentStageReady = React.useCallback(
    async (index: number, stage: any) => {
      if (isProcessingRef.current || hasFinishedRef.current) return;
      if (index !== currentIndex) return;
      isProcessingRef.current = true;

      let pxRatio = 2;
      let jpegQuality = 0.9;
      if (quality === 'high') {
        pxRatio = 3;
        jpegQuality = 0.92;
      } else if (quality === 'low') {
        pxRatio = 1;
        jpegQuality = 0.75;
      }

      const SAFE_MAX_DIM = 3840;
      const currentVersion = versions[currentIndex];

      if (stage) {
        try {
          const width = stage.width();
          const height = stage.height();

          let currentPxRatio = pxRatio;
          const maxDim = Math.max(width, height);
          if (currentPxRatio * maxDim > SAFE_MAX_DIM) {
            currentPxRatio = SAFE_MAX_DIM / maxDim;
          }

          if (format === 'pdf' || format === 'drive' || format === 'auto_drive') {
            const dataURL = stage.toDataURL({
              pixelRatio: currentPxRatio,
              mimeType: 'image/jpeg',
              quality: jpegQuality,
            });
            const isLandscape = width > height;
            const orientationStr = isLandscape ? 'landscape' : 'portrait';

            const { jsPDF } = await import('jspdf');

            if (!pdfRef.current) {
              if (paperSize === 'original') {
                pdfRef.current = new jsPDF({
                  orientation: orientationStr,
                  unit: 'px',
                  format: [width, height],
                });
              } else {
                pdfRef.current = new jsPDF({
                  orientation: orientationStr,
                  unit: 'mm',
                  format: paperSize,
                });
              }
            } else {
              if (paperSize === 'original') {
                pdfRef.current.addPage([width, height], orientationStr);
              } else {
                pdfRef.current.addPage(paperSize, orientationStr);
              }
            }

            const pdf = pdfRef.current;
            if (paperSize === 'original') {
              pdf.addImage(dataURL, 'JPEG', 0, 0, width, height);
            } else {
              const pageWidth = pdf.internal.pageSize.getWidth();
              const pageHeight = pdf.internal.pageSize.getHeight();

              let imgWidth = pageWidth;
              let imgHeight = (height * pageWidth) / width;

              if (imgHeight > pageHeight) {
                imgHeight = pageHeight;
                imgWidth = (width * pageHeight) / height;
              }

              const x = (pageWidth - imgWidth) / 2;
              const y = (pageHeight - imgHeight) / 2;

              pdf.addImage(dataURL, 'JPEG', x, y, imgWidth, imgHeight);
            }
          } else if (format === 'jpeg') {
            const dataURL = stage.toDataURL({
              pixelRatio: currentPxRatio,
              mimeType: 'image/jpeg',
              quality: jpegQuality,
            });
            const link = document.createElement('a');
            link.download = `version_${currentVersion?.name || currentIndex}.jpeg`;
            link.href = dataURL;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            await new Promise((r) => setTimeout(r, 200));
          } else if (format === 'r2_jpeg') {
            const blob = await captureStageBlob(stage, currentPxRatio, jpegQuality);
            if (blob) {
              collectedImagesRef.current.push({
                blob,
                name: currentVersion?.name || `version_${currentIndex}`,
              });
            }
          }
        } catch (stageErr) {
          console.error(
            `[ExportAllManager] Error processing stage for version ${currentVersion?.name}:`,
            stageErr
          );
        }
      } else {
        console.warn(
          `[ExportAllManager] Stage was null for version ${currentVersion?.name}, skipping.`
        );
      }

      await new Promise((r) => setTimeout(r, 120));

      const nextIndex = currentIndex + 1;
      if (nextIndex < versions.length) {
        isProcessingRef.current = false;
        setCurrentIndex(nextIndex);
      } else {
        hasFinishedRef.current = true;
        if (format === 'pdf' || format === 'drive' || format === 'auto_drive') {
          const pdf = pdfRef.current;
          if (pdf) {
            if (format === 'drive' || format === 'auto_drive') {
              const pdfBlob = pdf.output('blob');
              const token = await getAccessToken();
              if (!token) {
                if (format !== 'auto_drive') alert('Vui lòng đăng nhập Google để upload file.');
                onComplete?.(false);
              } else {
                const confirmSave =
                  format === 'auto_drive'
                    ? true
                    : window.confirm(
                        'Đồng ý tạo (hoặc ghi đè) file Data_Mapping_Export.pdf trên Google Drive của bạn?'
                      );
                if (confirmSave) {
                  try {
                    await uploadFileToDrive({
                      accessToken: token,
                      fileBlob: pdfBlob,
                      fileName: 'Data_Mapping_Export.pdf',
                      mimeType: 'application/pdf',
                      fileId: '1hxzPKKhQWhQ-tAThmgan8eNqqy5GN-Ds',
                    });
                    if (format !== 'auto_drive') alert('Upload thành công!');
                    onComplete?.(true);
                  } catch (e: any) {
                    console.error(e);
                    if (format !== 'auto_drive') alert('Lỗi upload: ' + e.message);
                    onComplete?.(false);
                  }
                } else {
                  onComplete?.(false);
                }
              }
            } else {
              pdf.save('all_versions.pdf');
              onComplete?.(true);
            }
          } else {
            onComplete?.(false);
          }
        } else if (format === 'jpeg') {
          onComplete?.(true);
        } else if (format === 'r2_jpeg') {
          if (collectedImagesRef.current.length > 0) {
            onComplete?.(true, collectedImagesRef.current);
          } else {
            onComplete?.(false);
          }
        }
      }
    },
    [currentIndex, versions, format, paperSize, quality, onComplete]
  );

  const currentVersion = versions && versions[currentIndex];
  const totalCount = versions ? versions.length : 0;
  const percent = totalCount > 0 ? Math.round(((currentIndex + 1) / totalCount) * 100) : 0;
  const currentVersionName = currentVersion?.name || `Bản vẽ ${currentIndex + 1}`;

  return (
    <>
      <div className="fixed inset-0 z-[9999] bg-black/85 flex flex-col items-center justify-center text-white backdrop-blur-md">
        <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-6 shadow-lg shadow-amber-500/20"></div>
        <h3 className="text-xl font-bold tracking-wider uppercase text-white">
          {format === 'r2_jpeg'
            ? 'Đang chuẩn bị ảnh cho Cloudflare R2...'
            : `Đang xuất ${format.toUpperCase()}...`}
        </h3>
        <p className="text-slate-300 mt-2 font-medium text-sm">
          Đang xử lý {currentIndex + 1} / {totalCount}:{' '}
          <span className="text-amber-400 font-bold">{currentVersionName}</span>
        </p>
        <div className="w-80 bg-slate-800 rounded-full h-3 mt-4 overflow-hidden border border-slate-700/80 shadow-inner">
          <div
            className="bg-amber-500 h-3 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${Math.max(6, percent)}%` }}
          ></div>
        </div>
        <span className="text-xs font-mono text-slate-400 mt-2">{percent}% hoàn thành</span>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: -9999,
          opacity: 0,
          pointerEvents: 'none',
        }}
      >
        {currentVersion && (
          <HiddenExportStage
            key={currentVersion.id}
            index={currentIndex}
            version={currentVersion}
            units={units}
            summaryData={summaryData}
            dynamicSummaryMap={dynamicSummaryMap}
            selectedLabels={selectedLabels}
            reviewLabelColors={reviewLabelColors}
            paperSize={paperSize}
            onReady={handleCurrentStageReady}
          />
        )}
      </div>
    </>
  );
};
