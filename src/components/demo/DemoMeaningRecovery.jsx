import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, XCircle, RotateCcw, AlertTriangle, MessageSquare, Volume2, Edit3, Trash2, Undo2 } from 'lucide-react';
import { SUPPORTED_SIGNS } from '../IslAvatarViewer';

export default function DemoMeaningRecovery({ onBack }) {
  const [currentPrediction, setCurrentPrediction] = useState(null);
  const [confirmedTranscript, setConfirmedTranscript] = useState([]);
  const [isCorrecting, setIsCorrecting] = useState(false);

  // Manual Test Input States
  const [testWord, setTestWord] = useState('HOME');
  const [testConfidence, setTestConfidence] = useState(95);

  const handleSimulatePrediction = () => {
    setIsCorrecting(false);
    
    // Create a mock prediction payload matching what the classifier would output
    const mockPrediction = {
      word: testWord,
      confidence: Number(testConfidence),
      rule: 'MANUAL_TEST_INPUT',
      timestamp: Date.now()
    };
    
    setCurrentPrediction(mockPrediction);
  };

  const handleConfirm = () => {
    if (currentPrediction) {
      setConfirmedTranscript(prev => [...prev, currentPrediction.word]);
      speakWord(currentPrediction.word);
      setCurrentPrediction(null);
      setIsCorrecting(false);
    }
  };

  const handleCorrect = (selectedWord) => {
    setConfirmedTranscript(prev => [...prev, selectedWord]);
    speakWord(selectedWord);
    setCurrentPrediction(null);
    setIsCorrecting(false);
  };

  const handleClear = () => {
    setCurrentPrediction(null);
    setIsCorrecting(false);
  };

  const handleUndo = () => {
    setConfirmedTranscript(prev => prev.slice(0, -1));
  };

  const speakWord = (word) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word.toLowerCase());
    window.speechSynthesis.speak(utterance);
  };

  const speakFullTranscript = () => {
    if (confirmedTranscript.length > 0) {
      speakWord(confirmedTranscript.join(' '));
    }
  };

  const isUncertain = currentPrediction && currentPrediction.confidence < 85;

  return (
    <div style={{ padding: '24px', color: '#e8eaed', minHeight: '100vh', backgroundColor: '#202124' }}>
      <header style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: '#8ab4f8', display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '16px' }}
        >
          <ArrowLeft size={20} style={{ marginRight: '8px' }} />
          Back to Demo Home
        </button>
        <h1 style={{ marginLeft: 'auto', fontSize: '20px', color: '#fff' }}>Meaning Recovery</h1>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '24px', maxWidth: '1100px', margin: '0 auto' }}>
        
        {/* Left Column: UI & Workflow */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Transcript Box */}
          <div style={{ background: '#292a2d', borderRadius: '12px', padding: '24px', border: '1px solid #3c4043', minHeight: '200px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '16px', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MessageSquare size={18} color="#8ab4f8" />
                Confirmed Transcript
              </h2>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleUndo}
                  disabled={confirmedTranscript.length === 0}
                  style={{ background: 'transparent', border: '1px solid #5f6368', color: confirmedTranscript.length > 0 ? '#fff' : '#5f6368', padding: '6px 12px', borderRadius: '6px', cursor: confirmedTranscript.length > 0 ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
                >
                  <Undo2 size={14} /> Undo Last
                </button>
                <button
                  onClick={speakFullTranscript}
                  disabled={confirmedTranscript.length === 0}
                  style={{ background: '#8ab4f8', border: 'none', color: '#202124', padding: '6px 12px', borderRadius: '6px', cursor: confirmedTranscript.length > 0 ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}
                >
                  <Volume2 size={14} /> Speak All
                </button>
              </div>
            </div>
            
            <div style={{ flex: 1, background: '#202124', borderRadius: '8px', padding: '16px', fontSize: '24px', border: '1px solid #3c4043' }}>
              {confirmedTranscript.length > 0 ? (
                <span>{confirmedTranscript.join(' ')}</span>
              ) : (
                <span style={{ color: '#5f6368' }}>No words confirmed yet.</span>
              )}
            </div>
          </div>

          {/* Current Prediction Review */}
          <div style={{ background: '#292a2d', borderRadius: '12px', padding: '24px', border: '1px solid #3c4043' }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#fff' }}>Pending Recognition</h2>
            
            {!currentPrediction ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#9aa0a6' }}>
                Waiting for sign prediction...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderRadius: '8px', border: `1px solid ${isUncertain ? '#fdd663' : '#81c995'}`, background: isUncertain ? 'rgba(253, 214, 99, 0.1)' : 'rgba(129, 201, 149, 0.1)' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#9aa0a6', textTransform: 'uppercase', marginBottom: '4px' }}>Predicted Word</div>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#fff' }}>{currentPrediction.word}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '12px', color: '#9aa0a6', textTransform: 'uppercase', marginBottom: '4px' }}>Confidence Score</div>
                    <div style={{ fontSize: '24px', color: isUncertain ? '#fdd663' : '#81c995', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {isUncertain ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
                      {currentPrediction.confidence}%
                    </div>
                  </div>
                </div>

                {isUncertain && (
                  <div style={{ color: '#fdd663', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle size={16} />
                    <span>Prediction is uncertain. Please confirm, correct, or repeat the sign.</span>
                  </div>
                )}

                {!isCorrecting ? (
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      onClick={handleConfirm}
                      style={{ flex: 1, background: '#81c995', color: '#202124', border: 'none', padding: '12px', borderRadius: '8px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                    >
                      <CheckCircle2 size={18} /> Confirm
                    </button>
                    <button
                      onClick={() => setIsCorrecting(true)}
                      style={{ flex: 1, background: '#3c4043', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                    >
                      <Edit3 size={18} /> Correct
                    </button>
                    <button
                      onClick={handleClear}
                      style={{ flex: 1, background: 'transparent', color: '#ea4335', border: '1px solid #ea4335', padding: '12px', borderRadius: '8px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                    >
                      <RotateCcw size={18} /> Repeat Sign
                    </button>
                  </div>
                ) : (
                  <div style={{ background: '#303134', padding: '16px', borderRadius: '8px', border: '1px solid #5f6368' }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#e8eaed' }}>Select Correct Word:</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {SUPPORTED_SIGNS.map(sign => (
                        <button
                          key={sign.id}
                          onClick={() => handleCorrect(sign.id)}
                          style={{ background: '#202124', border: '1px solid #8ab4f8', color: '#8ab4f8', padding: '8px 16px', borderRadius: '20px', cursor: 'pointer', fontSize: '14px' }}
                        >
                          {sign.label}
                        </button>
                      ))}
                    </div>
                    <div style={{ marginTop: '16px', textAlign: 'right' }}>
                      <button
                        onClick={() => setIsCorrecting(false)}
                        style={{ background: 'transparent', color: '#9aa0a6', border: 'none', cursor: 'pointer', fontSize: '14px' }}
                      >
                        Cancel Correction
                      </button>
                    </div>
                    <div style={{ marginTop: '12px', fontSize: '12px', color: '#9aa0a6' }}>
                      Note: User corrections are kept in the current session and not automatically added to the training dataset.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Test Harness */}
        <div style={{ background: '#292a2d', borderRadius: '12px', padding: '24px', border: '1px solid #3c4043', height: 'fit-content' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: '#fdd663' }}>
            <AlertTriangle size={18} />
            <h2 style={{ margin: 0, fontSize: '14px', textTransform: 'uppercase' }}>Manual Test Input</h2>
          </div>
          
          <p style={{ fontSize: '13px', color: '#9aa0a6', marginBottom: '20px', lineHeight: 1.5 }}>
            The actual AI classifier is disabled in this interface to allow manual testing of the correction workflow. 
            Use these controls to simulate recognized signs.
          </p>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: '#e8eaed', marginBottom: '8px' }}>Simulate Word:</label>
            <select
              value={testWord}
              onChange={(e) => setTestWord(e.target.value)}
              style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#202124', color: '#fff', border: '1px solid #5f6368' }}
            >
              {SUPPORTED_SIGNS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: '#e8eaed', marginBottom: '8px' }}>
              Simulate Confidence: {testConfidence}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={testConfidence}
              onChange={(e) => setTestConfidence(e.target.value)}
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#9aa0a6', marginTop: '4px' }}>
              <span>Uncertain</span>
              <span>Confident</span>
            </div>
          </div>

          <button
            onClick={handleSimulatePrediction}
            style={{ width: '100%', background: '#8ab4f8', color: '#202124', border: 'none', padding: '12px', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Generate Test Prediction
          </button>
        </div>

      </div>
    </div>
  );
}
