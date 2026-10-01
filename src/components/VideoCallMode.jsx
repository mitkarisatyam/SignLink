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
  Share2,
  Send,
  MessageSquare,
  X,
  Sun,
  Moon,
  User
} from 'lucide-react';
import { SignalingService } from '../utils/signalingService';
import './VideoCallMode.css';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// Generates an intuitive room code like 'call-784-219'
function generateRoomCode() {
  const num1 = Math.floor(100 + Math.random() * 900);
  const num2 = Math.floor(100 + Math.random() * 900);
  return `call-${num1}-${num2}`;
}

export default function VideoCallMode({ initialRoomId = '', onBack, theme = 'dark', onToggleTheme }) {
  // Room & View state
  const [roomId, setRoomId] = useState(initialRoomId || '');
  const [inCall, setInCall] = useState(Boolean(initialRoomId));
  const [roomInput, setRoomInput] = useState(initialRoomId || '');
  const [copiedLink, setCopiedLink] = useState(false);
  const [layoutMode, setLayoutMode] = useState('hero'); // 'hero' | 'grid'
  const [pinnedParticipant, setPinnedParticipant] = useState('remote'); // 'remote' | 'local'

  // Modals & Panels
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [notificationToast, setNotificationToast] = useState(null);

  // Peer & WebRTC state
  const [peerId] = useState(() => 'peer_' + Math.random().toString(36).slice(2, 9));
  const [remotePeerId, setRemotePeerId] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('waiting'); // 'waiting' | 'connecting' | 'connected' | 'disconnected'
  
  // Media controls
  const [micActive, setMicActive] = useState(true);
  const [camActive, setCamActive] = useState(true);
  const [remoteMicActive, setRemoteMicActive] = useState(true);
  const [remoteCamActive, setRemoteCamActive] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // Settings preferences
  const [mirrorVideo, setMirrorVideo] = useState(true);
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [audioVolume, setAudioVolume] = useState(85);

  // Call timer
  const [callDuration, setCallDuration] = useState(0);

  // Real Chat messages
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');

  // Refs
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const pcRef = useRef(null);
  const signalingRef = useRef(null);
  const dataChannelRef = useRef(null);
  const iceCandidateQueueRef = useRef([]);
  const toastTimeoutRef = useRef(null);
  const chatBottomRef = useRef(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  // Setup WebRTC DataChannel for Real-Time Chat
  const setupDataChannel = useCallback((channel) => {
    dataChannelRef.current = channel;

    channel.onopen = () => {
      console.log('[WEBRTC] Data channel opened');
    };

    channel.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'chat') {
          setMessages((prev) => [
            ...prev,
            {
              id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
              sender: 'other',
              author: payload.author || 'Remote',
              text: payload.text,
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
          ]);
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
      console.log('[WEBRTC] Remote track received:', event.track.kind);
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
        setConnectionStatus('connected');
        showToast('Participant connected');
      }
    };

    // Handle ICE Candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && signalingRef.current) {
        signalingRef.current.send(
          { type: 'candidate', candidate: event.candidate },
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

      signalingRef.current?.send(
        { type: 'offer', sdp: pc.localDescription },
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

      await pc.setRemoteDescription(new RTCSessionDescription(offerSdp));

      // Flush queued candidates
      while (iceCandidateQueueRef.current.length > 0) {
        const c = iceCandidateQueueRef.current.shift();
        await pc.addIceCandidate(new RTCIceCandidate(c));
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      signalingRef.current?.send(
        { type: 'answer', sdp: pc.localDescription },
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
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(answerSdp));
        while (iceCandidateQueueRef.current.length > 0) {
          const c = iceCandidateQueueRef.current.shift();
          await pcRef.current.addIceCandidate(new RTCIceCandidate(c));
        }
      }
    } catch (err) {
      console.error('[WEBRTC] Failed to handle answer:', err);
    }
  }, []);

  // Handle incoming ICE Candidate
  const handleCandidate = useCallback(async (senderId, candidate) => {
    try {
      if (pcRef.current && pcRef.current.remoteDescription && pcRef.current.remoteDescription.type) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        iceCandidateQueueRef.current.push(candidate);
      }
    } catch (err) {
      console.error('[WEBRTC] Failed to add ICE candidate:', err);
    }
  }, []);

  // Handle Join Call
  const handleJoinCall = useCallback(async (targetRoom) => {
    if (!targetRoom.trim()) return;
    const cleanRoom = targetRoom.trim();
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

  // Toggle Screen Sharing
  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      if (localStreamRef.current && pcRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        const senders = pcRef.current.getSenders();
        const sender = senders.find((s) => s.track && s.track.kind === 'video');
        if (sender && videoTrack) {
          sender.replaceTrack(videoTrack);
        }
      }
      setIsScreenSharing(false);
      showToast('Screen sharing stopped');
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true
        });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];

        if (pcRef.current) {
          const senders = pcRef.current.getSenders();
          const sender = senders.find((s) => s.track && s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
          }
        }

        screenTrack.onended = () => {
          toggleScreenShare();
        };

        setIsScreenSharing(true);
        showToast('Screen sharing started');
      } catch (err) {
        console.warn('[SCREEN] Sharing cancelled or failed:', err);
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

  // Send Chat Message
  const handleSendMessage = (e) => {
    e?.preventDefault();
    if (!chatInput.trim()) return;

    const newMsg = {
      id: 'msg_' + Date.now(),
      sender: 'me',
      author: 'You',
      text: chatInput.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, newMsg]);

    // Send via Data Channel
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      dataChannelRef.current.send(
        JSON.stringify({
          type: 'chat',
          text: chatInput.trim(),
          author: 'Peer'
        })
      );
    }

    setChatInput('');
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
            <button
              className={`rail-icon-btn ${isChatOpen ? 'active-pill' : ''}`}
              onClick={() => setIsChatOpen(!isChatOpen)}
              title={isChatOpen ? 'Hide Chat' : 'Show Chat'}
            >
              <MessageSquare size={18} />
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

            {/* Video Stage Layout */}
            <div className={`glass-stage-content ${layoutMode === 'grid' ? 'mode-grid' : 'mode-hero'}`}>
              {/* Primary Video Card (Remote Participant) */}
              <div 
                className={`hero-video-card ${pinnedParticipant === 'remote' ? 'pinned' : ''}`}
                onClick={() => setPinnedParticipant('remote')}
              >
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className={`hero-video-element ${!remoteCamActive ? 'hidden' : ''}`}
                />

                {/* Placeholder when remote camera is off or waiting for peer */}
                {(!remoteCamActive || connectionStatus !== 'connected') && (
                  <div className="hero-placeholder-overlay">
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
                <div className="hero-name-badge">
                  <span>{connectionStatus === 'connected' ? 'Remote Participant' : 'Waiting...'}</span>
                  {!remoteMicActive && connectionStatus === 'connected' && (
                    <MicOff size={13} color="#dc2626" />
                  )}
                </div>

                {/* EXACT REFERENCE LEVEL GLASSMORPHIC CONTROL CAPSULE */}
                <div className="floating-control-capsule">
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

                  {/* Screen Share (Circular Glass Disc) */}
                  <button
                    className={`capsule-glass-circle ${isScreenSharing ? 'active-share' : ''}`}
                    onClick={toggleScreenShare}
                    title={isScreenSharing ? 'Stop sharing screen' : 'Share screen'}
                  >
                    <Share2 size={18} strokeWidth={2.2} />
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

              {/* Local Participant Tile (Self-View) */}
              <div 
                className={`self-video-tile ${pinnedParticipant === 'local' ? 'pinned' : ''}`}
                onClick={() => setPinnedParticipant(pinnedParticipant === 'local' ? 'remote' : 'local')}
                title="Click to toggle focus"
              >
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`sub-video-element ${mirrorVideo ? 'mirror' : ''} ${!camActive ? 'hidden' : ''}`}
                />
                {!camActive && (
                  <div className="sub-placeholder-static">
                    <User size={28} />
                    <span>Camera off</span>
                  </div>
                )}
                <div className="sub-name-overlay">
                  <span>You</span>
                  {!micActive && <MicOff size={12} color="#dc2626" />}
                </div>
              </div>
            </div>
          </section>

          {/* 3. Right Sidebar: Real Chat Room */}
          {isChatOpen && (
            <aside className="glass-chat-sidebar">
              <header className="chat-sidebar-header">
                <h2>Chat</h2>
                <button
                  className="modal-close-btn"
                  onClick={() => setIsChatOpen(false)}
                  title="Close Chat"
                >
                  <X size={16} />
                </button>
              </header>

              {/* Message Stream */}
              <div className="chat-messages-container">
                {messages.length === 0 ? (
                  <div className="chat-empty-state">
                    <MessageSquare size={28} />
                    <p>No messages yet. Send a message to chat with your partner.</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMe = msg.sender === 'me';
                    return (
                      <div key={msg.id} className={`chat-message-row ${isMe ? 'msg-me' : 'msg-other'}`}>
                        <div className="msg-content-block">
                          <span className="msg-sender-label">{msg.author}</span>
                          <div className={`msg-bubble ${isMe ? 'bubble-blue' : 'bubble-slate'}`}>
                            <p>{msg.text}</p>
                          </div>
                          <span className="msg-time">{msg.time}</span>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Bottom Input Capsule */}
              <form className="chat-input-form" onSubmit={handleSendMessage}>
                <div className="chat-input-capsule">
                  <input
                    type="text"
                    placeholder="Type a message..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="input-send-circle"
                    disabled={!chatInput.trim()}
                    title="Send message"
                  >
                    <Send size={15} color="#ffffff" />
                  </button>
                </div>
              </form>
            </aside>
          )}
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
