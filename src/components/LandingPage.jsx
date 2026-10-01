import React, { useEffect, useRef } from 'react';
import { 
  Video, Bot, ArrowRight, Sun, Moon, 
  Mic, Eye, MessageSquare, Monitor, AudioLines, ScanFace, Globe
} from 'lucide-react';
import './LandingPage.css';

// Intersection Observer Hook for elegant scroll animations
function useFadeIn() {
  const ref = useRef(null);
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    }, { threshold: 0.1 });
    
    if (ref.current) observer.observe(ref.current);
    return () => { if (ref.current) observer.unobserve(ref.current); };
  }, []);
  return ref;
}

const FadeSection = ({ children, className = '', id }) => {
  const ref = useFadeIn();
  return (
    <section ref={ref} className={`fade-section ${className}`} id={id}>
      {children}
    </section>
  );
};

export default function LandingPage({ onSelectMode, theme = 'dark', onToggleTheme }) {
  
  return (
    <div className="landing-container">
      {/* Ambient background glows */}
      <div className="ambient-glow"></div>
      <div className="ambient-glow-2"></div>

      {/* Navbar */}
      <nav className="landing-nav">
        <div className="nav-left">
          <div className="nav-logo">SignLink</div>
        </div>
        
        <div className="nav-links">
          <a href="#how-it-works">How It Works</a>
          <a href="#why-it-matters">Why It Matters</a>
          <a href="#technology">Technology</a>
        </div>
        
        <div className="nav-actions">
          <button onClick={onToggleTheme} className="nav-btn ghost">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="nav-btn ghost" onClick={() => onSelectMode('demo')}>Demo</button>
          <button className="nav-btn primary" onClick={() => onSelectMode('call')}>Video Call</button>
        </div>
      </nav>

      {/* 1. HERO SECTION */}
      <section 
        className="hero-section"
        style={{
          backgroundImage: `url('https://static.vecteezy.com/system/resources/thumbnails/070/866/760/small/close-up-of-hands-forming-sign-language-gestures-communicating-silently-and-expressively-photo.jpg')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }}
      >
        <div className="hero-overlay"></div>
        <div className="hero-content">
          <div className="website-brand-name">SignLink</div>
          <h1 className="hero-title">Communication Without<br/>Language Barriers.</h1>
          <p className="hero-subtitle">
            A real-time bridge between Indian Sign Language and speech, 
            designed to help Deaf and hearing people communicate naturally.
          </p>
          
          <div className="hero-cta">
            <button className="btn primary" onClick={() => onSelectMode('call')}>
              Start Video Call <ArrowRight size={16} />
            </button>
            <button className="btn secondary" onClick={() => onSelectMode('demo')}>
              Try Live Demo
            </button>
          </div>
        </div>
      </section>

      {/* 4. WHY WE MADE IT */}
      <FadeSection className="story-section">
        <h2 className="story-text">
          "Communication should never depend on whether two people speak the same language."
        </h2>
      </FadeSection>

      {/* 5. WHY IT MATTERS */}
      <FadeSection id="why-it-matters">
        <div className="section-header">
          <span className="section-tag">Why It Matters</span>
          <h2 className="section-title">Inclusive by design.</h2>
        </div>
        <div className="cards-grid">
          <div className="feature-card">
            <Globe className="feature-icon" size={28} />
            <h3 className="feature-title">Real-Time</h3>
            <p className="feature-desc">Communication happens naturally, as the conversation happens, with minimal latency.</p>
          </div>
          <div className="feature-card">
            <MessageSquare className="feature-icon" size={28} />
            <h3 className="feature-title">Two-Way</h3>
            <p className="feature-desc">Both people can communicate effortlessly instead of supporting only one direction.</p>
          </div>
          <div className="feature-card">
            <Eye className="feature-icon" size={28} />
            <h3 className="feature-title">Accessible</h3>
            <p className="feature-desc">Designed strictly around visual communication, clear feedback, and ease of use.</p>
          </div>
        </div>
      </FadeSection>

      {/* 6 & 7. HOW IT WORKS / TWO-WAY COMMUNICATION */}
      <FadeSection id="how-it-works">
        <div className="section-header">
          <span className="section-tag">How It Works</span>
          <h2 className="section-title">Two directions. One conversation.</h2>
        </div>
        
        <div className="flow-container">
          {/* Sign to Speech */}
          <div className="flow-row">
            <div className="flow-step">
              <div className="step-icon"><ScanFace size={24} /></div>
              <div className="step-label">ISL Sign</div>
            </div>
            <ArrowRight className="flow-arrow" />
            <div className="flow-step">
              <div className="step-icon"><Monitor size={24} /></div>
              <div className="step-label">AI Recognition</div>
            </div>
            <ArrowRight className="flow-arrow" />
            <div className="flow-step">
              <div className="step-icon"><AudioLines size={24} /></div>
              <div className="step-label">Voice Output</div>
            </div>
          </div>
          
          {/* Speech to Sign */}
          <div className="flow-row">
            <div className="flow-step">
              <div className="step-icon"><Mic size={24} /></div>
              <div className="step-label">Speech</div>
            </div>
            <ArrowRight className="flow-arrow" />
            <div className="flow-step">
              <div className="step-icon"><MessageSquare size={24} /></div>
              <div className="step-label">Text Mapping</div>
            </div>
            <ArrowRight className="flow-arrow" />
            <div className="flow-step">
              <div className="step-icon"><Bot size={24} /></div>
              <div className="step-label">3D ISL Avatar</div>
            </div>
          </div>
        </div>
      </FadeSection>

      {/* 8. VIDEO CALL PREVIEW */}
      <FadeSection>
        <div className="section-header">
          <span className="section-tag">Product Preview</span>
          <h2 className="section-title">Seamless Video Calling</h2>
        </div>
        
        <div className="product-preview-ui">
          <div className="mock-header">
            <span>SignLink</span>
            <span className="status"><span className="live-dot" style={{width: 6, height: 6, display: 'inline-block'}}></span> Connected</span>
          </div>
          <div className="mock-body">
            <div className="mock-video">
              <div className="mock-video-label">Deaf User</div>
              <ScanFace size={48} opacity={0.2} />
            </div>
            <div className="mock-video">
              <div className="mock-video-label">Hearing User</div>
              <Bot size={48} opacity={0.2} />
            </div>
          </div>
          <div className="mock-footer">
            <div className="captions">🔊 Hello, how is your day going?</div>
            <div className="controls">
              <div className="ctrl-btn"><Mic size={20} /></div>
              <div className="ctrl-btn"><Video size={20} /></div>
              <div className="ctrl-btn end"><ArrowRight size={20} style={{transform: 'rotate(135deg)'}}/></div>
            </div>
          </div>
        </div>
      </FadeSection>

      {/* 9. TECHNOLOGY */}
      <FadeSection id="technology">
        <div className="section-header">
          <span className="section-tag">Under the Hood</span>
          <h2 className="section-title">Powered by Modern Tech</h2>
        </div>
        <div className="tech-grid">
          <div className="tech-pill">MediaPipe</div>
          <div className="tech-pill">Computer Vision</div>
          <div className="tech-pill">LSTM & GRU</div>
          <div className="tech-pill">Web Speech API</div>
          <div className="tech-pill">WebRTC</div>
          <div className="tech-pill">Three.js</div>
          <div className="tech-pill">React</div>
        </div>
      </FadeSection>

      {/* FINAL CTA */}
      <FadeSection>
        <div className="final-cta">
          <h2>Ready to bridge the gap?</h2>
          <div className="hero-cta" style={{marginBottom: 0, justifyContent: 'center'}}>
            <button className="btn primary" onClick={() => onSelectMode('call')}>
              Start a Call Now
            </button>
            <button className="btn secondary" onClick={() => onSelectMode('demo')}>
              Explore Demo
            </button>
          </div>
        </div>
      </FadeSection>

      {/* FOOTER */}
      <footer className="landing-footer">
        <p>© 2026 SignLink. Breaking communication barriers with technology.</p>
      </footer>
    </div>
  );
}
