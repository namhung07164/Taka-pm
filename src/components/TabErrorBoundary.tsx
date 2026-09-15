import React from 'react';
import { RotateCw, AlertTriangle } from 'lucide-react';

interface TabErrorBoundaryProps {
  children: React.ReactNode;
  tabKey?: string;
}

interface TabErrorBoundaryState {
  hasError: boolean;
  error: any;
}

export class TabErrorBoundary extends React.Component<TabErrorBoundaryProps, TabErrorBoundaryState> {
  constructor(props: TabErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any): TabErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("TabErrorBoundary caught error:", error, errorInfo);
    
    const isChunkError = 
      error?.message?.includes('Importing a module script failed') ||
      error?.message?.includes('Failed to fetch dynamically imported module') ||
      error?.message?.includes('error loading dynamically imported module');
      
    const isIDBError = error?.message?.includes('Connection to Indexed Database server lost');
    
    if (isChunkError || isIDBError) {
      const reloadKey = isChunkError ? 'tab_chunk_reload' : 'tab_idb_reload';
      const hasReloaded = window.sessionStorage.getItem(reloadKey);
      if (!hasReloaded) {
        window.sessionStorage.setItem(reloadKey, 'true');
        window.location.reload();
      }
    }
  }

  componentDidUpdate(prevProps: TabErrorBoundaryProps) {
    if (prevProps.tabKey !== this.props.tabKey && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const isChunkError =
        this.state.error?.message?.includes('Importing a module script failed') ||
        this.state.error?.message?.includes('Failed to fetch dynamically imported module') ||
        this.state.error?.message?.includes('error loading dynamically imported module');

      return (
        <div className="flex flex-col items-center justify-center p-8 m-4 bg-slate-50 dark:bg-[#1e1e20] border border-slate-200 dark:border-[#38383a] rounded-2xl text-center shadow-xs">
          <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-3">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800 dark:text-[#e3e3e3] mb-1">
            {isChunkError ? 'Đang cập nhật phiên bản mới / Module chưa tải kịp' : 'Không thể tải phân hệ này'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-[#a3a3a3] max-w-md mb-4 leading-relaxed">
            {isChunkError
              ? 'Hệ thống vừa cập nhật hoặc kết nối mạng bị gián đoạn trong giây lát. Vui lòng bấm Thử lại hoặc Tải lại trang.'
              : (this.state.error?.message || 'Đã có sự cố xảy ra khi hiển thị tab.')}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={this.handleRetry}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 active:scale-95"
            >
              <RotateCw className="w-3.5 h-3.5" />
              Thử lại (Retry)
            </button>
            <button
              onClick={this.handleReload}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-[#2c2c30] dark:hover:bg-[#38383e] text-slate-800 dark:text-[#e3e3e3] text-xs font-bold rounded-xl transition-all shadow-xs active:scale-95"
            >
              Tải lại trang (Reload)
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
