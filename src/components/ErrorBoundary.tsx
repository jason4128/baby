import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, LogOut } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetAuth = async () => {
    try {
      await signOut(auth);
      localStorage.clear();
      window.location.reload();
    } catch (e) {
      window.location.reload();
    }
  };

  private handleDismiss = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FFF9F0] flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-3xl shadow-md border border-amber-100 max-w-md w-full text-center">
            <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-200">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-black text-[#5C4D43] mb-2">畫面載入發生狀況</h2>
            <p className="text-xs text-amber-800/80 mb-6 leading-relaxed">
              系統在初始化或同步資料時遇到暫時性問題。您可以嘗試略過繼續進入，或重新整理畫面。
            </p>

            {this.state.error && (
              <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-200 text-left text-xs font-mono text-amber-900 mb-6 overflow-x-auto max-h-32">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <button
                onClick={this.handleDismiss}
                className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                略過並繼續進入系統
              </button>
              <button
                onClick={this.handleReload}
                className="w-full py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold rounded-xl transition-colors flex items-center justify-center gap-2 text-xs border border-amber-200"
              >
                <RefreshCw className="w-4 h-4" />
                重新整理畫面
              </button>
              <button
                onClick={this.handleResetAuth}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-[#5C4D43] font-bold rounded-xl transition-colors flex items-center justify-center gap-2 text-xs"
              >
                <LogOut className="w-4 h-4" />
                重設登入帳號並重新開啟
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
