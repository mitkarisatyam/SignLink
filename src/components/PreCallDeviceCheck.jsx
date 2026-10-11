import React, { useState, useEffect, useRef } from 'react';
import { Camera, Mic, CheckCircle, XCircle, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';

export default function PreCallDeviceCheck({ onComplete, onCancel }) {
  const [stream, setStream] = useState(null);
  const [camStatus, setCamStatus] = useState('checking'); // pending, checking, ready, error
  const [micStatus, setMicStatus] = useState('checking');
  const [micLevel, setMicLevel] = useState(0);
  const [videoInfo, setVideoInfo] = useState('');
  
  const videoRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyzerRef = useRef(null);
  const reqFrameRef = useRef(null);

  useEffect(() => {
    // Automatically initialize camera and microphone check on mount
    requestPermissions();

    return () => {
      if (reqFrameRef.current) cancelAnimationFrame(reqFrameRef.current);
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  const requestPermissions = async () => {
    setCamStatus('checking');
    setMicStatus('checking');
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      setStream(mediaStream);
      
      const videoTrack = mediaStream.getVideoTracks()[0];
      if (videoTrack) {
        setCamStatus('ready');
        const settings = videoTrack.getSettings();
        setVideoInfo(`${settings.width || 1280}x${settings.height || 720} @ ${Math.round(settings.frameRate || 30)}fps`);
      } else {
        setCamStatus('error');
      }

      const audioTrack = mediaStream.getAudioTracks()[0];
      if (audioTrack) {
        setMicStatus('ready');
        // Setup mic volume meter
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(mediaStream);
        const analyzer = audioCtx.createAnalyser();
        analyzer.fftSize = 256;
        source.connect(analyzer);
        analyzerRef.current = analyzer;

        const dataArray = new Uint8Array(analyzer.frequencyBinCount);
        const updateMic = () => {
          if (!analyzerRef.current) return;
          analyzerRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const avg = sum / dataArray.length;
          setMicLevel(Math.min(100, (avg / 128) * 100));
          reqFrameRef.current = requestAnimationFrame(updateMic);
        };
        updateMic();
      } else {
        setMicStatus('error');
      }

    } catch (err) {
      console.warn('Device check failed', err);
      setCamStatus('error');
      setMicStatus('error');
    }
  };

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const handleContinue = () => {
    onComplete(stream); // pass the acquired stream so it can be reused without delay
  };

  const handleCancel = () => {
    if (stream) stream.getTracks().forEach(t => t.stop());
    onCancel();
  };

  return (
    <div
      className="glass-ambient-backdrop"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
        boxSizing: 'border-box'
      }}
    >
      <div
        className="glass-lobby-card"
        style={{
          maxWidth: '1320px',
          width: '95vw',
          height: '88vh',
          maxHeight: '820px',
          background: 'rgba(18, 21, 26, 0.92)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          padding: '20px 24px',
          boxSizing: 'border-box',
          overflow: 'hidden'
        }}
      >
        {/* Header Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            paddingBottom: '12px',
            flexShrink: 0
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#ffffff', textAlign: 'left' }}>
              Check Camera & Microphone
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8', textAlign: 'left' }}>
              Position yourself comfortably so your hands and face are clearly visible for signing.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '14px',
                background: camStatus === 'ready' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                color: camStatus === 'ready' ? '#10b981' : '#eab308',
                fontSize: '12px',
                fontWeight: 600
              }}
            >
              <ShieldCheck size={14} />
              {camStatus === 'ready' ? 'Devices Ready' : 'Setting up devices...'}
            </span>
          </div>
        </div>
        
        {/* Main Content: Left Dominant Video Feed + Right Compact Sidebar */}
        <div style={{ display: 'flex', gap: '20px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          
          {/* Dominant Video Preview (Takes the majority of the screen) */}
          <div
            style={{
              flex: 1,
              height: '100%',
              background: '#090b0e',
              borderRadius: '14px',
              overflow: 'hidden',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
            }}
          >
            {stream ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: 'scaleX(-1)' // Mirrored for natural selfie view
                }}
              />
            ) : (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  color: '#64748b'
                }}
              >
                <Camera size={44} style={{ opacity: 0.6 }} />
                <span style={{ fontSize: '15px' }}>
                  {camStatus === 'checking' ? 'Starting camera preview...' : 'Camera preview unavailable'}
                </span>
                {camStatus === 'error' && (
                  <button
                    onClick={requestPermissions}
                    style={{
                      marginTop: '8px',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      background: '#1d72fe',
                      color: '#fff',
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '13px'
                    }}
                  >
                    Grant Camera Access
                  </button>
                )}
              </div>
            )}

            {/* Overlay: Top-Left Guide Pill */}
            <div
              style={{
                position: 'absolute',
                top: 14,
                left: 14,
                background: 'rgba(0, 0, 0, 0.65)',
                backdropFilter: 'blur(8px)',
                color: '#e2e8f0',
                padding: '5px 12px',
                fontSize: '12px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                border: '1px solid rgba(255, 255, 255, 0.12)'
              }}
            >
              <Sparkles size={13} color="#8ab4f8" />
              <span>Optimal signing space: keep hands & chest in frame</span>
            </div>

            {/* Overlay: Bottom-Left Video Info & Status */}
            {videoInfo && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 14,
                  left: 14,
                  background: 'rgba(0, 0, 0, 0.7)',
                  backdropFilter: 'blur(8px)',
                  color: '#fff',
                  padding: '5px 12px',
                  fontSize: '12px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.12)'
                }}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                <span style={{ fontWeight: 600 }}>{videoInfo}</span>
                <span style={{ color: '#94a3b8' }}>• Mirrored HD Feed</span>
              </div>
            )}

            {/* Overlay: Bottom-Right Live Audio Indicator */}
            {micStatus === 'ready' && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 14,
                  right: 14,
                  background: 'rgba(0, 0, 0, 0.7)',
                  backdropFilter: 'blur(8px)',
                  color: '#fff',
                  padding: '5px 12px',
                  fontSize: '12px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.12)'
                }}
              >
                <Mic size={14} color={micLevel > 10 ? '#10b981' : '#94a3b8'} />
                <div style={{ width: '60px', height: '6px', background: 'rgba(255,255,255,0.2)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${micLevel}%`,
                      height: '100%',
                      background: micLevel > 10 ? '#10b981' : '#6b7280',
                      transition: 'width 0.1s ease-out'
                    }}
                  />
                </div>
              </div>
            )}
          </div>
          
          {/* Right Column: Compact Checks & Action Buttons */}
          <div
            style={{
              width: '320px',
              minWidth: '320px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '12px',
              height: '100%'
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              
              {/* Camera Status Card */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  textAlign: 'left'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <Camera size={16} color="#8ab4f8" />
                  <strong style={{ fontSize: '13.5px', color: '#f1f5f9' }}>Camera</strong>
                  {camStatus === 'ready' && <CheckCircle size={15} color="#10b981" style={{ marginLeft: 'auto' }} />}
                  {camStatus === 'error' && <XCircle size={15} color="#ef4444" style={{ marginLeft: 'auto' }} />}
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                  {camStatus === 'pending'
                    ? 'Permissions required'
                    : camStatus === 'ready'
                    ? 'Camera is active and ready for signing.'
                    : 'Camera unavailable. Please check browser permissions.'}
                </div>
              </div>

              {/* Microphone Status Card */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  textAlign: 'left'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <Mic size={16} color="#8ab4f8" />
                  <strong style={{ fontSize: '13.5px', color: '#f1f5f9' }}>Microphone</strong>
                  {micStatus === 'ready' && <CheckCircle size={15} color="#10b981" style={{ marginLeft: 'auto' }} />}
                  {micStatus === 'error' && <XCircle size={15} color="#ef4444" style={{ marginLeft: 'auto' }} />}
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>
                  {micStatus === 'pending'
                    ? 'Permissions required'
                    : micStatus === 'ready'
                    ? 'Microphone is active.'
                    : 'Microphone unavailable.'}
                </div>
                {micStatus === 'ready' && (
                  <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${micLevel}%`,
                        height: '100%',
                        background: micLevel > 10 ? '#10b981' : '#6b7280',
                        transition: 'width 0.1s ease-out'
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Signing Tip Card */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: 'rgba(29, 114, 254, 0.06)',
                  border: '1px solid rgba(29, 114, 254, 0.2)',
                  textAlign: 'left'
                }}
              >
                <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: '1.5' }}>
                  <strong style={{ color: '#8ab4f8', display: 'block', marginBottom: '2px' }}>AI Sign Tracking Ready:</strong>
                  Full MediaPipe temporal recognition will automatically initiate once you join the call.
                </div>
              </div>

            </div>

            {/* Bottom Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '10px' }}>
              {stream ? (
                <button
                  onClick={handleContinue}
                  className="glass-action-btn primary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '12px 20px',
                    fontSize: '14.5px',
                    fontWeight: 700,
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #1d72fe 0%, #1557bf 100%)',
                    cursor: 'pointer',
                    boxShadow: '0 4px 16px rgba(29, 114, 254, 0.35)'
                  }}
                >
                  Continue to Call <ArrowRight size={16} />
                </button>
              ) : (
                <button
                  onClick={requestPermissions}
                  className="glass-action-btn primary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '12px 20px',
                    fontSize: '14.5px',
                    fontWeight: 700,
                    borderRadius: '10px'
                  }}
                >
                  Request Permissions
                </button>
              )}

              <button
                onClick={handleCancel}
                style={{
                  padding: '10px 16px',
                  background: 'transparent',
                  color: '#94a3b8',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                  transition: 'all 0.15s ease'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
