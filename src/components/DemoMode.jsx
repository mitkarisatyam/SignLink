import React, { useState, Component } from 'react';
import DemoModeHome from './demo/DemoModeHome';
import DemoHearingToDeaf from './demo/DemoHearingToDeaf';
import DemoDeafToHearing from './demo/DemoDeafToHearing';
import { AlertCircle, RotateCcw, ArrowLeft } from 'lucide-react';

class DemoErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[DEMO ERROR BOUNDARY]:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#202124',
          color: '#e8eaed',
          padding: 24,
          textAlign: 'center'
        }}>
          <div style={{
            maxWidth: 520,
            background: '#292a2d',
            border: '1px solid rgba(234, 67, 53, 0.4)',
            borderRadius: 16,
            padding: 32,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <AlertCircle size={44} color="#ea4335" />
            </div>
            <h2 style={{ fontSize: 20, marginBottom: 8, color: '#ffffff' }}>Demo Component Encountered an Issue</h2>
            <p style={{ fontSize: 13, color: '#9aa0a6', marginBottom: 24, lineHeight: 1.5 }}>
              {this.state.error?.message || 'An unexpected error occurred while rendering the demo pipeline.'}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 18px',
                  borderRadius: 8,
                  background: '#8ab4f8',
                  color: '#202124',
                  fontWeight: 600,
                  fontSize: 13.5,
                  cursor: 'pointer',
                  border: 'none'
                }}
              >
                <RotateCcw size={15} />
                <span>Retry Pipeline</span>
              </button>
              {this.props.onReset && (
                <button
                  onClick={this.props.onReset}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 18px',
                    borderRadius: 8,
                    background: '#3c4043',
                    color: '#ffffff',
                    fontWeight: 600,
                    fontSize: 13.5,
                    cursor: 'pointer',
                    border: '1px solid rgba(255,255,255,0.1)'
                  }}
                >
                  <ArrowLeft size={15} />
                  <span>Back to Demo Home</span>
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function DemoMode({ onBack, theme = 'dark', onToggleTheme }) {
  const [pipelineView, setPipelineView] = useState('home'); // 'home' | 'hearing-to-deaf' | 'deaf-to-hearing'

  if (pipelineView === 'hearing-to-deaf') {
    return (
      <DemoErrorBoundary onReset={() => setPipelineView('home')}>
        <DemoHearingToDeaf
          onBack={() => setPipelineView('home')}
        />
      </DemoErrorBoundary>
    );
  }

  if (pipelineView === 'deaf-to-hearing') {
    return (
      <DemoErrorBoundary onReset={() => setPipelineView('home')}>
        <DemoDeafToHearing
          onBack={() => setPipelineView('home')}
        />
      </DemoErrorBoundary>
    );
  }

  return (
    <DemoModeHome
      onSelectPipeline={(pipeline) => setPipelineView(pipeline)}
      onBackToLanding={onBack}
      theme={theme}
      onToggleTheme={onToggleTheme}
    />
  );
}
