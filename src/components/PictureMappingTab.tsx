import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from "../lib/LanguageContext";
import { Stage, Layer, Image as KonvaImage } from 'react-konva';

export function PictureMappingTab() {
  const { t } = useLanguage();
  
  // State quản lý các Object URL và đối tượng Image
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [loadedImages, setLoadedImages] = useState<HTMLImageElement[]>([]);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // 1. GARBAGE COLLECTION & MEMORY MANAGEMENT (Yêu cầu của người dùng)
  // Xử lý chống rò rỉ bộ nhớ (OOM - Out of Memory) trên các thiết bị RAM yếu (iPad, Mobile)
  useEffect(() => {
    // Cleanup function sẽ chạy khi component unmount HOẶC trước khi imageUrls thay đổi
    return () => {
      // 1. Chủ động thu hồi các Blob URLs từ bộ nhớ trình duyệt
      imageUrls.forEach(url => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
          console.log(`[Garbage Collection] Revoked URL: ${url}`);
        }
      });
      
      // 2. Ép giải phóng bộ nhớ của các instance ảnh
      loadedImages.forEach(img => {
        img.src = ''; // Ngắt liên kết nguồn
        img.removeAttribute('src'); // Ép trình duyệt dọn dẹp
      });
      console.log("[Garbage Collection] PictureMappingTab instances cleared.");
    };
  }, [imageUrls, loadedImages]);

  // Handle Resize Stage
  useEffect(() => {
    const checkSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight
        });
      }
    };
    checkSize();
    window.addEventListener('resize', checkSize);
    return () => window.removeEventListener('resize', checkSize);
  }, []);

  // Xử lý upload ảnh để test logic Memory Management
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newUrls: string[] = [];
    const newImages: HTMLImageElement[] = [];

    Array.from(files).forEach(file => {
      const objectUrl = URL.createObjectURL(file);
      newUrls.push(objectUrl);
      
      const img = new window.Image();
      img.src = objectUrl;
      img.onload = () => {
        // Kích hoạt re-render khi ảnh load xong
        setLoadedImages(prev => [...prev, img]);
      };
    });

    setImageUrls(prev => [...prev, ...newUrls]);
  };

  // Hàm xoá toàn bộ ảnh (để test GC)
  const clearCanvas = () => {
    setImageUrls([]);
    setLoadedImages([]);
  };

  return (
    <div className="flex flex-col flex-grow bg-white dark:bg-[#1e1e20] p-6 text-slate-800 dark:text-[#e3e3e3]">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{t("Picture Mapping")} (Beta)</h1>
        <div className="flex gap-2">
          <button 
            onClick={clearCanvas}
            className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
          >
            {t("Clear Canvas")}
          </button>
          <label className="cursor-pointer px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors">
            {t("Upload Media")}
            <input 
              type="file" 
              multiple 
              accept="image/*,application/pdf" 
              onChange={handleFileUpload} 
              className="hidden" 
            />
          </label>
        </div>
      </div>

      <div 
        ref={containerRef}
        className="flex-grow border-2 border-dashed border-slate-300 dark:border-slate-700/50 rounded-2xl overflow-hidden relative bg-slate-50 dark:bg-[#151515]"
      >
          {loadedImages.length > 0 ? (
            <Stage width={dimensions.width} height={dimensions.height}>
              <Layer>
                {loadedImages.map((img, i) => (
                  <KonvaImage 
                    key={i} 
                    image={img} 
                    x={50 + (i * 30)} 
                    y={50 + (i * 30)} 
                    draggable 
                    shadowColor="rgba(0,0,0,0.2)"
                    shadowBlur={10}
                    shadowOffset={{ x: 5, y: 5 }}
                    shadowOpacity={0.5}
                  />
                ))}
              </Layer>
            </Stage>
          ) : (
             <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
               <svg className="w-16 h-16 mb-4 text-slate-300 dark:text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
               </svg>
               <p className="text-sm font-medium text-slate-500">{t("Upload images or PDF to start mapping")}</p>
             </div>
          )}
      </div>
    </div>
  );
}
