import React, { useState, useEffect, useCallback, useRef } from 'react';
import DeafVideoSignRecognizer from '../DeafVideoSignRecognizer';
import {
  Camera,
  CameraOff,
  Volume2,
  VolumeX,
  PhoneOff,
  ArrowLeft,
  Clock,
  HandMetal,
  User,
  Sparkles,
  CheckCircle2,
  Radio,
  Cpu
} from 'lucide-react';
import './DemoMode.css';

export default function DemoDeafToHearing({ onBack }) {
  const [camActive, setCamActive] = useState(true);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [lastRecognizedSign, setLastRecognizedSign] = useState(null);
  const [signConfidence, setSignConfidence] = useState(0);
  const [recentSigns, setRecentSigns] = useState([]);
  const [activeBanner, setActiveBanner] = useState(null);
  const [currentTime, setCurrentTime] = useState('');
  const [isSpeakingTts, setIsSpeakingTts] = useState(false);

  // Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const lastWordRef = useRef(null);
  const lastTimeRef = useRef(0);

  // Handle recognized sign from DeafVideoSignRecognizer - strictly ONCE per gesture
  const handleSignRecognized = useCallback((word) => {
    // Only accept supported 5 words, discard NO_SIGN
    if (!word || word === 'NO_SIGN') return;

    const now = Date.now();
    // Guard: Prevent duplicate triggers of the same sign within 3s or any sign within 1.8s
    if (lastWordRef.current === word && now - lastTimeRef.current < 3000) {
      return;
    }
    if (now - lastTimeRef.current < 1800) {
      return;
    }

    lastWordRef.current = word;
    lastTimeRef.current = now;

    setLastRecognizedSign(word);
    setIsSpeakingTts(true);

    setActiveBanner({
      word,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    });

    setRecentSigns((prev) => [
      { word, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
      ...prev.slice(0, 3)
    ]);

    // Reset speaking indicator after 1.8s
    setTimeout(() => {
      setIsSpeakingTts(false);
    }, 1800);

    // Auto-dismiss floating banner after 4.5s
    setTimeout(() => {
      setActiveBanner((prev) => (prev?.word === word ? null : prev));
    }, 4500);
  }, []);

  return (
    <div className="demo-call-screen">
      {/* Header */}
      <header className="demo-call-header">
        <div className="header-left">
          <button onClick={onBack} className="demo-call-back-btn" title="Back to Demo Selection">
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
          <div className="header-brand-group">
            <div className="badge-mini">SL</div>
            <span className="brand-text">SIGNLINK Demo</span>
            <span className="pipeline-indicator-pill deaf-pill">
              Pipeline B: Deaf → Hearing
            </span>
          </div>
        </div>

        <div className="header-center">
          <div className="pipeline-flow-banner">
            <span>Webcam & MediaPipe</span>
            <span className="arrow-sep">→</span>
            <span>SignTemporalGRU v2</span>
            <span className="arrow-sep">→</span>
            <span className="highlight-tag">Text + Voice (TTS)</span>
          </div>
        </div>

        <div className="header-right">
          <div className="clock-tag">
            <Clock size={13} />
            <span>{currentTime}</span>
          </div>
        </div>
      </header>

      {/* Main Two-Tile Stage */}
      <main className="demo-stage-grid">
        {/* Tile 1: Deaf Person (Webcam + MediaPipe + Sign Classifier) */}
        <div className="demo-video-tile deaf-tile">
          <div className="tile-content">
            <DeafVideoSignRecognizer
              onSignRecognized={handleSignRecognized}
              isCameraActive={camActive}
              onCameraToggle={setCamActive}
              ttsEnabled={ttsEnabled}
              onTtsToggle={() => setTtsEnabled(!ttsEnabled)}
            />


          </div>
        </div>

        {/* Tile 2: Hearing Person (Voice/TTS Receiver) */}
        <div className={`demo-video-tile receiver-tile ${isSpeakingTts ? 'speaker-active' : ''}`}>
          <div className="tile-content receiver-container">
            <div className="receiver-card">
              <div className={`speaker-avatar-circle ${isSpeakingTts ? 'speaking' : ''}`}>
                <User size={56} color="#8ab4f8" />
                {isSpeakingTts && <span className="speaker-wave-ring" />}
              </div>

              <h3 className="receiver-title">Hearing Participant</h3>
              <p className="receiver-desc">
                Receives translated speech audio (TTS) and live text subtitles in real time.
              </p>

              {/* Live Audio / TTS Output State */}
              <div className="live-tts-status-card">
                <div className="tts-status-header">
                  <div className="tts-active-indicator">
                    <span className={`status-led ${isSpeakingTts ? 'active' : ''}`} />
                    <span>{isSpeakingTts ? 'Speaking Output (TTS)...' : 'Listening for Signs...'}</span>
                  </div>
                  <span className="tts-volume-pill">
                    {ttsEnabled ? <Volume2 size={13} color="#81c995" /> : <VolumeX size={13} color="#ea4335" />}
                    <span>{ttsEnabled ? 'Audio On' : 'Audio Muted'}</span>
                  </span>
                </div>

                <div className="tts-word-display">
                  <span className="tts-label">Voice Spoken:</span>
                  <span className="tts-current-word">
                    {lastRecognizedSign ? `"${lastRecognizedSign}"` : 'Awaiting sign...'}
                  </span>
                </div>
              </div>

            </div>

            {/* Bottom Tile Info */}
            <div className="tile-bottom-badge">
              <Volume2 size={14} color="#8ab4f8" />
              <span>Hearing Participant • Voice Audio (TTS)</span>
            </div>
          </div>
        </div>
      </main>

      {/* Floating Call Controls Bar */}
      <footer className="demo-controls-bar">
        <div className="controls-inner">
          {/* Camera toggle */}
          <button
            className={`control-circle-btn ${!camActive ? 'disabled' : ''}`}
            onClick={() => setCamActive(!camActive)}
            title={camActive ? 'Turn Off Video' : 'Turn On Video'}
          >
            {camActive ? <Camera size={20} /> : <CameraOff size={20} color="#ea4335" />}
          </button>

          {/* TTS Audio toggle */}
          <button
            className={`control-circle-btn ${!ttsEnabled ? 'disabled' : ''}`}
            onClick={() => setTtsEnabled(!ttsEnabled)}
            title={ttsEnabled ? 'Mute Voice Audio (TTS)' : 'Unmute Voice Audio (TTS)'}
          >
            {ttsEnabled ? <Volume2 size={20} /> : <VolumeX size={20} color="#ea4335" />}
          </button>

          {/* End / Return */}
          <button
            className="control-circle-btn end-call-btn"
            onClick={onBack}
            title="Leave Demo (Back to selection)"
          >
            <PhoneOff size={20} />
          </button>
        </div>
      </footer>
    </div>
  );
}
