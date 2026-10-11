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

export default function DemoModeHome({ 
  onSelectPipeline, 
  onBackToLanding, 
  theme = 'dark', 
  onToggleTheme, 
  demoLanguage = 'en', 
  onToggleLanguage 
}) {
  const isHindi = demoLanguage === 'hi';

  return (
    <div className="demo-home-container">
      {/* Header */}
      <header className="demo-home-header">
        <button
          onClick={onBackToLanding}
          className="demo-back-btn"
          title={isHindi ? 'साइनलिंक मुख्य पृष्ठ पर वापस जाएं' : 'Return to SignLink Home'}
        >
          <ArrowLeft size={16} />
          <span>{isHindi ? 'वापस' : 'Back'}</span>
        </button>

        <div className="demo-header-brand">
          <div className="brand-badge">SL</div>
          <div>
            <div className="brand-title">SignLink</div>
            <div className="brand-subtitle">{isHindi ? 'डेमो मोड' : 'Demo Mode'}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {onToggleLanguage && (
            <div className="demo-lang-toggle" style={{ display: 'flex', background: '#202124', border: '1px solid #3c4043', borderRadius: '20px', overflow: 'hidden', fontSize: '12px', fontWeight: 'bold' }}>
              <button 
                onClick={onToggleLanguage}
                style={{ padding: '6px 12px', border: 'none', background: !isHindi ? '#8ab4f8' : 'transparent', color: !isHindi ? '#202124' : '#9aa0a6', cursor: 'pointer', transition: 'all 0.2s' }}
              >
                ENGLISH
              </button>
              <button 
                onClick={onToggleLanguage}
                style={{ padding: '6px 12px', border: 'none', background: isHindi ? '#8ab4f8' : 'transparent', color: isHindi ? '#202124' : '#9aa0a6', cursor: 'pointer', transition: 'all 0.2s' }}
              >
                हिन्दी
              </button>
            </div>
          )}

          <button 
            className="theme-toggle-pill-btn" 
            onClick={onToggleTheme} 
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} theme`}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
        </div>
      </header>

      {/* Main Choice Screen */}
      <main className="demo-home-main">
        <div className="demo-home-content">
          <h1 className="demo-main-title">{isHindi ? 'संकेत भाषा संचार डेमो' : 'Communication Demo'}</h1>
          <p className="demo-main-desc">
            {isHindi ? 'संकेत भाषा अनुवाद का परीक्षण करने के लिए एक मोड चुनें।' : 'Select a mode to test sign language translation.'}
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
                <h2 className="pipeline-title">{isHindi ? 'श्रवण → बधिर' : 'Hearing → Deaf'}</h2>
                <div className="pipeline-subtitle">{isHindi ? 'वाणी और टेक्स्ट से 3D दुभाषिया' : 'Speech & Text to 3D Signer'}</div>
                <p className="pipeline-desc">
                  {isHindi
                    ? '3D अवतार द्वारा भारतीय संकेत भाषा में अनुवाद देखने के लिए बोलें या टेक्स्ट टाइप करें (COME, HOME, PLEASE, WORK, GO आदि)।'
                    : 'Speak or type text to watch the 3D avatar translate words into Indian Sign Language (COME, HOME, PLEASE, WORK, GO).'}
                </p>
              </div>

              <button
                className="launch-demo-btn btn-hearing"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectPipeline('hearing-to-deaf');
                }}
              >
                <span>{isHindi ? 'श्रवण → बधिर खोलें' : 'Open Hearing → Deaf'}</span>
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
                <h2 className="pipeline-title">{isHindi ? 'बधिर → श्रवण' : 'Deaf → Hearing'}</h2>
                <div className="pipeline-subtitle">{isHindi ? 'संकेत पहचान से ध्वनि' : 'Sign Recognition to Speech'}</div>
                <p className="pipeline-desc">
                  {isHindi
                    ? 'टेक्स्ट और ध्वनि आउटपुट के साथ वास्तविक समय में इशारों को पहचानने के लिए अपने कैमरे के सामने ISL संकेत करें।'
                    : 'Perform ISL signs in front of your camera to recognize gestures in real-time with text and voice output.'}
                </p>
              </div>

              <button
                className="launch-demo-btn btn-deaf"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectPipeline('deaf-to-hearing');
                }}
              >
                <span>{isHindi ? 'बधिर → श्रवण खोलें' : 'Open Deaf → Hearing'}</span>
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
