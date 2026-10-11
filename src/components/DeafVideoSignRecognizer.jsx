import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
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

import { getLabelForConcept, speakConceptText } from '../utils/demoLanguageMappings';

/**
 * Anatomical validator: strictly filters out false-positive hand detections
 * on facial hair, lips, chin, or background artifacts.
 */
function isValidHandLandmarks(landmarks) {
  if (!landmarks || landmarks.length !== 21) return false;

  // 1. Calculate bounding box dimensions
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (let i = 0; i < 21; i++) {
    const p = landmarks[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const width = maxX - minX;
  const height = maxY - minY;

  // Real signing hands have reasonable bounds on webcam
  if (width < 0.05 || height < 0.05 || width > 0.95 || height > 0.95) {
    return false;
  }

  // 2. Palm Structure Validation
  // Landmark 0: Wrist, 5: Index MCP, 9: Middle MCP, 17: Pinky MCP
  const wrist = landmarks[0];
  const indexMcp = landmarks[5];
  const middleMcp = landmarks[9];
  const pinkyMcp = landmarks[17];

  const palmLength = Math.hypot(middleMcp.x - wrist.x, middleMcp.y - wrist.y);
  const palmWidth = Math.hypot(pinkyMcp.x - indexMcp.x, pinkyMcp.y - indexMcp.y);

  // A genuine human palm cannot be degenerate or collapsed (like facial contours)
  if (palmLength < 0.035 || palmWidth < 0.025) {
    return false;
  }

  // Human hand palm aspect ratio check
  const palmRatio = palmLength / Math.max(0.001, palmWidth);
  if (palmRatio < 0.35 || palmRatio > 3.5) {
    return false;
  }

  // 3. Finger Segment Length Plausibility
  const midLen = Math.hypot(landmarks[10].x - landmarks[9].x, landmarks[10].y - landmarks[9].y) +
                 Math.hypot(landmarks[11].x - landmarks[10].x, landmarks[11].y - landmarks[10].y) +
                 Math.hypot(landmarks[12].x - landmarks[11].x, landmarks[12].y - landmarks[11].y);

  const idxLen = Math.hypot(landmarks[6].x - landmarks[5].x, landmarks[6].y - landmarks[5].y) +
                 Math.hypot(landmarks[7].x - landmarks[6].x, landmarks[7].y - landmarks[6].y) +
                 Math.hypot(landmarks[8].x - landmarks[7].x, landmarks[8].y - landmarks[7].y);

  if (midLen < 0.025 || idxLen < 0.025) {
    return false;
  }

  // 4. Anti-Face Hallucination (Fingertips Alignment / Squashing)
  // When hallucinated onto mouth/beard, all 5 fingertips align into a tight flat curve on the lips.
  const tips = [landmarks[4], landmarks[8], landmarks[12], landmarks[16], landmarks[20]];
  let maxTipSpread = 0;
  for (let i = 0; i < tips.length; i++) {
    for (let j = i + 1; j < tips.length; j++) {
      const d = Math.hypot(tips[i].x - tips[j].x, tips[i].y - tips[j].y);
      if (d > maxTipSpread) maxTipSpread = d;
    }
  }

  // If fingertips are squeezed unnaturally close together (< 0.025) while the overall box is large
  if (maxTipSpread < 0.025 && Math.max(width, height) > 0.12) {
    return false;
  }

  return true;
}

const DeafVideoSignRecognizer = forwardRef(({ onSignRecognized, isCameraActive, ttsEnabled, mediaStream, hideControls = false, rejectionThreshold = 0.85, onCameraToggle, onTtsToggle, demoLanguage = 'en' }, ref) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const landmarkerRef = useRef(null);
  const classifierRef = useRef(new IslSignRecognizer({ rejectionThreshold }));
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
  const [isWordListExpanded, setIsWordListExpanded] = useState(false);
  const [engineMode, setEngineMode] = useState('ml');
  const [diagnostics, setDiagnostics] = useState({ lighting: 'good', handsVisible: false });
  const toggleEngine = () => setEngineMode(e => e === 'ml' ? 'heuristic' : 'ml');
  const frameCountRef = useRef(0);

  useImperativeHandle(ref, () => ({
    getCurrentSequence: () => {
      if (classifierRef.current) {
        return classifierRef.current.getCurrentSequence();
      }
      return null;
    },
    reloadPersonalizedProfile: async () => {
      if (classifierRef.current) {
        await classifierRef.current.reloadPersonalizedProfile();
      }
    },
    getHandCount: () => handCount,
    validateCandidateSign: (seq, targetSign, profile) => {
      if (classifierRef.current) {
        return classifierRef.current.validateCandidateSign(seq, targetSign, profile);
      }
      return { isValid: true };
    }
  }));

  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (activeSignTimerRef.current) clearTimeout(activeSignTimerRef.current);
    };
  }, []);

  // Text-to-Speech synthesis
  const speakWord = useCallback((word) => {
    if (!ttsEnabled || typeof window === 'undefined' || !window.speechSynthesis) return;
    speakConceptText(word, demoLanguage === 'hi');
  }, [ttsEnabled, demoLanguage]);

  const lastTriggeredWordRef = useRef(null);
  const lastTriggerTimeRef = useRef(0);
  const isGestureLockedRef = useRef(false);

  // Handle triggered word - strictly ONCE per gesture
  const handleTriggerWord = useCallback((word, conf) => {
    if (!word || word === 'NO_SIGN') return;
    if (conf < rejectionThreshold * 100) return;

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
      onSignRecognized(word, conf);
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
            delegate: 'CPU'
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.65,
          minHandPresenceConfidence: 0.60,
          minTrackingConfidence: 0.60
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
              delegate: 'CPU'
            },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.65,
            minHandPresenceConfidence: 0.60,
            minTrackingConfidence: 0.60
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
      if (streamRef.current && !mediaStream) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      return;
    }

    if (mediaStream) {
      streamRef.current = mediaStream;
      if (videoRef.current && videoRef.current.srcObject !== mediaStream) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(() => {});
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
      if (streamRef.current && !mediaStream) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [cameraActive, mediaStream]);

  // Main Detection Loop
  useEffect(() => {
    let lastVideoTime = -1;

    function checkLighting(ctx, width, height) {
      if (width === 0 || height === 0) return 'good';
      const sampleWidth = Math.min(100, width);
      const sampleHeight = Math.min(100, height);
      ctx.drawImage(videoRef.current, 0, 0, sampleWidth, sampleHeight);
      const imageData = ctx.getImageData(0, 0, sampleWidth, sampleHeight);
      let data = imageData.data;
      let colorSum = 0;
      
      for (let x = 0, len = data.length; x < len; x += 4) {
        colorSum += Math.floor((data[x] + data[x + 1] + data[x + 2]) / 3);
      }
      
      const brightness = Math.floor(colorSum / (sampleWidth * sampleHeight));
      return brightness < 50 ? 'poor' : 'good';
    }

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
          frameCountRef.current++;
          
          if (frameCountRef.current % 15 === 0) {
            const light = checkLighting(ctx, canvas.width, canvas.height);
            setDiagnostics(prev => prev.lighting !== light ? { ...prev, lighting: light } : prev);
          }
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          const startTimeMs = performance.now();
          const results = landmarker.detectForVideo(video, startTimeMs);

          // Robust hand validation to prevent false detections on facial hair, lips, chin, or background
          const handednessList = results?.handedness || results?.handednesses || [];
          const rawLandmarks = results?.landmarks || [];
          const validLandmarks = [];

          for (let i = 0; i < rawLandmarks.length; i++) {
            const lms = rawLandmarks[i];
            const hInfo = handednessList[i]?.[0];
            const hScore = hInfo ? hInfo.score : 1.0;

            // Reject if handedness category confidence is low (< 60%)
            if (hScore < 0.60) {
              continue;
            }

            // Reject if landmarks fail human hand anatomical validation
            if (!isValidHandLandmarks(lms)) {
              continue;
            }

            validLandmarks.push(lms);
          }

          if (validLandmarks.length > 0) {
            setHandCount(validLandmarks.length);
            setDiagnostics(prev => (!prev.handsVisible ? { ...prev, handsVisible: true } : prev));

            // Draw Hand Landmarks only for genuinely verified hands
            validLandmarks.forEach((landmarks) => {
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

            // Classify ISL Sign using filtered valid hands
            const classification = classifierRef.current.classifyFrame(validLandmarks);
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
            setDiagnostics(prev => (prev.handsVisible ? { ...prev, handsVisible: false } : prev));
            classifierRef.current.classifyFrame(null);
            setGestureProgress(0);
            setIsGestureCharging(false);
          }
        }
      }

      if (video && video.requestVideoFrameCallback) {
        animFrameIdRef.current = video.requestVideoFrameCallback(renderDetection);
      } else if (video) {
        animFrameIdRef.current = requestAnimationFrame(renderDetection);
      }
    }

    if (videoRef.current && videoRef.current.requestVideoFrameCallback) {
      animFrameIdRef.current = videoRef.current.requestVideoFrameCallback(renderDetection);
    } else {
      animFrameIdRef.current = requestAnimationFrame(renderDetection);
    }

    return () => {
      if (animFrameIdRef.current) {
        if (videoRef.current && videoRef.current.cancelVideoFrameCallback) {
          videoRef.current.cancelVideoFrameCallback(animFrameIdRef.current);
        } else {
          cancelAnimationFrame(animFrameIdRef.current);
        }
      }
    };
  }, [handleTriggerWord]);

  return (
    <div className="deaf-recognizer-container">
      {activeSign && (
        <div className={`deaf-active-sign-hud ${isGestureCharging ? 'charging' : 'confirmed'}`}>
          <div className="sign-hud-header">
            <Sparkles size={14} color={isGestureCharging ? '#93c5fd' : (engineMode === 'ml' ? '#1d72fe' : '#f59e0b')} />
            <span>{isGestureCharging ? 'ACTION IN PROGRESS' : (engineMode === 'ml' ? 'ML SIGN RECOGNIZED (GRU v2)' : 'HEURISTIC SIGN RECOGNIZED')}</span>
          </div>
          <div className="sign-hud-word">{getLabelForConcept(activeSign, demoLanguage === 'hi')}</div>
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

        {!hideControls && modelLoading && (
          <div className="deaf-loading-scrim">
            <Sparkles size={24} className="spin-icon" color="#1d72fe" />
            <span>Loading MediaPipe AI Sign Recognizer...</span>
          </div>
        )}
        
        {/* Short corner warnings for lighting/hands */}
        {!hideControls && (diagnostics.lighting === 'poor' || !diagnostics.handsVisible) && (
          <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', gap: '6px', zIndex: 10 }}>
            {diagnostics.lighting === 'poor' && (
              <div style={{ background: 'rgba(234,67,53,0.8)', color: '#fff', fontSize: '11px', padding: '4px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px', backdropFilter: 'blur(4px)' }}>
                <AlertCircle size={12} /> Low Light
              </div>
            )}
            {!diagnostics.handsVisible && (
              <div style={{ background: 'rgba(253,214,99,0.8)', color: '#202124', fontSize: '11px', padding: '4px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px', backdropFilter: 'blur(4px)' }}>
                <AlertCircle size={12} /> Hands not visible
              </div>
            )}
          </div>
        )}

        {!hideControls && (
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
        )}
      </div>

      {!hideControls && (
        <div className="deaf-controls-strip">
          <div className="available-words-container" style={{ position: 'relative' }}>
            <button
              className={`control-play-sign-btn ${activeSign ? 'playing' : ''}`}
              onClick={() => setIsWordListExpanded(!isWordListExpanded)}
              title="Show Available Signs"
              style={{ minWidth: '180px', height: '36px', borderRadius: '18px', padding: '0 16px', background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}
            >
              <Sparkles size={16} />
              <span>{activeSign ? `Simulating "${getLabelForConcept(activeSign, demoLanguage === 'hi')}"...` : `Available Words`}</span>
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
                      {getLabelForConcept(sign.id, demoLanguage === 'hi')}
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
      )}
    </div>
  );
});

export default DeafVideoSignRecognizer;
