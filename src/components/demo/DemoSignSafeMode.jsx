import React, { useRef, useEffect, useState } from 'react';
import { ArrowLeft, Camera, Sparkles, CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

export default function DemoSignSafeMode({ onBack, onProceed }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const landmarkerRef = useRef(null);
  const animFrameIdRef = useRef(null);

  const [status, setStatus] = useState('requesting'); // requesting, active, error
  const [modelLoading, setModelLoading] = useState(true);
  
  const [diagnostics, setDiagnostics] = useState({
    fps: 0,
    resolution: 'Unknown',
    leftHand: false,
    rightHand: false,
    lighting: 'calculating', // good, poor
    face: 'unavailable',
    upperBody: 'unavailable'
  });

  const [guidance, setGuidance] = useState('Initializing camera...');

  const lastFrameTimeRef = useRef(performance.now());
  const frameCountRef = useRef(0);
  const fpsUpdateTimerRef = useRef(performance.now());

  // Initialize MediaPipe HandLandmarker
  useEffect(() => {
    let isCancelled = false;

    async function initMediaPipe() {
      try {
        setModelLoading(true);
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

        if (!isCancelled) {
          landmarkerRef.current = handLandmarker;
          setModelLoading(false);
        }
      } catch (err) {
        console.error('[SignSafe] Error loading hand model:', err);
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

  // Initialize Camera
  useEffect(() => {
    let isSubscribed = true;

    async function startCamera() {
      try {
        setStatus('requesting');
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
        setStatus('active');
        setGuidance('Camera active. Analyzing frame...');
      } catch (err) {
        setStatus('error');
        setGuidance('Camera permission denied or device not found.');
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
  }, []);

  // Detection Loop
  useEffect(() => {
    let lastVideoTime = -1;

    function checkLighting(ctx, width, height) {
      if (width === 0 || height === 0) return 'good';
      // Sample a smaller grid for performance
      const sampleWidth = Math.min(100, width);
      const sampleHeight = Math.min(100, height);
      ctx.drawImage(videoRef.current, 0, 0, sampleWidth, sampleHeight);
      const imageData = ctx.getImageData(0, 0, sampleWidth, sampleHeight);
      let data = imageData.data;
      let r, g, b, avg;
      let colorSum = 0;
      
      for (let x = 0, len = data.length; x < len; x += 4) {
        r = data[x];
        g = data[x + 1];
        b = data[x + 2];
        avg = Math.floor((r + g + b) / 3);
        colorSum += avg;
      }
      
      const brightness = Math.floor(colorSum / (sampleWidth * sampleHeight));
      return brightness < 50 ? 'poor' : 'good';
    }

    function renderDetection() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const landmarker = landmarkerRef.current;

      if (video && canvas && video.readyState >= 2 && status === 'active') {
        const ctx = canvas.getContext('2d');
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;
        }

        // Calculate FPS
        const now = performance.now();
        frameCountRef.current++;
        if (now - fpsUpdateTimerRef.current >= 1000) {
          const fps = Math.round((frameCountRef.current * 1000) / (now - fpsUpdateTimerRef.current));
          frameCountRef.current = 0;
          fpsUpdateTimerRef.current = now;
          
          setDiagnostics(prev => ({ ...prev, fps }));
        }

        if (video.videoWidth && video.videoHeight) {
          setDiagnostics(prev => {
            const res = `${video.videoWidth}x${video.videoHeight}`;
            if (prev.resolution !== res) return { ...prev, resolution: res };
            return prev;
          });
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (landmarker && video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;
          
          // Lighting Check (every 10 frames approx)
          if (frameCountRef.current % 10 === 0) {
             const light = checkLighting(ctx, canvas.width, canvas.height);
             setDiagnostics(prev => prev.lighting !== light ? { ...prev, lighting: light } : prev);
          }
          ctx.clearRect(0, 0, canvas.width, canvas.height); // clear the scaled image used for lighting

          const startTimeMs = performance.now();
          const results = landmarker.detectForVideo(video, startTimeMs);

          let leftHand = false;
          let rightHand = false;

          if (results && results.landmarks) {
            results.handednesses.forEach((h, index) => {
              const label = h[0].categoryName; 
              // mediapipe usually mirrors left/right for front facing camera, but we just check presence
              if (label === 'Left') leftHand = true;
              if (label === 'Right') rightHand = true;
            });

            // Draw basic landmarks to show it's working
            results.landmarks.forEach((landmarks) => {
              ctx.fillStyle = '#0ed8e2';
              landmarks.forEach(pt => {
                ctx.beginPath();
                ctx.arc(pt.x * canvas.width, pt.y * canvas.height, 3, 0, 2 * Math.PI);
                ctx.fill();
              });
            });
          }

          setDiagnostics(prev => {
            if (prev.leftHand !== leftHand || prev.rightHand !== rightHand) {
              return { ...prev, leftHand, rightHand };
            }
            return prev;
          });

          // Update Guidance
          let newGuidance = 'Setup looks good! You are ready to sign.';
          if (!leftHand && !rightHand) {
            newGuidance = 'Show your hands to the camera.';
          } else if (!leftHand) {
            newGuidance = 'Your left hand is outside the visible frame or obscured.';
          } else if (!rightHand) {
            newGuidance = 'Your right hand is outside the visible frame or obscured.';
          }
          
          if (diagnostics.lighting === 'poor') {
            newGuidance = 'Lighting is too low. Please move to a brighter area.';
          }
          
          setGuidance(newGuidance);
        }
      }

      animFrameIdRef.current = requestAnimationFrame(renderDetection);
    }

    animFrameIdRef.current = requestAnimationFrame(renderDetection);

    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    };
  }, [status, diagnostics.lighting]);

  return (
    <div style={{ padding: '24px', color: '#e8eaed', minHeight: '100vh', backgroundColor: '#202124' }}>
      <header style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: '#8ab4f8', display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '16px' }}
        >
          <ArrowLeft size={20} style={{ marginRight: '8px' }} />
          Back
        </button>
        <h1 style={{ marginLeft: 'auto', fontSize: '20px', color: '#fff' }}>Sign-Safe Mode Diagnostics</h1>
        {onProceed && (
          <button
            onClick={onProceed}
            style={{ marginLeft: 'auto', background: '#81c995', border: 'none', color: '#202124', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '15px', fontWeight: 'bold' }}
          >
            Start Demo
          </button>
        )}
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px', maxWidth: '1000px', margin: '0 auto' }}>
        
        {/* Left Col: Camera */}
        <div style={{ background: '#292a2d', borderRadius: '12px', overflow: 'hidden', border: '1px solid #3c4043' }}>
          <div style={{ position: 'relative', aspectRatio: '4/3', backgroundColor: '#000' }}>
            <video
              ref={videoRef}
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
              autoPlay
              playsInline
              muted
            />
            <canvas
              ref={canvasRef}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', transform: 'scaleX(-1)' }}
            />
            {status === 'requesting' && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)' }}>
                <span>Requesting Camera Permission...</span>
              </div>
            )}
            {status === 'error' && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(234,67,53,0.2)' }}>
                <span style={{ color: '#ea4335' }}>Camera Error</span>
              </div>
            )}
            {modelLoading && status === 'active' && (
              <div style={{ position: 'absolute', bottom: 16, left: 16, background: 'rgba(0,0,0,0.6)', padding: '8px 12px', borderRadius: '8px', fontSize: '12px' }}>
                Loading Computer Vision...
              </div>
            )}
          </div>
          <div style={{ padding: '16px', background: '#303134', borderTop: '1px solid #3c4043' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: '#fff' }}>Live Guidance</h3>
            <p style={{ margin: 0, color: '#9aa0a6', fontSize: '14px' }}>{guidance}</p>
          </div>
        </div>

        {/* Right Col: Checks */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <div style={{ background: '#292a2d', borderRadius: '12px', padding: '16px', border: '1px solid #3c4043' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', textTransform: 'uppercase', color: '#9aa0a6' }}>Visibility Checks</h3>
            
            <DiagnosticRow label="Left Hand" status={diagnostics.leftHand ? 'ok' : 'warn'} />
            <DiagnosticRow label="Right Hand" status={diagnostics.rightHand ? 'ok' : 'warn'} />
            <DiagnosticRow label="Lighting" status={diagnostics.lighting === 'poor' ? 'warn' : 'ok'} note={diagnostics.lighting === 'poor' ? 'Poor' : 'Good'} />
          </div>

          <div style={{ background: '#292a2d', borderRadius: '12px', padding: '16px', border: '1px solid #3c4043' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', textTransform: 'uppercase', color: '#9aa0a6' }}>System Status</h3>
            <DiagnosticRow label="Resolution" status="info" note={diagnostics.resolution} />
            <DiagnosticRow label="Frame Rate" status={diagnostics.fps > 20 ? 'ok' : 'warn'} note={`${diagnostics.fps} FPS`} />
            <DiagnosticRow label="Local Processing" status="ok" note="Active" />
            <DiagnosticRow label="Cloud Uploads" status="ok" note="Disabled" />
          </div>

        </div>
      </div>
    </div>
  );
}

function DiagnosticRow({ label, status, note }) {
  let icon = null;
  let color = '#9aa0a6';
  
  if (status === 'ok') {
    icon = <CheckCircle2 size={16} />;
    color = '#81c995';
  } else if (status === 'warn') {
    icon = <AlertCircle size={16} />;
    color = '#fdd663';
  } else if (status === 'unavailable') {
    icon = <HelpCircle size={16} />;
    color = '#5f6368';
  } else if (status === 'info') {
    icon = <Sparkles size={16} />;
    color = '#8ab4f8';
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
      <span style={{ fontSize: '14px', color: '#e8eaed' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color }}>
        {note && <span style={{ fontSize: '12px' }}>{note}</span>}
        {icon}
      </div>
    </div>
  );
}
