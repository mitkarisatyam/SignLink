import React, { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';

export default function UpcomingSignModal({ word, onClose }) {
  const [timeLeft, setTimeLeft] = useState(3);
  const [isPaused, setIsPaused] = useState(false);

  // Auto-dismiss countdown
  useEffect(() => {
    if (isPaused) return;
    if (timeLeft <= 0) {
      onClose();
      return;
    }
    const timer = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft, isPaused, onClose]);

  const upperWord = (word || 'NEW SIGN').toUpperCase();
  const progressPercent = ((3 - timeLeft) / 3) * 100;

  return (
    <div
      className="future-word-toast-container"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="future-word-toast-content">
        <Sparkles size={16} color="#38bdf8" className="toast-icon" />
        <div className="toast-text">
          We will add the word <strong style={{ color: '#38bdf8' }}>"{upperWord}"</strong> in the future.
        </div>
        <button className="toast-close-btn" onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>
      </div>
      <div className="toast-progress-track">
        <div 
          className="toast-progress-bar" 
          style={{ width: `${progressPercent}%`, transition: 'width 1s linear' }} 
        />
      </div>
    </div>
  );
}

