import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Copy,
  Check,
  Users,
  ArrowLeft,
  Settings,
  Sliders,
  Grid,
  Maximize,
  Minimize,
  Send,
  MessageSquare,
  X,
  Sun,
  Moon,
  User
} from 'lucide-react';
import IslAvatarViewer from './IslAvatarViewer';
import DeafVideoSignRecognizer from './DeafVideoSignRecognizer';
import { matchAllSignsFromSpeech } from '../utils/speechDictionary';
import { SignalingService } from '../utils/signalingService';
import './VideoCallMode.css';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ]
};

// Generates an intuitive room code like 'call-784-219'
function generateRoomCode() {
  const num1 = Math.floor(100 + Math.random() * 900);
  const num2 = Math.floor(100 + Math.random() * 900);
  return `call-${num1}-${num2}`;
}

const DraggableWindow = ({ title, defaultRect, isVisible, onClose, children }) => {
  const [rect, setRect] = React.useState(defaultRect);
  const [isDragging, setIsDragging] = React.useState(false);
  const dragStart = React.useRef({ x: 0, y: 0, rectX: 0, rectY: 0 });

  const handleMouseDown = (e) => {
    if (e.target.closest('.drag-handle')) {
      setIsDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY, rectX: rect.x, rectY: rect.y };
    }
  };

  React.useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      setRect(prev => ({
        ...prev,
        x: Math.max(0, Math.min(window.innerWidth - prev.width, dragStart.current.rectX + (e.clientX - dragStart.current.x))),
        y: Math.max(0, Math.min(window.innerHeight - prev.height, dragStart.current.rectY + (e.clientY - dragStart.current.y)))
      }));
    };
    const handleMouseUp = () => setIsDragging(false);
    
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  if (!isVisible) return null;

  return (
    <div style={{
      position: 'absolute', left: rect.x, top: rect.y, width: rect.width, height: rect.height,
      backgroundColor: 'rgba(20,20,30,0.85)', border: '1px solid rgba(255,255,255,0.2)',
      borderRadius: '12px', overflow: 'hidden', zIndex: 50, display: 'flex', flexDirection: 'column',
      backdropFilter: 'blur(10px)'
    }}>
      <div 
        className="drag-handle" onMouseDown={handleMouseDown}
        style={{ height: '30px', backgroundColor: 'rgba(0,0,0,0.5)', cursor: 'grab', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 10px', userSelect: 'none' }}
      >
        <span style={{ fontSize: '12px', color: 'white', fontWeight: 600 }}>{title}</span>
        {onClose && (
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        )}
      </div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {children}
      </div>
      <div 
        style={{ position: 'absolute', bottom: 0, right: 0, width: '15px', height: '15px', cursor: 'nwse-resize', zIndex: 60 }}
        onMouseDown={(e) => {
          e.stopPropagation();
          const startWidth = rect.width;
          const startHeight = rect.height;
          const startX = e.clientX;
          const startY = e.clientY;
          const onMove = (moveEvt) => {
            setRect(prev => ({ 
              ...prev, 
              width: Math.max(150, Math.min(window.innerWidth - prev.x, startWidth + (moveEvt.clientX - startX))), 
              height: Math.max(150, Math.min(window.innerHeight - prev.y, startHeight + (moveEvt.clientY - startY))) 
            }));
          };
          const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
          };
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        }}
      >
        <svg viewBox="0 0 10 10" style={{position: 'absolute', right: 2, bottom: 2, width: 8, height: 8}}>
          <polygon points="10,0 10,10 0,10" fill="rgba(255,255,255,0.5)" />
        </svg>
      </div>
    </div>
  );
};

export default function VideoCallMode({ initialRoomId = '', onBack, theme = 'dark', onToggleTheme }) {
  // Room & View state
  const [roomId, setRoomId] = useState(initialRoomId || '');
  const [inCall, setInCall] = useState(Boolean(initialRoomId));
  const [roomInput, setRoomInput] = useState(initialRoomId || '');
  const [copiedLink, setCopiedLink] = useState(false);
  const [layoutMode, setLayoutMode] = useState('hero'); // 'hero' | 'grid'
  const [pinnedParticipant, setPinnedParticipant] = useState('remote'); // 'remote' | 'local'

  // Modals & Panels
  const [userRole, setUserRole] = useState(null); // 'hearing' | 'deaf'
  const [showRemoteVideo, setShowRemoteVideo] = useState(true);
  const [showLocalVideo, setShowLocalVideo] = useState(true);
  const [showAvatar, setShowAvatar] = useState(true);
  const [showSignText, setShowSignText] = useState(true);
  const [remoteSignText, setRemoteSignText] = useState('');
  const [remoteSpeechText, setRemoteSpeechText] = useState('');
  const [liveSpeechText, setLiveSpeechText] = useState('');
  const [liveSpeechHistory, setLiveSpeechHistory] = useState('');
  const [speechStatus, setSpeechStatus] = useState('Initializing...');
  
  const userRoleRef = useRef(userRole);
  useEffect(() => {
    userRoleRef.current = userRole;
  }, [userRole]);
  
  const isMountedRef = useRef(true);
  const lastResultIndexRef = useRef(0);
  const lastMatchesRef = useRef([]);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [notificationToast, setNotificationToast] = useState(null);

  // Peer & WebRTC state
  const [peerId] = useState(() => 'peer_' + Math.random().toString(36).slice(2, 9));
  const [remotePeerId, setRemotePeerId] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('waiting'); // 'waiting' | 'connecting' | 'connected' | 'disconnected'
  const [debugInfo, setDebugInfo] = useState(null);
  const lastOntrackInfoRef = useRef('None');
  const lastWebRtcErrorRef = useRef('None');
  
  // Media controls
  const [micActive, setMicActive] = useState(true);
  const [camActive, setCamActive] = useState(true);
  const [remoteMicActive, setRemoteMicActive] = useState(true);
  const [remoteCamActive, setRemoteCamActive] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Settings preferences
  const [mirrorVideo, setMirrorVideo] = useState(true);
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [audioVolume, setAudioVolume] = useState(85);

  // Call timer
  const [callDuration, setCallDuration] = useState(0);

  // Media streams & Refs
  const remoteStreamRef = useRef(null);
  const [remoteTrackCount, setRemoteTrackCount] = useState(0); // to force re-renders if needed
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const avatarRef = useRef(null);
  
  const handleRemoteVideoRef = useCallback((node) => {
    remoteVideoRef.current = node;
    console.log('[WEBRTC DEBUG] handleRemoteVideoRef called. Node exists:', !!node);
    if (node && remoteStreamRef.current) {
      if (node.srcObject !== remoteStreamRef.current) {
        console.log('[WEBRTC DEBUG] Assigning stream to remote video element on mount');
        node.srcObject = remoteStreamRef.current;
      }
      node.play().then(() => {
        console.log('[WEBRTC DEBUG] play() succeeded in callback ref');
      }).catch(e => console.error('[WEBRTC DEBUG] Auto-play prevented in callback ref:', e.name, e.message));
    }
  }, [remoteTrackCount]);

  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const pcRef = useRef(null);
  const signalingRef = useRef(null);
  const dataChannelRef = useRef(null);
  const iceCandidateQueueRef = useRef([]);
  const toastTimeoutRef = useRef(null);

  // Web Speech API for Hearing Person
  useEffect(() => {
    if (userRole !== 'hearing') return;
    
    isMountedRef.current = true;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    
    let recognition = null;
    let hasFatalError = false;

    const startRecognition = () => {
      if (!isMountedRef.current || hasFatalError) return;

      // Reset tracking refs for the new instance
      lastResultIndexRef.current = -1;
      lastMatchesRef.current = [];

      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = navigator.language || 'en-US';

      recognition.onstart = () => {
        setSpeechStatus('Listening (Mic Active)');
      };

      recognition.onresult = (event) => {
        if (!isMountedRef.current) return;
        const results = event.results;
        const resultIndex = event.resultIndex !== undefined ? event.resultIndex : results.length - 1;
        
        if (resultIndex !== lastResultIndexRef.current) {
          lastMatchesRef.current = [];
          lastResultIndexRef.current = resultIndex;
        }

        const currentResult = results[resultIndex];
        if (!currentResult) return;
        
        const transcript = currentResult[0].transcript.trim();
        setLiveSpeechText(transcript);

        if (currentResult.isFinal) {
          setLiveSpeechHistory(prev => (prev + ' ' + transcript).trim());
          setLiveSpeechText('');
        }

        const matches = matchAllSignsFromSpeech(transcript);
        let divergeIndex = 0;
        const prevMatches = lastMatchesRef.current;
        while (divergeIndex < prevMatches.length && divergeIndex < matches.length && prevMatches[divergeIndex] === matches[divergeIndex]) {
          divergeIndex++;
        }
        const newSigns = matches.slice(divergeIndex);
        
        if (newSigns.length > 0) {
          const word = newSigns[newSigns.length - 1];
          console.log('[SPEECH] Recognized sign to send:', word);
          if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
            dataChannelRef.current.send(JSON.stringify({ type: 'speech', text: word }));
          }
        }
        lastMatchesRef.current = matches;
      };

      recognition.onerror = (event) => {
        if (event.error !== 'no-speech') {
          console.warn('[SPEECH] Recognition error:', event.error);
          setSpeechStatus(`Error: ${event.error}`);
          if (['not-allowed', 'audio-capture', 'network'].includes(event.error)) {
            hasFatalError = true;
          }
        }
      };

      recognition.onend = () => {
        if (hasFatalError || !isMountedRef.current) return;
        
        // Destroy old instance and create a new one to prevent Chrome zombie state
        setTimeout(() => {
          startRecognition();
        }, 1000);
      };

      try {
        recognition.start();
      } catch (e) {
        console.error('[SPEECH] Failed to start:', e);
      }
    };

    startRecognition();

    return () => {
      isMountedRef.current = false;
      hasFatalError = true; // Stop loop
      if (recognition) {
        try { recognition.stop(); } catch (e) {}
      }
    };
  }, [userRole]);

  // Duration Timer
  useEffect(() => {
    let timer;
    if (inCall) {
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(timer);
  }, [inCall]);

  const formatDuration = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Toast notification helper
  const showToast = useCallback((msg) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setNotificationToast(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setNotificationToast(null);
    }, 3200);
  }, []);

  // Copy Room Link to Clipboard
  const copyRoomLink = () => {
    const fullUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomId)}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopiedLink(true);
      showToast('Room link copied to clipboard');
      setTimeout(() => setCopiedLink(false), 2500);
    }).catch(() => {
      navigator.clipboard.writeText(roomId);
      setCopiedLink(true);
      showToast(`Room code copied: ${roomId}`);
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  // Setup WebRTC DataChannel for Signs/Speech
  const setupDataChannel = useCallback((channel) => {
    dataChannelRef.current = channel;

    channel.onopen = () => {
      console.log('[WEBRTC] Data channel opened');
    };

    channel.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'sign') {
          setRemoteSignText(payload.word);
          if (userRoleRef.current === 'hearing' && window.speechSynthesis) {
            window.speechSynthesis.cancel();
            window.speechSynthesis.resume(); // Ensure TTS engine is not stuck
            const utterance = new SpeechSynthesisUtterance(payload.word.toLowerCase());
            utterance.rate = 0.9;
            utterance.pitch = 1.0;
            
            // Try to find a good English voice
            const voices = window.speechSynthesis.getVoices();
            const engVoice = voices.find((v) => v.lang.startsWith('en') && !v.name.includes('Google') && v.name.includes('Natural')) ||
                             voices.find((v) => v.lang.startsWith('en'));
            if (engVoice) utterance.voice = engVoice;

            window.speechSynthesis.speak(utterance);
          }
        } else if (payload.type === 'speech') {
          setRemoteSpeechText(payload.text);
          if (avatarRef.current) {
            avatarRef.current.playSign(payload.text);
          }
        }
      } catch (err) {
        console.warn('[WEBRTC] DataChannel parse error:', err);
      }
    };
  }, []);

  // Initialize WebRTC Peer Connection
  const createPeerConnection = useCallback((targetPeerId) => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    // Attach local media tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Handle remote track
    pc.ontrack = (event) => {
      console.log('[WEBRTC DEBUG] === ONTRACK FIRED ===');
      console.log(`[WEBRTC DEBUG] Track info - kind: ${event.track.kind}, readyState: ${event.track.readyState}, enabled: ${event.track.enabled}, muted: ${event.track.muted}`);
      console.log('[WEBRTC DEBUG] Streams count:', event.streams?.length || 0);

      lastOntrackInfoRef.current = `${new Date().toLocaleTimeString()} | ${event.track.kind} | ${event.track.readyState} | streamCount:${event.streams?.length || 0}`;

      let streamToUse;
      if (event.streams && event.streams[0]) {
        streamToUse = event.streams[0];
        console.log('[WEBRTC DEBUG] Using event.streams[0] with ID:', streamToUse.id);
      } else {
        if (!remoteStreamRef.current) {
          remoteStreamRef.current = new MediaStream();
          console.log('[WEBRTC DEBUG] Created new fallback MediaStream');
        }
        streamToUse = remoteStreamRef.current;
        if (!streamToUse.getTracks().includes(event.track)) {
          streamToUse.addTrack(event.track);
          console.log('[WEBRTC DEBUG] Added track to fallback stream');
        }
      }
      
      console.log(`[WEBRTC DEBUG] Final stream: ${streamToUse.id} | Audio tracks: ${streamToUse.getAudioTracks().length} | Video tracks: ${streamToUse.getVideoTracks().length}`);
      
      remoteStreamRef.current = streamToUse;
      setRemoteTrackCount(prev => prev + 1);

      if (remoteVideoRef.current) {
        console.log('[WEBRTC DEBUG] remoteVideoRef exists, assigning srcObject');
        if (remoteVideoRef.current.srcObject !== streamToUse) {
          remoteVideoRef.current.srcObject = streamToUse;
        }
        remoteVideoRef.current.play().then(() => {
          console.log('[WEBRTC DEBUG] play() succeeded on ontrack');
        }).catch(e => console.error('[WEBRTC DEBUG] play() FAILED on ontrack:', e.name, e.message));
      } else {
        console.warn('[WEBRTC DEBUG] remoteVideoRef is NOT present when ontrack fired');
      }

      setConnectionStatus('connected');
      showToast('Participant media connected');
    };

    pc.oniceconnectionstatechange = () => {
      if (
        pc.iceConnectionState === 'connected' ||
        pc.iceConnectionState === 'completed'
      ) {
        setConnectionStatus('connected');
      }
    };

    // Handle ICE Candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && signalingRef.current) {
        signalingRef.current.send(
          { type: 'candidate', candidate: JSON.stringify(event.candidate.toJSON()) },
          targetPeerId
        );
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log('[WEBRTC] Connection state:', state);
      if (state === 'connected') {
        setConnectionStatus('connected');
      } else if (state === 'disconnected' || state === 'failed') {
        setConnectionStatus('disconnected');
        showToast('Connection interrupted');
      }
    };

    // Data Channel handler for answerer
    pc.ondatachannel = (event) => {
      setupDataChannel(event.channel);
    };

    return pc;
  }, [setupDataChannel, showToast]);

  // Start Local Audio/Video Media
  const startLocalMedia = useCallback(async () => {
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (err) {
      console.warn('[WEBCAM] Camera access unavailable:', err);
      setCamActive(false);
      return null;
    }
  }, []);

  // Stop Local Media
  const stopLocalMedia = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
  }, []);

  // Close Peer Connection
  const closePeerConnection = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    setRemotePeerId(null);
    setConnectionStatus('waiting');
    remoteStreamRef.current = null;
    setRemoteTrackCount(0);
    iceCandidateQueueRef.current = [];
  }, []);

  // Initiate WebRTC Call
  const initiateCall = useCallback(async (targetPeerId) => {
    try {
      setConnectionStatus('connecting');
      const pc = createPeerConnection(targetPeerId);

      // Create data channel as offerer
      const dc = pc.createDataChannel('signlink-chat');
      setupDataChannel(dc);

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await pc.setLocalDescription(offer);

      // Wait a tiny bit for DataChannel to fully open on the remote side
      await new Promise(resolve => setTimeout(resolve, 300));

      signalingRef.current?.send(
        { type: 'offer', sdp: JSON.stringify(pc.localDescription.toJSON()) },
        targetPeerId
      );
    } catch (err) {
      console.error('[WEBRTC] Failed to create offer:', err);
      setConnectionStatus('waiting');
    }
  }, [createPeerConnection, setupDataChannel]);

  // Handle incoming SDP Offer
  const handleOffer = useCallback(async (senderId, offerSdp) => {
    try {
      setConnectionStatus('connecting');
      setRemotePeerId(senderId);
      const pc = createPeerConnection(senderId);

      const parsedSdp = typeof offerSdp === 'string' ? JSON.parse(offerSdp) : offerSdp;
      await pc.setRemoteDescription(new RTCSessionDescription(parsedSdp));

      // Flush queued candidates safely
      while (iceCandidateQueueRef.current.length > 0) {
        const c = iceCandidateQueueRef.current.shift();
        try {
          await pc.addIceCandidate(new RTCIceCandidate(c));
        } catch (e) {
          console.warn('[WEBRTC] Queued candidate rejected (likely stale):', e);
        }
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      signalingRef.current?.send(
        { type: 'answer', sdp: JSON.stringify(pc.localDescription.toJSON()) },
        senderId
      );
    } catch (err) {
      console.error('[WEBRTC] Failed to handle offer:', err);
    }
  }, [createPeerConnection]);

  // Handle incoming SDP Answer
  const handleAnswer = useCallback(async (senderId, answerSdp) => {
    try {
      if (pcRef.current) {
        const parsedSdp = typeof answerSdp === 'string' ? JSON.parse(answerSdp) : answerSdp;
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(parsedSdp));
        while (iceCandidateQueueRef.current.length > 0) {
          const c = iceCandidateQueueRef.current.shift();
          try {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(c));
          } catch (e) {
            console.warn('[WEBRTC] Queued candidate rejected (likely stale):', e);
          }
        }
      }
    } catch (err) {
      console.error('[WEBRTC] Failed to handle answer:', err);
    }
  }, []);

  // Handle incoming ICE Candidate
  const handleCandidate = useCallback(async (senderId, candidate) => {
    try {
      const parsedCandidate = typeof candidate === 'string' ? JSON.parse(candidate) : candidate;
      if (pcRef.current && pcRef.current.remoteDescription && pcRef.current.remoteDescription.type) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(parsedCandidate));
      } else {
        iceCandidateQueueRef.current.push(parsedCandidate);
      }
    } catch (err) {
      console.error('[WEBRTC] Failed to add ICE candidate:', err);
    }
  }, []);

  // Handle Join Call
  const handleJoinCall = useCallback(async (targetRoom) => {
    if (!targetRoom.trim()) return;
    const cleanRoom = targetRoom.trim();

    // STRICT MODE FIX: Clean up ghost instances to free up the PeerJS ID and event listeners
    if (signalingRef.current) {
      signalingRef.current.destroy();
      signalingRef.current = null;
    }

    setRoomId(cleanRoom);
    setInCall(true);
    setConnectionStatus('waiting');

    await startLocalMedia();

    const sig = new SignalingService(cleanRoom, peerId);
    signalingRef.current = sig;

    sig.on('peer_joined', async ({ sender }) => {
      setRemotePeerId(sender);
      showToast('Participant joining room...');
      await initiateCall(sender);
    });

    sig.on('offer', async ({ sender, sdp }) => {
      await handleOffer(sender, sdp);
    });

    sig.on('answer', async ({ sender, sdp }) => {
      await handleAnswer(sender, sdp);
    });

    sig.on('candidate', async ({ sender, candidate }) => {
      await handleCandidate(sender, candidate);
    });

    sig.on('peer_left', () => {
      showToast('Participant left the room');
      closePeerConnection();
    });

    sig.on('mic_state', ({ active }) => {
      setRemoteMicActive(active);
    });

    sig.on('cam_state', ({ active }) => {
      setRemoteCamActive(active);
    });

    sig.join();
  }, [peerId, startLocalMedia, initiateCall, handleOffer, handleAnswer, handleCandidate, closePeerConnection, showToast]);

  // Handle auto-join if initialRoomId is provided
  useEffect(() => {
    if (initialRoomId) {
      handleJoinCall(initialRoomId);
    }
  }, [initialRoomId, handleJoinCall]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (signalingRef.current) {
        signalingRef.current.send({ type: 'leave' });
        signalingRef.current.destroy();
        signalingRef.current = null;
      }
      closePeerConnection();
      stopLocalMedia();
    };
  }, [closePeerConnection, stopLocalMedia]);

  // Diagnostic Logger for Media States
  useEffect(() => {
    if (!inCall) return;
    const interval = setInterval(() => {
      console.log('--- WEBRTC MEDIA DIAGNOSTICS ---');
      const info = {
        role: signalingRef.current ? (signalingRef.current.isHost ? 'HOST' : 'GUEST') : 'UNKNOWN',
        sigConns: signalingRef.current?.connections?.size || 0,
        peerId,
        pcState: pcRef.current?.connectionState || 'null',
        signalingState: pcRef.current?.signalingState || 'null',
        iceState: pcRef.current?.iceConnectionState || 'null',
        localVideo: '0',
        localAudio: '0',
        remoteVideo: '0',
        remoteAudio: '0',
        remoteStreamExists: !!remoteStreamRef.current ? 'YES' : 'NO',
        remoteSrcObjectExists: !!remoteVideoRef.current?.srcObject ? 'YES' : 'NO',
        remoteVideoReadyState: remoteVideoRef.current?.readyState || 'null',
        remoteVideoPaused: remoteVideoRef.current?.paused !== undefined ? (remoteVideoRef.current.paused ? 'YES' : 'NO') : 'null',
        remoteDimensions: `${remoteVideoRef.current?.videoWidth || 0}x${remoteVideoRef.current?.videoHeight || 0}`,
        lastOntrack: lastOntrackInfoRef.current,
        lastError: lastWebRtcErrorRef.current
      };

      // LOCAL
      if (localStreamRef.current) {
        const vTracks = localStreamRef.current.getVideoTracks();
        const aTracks = localStreamRef.current.getAudioTracks();
        info.localVideo = `${vTracks.length} (${vTracks[0]?.readyState || 'N/A'})`;
        info.localAudio = `${aTracks.length} (${aTracks[0]?.readyState || 'N/A'})`;
        
        console.log(`[LOCAL] Stream ID: ${localStreamRef.current.id}`);
        console.log(`[LOCAL] Video Track: ${vTracks.length ? 'Exists' : 'Missing'} | readyState: ${vTracks[0]?.readyState} | enabled: ${vTracks[0]?.enabled}`);
      } else {
        console.log('[LOCAL] localStreamRef is NULL');
      }

      // PC Senders
      if (pcRef.current) {
        const senders = pcRef.current.getSenders();
        console.log(`[PC] Senders count: ${senders.length}`);
        console.log(`[PC] connectionState: ${pcRef.current.connectionState} | iceConnectionState: ${pcRef.current.iceConnectionState}`);
      } else {
        console.log('[PC] pcRef is NULL');
      }

      // REMOTE
      const video = remoteVideoRef.current;
      console.log(`[REMOTE] Video Element Exists: ${!!video}`);
      if (video) {
        const srcObj = video.srcObject;
        console.log(`[REMOTE] srcObject Assigned: ${!!srcObj}`);
        if (srcObj) {
          const vTracks = srcObj.getVideoTracks();
          const aTracks = srcObj.getAudioTracks();
          info.remoteVideo = `${vTracks.length} (${vTracks[0]?.readyState || 'N/A'})`;
          info.remoteAudio = `${aTracks.length} (${aTracks[0]?.readyState || 'N/A'})`;
          console.log(`[REMOTE] srcObject Tracks: ${srcObj.getTracks().map(t => `${t.kind}(${t.readyState}, enabled:${t.enabled}, muted:${t.muted})`).join(', ')}`);
        }
        console.log(`[REMOTE] Video State - readyState: ${video.readyState}, paused: ${video.paused}, dimensions: ${video.videoWidth}x${video.videoHeight}`);
      }
      
      setDebugInfo(info);
      console.log('--------------------------------');
    }, 4000);
    return () => clearInterval(interval);
  }, [inCall]);

  // Toggle Microphone
  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      const nextState = !micActive;
      audioTracks.forEach((track) => {
        track.enabled = nextState;
      });
      setMicActive(nextState);
      signalingRef.current?.send({ type: 'mic_state', active: nextState });
      showToast(nextState ? 'Microphone unmuted' : 'Microphone muted');
    }
  };

  // Toggle Camera
  const toggleCam = () => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      const nextState = !camActive;
      videoTracks.forEach((track) => {
        track.enabled = nextState;
      });
      setCamActive(nextState);
      signalingRef.current?.send({ type: 'cam_state', active: nextState });
      showToast(nextState ? 'Camera turned on' : 'Camera turned off');
    }
  };

  // Toggle Full Screen
  // Sync local stream to local video element if it renders after stream is ready
  useEffect(() => {
    if (showLocalVideo && localVideoRef.current && localStreamRef.current) {
      if (localVideoRef.current.srcObject !== localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
    }
  });

  // Sync remote stream to remote video element dynamically is handled by handleRemoteVideoRef now

  const toggleFullScreen = () => {
    const stage = document.querySelector('.glass-stage-content');
    if (!stage) return;

    if (!document.fullscreenElement) {
      stage.requestFullscreen().catch((err) => {
        console.warn('[FULLSCREEN] Error:', err);
      });
      setIsFullScreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullScreen(false);
      }
    }
  };

  // End Call
  const handleEndCall = () => {
    if (signalingRef.current) {
      signalingRef.current.send({ type: 'leave' });
      signalingRef.current.destroy();
      signalingRef.current = null;
    }
    closePeerConnection();
    stopLocalMedia();
    setInCall(false);
    onBack();
  };


  // ----------------------------------------------------
  // RENDER: LOBBY SCREEN (Clean Modern Glass)
  // ----------------------------------------------------
  if (!inCall) {
    return (
      <div className="glass-ambient-backdrop">
        <div className="glass-lobby-shell">
          <header className="glass-lobby-header">
            <button onClick={onBack} className="glass-back-btn">
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
            <div className="glass-lobby-brand">
              <div className="logo-badge">SL</div>
              <span>SignLink Video Call</span>
            </div>
            <button 
              className="theme-toggle-pill-btn" 
              onClick={onToggleTheme} 
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} theme`}
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
          </header>

          <main className="glass-lobby-main">
            <div className="glass-lobby-card">
              <h2>Video Call</h2>
              <p className="glass-lobby-desc">
                Start a private video meeting or join an existing room with a code.
              </p>

              <div className="glass-lobby-grid">
                {/* Option 1: Start Call */}
                <div className="glass-lobby-box">
                  <div className="box-icon-circle blue">
                    <Video size={22} color="#ffffff" />
                  </div>
                  <h3>Start Meeting</h3>
                  <p>Generate a room code and invite your partner to connect.</p>
                  <button
                    className="glass-action-btn primary"
                    onClick={() => {
                      const newCode = generateRoomCode();
                      handleJoinCall(newCode);
                    }}
                  >
                    <Video size={16} />
                    <span>Create Room</span>
                  </button>
                </div>

                <div className="glass-divider">
                  <span>OR</span>
                </div>

                {/* Option 2: Join Existing Call */}
                <div className="glass-lobby-box">
                  <div className="box-icon-circle slate">
                    <Users size={22} />
                  </div>
                  <h3>Join with Code</h3>
                  <p>Enter the code or paste the link provided by your partner.</p>
                  <div className="glass-input-row">
                    <input
                      type="text"
                      placeholder="e.g. call-784-219"
                      value={roomInput}
                      onChange={(e) => setRoomInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && roomInput.trim()) {
                          handleJoinCall(roomInput);
                        }
                      }}
                    />
                    <button
                      className="glass-action-btn secondary"
                      disabled={!roomInput.trim()}
                      onClick={() => handleJoinCall(roomInput)}
                    >
                      Join
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // RENDER: ROLE SELECTION SCREEN
  // ----------------------------------------------------
  if (!userRole) {
    return (
      <div className="glass-ambient-backdrop">
        <div className="glass-lobby-shell" style={{ maxWidth: '600px' }}>
          <header className="glass-lobby-header">
            <button onClick={handleEndCall} className="glass-back-btn">
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
            <div className="glass-lobby-brand">
              <div className="logo-badge">SL</div>
              <span>SignLink</span>
            </div>
            <button 
              className="theme-toggle-pill-btn" 
              onClick={onToggleTheme} 
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} theme`}
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
          </header>

          <main className="glass-lobby-main">
            <div className="glass-lobby-card">
              <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>Select Your Role</h2>
              <p className="glass-lobby-desc" style={{ textAlign: 'center', marginBottom: '30px' }}>
                Please select your role before joining the call. The layout will adapt automatically.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <button
                  className="glass-action-btn primary"
                  style={{ height: '60px', fontSize: '18px', width: '100%', display: 'flex', justifyContent: 'center' }}
                  onClick={() => setUserRole('hearing')}
                >
                  <Mic size={24} style={{ marginRight: '10px' }} />
                  Normal / Hearing Person
                </button>

                <button
                  className="glass-action-btn primary"
                  style={{ height: '60px', fontSize: '18px', width: '100%', display: 'flex', justifyContent: 'center', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
                  onClick={() => setUserRole('deaf')}
                >
                  <MessageSquare size={24} style={{ marginRight: '10px' }} />
                  Deaf / Hard-of-Hearing Person
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // RENDER: ACTIVE IN-CALL SCREEN (Clean & Focused)
  // ----------------------------------------------------
  return (
    <div className="glass-ambient-backdrop">
      {/* Toast Notification */}
      {notificationToast && (
        <div className="glass-toast-banner">
          <span>{notificationToast}</span>
        </div>
      )}

      <div className="glass-call-shell">
        {/* 1. Left Vertical Navigation Rail */}
        <aside className="glass-nav-rail">
          <div className="rail-top">
            <div className="logo-badge" title="SignLink" onClick={onBack}>
              SL
            </div>
          </div>

          <div className="rail-nav-group">
            <button
              className="rail-icon-btn active-pill"
              onClick={() => setLayoutMode('hero')}
              title="Video Stage"
            >
              <Video size={18} />
            </button>
            <button
              className={`rail-icon-btn ${isParticipantsOpen ? 'active-pill' : ''}`}
              onClick={() => setIsParticipantsOpen(!isParticipantsOpen)}
              title="Participants"
            >
              <Users size={18} />
            </button>
          </div>

          <div className="rail-bottom">
            <button
              className={`rail-icon-btn ${isSettingsOpen ? 'active-pill' : ''}`}
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              title="Settings"
            >
              <Settings size={18} />
            </button>
            <button
              className="rail-icon-btn danger"
              onClick={handleEndCall}
              title="Leave Call"
            >
              <PhoneOff size={18} />
            </button>
          </div>
        </aside>

        {/* 2. Main Call Workspace */}
        <div className="glass-call-body">
          {/* Main Video Section */}
          <section className="glass-video-section">
            {/* Top Meeting Header */}
            <header className="glass-call-header">
              <div className="header-title-group">
                <button onClick={onBack} className="header-back-arrow" title="Back to Home">
                  <ArrowLeft size={16} />
                </button>
                <div className="header-text-block">
                  <h1 className="header-meeting-title">Video Call</h1>
                  <span className="header-meeting-sub">
                    {roomId} • {formatDuration(callDuration)}
                  </span>
                </div>
                <div className="room-copy-pill" onClick={copyRoomLink} title="Copy Room Link">
                  <span>{roomId}</span>
                  {copiedLink ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                </div>
              </div>

              <div className="header-tools-group">
                {/* Theme Mode Toggle */}
                <button
                  className="glass-tool-btn"
                  onClick={onToggleTheme}
                  title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} theme`}
                >
                  {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                </button>

                {/* Grid vs Hero Layout Toggle */}
                <button
                  className={`glass-tool-btn ${layoutMode === 'grid' ? 'active' : ''}`}
                  onClick={() => {
                    const nextMode = layoutMode === 'hero' ? 'grid' : 'hero';
                    setLayoutMode(nextMode);
                    showToast(nextMode === 'grid' ? 'Grid view' : 'Focus view');
                  }}
                  title={layoutMode === 'hero' ? 'Switch to Grid View' : 'Switch to Focus View'}
                >
                  <Grid size={15} />
                </button>

                {/* Audio/Video Settings */}
                <button
                  className={`glass-tool-btn ${isSettingsOpen ? 'active' : ''}`}
                  onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                  title="Settings"
                >
                  <Sliders size={15} />
                </button>
              </div>
            </header>

            {/* Layout Toggles (Show hidden windows) */}
            <div style={{ position: 'absolute', top: 80, right: 20, zIndex: 100, display: 'flex', gap: '10px' }}>
              {userRole === 'hearing' && (
                <>
                  {!showLocalVideo && <button className="glass-action-btn primary" onClick={() => setShowLocalVideo(true)}>Show Self</button>}
                  {!showSignText && <button className="glass-action-btn primary" onClick={() => setShowSignText(true)}>Show Text</button>}
                </>
              )}
              {userRole === 'deaf' && (
                <>
                  {!showLocalVideo && <button className="glass-action-btn primary" onClick={() => setShowLocalVideo(true)}>Show Self</button>}
                  
                </>
              )}
            </div>
            {/* WEBRTC DEBUG PANEL (Development Only) */}
            {debugInfo && (
              <div style={{
                position: 'absolute', top: '70px', left: '20px', zIndex: 9999,
                background: 'rgba(0,0,0,0.8)', border: '1px solid red', color: '#0f0',
                padding: '10px', fontSize: '12px', fontFamily: 'monospace', borderRadius: '8px',
                maxWidth: '400px', wordWrap: 'break-word', maxHeight: '70vh', overflowY: 'auto'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <b style={{ color: 'red' }}>WEBRTC DEBUG</b>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
                      showToast('Debug log copied!');
                    }}
                    style={{ background: 'white', color: 'black', border: 'none', padding: '2px 6px', cursor: 'pointer', fontSize: '10px' }}
                  >
                    COPY LOG
                  </button>
                </div>
                <div><b>ROLE:</b> {debugInfo.role}</div>
                <div><b>SigConns:</b> {debugInfo.sigConns}</div>
                <div><b>Peer ID:</b> {debugInfo.peerId}</div>
                <div><b>PC State:</b> {debugInfo.pcState}</div>
                <div><b>Signaling:</b> {debugInfo.signalingState}</div>
                <div><b>ICE State:</b> {debugInfo.iceState}</div>
                <div><b>Local Video:</b> {debugInfo.localVideo}</div>
                <div><b>Local Audio:</b> {debugInfo.localAudio}</div>
                <div><b>Remote Video:</b> {debugInfo.remoteVideo}</div>
                <div><b>Remote Audio:</b> {debugInfo.remoteAudio}</div>
                <div><b>Remote Stream:</b> {debugInfo.remoteStreamExists}</div>
                <div><b>srcObject:</b> {debugInfo.remoteSrcObjectExists}</div>
                <div><b>video.readyState:</b> {debugInfo.remoteVideoReadyState}</div>
                <div><b>video.paused:</b> {debugInfo.remoteVideoPaused}</div>
                <div><b>Dimensions:</b> {debugInfo.remoteDimensions}</div>
                <div style={{ marginTop: '4px' }}><b>Last ontrack:</b><br/>{debugInfo.lastOntrack}</div>
                <div style={{ marginTop: '4px' }}><b>Last error:</b><br/>{debugInfo.lastError}</div>
              </div>
            )}

            {/* Video Stage Layout */}
            <div className="glass-stage-content" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#000' }}>
              
              {/* MAIN AREA (Depends on role) */}
              <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: userRole === 'deaf' ? 'flex' : 'block' }}>
                {userRole === 'deaf' ? (
                  <>
                    <div style={{ flex: 1, position: 'relative', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                      <video
                        ref={handleRemoteVideoRef}
                        autoPlay
                        playsInline
                        muted={true}
                        onLoadedMetadata={(e) => console.log('[WEBRTC DEBUG] Deaf remote video loadedmetadata:', e.target.videoWidth, 'x', e.target.videoHeight)}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      
                      {/* Placeholder when remote camera is off or waiting for peer */}
                      {(!remoteCamActive || connectionStatus !== 'connected') && (
                        <div className="hero-placeholder-overlay" style={{position: 'absolute', inset:0, zIndex: 11}}>
                          <div className="waiting-placeholder-box">
                            <div className="waiting-avatar-circle">
                              <User size={36} />
                            </div>
                            <h3>{connectionStatus === 'connected' ? 'Remote camera is off' : 'Waiting for participant'}</h3>
                            {connectionStatus !== 'connected' && (
                              <>
                                <p>Share this room code with your partner:</p>
                                <div className="room-copy-pill big" onClick={copyRoomLink}>
                                  <span>{roomId}</span>
                                  {copiedLink ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Top-Left Participant Name Badge */}
                      <div className="hero-name-badge" style={{ position: 'absolute', top: 20, left: 20, zIndex: 12 }}>
                        <span>{connectionStatus === 'connected' ? 'Remote Participant' : 'Waiting...'}</span>
                        {!remoteMicActive && connectionStatus === 'connected' && (
                          <MicOff size={13} color="#dc2626" />
                        )}
                      </div>
                    </div>
                    <div style={{ flex: 1, position: 'relative', background: 'transparent' }}>
                      <IslAvatarViewer ref={avatarRef} activeSign={remoteSpeechText || 'HELLO'} />
                    </div>
                  </>
                ) : (
                  <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                    <video
                      ref={handleRemoteVideoRef}
                      autoPlay
                      playsInline
                      muted={true}
                      onLoadedMetadata={(e) => console.log('[WEBRTC DEBUG] Hearing remote video loadedmetadata:', e.target.videoWidth, 'x', e.target.videoHeight)}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    
                    {/* Placeholder when remote camera is off or waiting for peer */}
                    {(!remoteCamActive || connectionStatus !== 'connected') && (
                      <div className="hero-placeholder-overlay" style={{position: 'absolute', inset:0, zIndex: 11}}>
                        <div className="waiting-placeholder-box">
                          <div className="waiting-avatar-circle">
                            <User size={36} />
                          </div>
                          <h3>{connectionStatus === 'connected' ? 'Remote camera is off' : 'Waiting for participant'}</h3>
                          {connectionStatus !== 'connected' && (
                            <>
                              <p>Share this room code with your partner:</p>
                              <div className="room-copy-pill big" onClick={copyRoomLink}>
                                <span>{roomId}</span>
                                {copiedLink ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Top-Left Participant Name Badge */}
                    <div className="hero-name-badge" style={{ position: 'absolute', top: 20, left: 20, zIndex: 12 }}>
                      <span>{connectionStatus === 'connected' ? 'Remote Participant' : 'Waiting...'}</span>
                      {!remoteMicActive && connectionStatus === 'connected' && (
                        <MicOff size={13} color="#dc2626" />
                      )}
                    </div>
                  </div>
                )}

                {/* EXACT REFERENCE LEVEL GLASSMORPHIC CONTROL CAPSULE */}
                <div className="floating-control-capsule" style={{ zIndex: 100 }}>
                  {/* Mic Toggle (Circular Glass Disc) */}
                  <button
                    className={`capsule-glass-circle ${!micActive ? 'disabled' : ''}`}
                    onClick={toggleMic}
                    title={micActive ? 'Mute microphone' : 'Unmute microphone'}
                  >
                    {micActive ? (
                      <Mic size={18} strokeWidth={2.2} />
                    ) : (
                      <MicOff size={18} strokeWidth={2.2} color="#ffffff" />
                    )}
                  </button>

                  {/* Video Toggle (Circular Glass Disc) */}
                  <button
                    className={`capsule-glass-circle ${!camActive ? 'disabled' : ''}`}
                    onClick={toggleCam}
                    title={camActive ? 'Turn off camera' : 'Turn on camera'}
                  >
                    {camActive ? (
                      <Video size={18} strokeWidth={2.2} />
                    ) : (
                      <VideoOff size={18} strokeWidth={2.2} color="#ffffff" />
                    )}
                  </button>

                  {/* Full Screen (Circular Glass Disc) */}
                  <button
                    className={`capsule-glass-circle ${isFullScreen ? 'active-share' : ''}`}
                    onClick={toggleFullScreen}
                    title={isFullScreen ? 'Exit full screen' : 'Full screen'}
                  >
                    {isFullScreen ? (
                      <Minimize size={18} strokeWidth={2.2} />
                    ) : (
                      <Maximize size={18} strokeWidth={2.2} />
                    )}
                  </button>

                  {/* End Call Button (Solid Crimson Red Disc) */}
                  <button
                    className="capsule-end-call-btn"
                    onClick={handleEndCall}
                    title="Leave call"
                  >
                    <PhoneOff size={20} strokeWidth={2.4} color="#ffffff" />
                  </button>
                </div>
              </div>

              {/* HEARING LAYOUT FLOATING WINDOWS */}
              {userRole === 'hearing' && (
                <>


                  <DraggableWindow 
                    title="My Video" 
                    defaultRect={{ x: window.innerWidth - 300, y: window.innerHeight - 200, width: 250, height: 180 }}
                    isVisible={showLocalVideo}
                    onClose={() => setShowLocalVideo(false)}
                  >
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className={mirrorVideo ? 'mirror' : ''}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    {!camActive && (
                      <div className="cam-off-overlay" style={{position: 'absolute', inset:0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000'}}>
                        <User size={40} color="#64748b" />
                      </div>
                    )}
                  </DraggableWindow>

                  <DraggableWindow 
                    title="Recognized Sign Text" 
                    defaultRect={{ x: window.innerWidth - 320, y: 20, width: 300, height: 100 }}
                    isVisible={showSignText}
                    onClose={() => setShowSignText(false)}
                  >
                    <div style={{ padding: '20px', fontSize: '24px', color: 'white', textAlign: 'center', background: 'rgba(0,0,0,0.5)', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {remoteSignText || 'Waiting for sign...'}
                    </div>
                  </DraggableWindow>

                  <DraggableWindow 
                    title="My Live Speech" 
                    defaultRect={{ x: window.innerWidth - 320, y: 140, width: 300, height: 100 }}
                    isVisible={showSignText}
                  >
                    <div style={{ padding: '15px', fontSize: '16px', color: '#a78bfa', textAlign: 'center', background: 'rgba(0,0,0,0.5)', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      <span style={{ fontSize: '12px', color: speechStatus.includes('Error') ? '#ef4444' : '#94a3b8', marginBottom: '4px' }}>
                        {speechStatus}
                      </span>
                      <i style={{ wordBreak: 'break-word', overflowY: 'auto' }}>
                        {liveSpeechHistory ? `"${liveSpeechHistory} ${liveSpeechText}"` : `"${liveSpeechText || 'Say a supported word (e.g. Home, Come, Go)'}"`}
                      </i>
                    </div>
                  </DraggableWindow>
                </>
              )}

              {/* DEAF LAYOUT FLOATING WINDOWS */}
              {userRole === 'deaf' && (
                <>


                  <DraggableWindow 
                    title="My Video & Sign Recognition" 
                    defaultRect={{ x: 20, y: window.innerHeight - 200, width: 250, height: 180 }}
                    isVisible={showLocalVideo}
                    onClose={() => setShowLocalVideo(false)}
                  >
                    <DeafVideoSignRecognizer 
                      mediaStream={localStreamRef.current}
                      hideControls={true}
                      onSignRecognized={(word) => {
                        if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
                          dataChannelRef.current.send(JSON.stringify({ type: 'sign', word }));
                        }
                      }}
                      isCameraActive={camActive}
                      ttsEnabled={false} // TTS happens on remote side
                    />
                  </DraggableWindow>
                </>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* ===================================================
          FUNCTIONAL MODALS
          =================================================== */}

      {/* 1. Settings Modal */}
      {isSettingsOpen && (
        <div className="glass-modal-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="glass-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Call Settings</h3>
              <button className="modal-close-btn" onClick={() => setIsSettingsOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="setting-row">
                <div>
                  <div className="setting-label">Interface Theme</div>
                  <div className="setting-desc">Switch between Dark (Plain Black) and Light</div>
                </div>
                <button
                  className="theme-toggle-pill-btn"
                  onClick={onToggleTheme}
                  title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} theme`}
                >
                  {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                  <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                </button>
              </div>

              <div className="setting-row">
                <div>
                  <div className="setting-label">Microphone Noise Suppression</div>
                  <div className="setting-desc">Filter ambient background noise</div>
                </div>
                <input
                  type="checkbox"
                  checked={noiseSuppression}
                  onChange={(e) => {
                    setNoiseSuppression(e.target.checked);
                    showToast(e.target.checked ? 'Noise suppression enabled' : 'Noise suppression disabled');
                  }}
                  className="glass-toggle-switch"
                />
              </div>

              <div className="setting-row">
                <div>
                  <div className="setting-label">Mirror Self-View</div>
                  <div className="setting-desc">Flip local video horizontally</div>
                </div>
                <input
                  type="checkbox"
                  checked={mirrorVideo}
                  onChange={(e) => setMirrorVideo(e.target.checked)}
                  className="glass-toggle-switch"
                />
              </div>

              <div className="setting-row column">
                <div className="setting-label">Speaker Output Volume: {audioVolume}%</div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={audioVolume}
                  onChange={(e) => setAudioVolume(e.target.value)}
                  className="glass-range-slider"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Participants Modal */}
      {isParticipantsOpen && (
        <div className="glass-modal-overlay" onClick={() => setIsParticipantsOpen(false)}>
          <div className="glass-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Participants</h3>
              <button className="modal-close-btn" onClick={() => setIsParticipantsOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="participant-roster-item">
                <div className="roster-avatar-fallback">You</div>
                <div className="roster-info">
                  <div className="roster-name">You</div>
                  <div className="roster-role">Local Participant</div>
                </div>
                <span className="roster-mic-status">
                  {micActive ? <Mic size={14} color="#16a34a" /> : <MicOff size={14} color="#dc2626" />}
                </span>
              </div>

              <div className="participant-roster-item">
                <div className="roster-avatar-fallback">Peer</div>
                <div className="roster-info">
                  <div className="roster-name">
                    {remotePeerId ? 'Remote Participant' : 'Waiting for participant...'}
                  </div>
                  <div className="roster-role">
                    {connectionStatus === 'connected' ? 'Connected' : 'Waiting'}
                  </div>
                </div>
                <span className="roster-mic-status">
                  {remoteMicActive ? <Mic size={14} color="#16a34a" /> : <MicOff size={14} color="#dc2626" />}
                </span>
              </div>

              <button className="modal-full-btn" onClick={copyRoomLink}>
                <Copy size={15} />
                <span>Copy Room Link to Invite</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
