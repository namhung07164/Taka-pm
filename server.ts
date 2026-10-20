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

  // API Proxy tải binary PDF từ Google Drive để đồng bộ hiển thị Native Canvas như R2
  app.get('/api/drive-pdf', async (req, res) => {
    try {
      const fileId = req.query.id as string;
      if (!fileId || typeof fileId !== 'string') {
        return res.status(400).json({ success: false, error: 'Thiếu file ID' });
      }

      const cleanId = fileId.trim();
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
          // Thử endpoint uc?export=download
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

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Accept-Ranges', 'bytes');

      const arrayBuffer = await response.arrayBuffer();
      return res.send(Buffer.from(arrayBuffer));
    } catch (error: any) {
      console.error('Drive PDF Proxy Exception:', error);
      res.status(500).json({ success: false, error: error.message });
    }
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
        } else if (filePath.match(/\.(js|css|woff2?|png|jpg|jpeg|gif|ico|svg)$/)) {
          // File tĩnh (Vite hashed bundles, font, icon): Cache vĩnh viễn 1 năm
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      }
    }));
    app.get('*all', (req, res) => {
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
