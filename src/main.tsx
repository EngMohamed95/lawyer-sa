import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';

function showBootError(error: unknown) {
  const root = document.getElementById('root');
  const message = error instanceof Error ? error.message : String(error);

  if (root) {
    root.innerHTML = `
      <div dir="rtl" style="min-height:100vh;background:#0A192F;color:white;padding:32px;font-family:Arial,sans-serif">
        <div style="max-width:760px;margin:80px auto;border:1px solid rgba(248,113,113,.35);background:rgba(239,68,68,.12);border-radius:18px;padding:24px">
          <h1 style="font-size:26px;margin:0 0 14px">حدث خطأ أثناء تحميل النظام</h1>
          <pre style="white-space:pre-wrap;color:#fecaca;font-size:14px;line-height:1.7">${message}</pre>
        </div>
      </div>
    `;
  }
}

window.addEventListener('error', (event) => showBootError(event.error || event.message));
window.addEventListener('unhandledrejection', (event) => showBootError(event.reason));

document.getElementById('boot-status')?.replaceChildren('بدأ تحميل React...');

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Application render failed:", error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <div dir="rtl" className="min-h-screen bg-[#0A192F] p-8 text-white">
          <div className="mx-auto mt-20 max-w-2xl rounded-2xl border border-red-400/30 bg-red-500/10 p-6">
            <h1 className="text-2xl font-bold">حدث خطأ أثناء تحميل النظام</h1>
            <p className="mt-3 text-sm text-red-100">{this.state.error.message}</p>
            <p className="mt-4 text-sm text-gray-300">افتح Console أو أعد تحميل الصفحة بعد تحديث السيرفر.</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

async function boot() {
  const { default: App } = await import('./App.tsx?boot=2');

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}

boot().catch((error) => {
  showBootError(error);
});
