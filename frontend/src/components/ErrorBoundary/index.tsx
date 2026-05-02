'use client';

// =================================================================
// ERROR BOUNDARY COMPONENT
// Why: Provides a safety net for the application. If a React 
// component crashes, this boundary catches the error and displays 
// a user-friendly fallback UI instead of a blank screen or a 
// broken interface.
// =================================================================

import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export interface ErrorBoundaryProps {
  /** Child components to wrap in the boundary */
  children: ReactNode;
  /** Optional custom fallback UI to override the default display */
  fallback?: ReactNode;
  /** Callback for external error tracking or logging */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary catches JavaScript errors anywhere in the child component tree
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  // =================================================================
  // STATIC METHODS
  // Why: Lifecycle method to update state after an error is thrown.
  // =================================================================
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  // =================================================================
  // LIFECYCLE METHODS
  // =================================================================
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Why: Log the error to console for debugging purposes.
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // IF: Error callback is provided
    // Why: Propagate error to parent components or external services (e.g., Sentry).
    this.props.onError?.(error, errorInfo);
  }

  // =================================================================
  // EVENT HANDLERS
  // =================================================================
  handleReset = (): void => {
    // Why: Clear local error state and refresh the window as a "hard reset" 
    // to clear any corrupted memory or stale state.
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  // =================================================================
  // RENDERING
  // =================================================================
  render(): ReactNode {
    // IF: An error has occurred in the child tree
    if (this.state.hasError) {
      // IF: A custom fallback was provided
      // Why: Allows specific parts of the UI to fail gracefully while 
      // showing context-specific retry buttons.
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // DEFAULT: Global Fallback UI
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            padding: '20px',
            textAlign: 'center',
            backgroundColor: '#fafafa',
          }}
          role="alert"
          aria-live="assertive"
        >
          <AlertTriangle size={64} color="#ff4d4f" aria-hidden="true" />
          <h1
            style={{
              marginTop: '20px',
              fontSize: '24px',
              fontWeight: 600,
              color: '#262626',
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              color: '#666',
              maxWidth: '500px',
              marginTop: '10px',
              lineHeight: 1.6,
            }}
          >
            We encountered an unexpected error. Please try refreshing the page.
            If the problem persists, please contact support.
          </p>
          <button
            onClick={this.handleReset}
            style={{
              marginTop: '24px',
              padding: '12px 24px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              border: 'none',
              borderRadius: '3px',
              background: '#ff6b81',
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              transition: 'background 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#40a9ff';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = '#ff6b81';
            }}
            aria-label="重新載入應用程式"
          >
            <RefreshCw size={16} aria-hidden="true" />
            Reload Application
          </button>
          
          {/* 
              DEBUG VIEW: Display technical details in development
              Why: Speeds up debugging by showing the stack trace without 
              forcing the developer to check the browser console.
          */}
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details
              style={{
                marginTop: '24px',
                padding: '16px',
                background: '#fff1f0',
                borderRadius: '8px',
                maxWidth: '600px',
                width: '100%',
                textAlign: 'left',
                border: '1px solid #ffa39e',
              }}
            >
              <summary
                style={{
                  cursor: 'pointer',
                  fontWeight: 500,
                  color: '#cf1322',
                }}
              >
                Error Details (Development Only)
              </summary>
              <pre
                style={{
                  marginTop: '12px',
                  padding: '12px',
                  background: '#fff',
                  borderRadius: '4px',
                  overflow: 'auto',
                  fontSize: '12px',
                  lineHeight: 1.5,
                }}
              >
                {this.state.error.toString()}
                {'\n\n'}
                {this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    // NORMAL CASE: Render children as-is
    return this.props.children;
  }
}

export default ErrorBoundary;
