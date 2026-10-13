import React, { Component, ReactNode, StrictMode } from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { LanguageProvider } from './lib/LanguageContext';
import { checkAndCleanStorageQuota, cleanupBloatedStorage } from './lib/storage';

// Proactively verify & clean localStorage quota before React and Firebase mount
checkAndCleanStorageQuota();

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: any, errorInfo: any}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, errorInfo: any) {
    this.setState({ errorInfo });
    const isChunkError = 
      error?.message?.includes('Importing a module script failed') ||
      error?.message?.includes('Failed to fetch dynamically imported module') ||
      error?.message?.includes('error loading dynamically imported module');
    
    const isIDBError = error?.message?.includes('Connection to Indexed Database server lost');

    const isQuotaError = 
      error?.message?.includes('QuotaExceededError') ||
      error?.message?.includes('exceeded the quota') ||
      (typeof error?.message === 'string' && (error.message.includes('firestore_mutations') || error.message.includes('b815')));
    
    if (isQuotaError) {
      const hasCleaned = window.sessionStorage.getItem('quota_error_auto_cleaned');
      if (!hasCleaned) {
        window.sessionStorage.setItem('quota_error_auto_cleaned', 'true');
        cleanupBloatedStorage();
        window.location.reload();
        return;
      }
    }

    if (isChunkError || isIDBError) {
      const reloadKey = isChunkError ? 'root_chunk_reload' : 'idb_error_reload';
      const hasReloaded = window.sessionStorage.getItem(reloadKey);
      if (!hasReloaded) {
        window.sessionStorage.setItem(reloadKey, 'true');
        window.location.reload();
        return;
      }
    }
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      const isChunkError = 
        this.state.error?.message?.includes('Importing a module script failed') ||
        this.state.error?.message?.includes('Failed to fetch dynamically imported module') ||
        this.state.error?.message?.includes('error loading dynamically imported module');
      const isIDBError = this.state.error?.message?.includes('Connection to Indexed Database server lost');
      const isQuotaError = 
        this.state.error?.message?.includes('QuotaExceededError') ||
        this.state.error?.message?.includes('exceeded the quota') ||
        (typeof this.state.error?.message === 'string' && (this.state.error.message.includes('firestore_mutations') || this.state.error.message.includes('b815')));

      return (
        <div style={{ padding: '24px', maxWidth: '600px', margin: '40px auto', fontFamily: 'system-ui, -apple-system, sans-serif', backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚠️</div>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e293b', marginBottom: '8px' }}>
            {isChunkError 
              ? 'Hệ thống đang tải phiên bản mới' 
              : isIDBError 
              ? 'Lỗi kết nối cơ sở dữ liệu cục bộ' 
              : isQuotaError
              ? 'Dung lượng bộ nhớ đệm trình duyệt bị đầy'
              : 'Đã có sự cố xảy ra'}
          </h2>
          <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '20px', lineHeight: '1.5' }}>
            {isChunkError 
              ? 'Mã nguồn ứng dụng vừa được cập nhật hoặc kết nối mạng bị gián đoạn. Vui lòng bấm Tải lại để tiếp tục sử dụng.' 
              : isIDBError
              ? 'Mất kết nối với cơ sở dữ liệu IndexedDB trên trình duyệt. Điều này thường xảy ra khi có nhiều tab mở hoặc trình duyệt dọn dẹp bộ nhớ. Vui lòng bấm Tải lại để khôi phục.'
              : isQuotaError
              ? 'Bộ nhớ lưu trữ cục bộ của Google Chrome đã đầy (Storage Quota Exceeded). Vui lòng nhấn nút bên dưới để tự động dọn sạch bộ nhớ tạm và khôi phục ứng dụng.'
              : 'Ứng dụng đã gặp lỗi ngoại lệ. Vui lòng bấm Tải lại trang để khôi phục trạng thái.'}
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button
              onClick={() => {
                cleanupBloatedStorage();
                window.sessionStorage.removeItem('root_chunk_reload');
                window.sessionStorage.removeItem('quota_error_auto_cleaned');
                window.location.reload();
              }}
              style={{
                backgroundColor: '#2563eb',
                color: '#fff',
                padding: '10px 20px',
                borderRadius: '10px',
                border: 'none',
                fontWeight: 'bold',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              {isQuotaError ? 'Dọn dẹp bộ nhớ & Tải lại (Clear Storage & Reload)' : 'Tải lại trang (Reload)'}
            </button>
          </div>
          {!isChunkError && (
            <details style={{ marginTop: '20px', textAlign: 'left', fontSize: '12px', color: '#b91c1c', backgroundColor: '#fef2f2', padding: '12px', borderRadius: '8px', border: '1px solid #fecaca' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, userSelect: 'none' }}>
                Chi tiết kỹ thuật (Technical Details)
              </summary>
              <pre style={{ marginTop: '8px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '11px' }}>
                {this.state.error && this.state.error.toString()}
                {'\n'}
                {this.state.errorInfo && this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

const shouldSuppress = (args) => {
  return args.some(arg => 
    typeof arg === 'string' && 
    (arg.includes("Could not reach Cloud Firestore backend") || 
     arg.includes("c050") ||
     arg.includes("INTERNAL ASSERTION FAILED: Unexpected state"))
  );
};

console.error = (...args) => {
  if (shouldSuppress(args)) return;
  originalConsoleError(...args);
};

console.warn = (...args) => {
  if (shouldSuppress(args)) return;
  originalConsoleWarn(...args);
};

// Register Service Worker for PWA notifications and Static Asset Caching
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/firebase-messaging-sw.js')
      .then(registration => {
        console.log('SW registered: ', registration);
        registration.update().catch(() => {});
      })
      .catch(registrationError => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}

// Request Persistent Storage for PWA (especially useful for iOS and Firestore IndexedDB)
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then((persistent) => {
    if (persistent) {
      console.log("Persistent storage granted. Data will not be cleared automatically.");
    } else {
      console.log("Persistent storage denied or not fully supported. Browser may clear data under storage pressure.");
    }
  }).catch(console.error);
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </ErrorBoundary>,
);
