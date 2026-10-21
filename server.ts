import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Cấu hình tăng giới hạn payload cho ảnh
  app.use(express.json({ limit: '50mb' }));
  app.use(express.raw({ type: '*/*', limit: '50mb' }));

  // Cấu hình CORS cho API
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, x-r2-account-id, x-r2-access-key-id, x-r2-secret-access-key, x-r2-bucket-name, x-r2-file-name, Authorization');
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    next();
  });

  // API Proxy cho R2 Upload
  app.post('/api/r2-upload', async (req, res) => {
    try {
      const accountId = req.headers['x-r2-account-id'] as string;
      const accessKeyId = req.headers['x-r2-access-key-id'] as string;
      const secretAccessKey = req.headers['x-r2-secret-access-key'] as string;
      const bucketName = req.headers['x-r2-bucket-name'] as string;
      const fileName = decodeURIComponent(req.headers['x-r2-file-name'] as string);
      const contentType = req.headers['content-type'] as string;

      if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !fileName) {
        return res.status(400).json({ success: false, error: 'Thiếu thông tin cấu hình R2' });
      }

      // Xây dựng signature AWS V4 chuẩn
      const crypto = await import('crypto');

      const region = 'auto';
      const service = 's3';
      const host = `${accountId}.r2.cloudflarestorage.com`;
      const endpoint = `https://${host}`;
      const url = `${endpoint}/${bucketName}/${encodeURIComponent(fileName)}`;

      // Tạo S3 Client từ AWS SDK (sử dụng Node.js)
      const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

      const s3 = new S3Client({
        region,
        endpoint,
        credentials: {
          accessKeyId,
          secretAccessKey,
        }
      });

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: fileName,
        ContentType: contentType,
      });

      const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

      // Gọi Cloudflare R2
      const r2Res = await fetch(signedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
        },
        body: req.body,
      });

      if (!r2Res.ok) {
        const errText = await r2Res.text();
        console.error('R2 Proxy Upload Error:', errText);
        return res.status(r2Res.status).json({ success: false, error: errText });
      }

      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('R2 Proxy Exception:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // API Proxy xóa Cache
  app.post('/api/purge-cache', async (req, res) => {
    try {
      const { zoneId, apiToken } = req.body;
      
      if (!zoneId || !apiToken) {
        return res.status(400).json({ success: false, error: 'Thiếu cấu hình xóa cache' });
      }
      
      const cfRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ purge_everything: true })
      });
      
      if (!cfRes.ok) {
         const errText = await cfRes.text();
         return res.status(cfRes.status).json({ success: false, error: errText });
      }
      
      res.status(200).json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // In-memory LRU Cache cho binary PDF và Thumbnail để phản hồi 0ms cho các lần mở tiếp theo
  const mediaMemoryCache = new Map<string, { buffer: Buffer; contentType: string; ts: number }>();
  const MAX_MEDIA_CACHE_ITEMS = 40;
  const setMediaCache = (key: string, buffer: Buffer, contentType: string) => {
    if (buffer.byteLength > 25 * 1024 * 1024) return; // Không cache file > 25MB trong RAM
    if (mediaMemoryCache.size >= MAX_MEDIA_CACHE_ITEMS) {
      const oldestKey = mediaMemoryCache.keys().next().value;
      if (oldestKey) mediaMemoryCache.delete(oldestKey);
    }
    mediaMemoryCache.set(key, { buffer, contentType, ts: Date.now() });
  };

  // Helper phục vụ file nhị phân kèm Range Request (HTTP 206 Partial Content) cho PDF viewer & iframe
  const sendBinaryWithRange = (
    req: express.Request,
    res: express.Response,
    buffer: Buffer,
    contentType: string,
    isPdf: boolean = false
  ) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    if (isPdf) {
      res.setHeader('Content-Disposition', 'inline; filename="document.pdf"');
    }

    const total = buffer.length;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : total - 1;

      if (!isNaN(start) && start < total && end < total && start <= end) {
        const chunk = buffer.subarray(start, end + 1);
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
        res.setHeader('Content-Length', String(chunk.length));
        res.setHeader('Content-Type', contentType);
        return res.end(chunk);
      }
    }

    res.setHeader('Content-Length', String(total));
    res.setHeader('Content-Type', contentType);
    return res.send(buffer);
  };

  // API Proxy tải binary PDF từ Google Drive để đồng bộ hiển thị Native Canvas như R2
  app.get('/api/drive-pdf', async (req, res) => {
    try {
      const fileId = req.query.id as string;
      if (!fileId || typeof fileId !== 'string') {
        return res.status(400).json({ success: false, error: 'Thiếu file ID' });
      }

      const cleanId = fileId.trim();
      const cacheKey = `drive-pdf:${cleanId}`;
      const cached = mediaMemoryCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < 3600_000) {
        return sendBinaryWithRange(req, res, cached.buffer, cached.contentType || 'application/pdf', true);
      }

      const directDownloadUrl = `https://drive.usercontent.google.com/download?id=${cleanId}&export=download&authuser=0`;

      let response = await fetch(directDownloadUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/pdf,application/octet-stream,*/*',
        },
        redirect: 'follow',
      });

      const contentType = response.headers.get('content-type') || '';

      // Xử lý trang xác nhận virus scan nếu file dung lượng lớn
      if (response.ok && contentType.includes('text/html')) {
        const text = await response.text();
        const confirmMatch = text.match(/confirm=([a-zA-Z0-9_-]+)/);
        if (confirmMatch?.[1]) {
          const confirmUrl = `https://drive.usercontent.google.com/download?id=${cleanId}&export=download&confirm=${confirmMatch[1]}`;
          response = await fetch(confirmUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            redirect: 'follow',
          });
        } else {
          const ucUrl = `https://drive.google.com/uc?export=download&id=${cleanId}`;
          const ucRes = await fetch(ucUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            },
            redirect: 'follow',
          });
          if (ucRes.ok && !ucRes.headers.get('content-type')?.includes('text/html')) {
            response = ucRes;
          }
        }
      }

      const finalContentType = response.headers.get('content-type') || '';
      if (!response.ok || finalContentType.includes('text/html')) {
        return res.status(404).json({
          success: false,
          error: 'Tài liệu Google Drive không cho phép tải trực tiếp dạng binary (yêu cầu quyền xem hoặc mở trong iframe)'
        });
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const resolvedMime = finalContentType.includes('image/') ? finalContentType : 'application/pdf';
      setMediaCache(cacheKey, buffer, resolvedMime);

      return sendBinaryWithRange(req, res, buffer, resolvedMime, true);
    } catch (error: any) {
      console.error('Drive PDF Proxy Exception:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // API Proxy tải nhanh Thumbnail từ Google Drive (chống lỗi chặn ITP/CORS trên iOS Safari)
  app.get('/api/drive-thumb', async (req, res) => {
    try {
      const fileId = String(req.query.id || '').trim();
      const sz = String(req.query.sz || 'w600').trim();
      if (!fileId) return res.status(400).end();

      const cacheKey = `drive-thumb:${fileId}:${sz}`;
      const cached = mediaMemoryCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < 3600_000) {
        res.setHeader('Content-Type', cached.contentType);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
        return res.send(cached.buffer);
      }

      const thumbUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=${sz}`;
      let response = await fetch(thumbUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
        redirect: 'follow',
      });

      if (!response.ok || (response.headers.get('content-type') || '').includes('text/html')) {
        const fallbackLh3 = `https://lh3.googleusercontent.com/d/${fileId}=${sz}`;
        response = await fetch(fallbackLh3, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'image/*,*/*;q=0.8',
          },
          redirect: 'follow',
        });
      }

      const ct = response.headers.get('content-type') || 'image/jpeg';
      if (!response.ok || ct.includes('text/html')) {
        return res.status(404).end();
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      setMediaCache(cacheKey, buffer, ct);

      res.setHeader('Content-Type', ct);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      return res.send(buffer);
    } catch {
      return res.status(500).end();
    }
  });

  // API Proxy đa năng cho mọi nguồn PDF/Image (R2, Firebase, HTTP) khi trình duyệt gặp rào cản CORS
  app.get('/api/pdf-proxy', async (req, res) => {
    try {
      const targetUrl = String(req.query.url || '').trim();
      if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
        return res.status(400).json({ success: false, error: 'URL không hợp lệ' });
      }

      const cacheKey = `pdf-proxy:${targetUrl}`;
      const cached = mediaMemoryCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < 3600_000) {
        const isPdf = cached.contentType.includes('pdf') || /\.pdf($|\?)/i.test(targetUrl);
        return sendBinaryWithRange(req, res, cached.buffer, cached.contentType, isPdf);
      }

      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/pdf,image/*,application/octet-stream,*/*',
        },
        redirect: 'follow',
      });

      if (!response.ok) {
        return res.status(response.status).end();
      }

      const ct = response.headers.get('content-type') || 'application/pdf';
      const buffer = Buffer.from(await response.arrayBuffer());
      setMediaCache(cacheKey, buffer, ct);

      const isPdf = ct.includes('pdf') || /\.pdf($|\?)/i.test(targetUrl);
      return sendBinaryWithRange(req, res, buffer, ct, isPdf);
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // Phục vụ trực tiếp pdf.worker.min.mjs, cmaps & standard_fonts từ node_modules/pdfjs-dist
  // (không cần lưu 186 file nhị phân nặng vào thư mục public/ của Git repo, chống lỗi timeout khi Clone repo trên Cloudflare)
  const pdfjsBasePath = path.join(process.cwd(), 'node_modules', 'pdfjs-dist');
  app.get('/pdf.worker.min.mjs', (_req, res) => {
    const workerFile = path.join(pdfjsBasePath, 'build', 'pdf.worker.min.mjs');
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(workerFile, (err) => {
      if (err && !res.headersSent) {
        res.status(404).end();
      }
    });
  });

  app.use('/cmaps', express.static(path.join(pdfjsBasePath, 'cmaps'), {
    fallthrough: false,
    setHeaders: (res) => {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  }));

  app.use('/standard_fonts', express.static(path.join(pdfjsBasePath, 'standard_fonts'), {
    fallthrough: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.ttf')) {
        res.setHeader('Content-Type', 'font/ttf');
      } else {
        res.setHeader('Content-Type', 'application/octet-stream');
      }
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  }));

  // Chặn trả file index.html cho các đuôi mở rộng nhị phân font/cmap nếu không tồn tại
  app.use((req, res, next) => {
    if (/\.(bcmap|pfb|ttf|otf|wasm)$/i.test(req.path)) {
      return res.status(404).end();
    }
    next();
  });

  // Tích hợp Vite Middleware cho môi trường Dev
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Phục vụ file tĩnh khi chạy Build (Production)
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, {
      maxAge: '1y',
      immutable: true,
      setHeaders: (res, filePath) => {
        // HTML files: NO-CACHE để luôn nhận phiên bản mới nhất, không bị kẹt bundle cũ
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        } else if (filePath.endsWith('.json') || filePath.includes('sw.js')) {
          // Manifest và Service Worker: Revalidate nhanh
          res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        } else if (filePath.match(/\.(js|mjs|css|woff2?|png|jpg|jpeg|gif|ico|svg)$/)) {
          // File tĩnh (Vite hashed bundles, font, icon): Cache vĩnh viễn 1 năm
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      }
    }));
    app.get('*all', (req, res) => {
      if (/\.(bcmap|pfb|ttf|otf|wasm|mjs|map)$/i.test(req.path)) {
        return res.status(404).end();
      }
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server chạy tại cổng ${PORT}`);
  });
}

startServer();
