import React, { Component, ErrorInfo, ReactNode } from 'react';
import Icon from './Icon';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false
  };

  props: Props;
  
  constructor(props: Props) {
    super(props);
    this.props = props;
  }

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-200 dark:border-neutral-810 text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 text-red-600 rounded-full flex items-center justify-center mb-4 mx-auto">
            <Icon name="alert-triangle" className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold mb-2">Algo salió mal</h2>
          <p className="text-neutral-500 text-sm mb-6">No pudimos cargar esta sección correctamente. Es posible que el proyecto tenga datos incompletos.</p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-6 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-xl font-bold text-sm"
          >
            Recargar Aplicación
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
