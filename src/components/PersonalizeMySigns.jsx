import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Video, CheckCircle2, AlertCircle, Trash2, Sparkles, ShieldCheck, ShieldAlert } from 'lucide-react';
import DeafVideoSignRecognizer from './DeafVideoSignRecognizer';
import { SUPPORTED_SIGNS } from './IslAvatarViewer';
import { savePersonalizedSign, clearAllPersonalizedSigns, getAllPersonalizedSigns } from '../utils/personalizeStorage';
import { validateCandidateSign } from '../utils/islSignClassifier';
import './demo/DemoMode.css';

export default function PersonalizeMySigns({ onBack }) {
  const [activeSign, setActiveSign] = useState(SUPPORTED_SIGNS[0].id);
  const [profile, setProfile] = useState({});
  const [isRecording, setIsRecording] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [recordingError, setRecordingError] = useState('');
  const [recordingSuccess, setRecordingSuccess] = useState('');
  const recognizerRef = useRef(null);
  const timerIdsRef = useRef({ interval: null, timeout: null, countdown: null });
  
  // Test Mode
  const [testMode, setTestMode] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    loadProfile();
    return () => {
      // Clean up any pending timers on unmount
      if (timerIdsRef.current.interval) clearInterval(timerIdsRef.current.interval);
      if (timerIdsRef.current.timeout) clearTimeout(timerIdsRef.current.timeout);
      if (timerIdsRef.current.countdown) clearInterval(timerIdsRef.current.countdown);
    };
  }, []);

  const loadProfile = async () => {
    const data = await getAllPersonalizedSigns();
    const map = {};
    for (const item of data) {
      map[item.signId] = item.templates || [];
    }
    setProfile(map);
  };

  const handleClearProfile = async () => {
    if (window.confirm("Are you sure you want to delete your personalized sign profile? This cannot be undone.")) {
      await clearAllPersonalizedSigns();
      if (recognizerRef.current) {
        await recognizerRef.current.reloadPersonalizedProfile();
      }
      setProfile({});
      setRecordingSuccess('Personalized profile cleared.');
      setTimeout(() => setRecordingSuccess(''), 2500);
    }
  };

  // Evaluate gesture movement across the 20-frame standardized sequence
  const evaluateSequenceMovement = (seq) => {
    if (!seq || seq.length === 0) return { maxDev: 0, pathDist: 0, score: 0 };
    let maxDev = 0;
    let pathDist = 0;
    const first = seq[0];

    for (let t = 1; t < seq.length; t++) {
      const cur = seq[t];
      const prev = seq[t - 1];
      let devSq = 0;
      let stepSq = 0;
      for (let i = 0; i < cur.length; i++) {
        const dDev = cur[i] - first[i];
        const dStep = cur[i] - prev[i];
        devSq += dDev * dDev;
        stepSq += dStep * dStep;
      }
      const curDev = Math.sqrt(devSq);
      if (curDev > maxDev) maxDev = curDev;
      pathDist += Math.sqrt(stepSq);
    }

    // Gesture motion score combines peak excursion from initial posture and path traveled
    const score = maxDev * 0.7 + pathDist * 0.3;
    return { maxDev, pathDist, score };
  };

  const startRecording = () => {
    setRecordingError('');
    setRecordingSuccess('');
    setCountdown(3);

    timerIdsRef.current.countdown = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timerIdsRef.current.countdown);
          recordSequence();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const recordSequence = () => {
    setIsRecording(true);
    setRecordingProgress(0);
    setRecordingError('');

    const candidates = [];
    const startTime = Date.now();
    const RECORD_DURATION_MS = 2400; // 2.4 seconds

    // Continuously sample sequence buffer every 75ms during recording window
    timerIdsRef.current.interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(100, Math.round((elapsed / RECORD_DURATION_MS) * 100));
      setRecordingProgress(progress);

      if (recognizerRef.current) {
        const seq = recognizerRef.current.getCurrentSequence();
        if (seq && seq.length === 20) {
          // Clone the typed arrays to preserve this snapshot from future frame mutations
          const clonedSeq = seq.map(row => new Float32Array(row));
          const movement = evaluateSequenceMovement(clonedSeq);
          candidates.push({ seq: clonedSeq, movement });
        }
      }
    }, 75);

    timerIdsRef.current.timeout = setTimeout(async () => {
      clearInterval(timerIdsRef.current.interval);
      setIsRecording(false);
      setRecordingProgress(0);

      if (candidates.length === 0) {
        setRecordingError('No hands detected. Please make sure both hands are clearly in camera view while signing.');
        return;
      }

      // Pick the candidate snapshot that achieved peak gesture movement
      candidates.sort((a, b) => b.movement.score - a.movement.score);
      const best = candidates[0];

      // Robust check: reject only if hands were virtually motionless
      if (best.movement.maxDev < 0.25 && best.movement.pathDist < 0.5) {
        setRecordingError('Not enough movement detected. Please perform the sign clearly with your hands.');
        return;
      }

      // AI Sign Guard: Validate that the gesture genuinely corresponds to the target sign
      // and reject if user mistakenly or intentionally performed a different sign
      const validation = validateCandidateSign(best.seq, activeSign, profile);
      if (!validation.isValid) {
        setRecordingError(validation.message);
        return;
      }

      // Save template to profile
      const existing = profile[activeSign] || [];
      if (existing.length >= 3) {
        setRecordingError('Maximum 3 examples reached for this sign.');
        return;
      }

      const updated = [...existing, best.seq];
      await savePersonalizedSign(activeSign, updated);
      
      if (recognizerRef.current) {
        await recognizerRef.current.reloadPersonalizedProfile();
      }

      setProfile(prev => ({ ...prev, [activeSign]: updated }));
      setRecordingSuccess(`Example ${updated.length} saved successfully!`);
      setTimeout(() => setRecordingSuccess(''), 3000);
    }, RECORD_DURATION_MS);
  };

  const handleDeleteExample = async (signId, index) => {
    const existing = profile[signId] || [];
    const updated = existing.filter((_, i) => i !== index);
    await savePersonalizedSign(signId, updated);
    if (recognizerRef.current) {
      await recognizerRef.current.reloadPersonalizedProfile();
    }
    setProfile(prev => ({ ...prev, [signId]: updated }));
    setRecordingSuccess('Example removed.');
    setTimeout(() => setRecordingSuccess(''), 2000);
  };

  const handleTestSign = (word, conf) => {
    if (testMode && word !== 'NO_SIGN') {
      setTestResult({ word, conf });
      setTimeout(() => setTestResult(null), 2000);
    }
  };

  const currentCount = (profile[activeSign] || []).length;

  return (
    <div className="demo-call-screen" style={{ overflow: 'hidden', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Compact Top Header */}
      <header className="demo-call-header" style={{ position: 'sticky', top: 0, zIndex: 100, height: '48px', padding: '0 16px', flexShrink: 0 }}>
        <div className="header-left">
          <button onClick={onBack} className="demo-call-back-btn" style={{ padding: '5px 10px', fontSize: '13px' }}>
            <ArrowLeft size={15} />
            <span>Back</span>
          </button>
          <div className="header-brand-group" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="brand-text" style={{ fontSize: '15px' }}>Personalize My Signs</span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                background: 'rgba(16, 185, 129, 0.12)',
                color: '#10b981',
                padding: '2px 8px',
                borderRadius: '12px',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                fontWeight: 600
              }}
              title="AI verifies each recorded gesture against base neural models to prevent mistaken or false sign entries"
            >
              <ShieldCheck size={12} /> AI Sign Guard Active
            </span>
          </div>
        </div>
        <div className="header-right">
          <button
            onClick={handleClearProfile}
            style={{
              background: 'transparent',
              border: '1px solid rgba(234,67,53,0.5)',
              color: '#ea4335',
              padding: '4px 10px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 500
            }}
          >
            <Trash2 size={13} /> Clear Profile
          </button>
        </div>
      </header>

      {/* Main Workspace: Full-width responsive layout */}
      <main
        style={{
          width: '100%',
          maxWidth: '1600px',
          margin: '0 auto',
          padding: '10px 14px',
          display: 'flex',
          gap: '12px',
          height: 'calc(100vh - 48px)',
          boxSizing: 'border-box',
          overflow: 'hidden'
        }}
      >
        {/* Left Sidebar: Compact Vocabulary List */}
        <div
          style={{
            width: '190px',
            minWidth: '190px',
            maxWidth: '190px',
            background: '#18191c',
            borderRadius: '10px',
            padding: '8px',
            border: '1px solid #2d3035',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            boxSizing: 'border-box'
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#9aa0a6',
              padding: '4px 6px 8px 6px',
              borderBottom: '1px solid #2d3035',
              marginBottom: '6px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <span>Vocabulary</span>
            <span style={{ fontSize: '10px', background: '#292a2d', padding: '1px 5px', borderRadius: '4px', color: '#8ab4f8' }}>
              {SUPPORTED_SIGNS.length}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', overflowY: 'auto', flex: 1, paddingRight: '2px' }}>
            {SUPPORTED_SIGNS.map((sign) => {
              const count = (profile[sign.id] || []).length;
              const isActive = activeSign === sign.id;
              return (
                <button
                  key={sign.id}
                  onClick={() => {
                    setActiveSign(sign.id);
                    setRecordingError('');
                    setRecordingSuccess('');
                  }}
                  style={{
                    padding: '7px 9px',
                    textAlign: 'left',
                    background: isActive ? '#1f2b45' : 'transparent',
                    border: `1px solid ${isActive ? '#1d72fe' : 'transparent'}`,
                    borderRadius: '6px',
                    color: isActive ? '#8ab4f8' : '#bdc1c6',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '12.5px',
                    fontWeight: isActive ? 600 : 500,
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sign.label}</span>
                  <span
                    style={{
                      fontSize: '11px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                      color: count >= 2 ? '#81c995' : count > 0 ? '#fdd663' : '#5f6368',
                      fontWeight: 600
                    }}
                  >
                    {count}/3 {count >= 2 && <CheckCircle2 size={12} />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Section: Large Dominant Camera Preview & Ultra-Compact Controls */}
        <div style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          
          {/* Top Panel: Dominant Full-Flex Camera Feed */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              background: '#0b0d11',
              borderRadius: '10px',
              overflow: 'hidden',
              border: '1px solid #3c4043',
              position: 'relative',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
            }}
          >
            <DeafVideoSignRecognizer 
              ref={recognizerRef}
              isCameraActive={true}
              hideControls={true}
              onSignRecognized={handleTestSign}
            />

            {/* Overlays: Large Countdown */}
            {countdown > 0 && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(0,0,0,0.65)',
                  backdropFilter: 'blur(3px)',
                  fontSize: '84px',
                  color: '#fff',
                  fontWeight: 800,
                  zIndex: 20
                }}
              >
                {countdown}
              </div>
            )}
            
            {/* Overlays: Top-Right Recording Badge */}
            {isRecording && (
              <div
                style={{
                  position: 'absolute',
                  top: 14,
                  right: 14,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(234,67,53,0.92)',
                  color: '#fff',
                  padding: '6px 14px',
                  borderRadius: '16px',
                  fontWeight: 700,
                  fontSize: '13px',
                  zIndex: 15,
                  boxShadow: '0 4px 16px rgba(234,67,53,0.45)'
                }}
              >
                <span className="live-dot" /> Recording {activeSign}...
              </div>
            )}

            {/* Overlays: Live Gesture Recording Progress Bar */}
            {isRecording && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 16,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '320px',
                  background: 'rgba(18,21,26,0.9)',
                  backdropFilter: 'blur(8px)',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.18)',
                  zIndex: 15,
                  textAlign: 'center',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.5)'
                }}
              >
                <div style={{ fontSize: '12px', color: '#e8eaed', marginBottom: '5px', fontWeight: 600 }}>
                  Perform gesture now: <span style={{ color: '#8ab4f8' }}>{activeSign}</span>
                </div>
                <div style={{ height: '5px', width: '100%', background: '#3c4043', borderRadius: '3px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${recordingProgress}%`,
                      background: 'linear-gradient(90deg, #1d72fe, #60a5fa)',
                      transition: 'width 80ms linear'
                    }}
                  />
                </div>
              </div>
            )}

            {/* Overlays: Testing Mode Result Pill */}
            {testMode && testResult && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 20,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(16,185,129,0.95)',
                  color: '#042f2e',
                  padding: '8px 20px',
                  borderRadius: '8px',
                  fontWeight: 800,
                  fontSize: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  zIndex: 15,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
                }}
              >
                <CheckCircle2 size={18} /> {testResult.word} ({testResult.conf}%)
              </div>
            )}
          </div>

          {/* Bottom Panel: Ultra-Compact Horizontal Controls */}
          <div
            style={{
              flexShrink: 0,
              background: '#18191c',
              borderRadius: '10px',
              padding: '10px 14px',
              border: '1px solid #2d3035',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}
          >
            {/* Top Bar: Sign Info & Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', color: '#9aa0a6' }}>Sign:</span>
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#8ab4f8' }}>{activeSign}</span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: currentCount >= 2 ? '#81c995' : currentCount > 0 ? '#fdd663' : '#9aa0a6',
                    background: '#202124',
                    padding: '2px 8px',
                    borderRadius: '8px',
                    border: '1px solid #3c4043'
                  }}
                >
                  {currentCount}/3 examples
                </span>
                <span style={{ fontSize: '11.5px', color: '#70757a', marginLeft: '4px' }}>
                  (Record 2-3 examples to personalize accuracy)
                </span>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={() => setTestMode(!testMode)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '6px',
                    border: `1px solid ${testMode ? '#8ab4f8' : '#3c4043'}`,
                    background: testMode ? '#8ab4f8' : 'transparent',
                    color: testMode ? '#18191c' : '#8ab4f8',
                    fontWeight: 600,
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Sparkles size={13} />
                  {testMode ? 'Testing Mode Active' : 'Test Profile'}
                </button>
                
                <button
                  onClick={startRecording}
                  disabled={isRecording || countdown > 0 || currentCount >= 3 || testMode}
                  style={{
                    padding: '5px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    background: (isRecording || countdown > 0 || currentCount >= 3 || testMode) ? '#292a2d' : '#1d72fe',
                    color: (isRecording || countdown > 0 || currentCount >= 3 || testMode) ? '#5f6368' : '#fff',
                    fontWeight: 600,
                    fontSize: '12px',
                    cursor: (isRecording || countdown > 0 || currentCount >= 3 || testMode) ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Video size={13} /> 
                  {currentCount >= 3 ? 'Max Reached' : isRecording ? 'Recording...' : 'Record Example'}
                </button>
              </div>
            </div>

            {/* Error & Success Feedback Banners */}
            {recordingError && (
              <div
                style={{
                  padding: '6px 12px',
                  background: 'rgba(234,67,53,0.12)',
                  border: '1px solid #ea4335',
                  color: '#ea4335',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '12px',
                  lineHeight: '1.4'
                }}
              >
                {recordingError.includes('Mismatched') || recordingError.includes('Duplicate') ? (
                  <ShieldAlert size={16} style={{ flexShrink: 0 }} />
                ) : (
                  <AlertCircle size={15} style={{ flexShrink: 0 }} />
                )}
                <span>{recordingError}</span>
              </div>
            )}

            {recordingSuccess && (
              <div
                style={{
                  padding: '5px 10px',
                  background: 'rgba(129,201,149,0.12)',
                  border: '1px solid #81c995',
                  color: '#81c995',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px'
                }}
              >
                <CheckCircle2 size={14} /> {recordingSuccess}
              </div>
            )}

            {/* Bottom Row: 3 Compact Example Slot Cards */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {Array.from({ length: 3 }).map((_, i) => {
                const hasExample = i < currentCount;
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: '32px',
                      background: hasExample ? 'rgba(129,201,149,0.08)' : '#202124',
                      border: `1px solid ${hasExample ? '#81c995' : '#2d3035'}`,
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0 10px',
                      fontSize: '12px'
                    }}
                  >
                    <span style={{ color: hasExample ? '#81c995' : '#5f6368', fontWeight: 600 }}>
                      {hasExample ? `Example ${i + 1}` : `Slot ${i + 1} (Empty)`}
                    </span>
                    {hasExample && (
                      <button
                        onClick={() => handleDeleteExample(activeSign, i)}
                        title="Delete Example"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#ea4335',
                          cursor: 'pointer',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ fontSize: '10.5px', color: '#70757a', marginTop: '1px', display: 'flex', justifyContent: 'space-between' }}>
              <span>Stored locally on device via IndexedDB. Only mathematical DTW gesture trajectories are saved.</span>
              <span style={{ color: '#81c995' }}>AI Guard ensures only authentic gestures are accepted.</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
