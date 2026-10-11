import React, { useRef, useState, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { Pencil, Eraser, Type, RotateCcw, RotateCw, Trash2, X, Check, MousePointer2 } from 'lucide-react';

const COLORS = ['#ffffff', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#a855f7'];
const SIZES = [2, 5, 10, 20];

const SharedBoard = forwardRef(({ peerId, onSendEvent }, ref) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  
  const [tool, setTool] = useState('pencil'); // 'pencil' | 'eraser' | 'text' | 'move'
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  
  const [textInputVisible, setTextInputVisible] = useState(false);
  const [textInputPos, setTextInputPos] = useState({ x: 0, y: 0 });
  const [textInputValue, setTextInputValue] = useState('');

  // State refs for canvas rendering
  const historyRef = useRef([]);
  const redoStackRef = useRef([]);
  const currentStrokesRef = useRef({}); // { [peerId]: { id, color, size, points: [], isEraser: boolean } }

  const isDrawingRef = useRef(false);
  const currentStrokeIdRef = useRef(null);
  const lastPointRef = useRef(null);

  const drawAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw history
    historyRef.current.forEach(action => {
      if (action.type === 'path') {
        drawPath(ctx, action);
      } else if (action.type === 'text') {
        drawText(ctx, action);
      }
    });

    // Draw active strokes (live)
    Object.values(currentStrokesRef.current).forEach(stroke => {
      drawPath(ctx, stroke);
    });
  }, []);

  const drawPath = (ctx, pathData) => {
    if (!pathData.points || pathData.points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pathData.points[0].x, pathData.points[0].y);
    for (let i = 1; i < pathData.points.length; i++) {
      ctx.lineTo(pathData.points[i].x, pathData.points[i].y);
    }
    ctx.strokeStyle = pathData.isEraser ? '#1a1a24' : pathData.color; // Hack for eraser: draw with background color. Real eraser would use destination-out, but layering gets complex with multiple strokes. Wait, if we use a dark background (#1a1a24), we can just draw that color.
    ctx.lineWidth = pathData.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (pathData.isEraser) {
       ctx.globalCompositeOperation = 'destination-out';
       ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
       ctx.globalCompositeOperation = 'source-over';
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over'; // reset
  };

  const drawText = (ctx, textData) => {
    ctx.font = `${textData.size * 4}px Inter, sans-serif`;
    ctx.fillStyle = textData.color;
    ctx.textBaseline = 'top';
    ctx.fillText(textData.text, textData.x, textData.y);
  };

  useEffect(() => {
    const resizeCanvas = () => {
      if (canvasRef.current && containerRef.current) {
        // We use a fixed internal resolution to keep coordinates simple across devices
        // and CSS to scale it. Let's use 1200x800 internal resolution.
        if (canvasRef.current.width !== 1200) {
           canvasRef.current.width = 1200;
           canvasRef.current.height = 800;
        }
        drawAll();
      }
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [drawAll]);

  useImperativeHandle(ref, () => ({
    processIncomingEvent: (event) => {
      switch (event.type) {
        case 'board_stroke_start':
          currentStrokesRef.current[event.peerId] = {
            id: event.id,
            color: event.color,
            size: event.size,
            isEraser: event.isEraser,
            points: [{ x: event.x, y: event.y }]
          };
          drawAll();
          break;
        case 'board_stroke_move':
          if (currentStrokesRef.current[event.peerId]) {
            currentStrokesRef.current[event.peerId].points.push({ x: event.x, y: event.y });
            drawAll();
          }
          break;
        case 'board_stroke_end':
          if (currentStrokesRef.current[event.peerId]) {
            historyRef.current.push({
              type: 'path',
              peerId: event.peerId,
              ...currentStrokesRef.current[event.peerId]
            });
            delete currentStrokesRef.current[event.peerId];
            redoStackRef.current = []; // Clear redo stack on new action
            drawAll();
          }
          break;
        case 'board_text':
          historyRef.current.push({
            type: 'text',
            id: event.id,
            peerId: event.peerId,
            text: event.text,
            x: event.x,
            y: event.y,
            color: event.color,
            size: event.size
          });
          redoStackRef.current = [];
          drawAll();
          break;
        case 'board_undo':
          const undoIndex = historyRef.current.map(a => a.peerId).lastIndexOf(event.peerId);
          if (undoIndex >= 0) {
            const undoneAction = historyRef.current.splice(undoIndex, 1)[0];
            redoStackRef.current.push(undoneAction);
            drawAll();
          }
          break;
        case 'board_redo':
          const redoIndex = redoStackRef.current.map(a => a.peerId).lastIndexOf(event.peerId);
          if (redoIndex >= 0) {
            const redoneAction = redoStackRef.current.splice(redoIndex, 1)[0];
            historyRef.current.push(redoneAction);
            drawAll();
          }
          break;
        case 'board_clear':
          historyRef.current = [];
          redoStackRef.current = [];
          currentStrokesRef.current = {};
          drawAll();
          break;
        case 'board_state_request':
          // The peer who receives this should send their full state if they have it
          if (historyRef.current.length > 0) {
            onSendEvent({
              type: 'board_state_response',
              history: historyRef.current
            });
          }
          break;
        case 'board_state_response':
          // Only accept state if we are empty (e.g. just reconnected/opened)
          if (historyRef.current.length === 0) {
            historyRef.current = event.history || [];
            drawAll();
          }
          break;
      }
    }
  }));

  // Request state on mount just in case we joined late
  useEffect(() => {
    onSendEvent({ type: 'board_state_request', peerId });
  }, []);

  const getCanvasCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    // Scale coordinates to internal resolution (1200x800)
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const handlePointerDown = (e) => {
    if (tool === 'text') {
      const { x, y } = getCanvasCoordinates(e);
      setTextInputPos({ x, y });
      setTextInputValue('');
      setTextInputVisible(true);
      return;
    }

    if (textInputVisible) {
      setTextInputVisible(false);
    }

    if (tool === 'pencil' || tool === 'eraser') {
      isDrawingRef.current = true;
      const { x, y } = getCanvasCoordinates(e);
      const id = generateId();
      currentStrokeIdRef.current = id;
      lastPointRef.current = { x, y };
      
      const isEraser = tool === 'eraser';
      
      currentStrokesRef.current[peerId] = {
        id,
        color,
        size,
        isEraser,
        points: [{ x, y }]
      };
      
      onSendEvent({
        type: 'board_stroke_start',
        peerId,
        id,
        color,
        size,
        isEraser,
        x,
        y
      });
      drawAll();
    }
  };

  const handlePointerMove = (e) => {
    if (!isDrawingRef.current) return;
    e.preventDefault(); // Prevent scrolling on touch
    
    const { x, y } = getCanvasCoordinates(e);
    
    // Throttle events slightly by distance
    const last = lastPointRef.current;
    const dist = Math.hypot(x - last.x, y - last.y);
    if (dist < 3) return; // Only record if moved a bit
    
    lastPointRef.current = { x, y };
    
    if (currentStrokesRef.current[peerId]) {
      currentStrokesRef.current[peerId].points.push({ x, y });
      drawAll();
      onSendEvent({
        type: 'board_stroke_move',
        peerId,
        id: currentStrokeIdRef.current,
        x,
        y
      });
    }
  };

  const handlePointerUp = () => {
    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      if (currentStrokesRef.current[peerId]) {
        historyRef.current.push({
          type: 'path',
          peerId,
          ...currentStrokesRef.current[peerId]
        });
        delete currentStrokesRef.current[peerId];
        redoStackRef.current = [];
        drawAll();
        
        onSendEvent({
          type: 'board_stroke_end',
          peerId,
          id: currentStrokeIdRef.current
        });
      }
    }
  };

  const handleTextSubmit = (e) => {
    if (e.key === 'Enter' || e.type === 'blur') {
      if (textInputValue.trim()) {
        const action = {
          type: 'text',
          id: generateId(),
          peerId,
          text: textInputValue.trim(),
          x: textInputPos.x,
          y: textInputPos.y,
          color,
          size
        };
        historyRef.current.push(action);
        redoStackRef.current = [];
        drawAll();
        
        onSendEvent({
          type: 'board_text',
          ...action
        });
      }
      setTextInputVisible(false);
    }
  };

  const handleUndo = () => {
    const undoIndex = historyRef.current.map(a => a.peerId).lastIndexOf(peerId);
    if (undoIndex >= 0) {
      const undoneAction = historyRef.current.splice(undoIndex, 1)[0];
      redoStackRef.current.push(undoneAction);
      drawAll();
      onSendEvent({ type: 'board_undo', peerId });
    }
  };

  const handleRedo = () => {
    const redoIndex = redoStackRef.current.map(a => a.peerId).lastIndexOf(peerId);
    if (redoIndex >= 0) {
      const redoneAction = redoStackRef.current.splice(redoIndex, 1)[0];
      historyRef.current.push(redoneAction);
      drawAll();
      onSendEvent({ type: 'board_redo', peerId });
    }
  };

  const handleClear = () => {
    if (window.confirm("Are you sure you want to clear the shared board for everyone?")) {
      historyRef.current = [];
      redoStackRef.current = [];
      drawAll();
      onSendEvent({ type: 'board_clear', peerId });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: '#1a1a24' }}>
      {/* TOOLBAR */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px', background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid rgba(255,255,255,0.1)', gap: '10px', overflowX: 'auto' }}>
        <button className={`board-tool-btn ${tool === 'pencil' ? 'active' : ''}`} onClick={() => setTool('pencil')} title="Pencil">
          <Pencil size={16} />
        </button>
        <button className={`board-tool-btn ${tool === 'eraser' ? 'active' : ''}`} onClick={() => setTool('eraser')} title="Eraser">
          <Eraser size={16} />
        </button>
        <button className={`board-tool-btn ${tool === 'text' ? 'active' : ''}`} onClick={() => setTool('text')} title="Text">
          <Type size={16} />
        </button>
        
        <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.2)', margin: '0 5px' }} />
        
        {/* Colors */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {COLORS.map(c => (
            <div 
              key={c}
              onClick={() => setColor(c)}
              style={{ width: '20px', height: '20px', borderRadius: '50%', background: c, cursor: 'pointer', border: color === c ? '2px solid white' : '2px solid transparent', transform: color === c ? 'scale(1.1)' : 'scale(1)' }}
            />
          ))}
        </div>

        <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.2)', margin: '0 5px' }} />
        
        {/* Sizes */}
        <select value={size} onChange={(e) => setSize(Number(e.target.value))} style={{ background: '#374151', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '12px' }}>
          <option value={2}>Thin</option>
          <option value={5}>Medium</option>
          <option value={10}>Thick</option>
          <option value={20}>Huge</option>
        </select>

        <div style={{ flex: 1 }} />
        
        <button className="board-tool-btn" onClick={handleUndo} title="Undo" disabled={historyRef.current.filter(a => a.peerId === peerId).length === 0}>
          <RotateCcw size={16} />
        </button>
        <button className="board-tool-btn" onClick={handleRedo} title="Redo" disabled={redoStackRef.current.filter(a => a.peerId === peerId).length === 0}>
          <RotateCw size={16} />
        </button>
        <button className="board-tool-btn danger" onClick={handleClear} title="Clear Board">
          <Trash2 size={16} />
        </button>
      </div>

      {/* CANVAS AREA */}
      <div 
        ref={containerRef}
        style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: tool === 'text' ? 'text' : 'crosshair' }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', touchAction: 'none' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
        
        {/* TEXT INPUT OVERLAY */}
        {textInputVisible && (
          <input
            autoFocus
            type="text"
            value={textInputValue}
            onChange={(e) => setTextInputValue(e.target.value)}
            onKeyDown={handleTextSubmit}
            onBlur={handleTextSubmit}
            placeholder="Type and press Enter"
            style={{
              position: 'absolute',
              left: `${(textInputPos.x / 1200) * 100}%`,
              top: `${(textInputPos.y / 800) * 100}%`,
              color: color,
              fontSize: `${size * 4}px`,
              fontFamily: 'Inter, sans-serif',
              background: 'transparent',
              border: '1px dashed rgba(255,255,255,0.5)',
              outline: 'none',
              padding: '2px',
              minWidth: '200px'
            }}
          />
        )}
      </div>

      <style>{`
        .board-tool-btn {
          background: transparent;
          border: none;
          color: #9ca3af;
          cursor: pointer;
          padding: 6px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: 0.2s;
        }
        .board-tool-btn:hover:not(:disabled) {
          background: rgba(255,255,255,0.1);
          color: white;
        }
        .board-tool-btn.active {
          background: rgba(59,130,246,0.5);
          color: white;
        }
        .board-tool-btn.danger:hover:not(:disabled) {
          background: rgba(239,68,68,0.5);
          color: white;
        }
        .board-tool-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
});

export default SharedBoard;
