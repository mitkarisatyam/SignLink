import React, { useRef, useState, useEffect, useCallback } from 'react';
import IslAvatarViewer, { SUPPORTED_SIGNS } from '../IslAvatarViewer';
import UpcomingSignModal from './UpcomingSignModal';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  ArrowLeft,
  Volume2,
  RotateCcw,
  Sparkles,
  MessageSquare,
  Clock,
  Bot,
  User,
  CheckCircle2,
  Radio,
  AlertCircle
} from 'lucide-react';
import './DemoMode.css';
import {
  matchSpeechToConceptId,
  matchSpeechToConceptSequence,
  formatConceptSequence,
  getLabelForConcept,
  DEMO_VOCABULARY
} from '../../utils/demoLanguageMappings';

export default function DemoHearingToDeaf({ onBack, demoLanguage = 'en', onToggleLanguage }) {
  const avatarRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);

  // States
  const [selectedWord, setSelectedWord] = useState('COME');
  const [lastSpokenWord, setLastSpokenWord] = useState('COME');
  const [hasSpoken, setHasSpoken] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(1.0);
  const [micActive, setMicActive] = useState(true);
  const [camActive, setCamActive] = useState(true);
  const [isListeningSpeech, setIsListeningSpeech] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [liveSpeechText, setLiveSpeechText] = useState('');
  const [currentTime, setCurrentTime] = useState('');
  const [isWordListExpanded, setIsWordListExpanded] = useState(false);
  const [upcomingModalData, setUpcomingModalData] = useState(null);

  // Refs for bulletproof speech lifecycle
  const micActiveRef = useRef(micActive);
  const isMountedRef = useRef(true);
  const restartTimerRef = useRef(null);
  const lastTriggerTimeRef = useRef(0);
  const lastTriggeredWordRef = useRef('');
  const lastRecognizedTimeRef = useRef(0);
  const signQueueRef = useRef([]);
  const lastMatchesRef = useRef([]);
  const lastResultIndexRef = useRef(0);
  const lastModalTimeRef = useRef(0);

  useEffect(() => {
    micActiveRef.current = micActive;
  }, [micActive]);

  // When demoLanguage changes, instantly update subtitles to the new language
  const prevLangHearingRef = useRef(demoLanguage);
  useEffect(() => {
    if (prevLangHearingRef.current !== demoLanguage) {
      prevLangHearingRef.current = demoLanguage;
      const isHindi = demoLanguage === 'hi';
      if (lastMatchesRef.current && lastMatchesRef.current.length > 0) {
        const sequenceDisplay = formatConceptSequence(lastMatchesRef.current, isHindi, ' • ');
        setLastSpokenWord(sequenceDisplay);
        setLiveSpeechText(sequenceDisplay);
      } else if (selectedWord) {
        const single = getLabelForConcept(selectedWord, isHindi);
        setLastSpokenWord(single);
        setLiveSpeechText(single);
      }
    }
  }, [demoLanguage, selectedWord]);

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

  // 1. Initialize Hearing Person Camera
  useEffect(() => {
    let isSubscribed = true;

    async function initCamera() {
      if (!camActive) {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false
        });

        if (!isSubscribed) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.warn('[DEMO] Camera access warning:', err);
      }
    }

    initCamera();

    return () => {
      isSubscribed = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [camActive]);

  // 2. Play sign on avatar - analyzed in 1 attempt
  const handleTriggerWord = useCallback((wordId, preserveLiveText = false) => {
    const upper = wordId.toUpperCase();
    const now = Date.now();

    lastTriggerTimeRef.current = now;
    lastTriggeredWordRef.current = upper;
    setSelectedWord(upper);
    const label = getLabelForConcept(upper, demoLanguage === 'hi');
    if (!preserveLiveText) {
      setLastSpokenWord(label);
      setLiveSpeechText(label);
    }
    setHasSpoken(true);

    if (avatarRef.current) {
      avatarRef.current.playSign(upper);
    }
  }, [demoLanguage]);

  // Synchronize animation state - plays queued signs in sequence
  const handleAnimationStateChange = useCallback((playing, word) => {
    setIsPlaying(playing);
    if (!playing) {
      console.log(`[DEMO HEARING] Avatar finished sign "${word}". Ready for next sign.`);
      if (signQueueRef.current && signQueueRef.current.length > 0) {
        const nextSign = signQueueRef.current.shift();
        handleTriggerWord(nextSign, true);
      }
    }
  }, [handleTriggerWord]);

  // 3. Handle unsupported or roadmap word spoken by user
  const handleUnsupportedWordSpoken = useCallback((rawPhrase) => {
    const now = Date.now();
    if (now - lastModalTimeRef.current < 1500) {
      return;
    }

    // Filter out stop words for meaningful word extraction
    const words = rawPhrase.trim().split(/\s+/);
    const stopWords = new Set(['i', 'a', 'an', 'the', 'is', 'are', 'was', 'were', 'am', 'to', 'for', 'in', 'on', 'at', 'by', 'this', 'that', 'it', 'my', 'your', 'we', 'they', 'you', 'me', 'him', 'her', 'can', 'will', 'do', 'does', 'did', 'want', 'need', 'say', 'speak', 'tell']);
    const meaningfulWords = words.filter((w) => !stopWords.has(w.toLowerCase()));

    let displayWord = '';
    if (meaningfulWords.length > 0 && meaningfulWords.length <= 3) {
      displayWord = meaningfulWords.join(' ').toUpperCase();
    } else if (words.length <= 3) {
      displayWord = words.join(' ').toUpperCase();
    } else if (meaningfulWords.length > 0) {
      displayWord = meaningfulWords[0].toUpperCase();
    } else {
      displayWord = words[0].toUpperCase();
    }

    if (!displayWord || displayWord.length < 2) return;

    lastModalTimeRef.current = now;
    setLiveSpeechText(demoLanguage === 'hi' ? "यह शब्द अभी समर्थित नहीं है।" : "This word is not supported yet.");
    setHasSpoken(false);
  }, [demoLanguage]);


  // 4. Web Speech Recognition Lifecycle
  useEffect(() => {
    isMountedRef.current = true;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }

    setSpeechSupported(true);
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 5;
    recognition.lang = demoLanguage === 'hi' ? 'hi-IN' : (navigator.language || 'en-US');

    recognition.onstart = () => {
      if (isMountedRef.current) {
        setIsListeningSpeech(true);
      }
    };

    recognition.onresult = (event) => {
      if (!isMountedRef.current) return;

      const results = event.results;
      const resultIndex = event.resultIndex !== undefined ? event.resultIndex : results.length - 1;
      
      if (resultIndex !== lastResultIndexRef.current) {
        lastMatchesRef.current = [];
        lastResultIndexRef.current = resultIndex;
      }

      const currentResult = results[resultIndex] || results[results.length - 1];
      if (!currentResult) return;

      // Extract all alternatives
      const alternatives = [];
      for (let i = 0; i < currentResult.length; i++) {
        const text = currentResult[i].transcript.trim();
        if (text) alternatives.push(text);
      }
      if (alternatives.length === 0) return;

      const rawSpoken = alternatives[0];
      setLiveSpeechText(rawSpoken);

      // Check for sequential signs in the recognized sentence
      let matchedSigns = [];
      const isHindi = demoLanguage === 'hi';
      for (const alt of alternatives) {
        const seq = matchSpeechToConceptSequence(alt, isHindi);
        if (seq.length > 0) {
          matchedSigns = seq;
          break;
        }
      }

      let divergeIndex = 0;
      const prevMatches = lastMatchesRef.current;
      while (divergeIndex < prevMatches.length && divergeIndex < matchedSigns.length && prevMatches[divergeIndex] === matchedSigns[divergeIndex]) {
        divergeIndex++;
      }
      const newSigns = matchedSigns.slice(divergeIndex);

      if (newSigns.length > 0) {
        lastRecognizedTimeRef.current = Date.now();
        const fullSequenceLabels = formatConceptSequence(matchedSigns, isHindi, ' • ');
        setLiveSpeechText(rawSpoken || fullSequenceLabels);
        setLastSpokenWord(fullSequenceLabels);
        setHasSpoken(true);

        if (avatarRef.current && avatarRef.current.isCurrentlyPlaying && avatarRef.current.isCurrentlyPlaying()) {
          signQueueRef.current.push(...newSigns);
        } else {
          const first = newSigns.shift();
          signQueueRef.current = newSigns;
          handleTriggerWord(first, true);
        }
      }
      lastMatchesRef.current = matchedSigns;

      // If NOT matched and speech is finalized (user paused/finished utterance)
      if (currentResult.isFinal) {
        
        // If the utterance contained any supported signs, don't show the unsupported modal
        // (even if we already processed them in interim results)
        if (matchedSigns.length > 0) return;

        const timeSinceMatched = Date.now() - lastRecognizedTimeRef.current;
        // Avoid popping modal on trailing audio fragments if a sign was just triggered within 1.2s
        if (timeSinceMatched < 1200) return;

        handleUnsupportedWordSpoken(rawSpoken);
      }
    };

    recognition.onerror = (e) => {
      console.warn('[SPEECH] Recognition error:', e.error);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        if (isMountedRef.current) {
          setIsListeningSpeech(false);
        }
      }
    };

    recognition.onend = () => {
      if (!isMountedRef.current) return;
      setIsListeningSpeech(false);

      // Robust auto-restart loop using micActiveRef
      if (micActiveRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = setTimeout(() => {
          if (isMountedRef.current && micActiveRef.current && recognitionRef.current) {
            try {
              recognitionRef.current.start();
              setIsListeningSpeech(true);
            } catch (err) {
              // Browser may report InvalidStateError if already restarting; safe to ignore
            }
          }
        }, 150);
      }
    };

    recognitionRef.current = recognition;

    if (micActive) {
      try {
        recognition.start();
        setIsListeningSpeech(true);
      } catch (err) {
        console.warn('[SPEECH] Start error:', err);
      }
    }

    return () => {
      isMountedRef.current = false;
      clearTimeout(restartTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }
    };
  }, [handleTriggerWord, handleUnsupportedWordSpoken, demoLanguage]);

  // Toggle mic
  const toggleMic = () => {
    const next = !micActive;
    setMicActive(next);
    micActiveRef.current = next;

    if (!next) {
      clearTimeout(restartTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      setIsListeningSpeech(false);
    } else {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
          setIsListeningSpeech(true);
        } catch {}
      }
    }
  };

  // Speed change
  const handleSpeedChange = (speed) => {
    setCurrentSpeed(speed);
    if (avatarRef.current) {
      avatarRef.current.setPlaybackSpeed(speed);
    }
  };

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
            <span className="pipeline-indicator-pill hearing-pill">
              {demoLanguage === 'hi' ? 'पाइपलाइन: श्रवण → बधिर' : 'Pipeline A: Hearing → Deaf'}
            </span>
          </div>
        </div>

        <div className="header-center" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="pipeline-flow-banner">
            <span>{demoLanguage === 'hi' ? 'वाणी / टेक्स्ट' : 'Speech / Text'}</span>
            <span className="arrow-sep">→</span>
            <span className="highlight-tag">{demoLanguage === 'hi' ? '3D ISL अवतार' : '3D ISL Avatar'}</span>
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

      {/* Main Real-Call Inspired Video Grid */}
      <main className="demo-stage-grid">
        {/* Tile 1: Hearing Person (Camera + Speech Recognition) */}
        <div className="demo-video-tile hearing-tile">
          <div className="tile-content">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`demo-video-feed mirror ${!camActive ? 'hidden' : ''}`}
            />

            {!camActive && (
              <div className="camera-off-placeholder">
                <div className="avatar-placeholder-circle">
                  <User size={48} color="#9aa0a6" />
                </div>
                <span>{demoLanguage === 'hi' ? 'श्रवण प्रतिभागी (कैमरा बंद)' : 'Hearing Participant (Camera Off)'}</span>
              </div>
            )}

            {/* Speech Overlay / Subtitles */}
            <div className="video-speech-overlay">
              <Mic size={14} className={isListeningSpeech ? "listening-pulse" : ""} color="#93c5fd" />
              <div className="speech-text-content">
                {hasSpoken && <span className="speech-final-text">"{lastSpokenWord}"</span>}
                {isListeningSpeech && liveSpeechText && (
                  <span className="speech-interim-text">"{liveSpeechText}"</span>
                )}
                {!hasSpoken && !liveSpeechText && (
                  <span className="speech-placeholder">{demoLanguage === 'hi' ? 'अनुवाद के लिए बोलें...' : 'Speak to translate...'}</span>
                )}
              </div>
            </div>

            {/* Bottom Tile Info */}
            <div className="tile-bottom-badge">
              <User size={14} color="#8ab4f8" />
              <span>{demoLanguage === 'hi' ? 'श्रवण प्रतिभागी' : 'Hearing Participant'}</span>
              {!micActive && (
                <span className="tile-mute-badge">
                  <MicOff size={11} color="#ea4335" />
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tile 2: 3D Robot Interpreter Avatar */}
        <div className={`demo-video-tile avatar-tile ${isPlaying ? 'avatar-active' : ''}`}>
          <div className="tile-content avatar-container">
            <IslAvatarViewer
              ref={avatarRef}
              activeSign={selectedWord}
              onAnimationStateChange={handleAnimationStateChange}
              demoLanguage={demoLanguage}
            />

            {/* Floating Live Animation Status */}
            <div className="avatar-live-status-hud">
              <div className="avatar-hud-pill">
                <Bot size={13} color="#1d72fe" />
                <span>{demoLanguage === 'hi' ? 'संकेत कर रहे हैं:' : 'Signing:'}</span>
                <strong className="avatar-active-word">"{getLabelForConcept(selectedWord, demoLanguage === 'hi')}"</strong>
                {isPlaying && <span className="animating-pulse" />}
              </div>

              {/* Speed Pills */}
              <div className="avatar-speed-pills">
                <span style={{ fontSize: 11, color: '#9aa0a6' }}>{demoLanguage === 'hi' ? 'गति:' : 'Speed:'}</span>
                {[1.0, 0.75, 0.5].map((spd) => (
                  <button
                    key={spd}
                    className={`speed-pill ${currentSpeed === spd ? 'active' : ''}`}
                    onClick={() => handleSpeedChange(spd)}
                  >
                    {spd}x
                  </button>
                ))}
              </div>

              {/* Reset Camera View */}
              <button
                className="reset-cam-btn"
                onClick={() => avatarRef.current?.resetCamera()}
                title={demoLanguage === 'hi' ? 'अवतार दृश्य को केंद्रित करें' : 'Center Avatar View'}
              >
                <RotateCcw size={12} />
                <span>{demoLanguage === 'hi' ? 'केंद्र' : 'Center'}</span>
              </button>
            </div>

            {/* Bottom Tile Info */}
            <div className="tile-bottom-badge avatar-badge">
              <Bot size={14} color="#1d72fe" />
              <span>{demoLanguage === 'hi' ? 'ISL 3D रोबोट दुभाषिया' : 'ISL 3D Robot Interpreter'}</span>
            </div>
          </div>
        </div>
      </main>

      {/* Floating Call Controls Bar */}
      <footer className="demo-controls-bar">
        <div className="controls-inner">
          {/* Mic */}
          <button
            className={`control-circle-btn ${!micActive ? 'disabled' : ''}`}
            onClick={toggleMic}
            title={demoLanguage === 'hi' ? (micActive ? 'माइक म्यूट करें' : 'माइक चालू करें') : (micActive ? 'Mute Microphone' : 'Unmute Microphone')}
          >
            {micActive ? <Mic size={20} /> : <MicOff size={20} color="#ea4335" />}
          </button>

          {/* Camera */}
          <button
            className={`control-circle-btn ${!camActive ? 'disabled' : ''}`}
            onClick={() => setCamActive(!camActive)}
            title={demoLanguage === 'hi' ? (camActive ? 'कैमरा बंद करें' : 'कैमरा चालू करें') : (camActive ? 'Turn Off Video' : 'Turn On Video')}
          >
            {camActive ? <Video size={20} /> : <VideoOff size={20} color="#ea4335" />}
          </button>

          {/* Trigger Active Sign / Available Words */}
          <div className="available-words-container" style={{ position: 'relative' }}>
            <button
              className={`control-play-sign-btn ${isPlaying ? 'playing' : ''}`}
              onClick={() => setIsWordListExpanded(!isWordListExpanded)}
              title={demoLanguage === 'hi' ? 'उपलब्ध संकेत देखें' : 'Show Available Signs'}
            >
              <Sparkles size={16} />
              <span>
                {isPlaying 
                  ? (demoLanguage === 'hi' ? `संकेत: "${getLabelForConcept(selectedWord, true)}"...` : `Signing "${getLabelForConcept(selectedWord, false)}"...`) 
                  : (demoLanguage === 'hi' ? 'उपलब्ध शब्द' : 'Available Words')}
              </span>
            </button>
            
            {isWordListExpanded && (
              <div className="available-words-dropdown">
                <div className="dropdown-header">
                  {demoLanguage === 'hi' ? 'संकेत देखने के लिए शब्द चुनें:' : 'Select a word to sign:'}
                </div>
                <div className="dropdown-list">
                  {SUPPORTED_SIGNS.map((sign) => (
                    <button
                      key={sign.id}
                      className="dropdown-item"
                      onClick={() => {
                        handleTriggerWord(sign.id);
                        setIsWordListExpanded(false);
                      }}
                    >
                      {getLabelForConcept(sign.id, demoLanguage === 'hi')}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

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

      {/* Render Upcoming Sign Modal */}
      {upcomingModalData && (
        <UpcomingSignModal
          word={upcomingModalData.word}
          category={upcomingModalData.category}
          description={upcomingModalData.description}
          supportedSigns={SUPPORTED_SIGNS}
          onSelectSupportedSign={handleTriggerWord}
          onClose={() => setUpcomingModalData(null)}
          demoLanguage={demoLanguage}
        />
      )}

    </div>
  );
}
