import React, { useState } from 'react';
import { Activity, AlertTriangle, Wifi, WifiOff, RefreshCw } from 'lucide-react';

export default function ConnectionQualityMonitor({ qualityStats }) {
  const [expanded, setExpanded] = useState(false);

  // qualityStats: { state: 'good' | 'degraded' | 'frozen' | 'reconnecting' | 'recovering', fps: number, rtt: number, packetLoss: number }
  
  if (!qualityStats) return null;

  const { state, fps, rtt, packetLoss } = qualityStats;

  let Icon = Wifi;
  let color = '#10b981';
  let message = 'Video quality is good.';

  if (state === 'degraded') {
    Icon = AlertTriangle;
    color = '#f59e0b';
    message = 'Video quality is reduced. Signing may be harder to follow.';
  } else if (state === 'frozen') {
    Icon = WifiOff;
    color = '#ef4444';
    message = 'Remote video appears frozen.';
  } else if (state === 'reconnecting') {
    Icon = RefreshCw;
    color = '#ef4444';
    message = 'Connection interrupted. Reconnecting...';
  } else if (state === 'recovering') {
    Icon = Activity;
    color = '#3b82f6';
    message = 'Video quality is recovering.';
  }

  return (
    <div style={{
      position: 'absolute',
      bottom: '20px',
      left: '20px',
      zIndex: 100,
      background: 'rgba(0,0,0,0.7)',
      backdropFilter: 'blur(10px)',
      border: `1px solid ${color}`,
      borderRadius: '8px',
      padding: '8px 12px',
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      maxWidth: '300px',
      fontSize: '12px'
    }}>
      <div 
        style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
      >
        <Icon size={16} color={color} className={state === 'reconnecting' ? 'animate-spin' : ''} />
        <span style={{ fontWeight: 600, flex: 1 }}>{message}</span>
      </div>
      
      {expanded && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#9ca3af' }}>Frame Rate:</span>
            <span>{fps ? `${Math.round(fps)} fps` : 'N/A'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#9ca3af' }}>Latency (RTT):</span>
            <span>{rtt ? `${Math.round(rtt * 1000)} ms` : 'N/A'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#9ca3af' }}>Packet Loss:</span>
            <span>{packetLoss !== null && packetLoss !== undefined ? `${packetLoss.toFixed(1)}%` : 'N/A'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
