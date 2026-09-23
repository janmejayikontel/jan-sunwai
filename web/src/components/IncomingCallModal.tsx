"use client";

/**
 * Incoming Call Modal — Jan Sunwai Video Call Platform
 *
 * WhatsApp-Web-style full-screen incoming call ringing overlay.
 *
 * When a call is received via WebSocket, this modal takes over the screen
 * with a dramatic ringing animation, caller information, and Accept/Decline buttons.
 *
 * Features:
 * - Government seal pulsing animation
 * - Audio ringtone loop via Web Audio API
 * - Caller name, designation, and hearing subject
 * - Accept (green) and Decline (red) action buttons
 * - Auto-dismiss after 60 seconds (ring timeout)
 */

import React, { useEffect, useRef } from "react";
import { Phone, PhoneOff } from "lucide-react";

// ─── Props ────────────────────────────────────────────────────

interface IncomingCallModalProps {
  callerName: string;
  callerDesignation: string;
  subject: string;
  participantCount: number;
  onAccept: () => void;
  onDecline: () => void;
}

// ─── Ringtone Generator (Web Audio API) ──────────────────────

let globalAudioCtx: AudioContext | null = null;
let globalIntervalId: ReturnType<typeof setInterval> | null = null;
let globalPendingTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Stop any and all active ringtones immediately.
 * Exported so other call lifecycle events can silence audio instantly.
 */
export function stopAllRingtones() {
  if (globalPendingTimeout) {
    clearTimeout(globalPendingTimeout);
    globalPendingTimeout = null;
  }
  if (globalIntervalId) {
    clearInterval(globalIntervalId);
    globalIntervalId = null;
  }
  if (globalAudioCtx) {
    try {
      globalAudioCtx.close();
    } catch {
      // ignore
    }
    globalAudioCtx = null;
  }
}

/**
 * Creates a repeating ringtone pattern using Web Audio API.
 * Pattern: Two short tones followed by a pause (mimics a phone ring).
 */
function createRingtone(): { start: () => void; stop: () => void } {
  let isStopped = false;

  const playTone = (ctx: AudioContext, frequency: number, duration: number, startTime: number) => {
    if (isStopped || ctx.state === "closed") return;
    try {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, startTime);

      // Smooth envelope to avoid click artifacts
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.2, startTime + 0.02);
      gainNode.gain.setValueAtTime(0.2, startTime + duration - 0.02);
      gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    } catch {
      // Audio context might be closed
    }
  };

  const start = () => {
    if (isStopped) return;
    stopAllRingtones(); // Clean up any existing instances first

    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      globalAudioCtx = ctx;

      const ring = () => {
        if (isStopped || !globalAudioCtx || globalAudioCtx.state === "closed") return;
        const now = globalAudioCtx.currentTime;
        playTone(globalAudioCtx, 440, 0.4, now);
        playTone(globalAudioCtx, 440, 0.4, now + 0.6);
      };

      ring();
      globalIntervalId = setInterval(ring, 3000);
    } catch (err) {
      console.warn("Could not start Web Audio ringtone:", err);
    }
  };

  const stop = () => {
    isStopped = true;
    stopAllRingtones();
  };

  return { start, stop };
}

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function IncomingCallModal({
  callerName,
  callerDesignation,
  subject,
  participantCount,
  onAccept,
  onDecline,
}: IncomingCallModalProps) {
  const onDeclineRef = useRef(onDecline);
  const onAcceptRef = useRef(onAccept);

  useEffect(() => {
    onDeclineRef.current = onDecline;
    onAcceptRef.current = onAccept;
  }, [onDecline, onAccept]);

  const [isAccepting, setIsAccepting] = useState(false);

  // Start ringtone & mobile vibration on mount, stop on unmount
  useEffect(() => {
    const ringtone = createRingtone();
    ringtone.start();

    // Mobile vibration pattern (repeats like an incoming call)
    let vibInterval: ReturnType<typeof setInterval> | null = null;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate([350, 250, 350, 1200]);
        vibInterval = setInterval(() => {
          try {
            navigator.vibrate([350, 250, 350, 1200]);
          } catch {}
        }, 2200);
      } catch {}
    }

    // Auto-decline after 60 seconds
    const autoDeclineTimeout = setTimeout(() => {
      stopAllRingtones();
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try { navigator.vibrate(0); } catch {}
      }
      onDeclineRef.current();
    }, 60_000);

    return () => {
      clearTimeout(autoDeclineTimeout);
      if (vibInterval) clearInterval(vibInterval);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try { navigator.vibrate(0); } catch {}
      }
      ringtone.stop();
      stopAllRingtones();
    };
  }, []); // Empty dependency array: runs only on modal mount/unmount

  const handleAccept = () => {
    if (isAccepting) return;
    setIsAccepting(true);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate(0); } catch {}
    }
    stopAllRingtones();
    onAcceptRef.current();
  };

  const handleDecline = () => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate(0); } catch {}
    }
    stopAllRingtones();
    onDeclineRef.current();
  };

  return (
    <div className="call-overlay">
      <div className="call-modal">
        {/* Government Emblem with Sonar Waves */}
        <div className="call-modal__seal-wrapper">
          <div className="call-modal__sonar-ring" />
          <div className="call-modal__sonar-ring call-modal__sonar-ring--2" />
          <div className="call-modal__seal">🏛️</div>
        </div>

        {/* Ringing Indicator */}
        <div className="call-modal__ringing">
          {isAccepting
            ? "⏳ सुनवाई कक्ष में प्रवेश हो रहा है... • Connecting to Room"
            : "🔔 इनकमिंग जन सुनवाई वीडियो कॉल • Incoming Video Call"}
        </div>

        {/* Caller Info */}
        <div className="call-modal__caller-name">{callerName}</div>
        <div className="call-modal__caller-title">
          <span>{callerDesignation}</span>
        </div>

        {/* Subject */}
        <div className="call-modal__subject">
          <div style={{ fontSize: "0.75rem", color: "#fbbf24", fontWeight: 700, marginBottom: "2px", textTransform: "uppercase" }}>
            Hearing Case / विषय
          </div>
          <div>{subject}</div>
        </div>

        {/* Participant Count */}
        <div className="call-modal__participants">
          👥 {participantCount} अधिकारी एवं नागरिक उपस्थित • Multi-Party Hearing
        </div>

        {/* Action Buttons (Large, Touch-Friendly for Mobile) */}
        <div className="call-modal__actions">
          {isAccepting ? (
            <div style={{ padding: "16px", color: "#38bdf8", fontWeight: 700, fontSize: "1rem", textAlign: "center" }}>
              ⏳ Connecting to Hearing Room...
            </div>
          ) : (
            <>
              {/* Decline Button */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                <button
                  type="button"
                  className="call-modal__btn call-modal__btn--decline"
                  onClick={handleDecline}
                  aria-label="Decline hearing call"
                >
                  <PhoneOff size={32} color="white" />
                </button>
                <div className="call-modal__btn-label" style={{ color: "#fca5a5" }}>
                  <strong>अस्वीकार</strong>
                  <div style={{ fontSize: "0.7rem", opacity: 0.8 }}>Decline</div>
                </div>
              </div>

              {/* Accept Button */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                <button
                  type="button"
                  className="call-modal__btn call-modal__btn--accept"
                  onClick={handleAccept}
                  aria-label="Accept hearing call"
                >
                  <Phone size={32} color="white" />
                </button>
                <div className="call-modal__btn-label" style={{ color: "#6ee7b7" }}>
                  <strong>स्वीकार करें</strong>
                  <div style={{ fontSize: "0.7rem", opacity: 0.8 }}>Join Hearing</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
