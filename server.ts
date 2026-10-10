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
