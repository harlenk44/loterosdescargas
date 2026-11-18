import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Error inesperado en la interfaz.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#02153A] px-6 text-white">
          <div className="max-w-md w-full p-6 rounded-2xl border border-[#00A3FF]/40 bg-[#041B47]/90 text-center space-y-4 shadow-xl">
            <h1 className="font-display text-xl font-bold text-white">
              Ocurrió un problema al cargar LOTEROSDESCARGAS
            </h1>
            <p className="text-sm text-blue-100/85">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-bold text-[#041E00] bg-[#7FE000] hover:bg-[#91F20F] rounded-lg cursor-pointer"
            >
              Recargar página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

declare global {
  interface Window {
    __clearLoterosBootTimer?: () => void;
  }
}

const rootElement = document.getElementById('root')!;
createRoot(rootElement).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);

if (typeof window !== 'undefined' && typeof window.__clearLoterosBootTimer === 'function') {
  window.__clearLoterosBootTimer();
}
