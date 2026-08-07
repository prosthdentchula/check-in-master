import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';

// =========================================================================
// OFFLINE TOKEN GENERATION (Zero Latency)
// =========================================================================
// Instead of polling Google Apps Script every 10 seconds and hitting rate limits,
// we generate the exact same token locally in the browser!
// 
// IMPORTANT: Copy your 'QR_SECRET' from Apps Script (Script Properties)
// and paste it here. Keep this React app running on your clinic's tablet.
const LOCAL_QR_SECRET = '4116deca-47b9-4c7b-b97e-88204eb68f465df1ad69-48c0-47cf-a58e-92f88cd633ef';
const STUDENT_APP_URL = 'https://check-in-lac.vercel.app/';
const WINDOW_SECONDS = 30;

// Helper to mimic Apps Script's SHA-256 hex digest
async function generateToken(windowIndex) {
  const message = `${LOCAL_QR_SECRET}:${windowIndex}`;
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hex.substring(0, 12);
}

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxuuIk6qR5iKo2WhmQT3H4h-wIfU45BZV62sRbGrzylD0c6GHoaDcfoEG9tWvHXn1yK/exec';

function App() {
  const [token, setToken] = useState(null);
  const [secondsRemaining, setSecondsRemaining] = useState(WINDOW_SECONDS);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [timeOffsetMs, setTimeOffsetMs] = useState(0);

  // Sync clock with server exactly once on startup
  useEffect(() => {
    async function syncClock() {
      try {
        const start = Date.now();
        const res = await fetch(`${APPS_SCRIPT_URL}?action=time`);
        const data = await res.json();
        const end = Date.now();
        
        const rtt = end - start;
        const serverTime = data.serverTime + (rtt / 2); // Approximate exact server time
        const offset = serverTime - end; 
        
        setTimeOffsetMs(offset);
        console.log(`Clock synced! Local clock was off by ${offset}ms`);
      } catch (err) {
        console.error("Failed to sync clock, falling back to local time", err);
      }
    }
    syncClock();
  }, []);

  // Main local clock loop (runs 10x a second for smoothness)
  useEffect(() => {
    let lastToken = null;

    const tick = async () => {
      const now = new Date();
      setCurrentTime(now);
      
      // Calculate adjusted time using the server offset
      const adjustedTimeMs = now.getTime() + timeOffsetMs;
      const secondsSinceEpoch = Math.floor(adjustedTimeMs / 1000);
      const windowIndex = Math.floor(secondsSinceEpoch / WINDOW_SECONDS);
      const remaining = WINDOW_SECONDS - (secondsSinceEpoch % WINDOW_SECONDS);
      
      setSecondsRemaining(remaining);

      // Only re-generate the token if we crossed into a new time window
      const currentToken = await generateToken(windowIndex);
      if (currentToken !== lastToken) {
        setToken(currentToken);
        lastToken = currentToken;
        
        // Trigger pulse animation
        const card = document.getElementById('qrCard');
        if (card) {
          card.classList.remove('pulse');
          void card.offsetWidth; // restart animation
          card.classList.add('pulse');
        }
      }
    };

    const timer = setInterval(tick, 100); // 100ms for smooth clock/countdown
    return () => clearInterval(timer);
  }, [timeOffsetMs]);

  const fraction = Math.max(0, secondsRemaining) / WINDOW_SECONDS;
  const arcCircumference = 2 * Math.PI * 92;
  const strokeDashoffset = arcCircumference * (1 - fraction);
  
  const isExpired = secondsRemaining <= 5;
  const qrUrl = token ? `${STUDENT_APP_URL}?qrToken=${encodeURIComponent(token)}` : STUDENT_APP_URL;

  return (
    <div className="layout">
      {/* Top Bar */}
      <header className="topbar">
        <div className="eyebrow">ProsthCU · Clinic Check-in</div>
        <div className="clock">
          {currentTime.toLocaleTimeString('en-GB', { hour12: false })}
        </div>
      </header>

      {/* Main Stage */}
      <main className="stage">
        <h1 className="headline">
          Scan to check in <span>at the department</span>
        </h1>

        <div className={`gauge-wrap ${isExpired ? 'expired' : ''}`} id="gaugeWrap">
          <svg className="ring" viewBox="0 0 200 200">
            <circle className="track" cx="100" cy="100" r="92" />
            <circle 
              className="arc" 
              cx="100" 
              cy="100" 
              r="92"
              strokeDasharray={arcCircumference} 
              strokeDashoffset={strokeDashoffset} 
              style={{ transition: 'stroke-dashoffset 0.1s linear, stroke 0.3s ease' }}
            />
          </svg>
          
          <div className="qr-card" id="qrCard">
            {token ? (
              <QRCodeSVG 
                value={qrUrl} 
                size={256}
                style={{ width: '100%', height: '100%' }}
                bgColor="#f3f7f4"
                fgColor="#0e1f1c"
                level="M"
              />
            ) : (
              <div className="loading-spinner"></div>
            )}
          </div>
          
          <div className="countdown-label">
            refreshes in <b>{Math.ceil(secondsRemaining)}</b>s
          </div>
        </div>

        <div className="instructions">
          <p>
            New here? Scan this code to <strong>register</strong>. 
            Already have an account? Scan it, then log in and <strong>check in</strong>. 
            Codes change every 30 seconds — no need to rush.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="status">
          <span className="dot"></span>
          <span>live · local token generation (offline capable)</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
