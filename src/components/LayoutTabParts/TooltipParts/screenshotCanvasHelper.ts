import { CropBox, AnnotationStroke } from './snippingTypes';

export async function generateCroppedCanvas(
  sourceImg: string | null,
  rotation: number,
  cropBox: CropBox,
  strokes: AnnotationStroke[]
): Promise<HTMLCanvasElement | null> {
  if (!sourceImg) return null;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = sourceImg;
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });

  const rad = (rotation * Math.PI) / 180;
  const is90or270 = rotation % 180 !== 0;
  const rotW = is90or270 ? img.height : img.width;
  const rotH = is90or270 ? img.width : img.height;

  // Full rotated canvas
  const rotCanvas = document.createElement('canvas');
  rotCanvas.width = rotW;
  rotCanvas.height = rotH;
  const rotCtx = rotCanvas.getContext('2d');
  if (!rotCtx) throw new Error('Canvas 2D context not available');

  rotCtx.translate(rotW / 2, rotH / 2);
  rotCtx.rotate(rad);
  rotCtx.drawImage(img, -img.width / 2, -img.height / 2);

  // Crop coordinates in image pixels
  const cropX = Math.round((cropBox.x / 100) * rotW);
  const cropY = Math.round((cropBox.y / 100) * rotH);
  const cropW = Math.max(20, Math.round((cropBox.w / 100) * rotW));
  const cropH = Math.max(20, Math.round((cropBox.h / 100) * rotH));

  const croppedCanvas = document.createElement('canvas');
  croppedCanvas.width = cropW;
  croppedCanvas.height = cropH;
  const cropCtx = croppedCanvas.getContext('2d');
  if (!cropCtx) throw new Error('Canvas 2D context not available');

  // Draw cropped portion
  cropCtx.drawImage(rotCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  // Draw annotation strokes scaled to cropped canvas
  strokes.forEach((stroke) => {
    cropCtx.save();
    if (stroke.tool === 'highlighter') {
      cropCtx.globalAlpha = 0.42;
      cropCtx.strokeStyle = stroke.color;
      cropCtx.fillStyle = stroke.color;
      cropCtx.lineWidth = stroke.size * 3.5;
      cropCtx.lineCap = 'square';
    } else if (stroke.tool === 'pen') {
      cropCtx.globalAlpha = 1.0;
      cropCtx.strokeStyle = stroke.color;
      cropCtx.lineWidth = stroke.size;
      cropCtx.lineCap = 'round';
      cropCtx.lineJoin = 'round';
    } else if (stroke.tool === 'rectangle') {
      cropCtx.globalAlpha = 1.0;
      cropCtx.strokeStyle = stroke.color;
      cropCtx.lineWidth = stroke.size + 1;
    }

    if (stroke.tool === 'rectangle' && stroke.points.length >= 2) {
      const p1 = stroke.points[0];
      const p2 = stroke.points[stroke.points.length - 1];
      const x1 = ((p1.x - cropBox.x) / cropBox.w) * cropW;
      const y1 = ((p1.y - cropBox.y) / cropBox.h) * cropH;
      const x2 = ((p2.x - cropBox.x) / cropBox.w) * cropW;
      const y2 = ((p2.y - cropBox.y) / cropBox.h) * cropH;
      cropCtx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    } else if (stroke.points.length > 0) {
      cropCtx.beginPath();
      const first = stroke.points[0];
      const fx = ((first.x - cropBox.x) / cropBox.w) * cropW;
      const fy = ((first.y - cropBox.y) / cropBox.h) * cropH;
      cropCtx.moveTo(fx, fy);
      for (let i = 1; i < stroke.points.length; i++) {
        const pt = stroke.points[i];
        const px = ((pt.x - cropBox.x) / cropBox.w) * cropW;
        const py = ((pt.y - cropBox.y) / cropBox.h) * cropH;
        cropCtx.lineTo(px, py);
      }
      cropCtx.stroke();
    }
    cropCtx.restore();
  });

  return croppedCanvas;
}
