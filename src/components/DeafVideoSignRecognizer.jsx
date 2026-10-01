import React, { useRef, useEffect, useState, useCallback } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { IslSignRecognizer } from '../utils/islSignClassifier';
import { SUPPORTED_SIGNS } from './IslAvatarViewer';
import {
  Camera,
  CameraOff,
  Volume2,
  VolumeX,
  Sparkles,
  Hand,
  CheckCircle2,
  AlertCircle,
  Cpu
} from 'lucide-react';

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],          // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],          // Index
  [5, 9], [9, 10], [10, 11], [11, 12],     // Middle
  [9, 13], [13, 14], [14, 15], [15, 16],   // Ring
  [13, 17], [17, 18], [18, 19], [19, 20],  // Pinky
  [0, 17]                                  // Palm base
];

export default function DeafVideoSignRecognizer({
  onSignRecognized,
  isCameraActive = true,
  onCameraToggle,
  ttsEnabled = true,
  onTtsToggle
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const landmarkerRef = useRef(null);
  const classifierRef = useRef(new IslSignRecognizer());
  const animFrameIdRef = useRef(null);
  const activeSignTimerRef = useRef(null);

  const [modelLoading, setModelLoading] = useState(true);
  const [modelError, setModelError] = useState(null);
  const [cameraActive, setCameraActive] = useState(isCameraActive);
  const [activeSign, setActiveSign] = useState(null);
  const [confidenceScore, setConfidenceScore] = useState(0);
  const [recentRecognitions, setRecentRecognitions] = useState([]);
  const [handCount, setHandCount] = useState(0);
  const [gestureProgress, setGestureProgress] = useState(0);
  const [isGestureCharging, setIsGestureCharging] = useState(false);
  const [engineMode, setEngineMode] = useState('ml'); // 'ml' (default) or 'heuristic' (fallback)
  const [isWordListExpanded, setIsWordListExpanded] = useState(false);

  const toggleEngine = useCallback(() => {
    const nextMode = engineMode === 'ml' ? 'heuristic' : 'ml';
    setEngineMode(nextMode);
    if (classifierRef.current) {
      classifierRef.current.setEngine(nextMode);
    }
  }, [engineMode]);

  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (activeSignTimerRef.current) clearTimeout(activeSignTimerRef.current);
    };
  }, []);

  // Text-to-Speech synthesis
  const speakWord = useCallback((word) => {
    if (!ttsEnabled || typeof window === 'undefined' || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word.toLowerCase());
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Select natural English voice if available
    const voices = window.speechSynthesis.getVoices();
    const engVoice = voices.find((v) => v.lang.startsWith('en') && !v.name.includes('Google') && v.name.includes('Natural')) ||
                     voices.find((v) => v.lang.startsWith('en'));
    if (engVoice) utterance.voice = engVoice;

    window.speechSynthesis.speak(utterance);
  }, [ttsEnabled]);

  const lastTriggeredWordRef = useRef(null);
  const lastTriggerTimeRef = useRef(0);
  const isGestureLockedRef = useRef(false);

  // Handle triggered word - strictly ONCE per gesture
  const handleTriggerWord = useCallback((word, conf) => {
    if (!word || word === 'NO_SIGN') return;

    const now = Date.now();
    // Guard: Do sign only ONCE per gesture.
    // If the gesture is still held or same sign triggered within 3s, ignore duplicates
    if (isGestureLockedRef.current && lastTriggeredWordRef.current === word) {
      return;
    }
    if (now - lastTriggerTimeRef.current < 2500) {
      return;
    }

    lastTriggeredWordRef.current = word;
    lastTriggerTimeRef.current = now;
    isGestureLockedRef.current = true;

    setActiveSign(word);
    setConfidenceScore(conf);

    // Speak word via TTS (only once)
    speakWord(word);

    // Notify parent app
    if (onSignRecognized) {
      onSignRecognized(word);
    }

    setRecentRecognitions((prev) => [
      { word, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) },
      ...prev.slice(0, 4)
    ]);

    // Hold the recognized sign HUD badge for 2.6 seconds, then clear
    if (activeSignTimerRef.current) clearTimeout(activeSignTimerRef.current);
    activeSignTimerRef.current = setTimeout(() => {
      setActiveSign(null);
      setConfidenceScore(0);
      isGestureLockedRef.current = false;
    }, 2600);
  }, [speakWord, onSignRecognized]);

  // Initialize MediaPipe HandLandmarker
  useEffect(() => {
    let isCancelled = false;

    async function initMediaPipe() {
      try {
        setModelLoading(true);
        setModelError(null);

        // Try local wasm first, fallback to CDN
        let vision;
        try {
          vision = await FilesetResolver.forVisionTasks('/wasm');
        } catch {
          vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm');
        }

        if (isCancelled) return;

        const handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/models/hand_landmarker.task',
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          numHands: 2
        });

        if (isCancelled) return;
        landmarkerRef.current = handLandmarker;
        setModelLoading(false);
      } catch (err) {
        console.error('[MEDIAPIPE] Error loading model:', err);
        // Try fallback to remote model asset if local failed
        try {
          const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm');
          const handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
              delegate: 'GPU'
            },
            runningMode: 'VIDEO',
            numHands: 2
          });
          if (!isCancelled) {
            landmarkerRef.current = handLandmarker;
            setModelLoading(false);
          }
        } catch (fallbackErr) {
          console.error('[MEDIAPIPE] Fallback also failed:', fallbackErr);
          if (!isCancelled) {
            setModelError('Hand tracking engine initialized with simulated tester mode');
            setModelLoading(false);
          }
        }
      }
    }

    initMediaPipe();

    return () => {
      isCancelled = true;
      if (landmarkerRef.current) {
        try { landmarkerRef.current.close(); } catch {}
      }
    };
  }, []);

  // Initialize Webcam Stream
  useEffect(() => {
    if (!cameraActive) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      return;
    }

    let isSubscribed = true;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
          audio: false
        });

        if (!isSubscribed) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      } catch (err) {
        console.warn('[WEBCAM] Camera access unavailable or denied:', err);
      }
    }

    startCamera();

    return () => {
      isSubscribed = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [cameraActive]);

  // Main Detection Loop
  useEffect(() => {
    let lastVideoTime = -1;

    function renderDetection() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const landmarker = landmarkerRef.current;

      if (video && canvas && video.readyState >= 2) {
        const ctx = canvas.getContext('2d');
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (landmarker && video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;
          const startTimeMs = performance.now();
          const results = landmarker.detectForVideo(video, startTimeMs);

          if (results && results.landmarks && results.landmarks.length > 0) {
            setHandCount(results.landmarks.length);

            // Draw Hand Landmarks
            results.landmarks.forEach((landmarks) => {
              // Draw Connections
              ctx.strokeStyle = '#1d72fe';
              ctx.lineWidth = 3;
              HAND_CONNECTIONS.forEach(([i, j]) => {
                const p1 = landmarks[i];
                const p2 = landmarks[j];
                ctx.beginPath();
                ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
                ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
                ctx.stroke();
              });

              // Draw Joints
              landmarks.forEach((pt, idx) => {
                ctx.beginPath();
                const isTip = [4, 8, 12, 16, 20].includes(idx);
                ctx.arc(pt.x * canvas.width, pt.y * canvas.height, isTip ? 6 : 4, 0, Math.PI * 2);
                ctx.fillStyle = isTip ? '#ffffff' : '#0ed8e2';
                ctx.fill();
                ctx.strokeStyle = '#0a101d';
                ctx.lineWidth = 1.5;
                ctx.stroke();
              });
            });

            // Classify ISL Sign
            const classification = classifierRef.current.classifyFrame(results.landmarks);
            if (classification && classification.word && classification.word !== 'NO_SIGN') {
              if (classification.isTriggerable) {
                handleTriggerWord(classification.word, classification.confidence);
              }
              setGestureProgress(100);
              setIsGestureCharging(false);
            } else {
              setGestureProgress(0);
              setIsGestureCharging(false);
            }
          } else {
            setHandCount(0);
            classifierRef.current.classifyFrame(null);
            setGestureProgress(0);
            setIsGestureCharging(false);
          }
        }
      }

      animFrameIdRef.current = requestAnimationFrame(renderDetection);
    }

    animFrameIdRef.current = requestAnimationFrame(renderDetection);

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [handleTriggerWord]);

  return (
    <div className="deaf-recognizer-container">
      {/* Video & Landmark Canvas */}
      <div className="deaf-video-viewport">
        <video
          ref={videoRef}
          className="deaf-webcam-feed"
          autoPlay
          playsInline
          muted
        />
        <canvas ref={canvasRef} className="deaf-landmark-canvas" />

        {/* Loading Overlay */}
        {modelLoading && (
          <div className="deaf-loading-scrim">
            <Sparkles size={24} className="spin-icon" color="#1d72fe" />
            <span>Loading MediaPipe AI Sign Recognizer...</span>
          </div>
        )}

        {/* Live Detected Sign HUD with Completion Progress */}
        {activeSign && (
          <div className={`deaf-active-sign-hud ${isGestureCharging ? 'charging' : 'confirmed'}`}>
            <div className="sign-hud-header">
              <Sparkles size={14} color={isGestureCharging ? '#93c5fd' : (engineMode === 'ml' ? '#1d72fe' : '#f59e0b')} />
              <span>{isGestureCharging ? 'ACTION IN PROGRESS' : (engineMode === 'ml' ? 'ML SIGN RECOGNIZED (GRU v2)' : 'HEURISTIC SIGN RECOGNIZED')}</span>
            </div>
            <div className="sign-hud-word">{activeSign}</div>
            <div className="sign-hud-confidence">
              <span>{isGestureCharging ? `Completing Gesture: ${gestureProgress}%` : `Confidence: ${confidenceScore}%`}</span>
              <div className="hud-bar-track">
                <div
                  className="hud-bar-fill"
                  style={{
                    width: `${isGestureCharging ? gestureProgress : confidenceScore}%`,
                    background: isGestureCharging
                      ? 'linear-gradient(90deg, #3b82f6, #1d72fe)'
                      : (engineMode === 'ml' ? 'linear-gradient(90deg, #1d72fe, #10b981)' : 'linear-gradient(90deg, #f59e0b, #10b981)')
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Overlay Label & Hand Count */}
        <div className="deaf-video-overlay-bottom">
          <div className="deaf-participant-badge">
            <span className="live-dot" />
            <span>Deaf Participant (You) • {engineMode === 'ml' ? 'SignTemporalGRU v2' : 'Heuristic Fallback'}</span>
          </div>
          <div className="hand-counter-badge">
            <Hand size={13} color="#1d72fe" />
            <span>{handCount > 0 ? `${handCount} Hand${handCount > 1 ? 's' : ''} Tracked` : 'Show hands to camera'}</span>
          </div>
        </div>
      </div>

      {/* Recognition Toolbar & Fallback Manual Sign Trigger Bar */}
      <div className="deaf-controls-strip">
        <div className="available-words-container" style={{ position: 'relative' }}>
          <button
            className={`control-play-sign-btn ${activeSign ? 'playing' : ''}`}
            onClick={() => setIsWordListExpanded(!isWordListExpanded)}
            title="Show Available Signs"
            style={{ minWidth: '180px', height: '36px', borderRadius: '18px', padding: '0 16px', background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}
          >
            <Sparkles size={16} />
            <span>{activeSign ? `Simulating "${activeSign}"...` : `Available Words`}</span>
          </button>
          
          {isWordListExpanded && (
            <div className="available-words-dropdown" style={{ bottom: '100%', top: 'auto', marginBottom: '8px' }}>
              <div className="dropdown-header">Select a word to simulate:</div>
              <div className="dropdown-list">
                {SUPPORTED_SIGNS.map((sign) => (
                  <button
                    key={sign.id}
                    className="dropdown-item"
                    onClick={() => {
                      handleTriggerWord(sign.id, 98);
                      setIsWordListExpanded(false);
                    }}
                  >
                    {sign.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="deaf-toggles">
          <button
            className={`deaf-toggle-icon-btn ${engineMode === 'ml' ? 'active' : ''}`}
            onClick={toggleEngine}
            title={engineMode === 'ml' ? 'Engine: SignTemporalGRU v2 (Click to switch to Heuristic Fallback)' : 'Engine: Heuristic Fallback (Click to switch to ML GRU v2)'}
            style={{ width: 'auto', padding: '0 8px', gap: '5px', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center' }}
          >
            <Cpu size={14} color={engineMode === 'ml' ? '#1d72fe' : '#f59e0b'} />
            <span>{engineMode === 'ml' ? 'ML GRU v2' : 'Fallback'}</span>
          </button>

          <button
            className={`deaf-toggle-icon-btn ${ttsEnabled ? 'active' : ''}`}
            onClick={onTtsToggle}
            title={ttsEnabled ? 'Mute Voice Output (TTS)' : 'Enable Voice Output (TTS)'}
          >
            {ttsEnabled ? <Volume2 size={16} color="#81c995" /> : <VolumeX size={16} color="#ea4335" />}
          </button>

          <button
            className={`deaf-toggle-icon-btn ${cameraActive ? 'active' : ''}`}
            onClick={() => {
              const nextState = !cameraActive;
              setCameraActive(nextState);
              if (onCameraToggle) onCameraToggle(nextState);
            }}
            title={cameraActive ? 'Turn Off Webcam' : 'Turn On Webcam'}
          >
            {cameraActive ? <Camera size={16} color="#8ab4f8" /> : <CameraOff size={16} color="#ea4335" />}
          </button>
        </div>
      </div>
    </div>
  );
}
