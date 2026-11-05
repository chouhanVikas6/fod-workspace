import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  name?: string;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[ErrorBoundary] Caught error in "${this.props.name || 'Component'}":`, error, errorInfo);
    this.setState({ errorInfo });
  }

  handleRetry = () => {
    if (this.props.onReset) {
      this.props.onReset();
    }
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const componentName = this.props.name || "Application Module";

      return (
        <div className="w-full h-full min-h-[220px] flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-[#1E242B] text-slate-800 dark:text-slate-100 rounded-xl border border-slate-200 dark:border-[#373C43] shadow-sm select-none">
          <div className="flex items-center space-x-3 mb-3 text-red-500">
            <svg
              className="w-8 h-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              An error occurred in {componentName}
            </h2>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400 mb-4 max-w-lg text-center font-mono bg-white dark:bg-[#14181E] p-3 rounded-lg border border-slate-200 dark:border-[#2C323B] overflow-auto max-h-32 w-full">
            {this.state.error?.message || "Unknown rendering exception"}
          </p>

          <div className="flex items-center gap-3">
            <button
              onClick={this.handleRetry}
              className="px-4 py-2 bg-[#4C9FE8] hover:bg-[#3B91DC] text-white text-xs font-bold rounded-lg shadow transition-all active:scale-95 cursor-pointer"
            >
              Try Again
            </button>
            <button
              onClick={this.handleReload}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-[#2B313A] dark:hover:bg-[#38404C] text-slate-700 dark:text-slate-200 text-xs font-bold rounded-lg border border-slate-300 dark:border-[#3A424E] transition-all active:scale-95 cursor-pointer"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
