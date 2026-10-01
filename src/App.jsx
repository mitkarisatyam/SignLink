import React, { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import DemoMode from './components/DemoMode';
import VideoCallMode from './components/VideoCallMode';
import './App.css';

function App() {
  const [currentMode, setCurrentMode] = useState('landing'); // 'landing' | 'call' | 'demo'
  const [initialRoomId, setInitialRoomId] = useState('');
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('signlink_theme') || 'dark';
    } catch {
      return 'dark';
    }
  });

  // Keep DOM data-theme attribute and localStorage in sync
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('signlink_theme', theme);
    } catch {}
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Check URL parameters on mount
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const room = params.get('room');
      const mode = params.get('mode');

      if (room) {
        setInitialRoomId(room);
        setCurrentMode('call');
      } else if (mode === 'demo') {
        setCurrentMode('demo');
      } else if (mode === 'call') {
        setCurrentMode('call');
      }
    } catch {}
  }, []);

  const handleSelectMode = (mode, roomId = '') => {
    setInitialRoomId(roomId);
    setCurrentMode(mode);
    try {
      const url = new URL(window.location.href);
      if (mode === 'landing') {
        url.search = '';
      } else if (mode === 'call' && roomId) {
        url.searchParams.set('room', roomId);
      } else if (mode === 'demo') {
        url.searchParams.set('mode', 'demo');
      } else if (mode === 'call') {
        url.searchParams.set('mode', 'call');
      }
      window.history.pushState({}, '', url.toString());
    } catch {}
  };

  const handleBackToLanding = () => {
    handleSelectMode('landing');
  };

  if (currentMode === 'call') {
    return (
      <VideoCallMode
        initialRoomId={initialRoomId}
        onBack={handleBackToLanding}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  if (currentMode === 'demo') {
    return (
      <DemoMode
        onBack={handleBackToLanding}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  return (
    <LandingPage
      onSelectMode={(mode) => handleSelectMode(mode)}
      theme={theme}
      onToggleTheme={toggleTheme}
    />
  );
}

export default App;
