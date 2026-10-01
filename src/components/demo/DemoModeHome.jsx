import React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  HandMetal,
  Mic,
  Volume2,
  Sun,
  Moon
} from 'lucide-react';
import './DemoMode.css';

export default function DemoModeHome({ onSelectPipeline, onBackToLanding, theme = 'dark', onToggleTheme }) {
  return (
    <div className="demo-home-container">
      {/* Header */}
      <header className="demo-home-header">
        <button
          onClick={onBackToLanding}
          className="demo-back-btn"
          title="Return to SignLink Home"
        >
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        <div className="demo-header-brand">
          <div className="brand-badge">SL</div>
          <div>
            <div className="brand-title">SignLink</div>
            <div className="brand-subtitle">Demo Mode</div>
          </div>
        </div>

        <button 
          className="theme-toggle-pill-btn" 
          onClick={onToggleTheme} 
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} theme`}
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>
      </header>

      {/* Main Choice Screen */}
      <main className="demo-home-main">
        <div className="demo-home-content">
          <h1 className="demo-main-title">Communication Demo</h1>
          <p className="demo-main-desc">
            Select a mode to test sign language translation.
          </p>

          {/* Action Cards */}
          <div className="demo-cards-grid">
            {/* Hearing -> Deaf */}
            <div
              className="demo-pipeline-card"
              onClick={() => onSelectPipeline('hearing-to-deaf')}
            >
              <div className="card-icon-circle icon-hearing">
                <Bot size={28} />
              </div>

              <div className="card-text-block">
                <h2 className="pipeline-title">Hearing → Deaf</h2>
                <div className="pipeline-subtitle">Speech & Text to 3D Signer</div>
                <p className="pipeline-desc">
                  Speak or type text to watch the 3D avatar translate words into Indian Sign Language (COME, HOME, PLEASE, WORK, GO).
                </p>
              </div>

              <button
                className="launch-demo-btn btn-hearing"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectPipeline('hearing-to-deaf');
                }}
              >
                <span>Open Hearing → Deaf</span>
                <ArrowRight size={15} />
              </button>
            </div>

            {/* Deaf -> Hearing */}
            <div
              className="demo-pipeline-card"
              onClick={() => onSelectPipeline('deaf-to-hearing')}
            >
              <div className="card-icon-circle icon-deaf">
                <HandMetal size={28} />
              </div>

              <div className="card-text-block">
                <h2 className="pipeline-title">Deaf → Hearing</h2>
                <div className="pipeline-subtitle">Sign Recognition to Speech</div>
                <p className="pipeline-desc">
                  Perform ISL signs in front of your camera to recognize gestures in real-time with text and voice output.
                </p>
              </div>

              <button
                className="launch-demo-btn btn-deaf"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectPipeline('deaf-to-hearing');
                }}
              >
                <span>Open Deaf → Hearing</span>
                <ArrowRight size={15} />
              </button>
            </div>
          </div>


        </div>
      </main>
    </div>
  );
}
