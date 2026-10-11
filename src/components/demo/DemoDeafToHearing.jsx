import React, { useState, useEffect, useCallback, useRef } from 'react';
import DeafVideoSignRecognizer from '../DeafVideoSignRecognizer';
import DemoSignSafeMode from './DemoSignSafeMode';
import { SUPPORTED_SIGNS } from '../IslAvatarViewer';
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
  AlertTriangle,
  RotateCcw,
  Edit3,
  Undo2,
  MessageSquare,
  Radio,
  Cpu
} from 'lucide-react';
import './DemoMode.css';

import { getLabelForConcept, getConceptIdFromLabel, DEMO_VOCABULARY, speakConceptText } from '../../utils/demoLanguageMappings';

export default function DemoDeafToHearing({ onBack, demoLanguage = 'en', onToggleLanguage }) {
  const [hasCompletedSignSafe, setHasCompletedSignSafe] = useState(false);
  const [camActive, setCamActive] = useState(true);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [currentTime, setCurrentTime] = useState('');
  const [isSpeakingTts, setIsSpeakingTts] = useState(false);

  // Meaning Recovery States
  const [currentPrediction, setCurrentPrediction] = useState(null);
  const [confirmedTranscript, setConfirmedTranscript] = useState([]);
  const [isCorrecting, setIsCorrecting] = useState(false);

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

  const speakWord = useCallback((conceptId, targetLang = demoLanguage) => {
    if (!ttsEnabled || typeof window === 'undefined' || !window.speechSynthesis) return;
    setIsSpeakingTts(true);
    speakConceptText(conceptId, targetLang === 'hi', {
      onEnd: () => setIsSpeakingTts(false),
      onError: () => setIsSpeakingTts(false)
    });
  }, [ttsEnabled, demoLanguage]);

  // When user switches language (even rapidly), immediately cut off prior speech and announce in the new language
  const prevLangRef = useRef(demoLanguage);
  useEffect(() => {
    if (prevLangRef.current !== demoLanguage) {
      prevLangRef.current = demoLanguage;
      
      // Stop ongoing voice immediately
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        setIsSpeakingTts(false);
      }

      // Re-announce the latest recognized or active prediction sign in the new language
      const wordToAnnounce = currentPrediction?.word || lastWordRef.current;
      if (wordToAnnounce && ttsEnabled) {
        speakWord(wordToAnnounce, demoLanguage);
      }
    }
  }, [demoLanguage, currentPrediction, ttsEnabled, speakWord]);

  // Handle recognized sign from DeafVideoSignRecognizer
  const handleSignRecognized = useCallback((word, conf) => {
    if (!word || word === 'NO_SIGN') return;

    const now = Date.now();
    // Guard: Prevent duplicate triggers within a small window
    if (lastWordRef.current === word && now - lastTimeRef.current < 3000) return;
    if (now - lastTimeRef.current < 1800) return;

    lastWordRef.current = word;
    lastTimeRef.current = now;

    const confidence = conf || 90;

    if (confidence >= 85) {
      // Normal workflow - store concept ID so it translates dynamically when language is switched
      setConfirmedTranscript(prev => [...prev, word]);
      speakWord(word, demoLanguage);
      setCurrentPrediction(null);
    } else {
      // Send to Meaning Recovery
      setCurrentPrediction({
        word, // Store the concept ID
        confidence,
      });
      setIsCorrecting(false);
    }
  }, [speakWord, demoLanguage]);

  const handleConfirm = () => {
    if (currentPrediction) {
      lastWordRef.current = currentPrediction.word;
      setConfirmedTranscript(prev => [...prev, currentPrediction.word]);
      speakWord(currentPrediction.word, demoLanguage);
      setCurrentPrediction(null);
    }
  };

  const handleCorrect = (selectedWordId) => {
    lastWordRef.current = selectedWordId;
    setConfirmedTranscript(prev => [...prev, selectedWordId]);
    speakWord(selectedWordId, demoLanguage);
    setCurrentPrediction(null);
    setIsCorrecting(false);
  };

  const handleClear = () => {
    setCurrentPrediction(null);
    setIsCorrecting(false);
  };

  const handleUndo = () => {
    setConfirmedTranscript(prev => prev.slice(0, -1));
  };

  if (!hasCompletedSignSafe) {
    return (
      <DemoSignSafeMode 
        onBack={onBack} 
        onProceed={() => setHasCompletedSignSafe(true)} 
      />
    );
  }

  const isUncertain = currentPrediction && currentPrediction.confidence < 85;

  return (
    <div className="demo-call-screen">
      {/* Header */}
      <header className="demo-call-header">
        <div className="header-left">
          <button 
            onClick={onBack} 
            className="demo-call-back-btn" 
            title={demoLanguage === 'hi' ? 'डेमो चयन पर वापस जाएं' : 'Back to Demo Selection'}
          >
            <ArrowLeft size={16} />
            <span>{demoLanguage === 'hi' ? 'वापस' : 'Back'}</span>
          </button>
          <div className="header-brand-group">
            <div className="badge-mini">SL</div>
            <span className="brand-text">SIGNLINK Demo</span>
            <span className="pipeline-indicator-pill deaf-pill">
              {demoLanguage === 'hi' ? 'पाइपलाइन: बधिर → श्रवण' : 'Pipeline B: Deaf → Hearing'}
            </span>
          </div>
        </div>

        <div className="header-center" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="pipeline-flow-banner">
            <span>{demoLanguage === 'hi' ? 'वेबकैम और मीडियापाइप' : 'Webcam & MediaPipe'}</span>
            <span className="arrow-sep">→</span>
            <span>SignTemporalGRU v2</span>
            <span className="arrow-sep">→</span>
            <span className="highlight-tag">{demoLanguage === 'hi' ? 'टेक्स्ट + ध्वनि (TTS)' : 'Text + Voice (TTS)'}</span>
          </div>

          {/* Language Toggle */}
          <div className="demo-lang-toggle" style={{ display: 'flex', background: '#202124', border: '1px solid #3c4043', borderRadius: '20px', overflow: 'hidden', fontSize: '12px', fontWeight: 'bold' }}>
            <button 
              onClick={onToggleLanguage}
              style={{ padding: '6px 12px', border: 'none', background: demoLanguage === 'en' ? '#8ab4f8' : 'transparent', color: demoLanguage === 'en' ? '#202124' : '#9aa0a6', cursor: 'pointer', transition: 'all 0.2s' }}
            >
              ENGLISH
            </button>
            <button 
              onClick={onToggleLanguage}
              style={{ padding: '6px 12px', border: 'none', background: demoLanguage === 'hi' ? '#8ab4f8' : 'transparent', color: demoLanguage === 'hi' ? '#202124' : '#9aa0a6', cursor: 'pointer', transition: 'all 0.2s' }}
            >
              हिन्दी
            </button>
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
              ttsEnabled={false} // Managed by Meaning Recovery now
              onTtsToggle={() => setTtsEnabled(!ttsEnabled)}
              rejectionThreshold={0.50} // Lower threshold for Meaning Recovery demo
              demoLanguage={demoLanguage}
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

              <h3 className="receiver-title">{demoLanguage === 'hi' ? 'श्रवण प्रतिभागी' : 'Hearing Participant'}</h3>
              <p className="receiver-desc">
                {demoLanguage === 'hi'
                  ? 'वास्तविक समय में अनुवादित भाषण ऑडियो (TTS) और लाइव उपशीर्षक प्राप्त करता है।'
                  : 'Receives translated speech audio (TTS) and live text subtitles in real time.'}
              </p>

              {/* Meaning Recovery Section */}
              <div className="meaning-recovery-section" style={{ width: '100%', marginTop: '16px', background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '12px' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#9aa0a6', textTransform: 'uppercase' }}>
                  {demoLanguage === 'hi' ? 'अर्थ पुनर्प्राप्ति एवं सत्यापन' : 'Meaning Recovery & Validation'}
                </h4>
                
                {!currentPrediction ? (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: '#5f6368', fontSize: '13px' }}>
                    {demoLanguage === 'hi'
                      ? 'सत्यापन देखने के लिए संकेत करें (विश्वास < 85%)...'
                      : 'Perform a sign to see Meaning Recovery in action (Confidence < 85%)...'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isUncertain ? 'rgba(253, 214, 99, 0.1)' : 'rgba(129, 201, 149, 0.1)', border: `1px solid ${isUncertain ? '#fdd663' : '#81c995'}`, padding: '12px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff' }}>{getLabelForConcept(currentPrediction.word, demoLanguage === 'hi')}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: isUncertain ? '#fdd663' : '#81c995', fontSize: '14px', fontWeight: 'bold' }}>
                        {isUncertain ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                        {currentPrediction.confidence}%
                      </div>
                    </div>

                    <div style={{ marginBottom: '8px', fontSize: '13px', color: '#fdd663', textAlign: 'center' }}>
                      {demoLanguage === 'hi'
                        ? 'इस संकेत पर पूरा विश्वास नहीं है। कृपया पुष्टि करें या सुधारें।'
                        : 'Not confident about this sign. Please confirm or correct it.'}
                    </div>
                    {!isCorrecting ? (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <button onClick={handleConfirm} style={{ background: '#81c995', border: 'none', padding: '8px', borderRadius: '6px', color: '#202124', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}><CheckCircle2 size={14}/> {demoLanguage === 'hi' ? 'पुष्टि करें' : 'Confirm'}</button>
                        <button onClick={() => setIsCorrecting(true)} style={{ background: '#3c4043', border: 'none', padding: '8px', borderRadius: '6px', color: '#fff', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}><Edit3 size={14}/> {demoLanguage === 'hi' ? 'सुधारें' : 'Correct'}</button>
                        <button onClick={handleClear} style={{ gridColumn: 'span 2', background: 'transparent', border: '1px solid #ea4335', padding: '8px', borderRadius: '6px', color: '#ea4335', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}><RotateCcw size={14}/> {demoLanguage === 'hi' ? 'संकेत दोहराएं' : 'Repeat Sign'}</button>
                      </div>
                    ) : (
                      <div style={{ background: '#303134', padding: '12px', borderRadius: '6px' }}>
                        <div style={{ marginBottom: '8px', fontSize: '12px', color: '#9aa0a6' }}>
                          {demoLanguage === 'hi' ? 'सही संकेत चुनें:' : 'Choose correct sign:'}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {SUPPORTED_SIGNS.map(s => (
                            <button key={s.id} onClick={() => handleCorrect(s.id)} style={{ background: '#202124', border: '1px solid #8ab4f8', color: '#8ab4f8', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', cursor: 'pointer' }}>{getLabelForConcept(s.id, demoLanguage === 'hi')}</button>
                          ))}
                        </div>
                        <button onClick={() => setIsCorrecting(false)} style={{ background: 'none', border: 'none', color: '#9aa0a6', fontSize: '12px', marginTop: '12px', cursor: 'pointer', width: '100%', textAlign: 'center' }}>
                          {demoLanguage === 'hi' ? 'सुधार रद्द करें' : 'Cancel Correction'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
                
                <div style={{ marginTop: '16px', background: '#202124', border: '1px solid #3c4043', padding: '12px', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ fontSize: '12px', color: '#8ab4f8', display: 'flex', alignItems: 'center', gap: '4px' }}><MessageSquare size={12}/> {demoLanguage === 'hi' ? 'प्रतिलेख' : 'Transcript'}</div>
                    <button onClick={handleUndo} disabled={confirmedTranscript.length === 0} style={{ background: 'none', border: 'none', color: confirmedTranscript.length > 0 ? '#ea4335' : '#5f6368', fontSize: '12px', cursor: confirmedTranscript.length > 0 ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: '4px' }}><Undo2 size={12}/> {demoLanguage === 'hi' ? 'पूर्ववत करें' : 'Undo'}</button>
                  </div>
                  <div style={{ fontSize: '16px', color: '#fff', minHeight: '24px' }}>
                    {confirmedTranscript.length > 0 ? (
                      confirmedTranscript.map(w => {
                        const conceptId = getConceptIdFromLabel(w) || (DEMO_VOCABULARY[w] ? w : null);
                        return conceptId ? getLabelForConcept(conceptId, demoLanguage === 'hi') : w;
                      }).join(' ')
                    ) : (
                      <span style={{ color: '#5f6368' }}>{demoLanguage === 'hi' ? 'संकेतों की प्रतीक्षा...' : 'Awaiting signs...'}</span>
                    )}
                  </div>
                </div>
              </div>

            </div>

            {/* Bottom Tile Info */}
            <div className="tile-bottom-badge">
              <Volume2 size={14} color="#8ab4f8" />
              <span>{demoLanguage === 'hi' ? 'श्रवण प्रतिभागी • ध्वनि ऑडियो (TTS)' : 'Hearing Participant • Voice Audio (TTS)'}</span>
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
            title={demoLanguage === 'hi' ? (camActive ? 'कैमरा बंद करें' : 'कैमरा चालू करें') : (camActive ? 'Turn Off Video' : 'Turn On Video')}
          >
            {camActive ? <Camera size={20} /> : <CameraOff size={20} color="#ea4335" />}
          </button>

          {/* TTS Audio toggle */}
          <button
            className={`control-circle-btn ${!ttsEnabled ? 'disabled' : ''}`}
            onClick={() => setTtsEnabled(!ttsEnabled)}
            title={demoLanguage === 'hi' ? (ttsEnabled ? 'ध्वनि ऑडियो म्यूट करें' : 'ध्वनि ऑडियो चालू करें') : (ttsEnabled ? 'Mute Voice Audio (TTS)' : 'Unmute Voice Audio (TTS)')}
          >
            {ttsEnabled ? <Volume2 size={20} /> : <VolumeX size={20} color="#ea4335" />}
          </button>

          {/* End / Return */}
          <button
            className="control-circle-btn end-call-btn"
            onClick={onBack}
            title={demoLanguage === 'hi' ? 'डेमो से बाहर निकलें' : 'Leave Demo (Back to selection)'}
          >
            <PhoneOff size={20} />
          </button>
        </div>
      </footer>
    </div>
  );
}
