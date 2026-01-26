import React from 'react';
import { useI18n } from '../i18n';

type ErrorBoundaryProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

class ErrorBoundaryBase extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    // Swallow error to keep UI alive.
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}

export const ErrorBoundary = ({ children, fallback }: ErrorBoundaryProps) => {
  const { t } = useI18n();
  const defaultFallback = (
    <div className="pixel-card flex flex-col items-center justify-center gap-3 text-center min-h-[220px]">
      <div className="pixel-title text-sm">{t('chartLoadFailed')}</div>
      <div className="text-xs text-[var(--muted)]">{t('chartLoadFailedHint')}</div>
      <button
        type="button"
        className="pixel-button ghost text-xs"
        onClick={() => window.location.reload()}
      >
        {t('reload')}
      </button>
    </div>
  );

  return (
    <ErrorBoundaryBase fallback={fallback ?? defaultFallback}>
      {children}
    </ErrorBoundaryBase>
  );
};

export default ErrorBoundary;
