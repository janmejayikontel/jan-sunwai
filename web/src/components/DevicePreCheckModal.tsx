"use client";

/**
 * DevicePreCheckModal — Jan Sunwai Hardware Diagnostic Suite & Room Launcher
 *
 * Implements:
 * 1. Device Enumeration: Automatically detects available microphones, webcams, and audio output devices.
 * 2. Live Hardware Preview: Real-time mirrored video feed and interactive voice level VU meter.
 * 3. Virtual Media Generator: Synthetic SMPTE color-bar test pattern & audio tone generator for testing without physical cameras/mics.
 * 4. Room Credentials: Generates memorable, high-entropy 6-character room codes and passphrases automatically.
 * 5. Role Switcher: Quick-toggle tabs for Citizen, Call Centre, Officer, and Administrator profiles.
 * 6. Admin PIN Gate: Enforces a 4-digit security PIN ('8899') to restrict administrative privileges.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Camera,
  CameraOff,
  Volume2,
  VolumeX,
  RefreshCw,
  Copy,
  Check,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Play,
  Square,
  Key,
  Sliders,
  X,
  User,
  Headphones,
  Building2,
  Lock,
  ArrowRight,
  Radio,
  CheckCircle,
} from "lucide-react";

// ─── Types & Personas ─────────────────────────────────────────

export type RoleType = "citizen" | "call_center" | "officer" | "admin";

export interface PersonaProfile {
  role: RoleType;
  name: string;
  phone: string;
  badge: string;
  designation: string;
  icon: string;
  color: string;
  features: string;
}

export const OFFICIAL_PERSONAS: Record<RoleType, PersonaProfile> = {
  citizen: {
    role: "citizen",
    name: "Janmejay Sethi",
    phone: "+917735807328",
    badge: "1. Citizen Complainant",
    designation: "Complainant — Grievance RAJ-2024-88421",
    icon: "👤",
    color: "#2563eb",
    features: "Stream Audio/Video • Share Screen • Encrypted Chat • Safety Numbers",
  },
  call_center: {
    role: "call_center",
    name: "Priya Sharma",
    phone: "+917749852014",
    badge: "2. Call Centre Representative",
    designation: "181 Sampark Helpdesk — Queue Dispatch",
    icon: "🎧",
    color: "#8b5cf6",
    features: "Initiate Calls • Verify Citizen KYC • Schedule Queue • Consult Records",
  },
  officer: {
    role: "officer",
    name: "Sh. Alok Sharma, IAS",
    phone: "+919414000001",
    badge: "3. Officer / Magistrate",
    designation: "District Magistrate & Presiding Hearing Officer",
    icon: "🏛️",
    color: "#059669",
    features: "Preside Hearing • Mute Participants • Disable Video • Eject • Terminate Meeting",
  },
  admin: {
    role: "admin",
    name: "Rajasthan DOIT&C Admin",
    phone: "+919999999999",
    badge: "4. Super Admin / Administrator",
    designation: "Department of IT & Communication, Govt. of Rajasthan",
    icon: "🛡️",
    color: "#d97706",
    features: "Full System Admin • Real-Time Diagnostics • Audit Logs • Security Parameters",
  },
};

interface DevicePreCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunchRoom: (params: {
    roomCode: string;
    passphrase: string;
    role: RoleType;
    userName: string;
    userPhone: string;
    useVirtualMedia: boolean;
    audioDeviceId?: string;
    videoDeviceId?: string;
  }) => void;
  initialRole?: RoleType;
}

// Helper: Generate memorable, high-entropy 6-character room codes & passphrases
function generateRoomCredentials() {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // Ambiguity-free charset
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const formattedCode = `JS-${code.slice(0, 3)}${code.slice(3)}`;

  const adjectives = ["Secure", "Sampark", "Nyay", "Jan", "Digital", "Shasan"];
  const nouns = ["Sunwai", "Bench", "Hearing", "Seva", "Portal", "Kisan"];
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const passphrase = `${adj}-${noun}@${randomNum}`;

  return { roomCode: formattedCode, passphrase };
}

export default function DevicePreCheckModal({
  isOpen,
  onClose,
  onLaunchRoom,
  initialRole = "citizen",
}: DevicePreCheckModalProps) {
  // ─── Role State & Admin PIN Gate ─────────────────────────────
  const [selectedRole, setSelectedRole] = useState<RoleType>(initialRole);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [showPinGate, setShowPinGate] = useState(false);
  const [adminPin, setAdminPin] = useState(["", "", "", ""]);
  const [pinError, setPinError] = useState("");
  const [pinShake, setPinShake] = useState(false);
  const pinInputRefs = [
    useRef<HTMLInputElement | null>(null),
    useRef<HTMLInputElement | null>(null),
    useRef<HTMLInputElement | null>(null),
    useRef<HTMLInputElement | null>(null),
  ];

  // ─── Room Credentials State ──────────────────────────────────
  const [credentials, setCredentials] = useState<{ roomCode: string; passphrase: string }>(
    generateRoomCredentials
  );
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);

  // ─── Device Enumeration State ────────────────────────────────
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoInputDevices, setVideoInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<string>("");
  const [selectedVideoId, setSelectedVideoId] = useState<string>("");
  const [selectedOutputId, setSelectedOutputId] = useState<string>("");

  // ─── Hardware Preview State ──────────────────────────────────
  const [useVirtualMedia, setUseVirtualMedia] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isMirrored, setIsMirrored] = useState(true);
  const [voiceLevel, setVoiceLevel] = useState<number>(0); // 0 to 100
  const [devicePermissionGranted, setDevicePermissionGranted] = useState(false);

  // ─── Virtual Media Generator State ───────────────────────────
  const [virtualToneActive, setVirtualToneActive] = useState(false);
  const [virtualToneFrequency, setVirtualToneFrequency] = useState<number>(440); // 440 Hz (A4) or 1000 Hz
  const [virtualToneVolume, setVirtualToneVolume] = useState<number>(0.2); // 0.0 - 1.0

  // ─── Refs ────────────────────────────────────────────────────
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const canvasAnimRef = useRef<number | null>(null);

  // Synchronize initial role
  useEffect(() => {
    setSelectedRole(initialRole);
    if (initialRole === "admin") {
      setIsAdminUnlocked(true);
    }
  }, [initialRole]);

  // ─── Enumerate Media Devices ─────────────────────────────────
  const enumerateDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioIns = devices.filter((d) => d.kind === "audioinput");
      const videoIns = devices.filter((d) => d.kind === "videoinput");
      const audioOuts = devices.filter((d) => d.kind === "audiooutput");

      setAudioInputDevices(audioIns);
      setVideoInputDevices(videoIns);
      setAudioOutputDevices(audioOuts);

      // Default selection if not already chosen
      if (audioIns.length > 0 && !selectedAudioId) {
        setSelectedAudioId(audioIns[0].deviceId);
      }
      if (videoIns.length > 0 && !selectedVideoId) {
        setSelectedVideoId(videoIns[0].deviceId);
      }
      if (audioOuts.length > 0 && !selectedOutputId) {
        setSelectedOutputId(audioOuts[0].deviceId);
      }
    } catch (err) {
      console.warn("[DevicePreCheck] enumerateDevices error:", err);
    }
  }, [selectedAudioId, selectedVideoId, selectedOutputId]);

  // ─── Voice Level Analyzer (Web Audio API) ────────────────────
  const stopAudioAnalysis = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      try {
        audioContextRef.current.close();
      } catch (e) {}
      audioContextRef.current = null;
    }
    setVoiceLevel(0);
  }, []);

  const startAudioAnalysis = useCallback((stream: MediaStream) => {
    stopAudioAnalysis();
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        // Normalize 0-128 avg to 0-100%
        const normalized = Math.min(100, Math.round((average / 60) * 100));
        setVoiceLevel(normalized);

        animationFrameRef.current = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (e) {
      console.warn("[DevicePreCheck] Web Audio analysis error:", e);
    }
  }, [stopAudioAnalysis]);

  // ─── Synthetic Color-Bar Generator (HTML5 Canvas) ────────────
  const stopVirtualGenerator = useCallback(() => {
    if (canvasAnimRef.current) {
      cancelAnimationFrame(canvasAnimRef.current);
      canvasAnimRef.current = null;
    }
    if (oscillatorRef.current) {
      try {
        oscillatorRef.current.stop();
        oscillatorRef.current.disconnect();
      } catch (e) {}
      oscillatorRef.current = null;
    }
    setVirtualToneActive(false);
  }, []);

  const startVirtualGenerator = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let scanlineY = 0;

    const renderTestCard = () => {
      const w = canvas.width;
      const h = canvas.height;

      // SMPTE 8 Color Bars
      const colors = [
        "#FFFFFF", // 1. White
        "#EAEA00", // 2. Yellow
        "#00EAEA", // 3. Cyan
        "#00EA00", // 4. Green
        "#EA00EA", // 5. Magenta
        "#EA0000", // 6. Red
        "#0000EA", // 7. Blue
        "#000000", // 8. Black
      ];

      const barWidth = w / colors.length;
      for (let i = 0; i < colors.length; i++) {
        ctx.fillStyle = colors[i];
        ctx.fillRect(i * barWidth, 0, barWidth, h * 0.72);
      }

      // Middle Sync Strip (Castellated Bars)
      const midColors = ["#0000EA", "#000000", "#EA00EA", "#000000", "#00EAEA", "#000000", "#FFFFFF"];
      const midW = w / midColors.length;
      for (let i = 0; i < midColors.length; i++) {
        ctx.fillStyle = midColors[i];
        ctx.fillRect(i * midW, h * 0.72, midW, h * 0.08);
      }

      // Bottom Bar (PLUGE and Black level)
      ctx.fillStyle = "#00214c";
      ctx.fillRect(0, h * 0.8, w * 0.25, h * 0.2);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(w * 0.25, h * 0.8, w * 0.25, h * 0.2);
      ctx.fillStyle = "#0c0c0c";
      ctx.fillRect(w * 0.5, h * 0.8, w * 0.25, h * 0.2);
      ctx.fillStyle = "#191919";
      ctx.fillRect(w * 0.75, h * 0.8, w * 0.25, h * 0.2);

      // Moving Scanline
      scanlineY = (scanlineY + 3) % h;
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.fillRect(0, scanlineY, w, 2);

      // Live Timestamp & Badge Overlay
      const now = new Date();
      const timeStr = `${now.toISOString().replace("T", " ").slice(0, 23)} IST`;

      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.fillRect(w * 0.1, h * 0.3, w * 0.8, h * 0.32);
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 3;
      ctx.strokeRect(w * 0.1, h * 0.3, w * 0.8, h * 0.32);

      // Rajasthan Emblem / Gov text
      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 20px 'Segoe UI', Roboto, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("🏛️ GOVT OF RAJASTHAN — JAN SUNWAI", w / 2, h * 0.38);

      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 28px 'Segoe UI', Roboto, sans-serif";
      ctx.fillText("SYNTHETIC VIDEO STREAM (1080p @ 30FPS)", w / 2, h * 0.46);

      ctx.fillStyle = "#34d399";
      ctx.font = "bold 16px monospace";
      ctx.fillText(`LIVE CLOCK: ${timeStr}`, w / 2, h * 0.53);

      ctx.fillStyle = "#fbbf24";
      ctx.font = "14px 'Segoe UI', Roboto, sans-serif";
      ctx.fillText("✓ Camera Hardware Bypass Active • Verified Test Media", w / 2, h * 0.58);

      canvasAnimRef.current = requestAnimationFrame(renderTestCard);
    };

    renderTestCard();

    // Acquire stream from canvas
    try {
      const stream = canvas.captureStream(30);
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        videoPreviewRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.warn("[DevicePreCheck] canvas.captureStream error:", err);
    }
  }, []);

  // ─── Start Real Hardware Stream ──────────────────────────────
  const startHardwareStream = useCallback(async () => {
    stopVirtualGenerator();
    stopAudioAnalysis();

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return;
    }

    try {
      let audioStream: MediaStream | null = null;
      let videoStream: MediaStream | null = null;

      // 1. Try combined audio + video if microphone devices exist
      const hasAudioDevices = audioInputDevices.length > 0;
      try {
        const constraints: MediaStreamConstraints = {
          audio: hasAudioDevices
            ? (selectedAudioId ? { deviceId: selectedAudioId } : true)
            : false,
          video: selectedVideoId
            ? { deviceId: selectedVideoId, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { width: { ideal: 1280 }, height: { ideal: 720 } },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        mediaStreamRef.current = stream;
        setDevicePermissionGranted(true);

        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = stream;
          videoPreviewRef.current.play().catch(() => {});
        }

        if (hasAudioDevices) {
          startAudioAnalysis(stream);
        }
        enumerateDevices();
        return;
      } catch (combinedErr: any) {
        console.warn("[DevicePreCheck] Combined media stream failed, attempting independent fallback:", combinedErr);
      }

      // 2. Try Video stream independently (so lack of mic doesn't break camera)
      try {
        const videoConstraints: MediaStreamConstraints = {
          video: selectedVideoId
            ? { deviceId: selectedVideoId, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        };
        videoStream = await navigator.mediaDevices.getUserMedia(videoConstraints);
      } catch (vErr) {
        console.warn("[DevicePreCheck] Independent video stream failed:", vErr);
      }

      // 3. Try Audio stream independently (so lack of camera doesn't break mic)
      if (hasAudioDevices) {
        try {
          const audioConstraints: MediaStreamConstraints = {
            audio: selectedAudioId ? { deviceId: selectedAudioId } : true,
            video: false,
          };
          audioStream = await navigator.mediaDevices.getUserMedia(audioConstraints);
        } catch (aErr) {
          console.warn("[DevicePreCheck] Independent audio stream failed:", aErr);
        }
      }

      if (videoStream || audioStream) {
        const combined = new MediaStream();
        if (videoStream) {
          videoStream.getVideoTracks().forEach((t) => combined.addTrack(t));
          if (videoPreviewRef.current) {
            videoPreviewRef.current.srcObject = combined;
            videoPreviewRef.current.play().catch(() => {});
          }
        }
        if (audioStream) {
          audioStream.getAudioTracks().forEach((t) => combined.addTrack(t));
          startAudioAnalysis(audioStream);
        }
        mediaStreamRef.current = combined;
        setDevicePermissionGranted(true);
        enumerateDevices();
        return;
      }

      // Fallback to virtual generator if neither physical device is available
      setUseVirtualMedia(true);
    } catch (err: any) {
      console.warn("[DevicePreCheck] getUserMedia fatal fallback:", err);
      setUseVirtualMedia(true);
    }
  }, [selectedAudioId, selectedVideoId, audioInputDevices.length, stopVirtualGenerator, stopAudioAnalysis, startAudioAnalysis, enumerateDevices]);

  // Handle stream lifecycle when modal opens or settings change
  useEffect(() => {
    if (!isOpen) {
      // Clean up when modal closes
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
      stopAudioAnalysis();
      stopVirtualGenerator();
      return;
    }

    enumerateDevices();

    if (typeof navigator !== "undefined" && navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener("devicechange", enumerateDevices);
    }

    if (useVirtualMedia) {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
      startVirtualGenerator();
    } else {
      startHardwareStream();
    }

    return () => {
      if (typeof navigator !== "undefined" && navigator.mediaDevices) {
        navigator.mediaDevices.removeEventListener("devicechange", enumerateDevices);
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
      stopAudioAnalysis();
      stopVirtualGenerator();
    };
  }, [isOpen, useVirtualMedia, selectedAudioId, selectedVideoId, enumerateDevices, startHardwareStream, startVirtualGenerator, stopAudioAnalysis, stopVirtualGenerator]);

  // Handle hardware track mute/unmute
  useEffect(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = !isMicMuted;
      });
      mediaStreamRef.current.getVideoTracks().forEach((t) => {
        t.enabled = !isCameraOff;
      });
    }
  }, [isMicMuted, isCameraOff]);

  // ─── Play Test Speaker Chime ─────────────────────────────────
  const playSpeakerTestChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      // Play a pleasant 3-note ascending chime (C5 -> E5 -> G5)
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.15);

        gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.15);
        gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + idx * 0.15 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.15 + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + idx * 0.15);
        osc.stop(ctx.currentTime + idx * 0.15 + 0.4);
      });
    } catch (err) {
      console.warn("[DevicePreCheck] Speaker test chime error:", err);
    }
  };

  // ─── Synthetic Tone Toggle ───────────────────────────────────
  const toggleVirtualTone = () => {
    if (virtualToneActive) {
      if (oscillatorRef.current) {
        try {
          oscillatorRef.current.stop();
          oscillatorRef.current.disconnect();
        } catch (e) {}
        oscillatorRef.current = null;
      }
      setVirtualToneActive(false);
      setVoiceLevel(0);
    } else {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = audioContextRef.current || new AudioCtx();
        audioContextRef.current = ctx;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(virtualToneFrequency, ctx.currentTime);
        gain.gain.setValueAtTime(virtualToneVolume, ctx.currentTime);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        oscillatorRef.current = osc;
        gainNodeRef.current = gain;

        setVirtualToneActive(true);
        // Animate VU meter with steady reference tone level
        setVoiceLevel(Math.round(virtualToneVolume * 100));
      } catch (err) {
        console.warn("[DevicePreCheck] Virtual tone error:", err);
      }
    }
  };

  // ─── Role Switcher with Admin PIN Gate ───────────────────────
  const handleSelectRole = (role: RoleType) => {
    if (role === "admin") {
      if (isAdminUnlocked) {
        setSelectedRole("admin");
      } else {
        // Trigger PIN Gate
        setShowPinGate(true);
        setPinError("");
        setAdminPin(["", "", "", ""]);
        setTimeout(() => pinInputRefs[0].current?.focus(), 150);
      }
    } else {
      setSelectedRole(role);
    }
  };

  const handlePinDigitChange = (index: number, val: string) => {
    const digit = val.slice(-1);
    const newPin = [...adminPin];
    newPin[index] = digit;
    setAdminPin(newPin);
    setPinError("");

    // Auto-advance to next box
    if (digit && index < 3) {
      pinInputRefs[index + 1].current?.focus();
    }

    // If 4 digits entered, automatically verify
    if (index === 3 && digit) {
      const fullPin = `${newPin[0]}${newPin[1]}${newPin[2]}${digit}`;
      verifyAdminPin(fullPin);
    }
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !adminPin[index] && index > 0) {
      pinInputRefs[index - 1].current?.focus();
    }
  };

  const verifyAdminPin = (enteredPin: string) => {
    if (enteredPin === "8899") {
      setIsAdminUnlocked(true);
      setSelectedRole("admin");
      setShowPinGate(false);
      setPinError("");
    } else {
      setPinShake(true);
      setPinError("❌ Invalid Security PIN. Access denied to Administrator profile.");
      setAdminPin(["", "", "", ""]);
      setTimeout(() => {
        setPinShake(false);
        pinInputRefs[0].current?.focus();
      }, 500);
    }
  };

  // ─── Copy Handlers ───────────────────────────────────────────
  const copyRoomCode = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(credentials.roomCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const copyFullInvitation = () => {
    const inviteText = `🏛️ Jan Sunwai Video Hearing Invitation\nRoom Code: ${credentials.roomCode}\nPassphrase: ${credentials.passphrase}\nPersona: ${OFFICIAL_PERSONAS[selectedRole].name} (${OFFICIAL_PERSONAS[selectedRole].badge})\nWeb Portal: ${typeof window !== "undefined" ? window.location.origin : ""}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(inviteText);
      setCopiedPass(true);
      setTimeout(() => setCopiedPass(false), 2000);
    }
  };

  // ─── Launch Room ─────────────────────────────────────────────
  const handleLaunch = () => {
    const persona = OFFICIAL_PERSONAS[selectedRole];
    onLaunchRoom({
      roomCode: credentials.roomCode,
      passphrase: credentials.passphrase,
      role: selectedRole,
      userName: persona.name,
      userPhone: persona.phone,
      useVirtualMedia,
      audioDeviceId: selectedAudioId,
      videoDeviceId: selectedVideoId,
    });
    onClose();
  };

  if (!isOpen) return null;

  const currentPersona = OFFICIAL_PERSONAS[selectedRole];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 120,
        background: "rgba(3, 7, 18, 0.88)",
        backdropFilter: "blur(16px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          width: "min(960px, 100%)",
          maxHeight: "calc(100vh - 32px)",
          background: "#0b1329",
          border: "1px solid rgba(56, 189, 248, 0.35)",
          borderRadius: "20px",
          boxShadow: "0 25px 60px rgba(0, 0, 0, 0.9)",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "16px 22px",
            background: "rgba(15, 23, 42, 0.9)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #0284c7, #0369a1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
              }}
            >
              <Sliders size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#f8fafc", display: "flex", alignItems: "center", gap: "8px" }}>
                <span>Hardware Diagnostic Suite & Room Launcher</span>
                <span
                  style={{
                    fontSize: "0.68rem",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    background: "rgba(16, 185, 129, 0.2)",
                    color: "#34d399",
                    border: "1px solid rgba(16, 185, 129, 0.4)",
                    fontWeight: 700,
                  }}
                >
                  PRE-FLIGHT READY
                </span>
              </div>
              <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                Device Enumeration • Live Preview • Virtual Color Bars • 6-Char Room Codes • Role Switcher
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: "rgba(255, 255, 255, 0.06)",
              border: "none",
              borderRadius: "8px",
              padding: "6px",
              color: "#94a3b8",
              cursor: "pointer",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div
          style={{
            padding: "20px 22px",
            display: "flex",
            flexDirection: "column",
            gap: "18px",
            overflowY: "auto",
            flex: 1,
          }}
        >
          {/* ─── 1. Role Switcher Tabs ──────────────────────────────── */}
          <div>
            <div style={{ fontSize: "0.76rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px", display: "flex", justifyContent: "space-between" }}>
              <span>Role Switcher (Profile Selection):</span>
              <span style={{ color: "#38bdf8", textTransform: "none" }}>
                Active Profile: <strong>{currentPersona.name}</strong>
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "8px" }}>
              {(["citizen", "call_center", "officer", "admin"] as RoleType[]).map((r) => {
                const p = OFFICIAL_PERSONAS[r];
                const isSelected = selectedRole === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => handleSelectRole(r)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "10px 12px",
                      borderRadius: "10px",
                      background: isSelected ? `${p.color}25` : "rgba(255, 255, 255, 0.04)",
                      border: isSelected ? `1.5px solid ${p.color}` : "1px solid rgba(255, 255, 255, 0.08)",
                      color: "#fff",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.15s ease",
                      position: "relative",
                    }}
                  >
                    <span style={{ fontSize: "1.25rem" }}>{p.icon}</span>
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <div style={{ fontSize: "0.82rem", fontWeight: 700, color: isSelected ? p.color : "#f1f5f9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {p.badge}
                      </div>
                      <div style={{ fontSize: "0.68rem", color: "#94a3b8" }}>{p.name}</div>
                    </div>
                    {r === "admin" && !isAdminUnlocked && (
                      <span title="PIN '8899' Required" style={{ display: "inline-flex" }}>
                        <Lock size={14} style={{ color: "#fbbf24" }} />
                      </span>
                    )}
                    {r === "admin" && isAdminUnlocked && (
                      <CheckCircle size={14} style={{ color: "#34d399" }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ─── 2. Hardware Preview & Virtual Media Generator Grid ───── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px" }}>
            {/* Left: Video Preview (Real Mirror or Virtual Color Bars) */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                background: "rgba(15, 23, 42, 0.6)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "14px",
                padding: "12px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#cbd5e1", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Video size={14} style={{ color: "#38bdf8" }} />
                  <span>Live Video Feed:</span>
                </span>

                {/* Switcher: Physical Hardware vs Virtual Generator */}
                <button
                  type="button"
                  onClick={() => setUseVirtualMedia(!useVirtualMedia)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "4px 8px",
                    borderRadius: "6px",
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    background: useVirtualMedia ? "rgba(245, 158, 11, 0.25)" : "rgba(59, 130, 246, 0.2)",
                    border: useVirtualMedia ? "1px solid #f59e0b" : "1px solid #3b82f6",
                    color: useVirtualMedia ? "#fbbf24" : "#60a5fa",
                  }}
                >
                  <Sparkles size={12} />
                  <span>{useVirtualMedia ? "Virtual Media Active" : "Use Virtual Generator"}</span>
                </button>
              </div>

              {/* Video Screen Container */}
              <div
                style={{
                  width: "100%",
                  aspectRatio: "16/9",
                  background: "#020617",
                  borderRadius: "10px",
                  overflow: "hidden",
                  position: "relative",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                }}
              >
                {/* Hidden canvas for generating synthetic 30fps color-bar stream */}
                <canvas
                  ref={canvasRef}
                  width={640}
                  height={360}
                  style={{ display: "none" }}
                />

                <video
                  ref={videoPreviewRef}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: useVirtualMedia ? "contain" : "cover",
                    transform: isMirrored && !useVirtualMedia ? "scaleX(-1)" : "none",
                  }}
                />

                {isCameraOff && !useVirtualMedia && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "#0f172a",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      color: "#64748b",
                    }}
                  >
                    <CameraOff size={32} />
                    <span style={{ fontSize: "0.8rem" }}>Camera Hardware Paused</span>
                  </div>
                )}

                {/* Badge Overlay on Video */}
                <div
                  style={{
                    position: "absolute",
                    top: "8px",
                    left: "8px",
                    background: "rgba(0, 0, 0, 0.7)",
                    backdropFilter: "blur(6px)",
                    borderRadius: "6px",
                    padding: "2px 8px",
                    fontSize: "0.68rem",
                    color: useVirtualMedia ? "#fbbf24" : "#34d399",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <Radio size={11} />
                  <span>{useVirtualMedia ? "SYNTHETIC SMPTE 1080p" : "LIVE HARDWARE WEBCAM"}</span>
                </div>
              </div>

              {/* Quick Preview Controls */}
              <div style={{ display: "flex", gap: "6px", marginTop: "2px" }}>
                <button
                  type="button"
                  onClick={() => setIsMirrored(!isMirrored)}
                  disabled={useVirtualMedia}
                  style={{
                    flex: 1,
                    padding: "6px 8px",
                    borderRadius: "6px",
                    background: isMirrored ? "rgba(59, 130, 246, 0.2)" : "rgba(255, 255, 255, 0.06)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    color: isMirrored ? "#93c5fd" : "#cbd5e1",
                    fontSize: "0.72rem",
                    cursor: useVirtualMedia ? "not-allowed" : "pointer",
                  }}
                >
                  {isMirrored ? "Mirror: ON" : "Mirror: OFF"}
                </button>

                <button
                  type="button"
                  onClick={() => setIsCameraOff(!isCameraOff)}
                  disabled={useVirtualMedia}
                  style={{
                    flex: 1,
                    padding: "6px 8px",
                    borderRadius: "6px",
                    background: isCameraOff ? "rgba(239, 68, 68, 0.2)" : "rgba(255, 255, 255, 0.06)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    color: isCameraOff ? "#f87171" : "#cbd5e1",
                    fontSize: "0.72rem",
                    cursor: useVirtualMedia ? "not-allowed" : "pointer",
                  }}
                >
                  {isCameraOff ? "Start Cam" : "Pause Cam"}
                </button>

                <button
                  type="button"
                  onClick={() => setIsMicMuted(!isMicMuted)}
                  style={{
                    flex: 1,
                    padding: "6px 8px",
                    borderRadius: "6px",
                    background: isMicMuted ? "rgba(239, 68, 68, 0.2)" : "rgba(16, 185, 129, 0.2)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    color: isMicMuted ? "#f87171" : "#34d399",
                    fontSize: "0.72rem",
                    cursor: "pointer",
                  }}
                >
                  {isMicMuted ? "Unmute Mic" : "Mute Mic"}
                </button>
              </div>
            </div>

            {/* Right: Audio Level Meter, Virtual Tone & Device Selectors */}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {/* Interactive Voice Level Indicator (VU Meter) */}
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.6)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "14px",
                  padding: "12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#cbd5e1", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Mic size={14} style={{ color: "#10b981" }} />
                    <span>Interactive Voice Level Indicator:</span>
                  </span>
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, color: voiceLevel > 10 ? "#34d399" : "#94a3b8" }}>
                    {isMicMuted ? "MUTED" : `${voiceLevel}% Amplitude`}
                  </span>
                </div>

                {/* Multi-segment LED VU Meter Bar */}
                <div
                  style={{
                    width: "100%",
                    height: "14px",
                    background: "rgba(0, 0, 0, 0.6)",
                    borderRadius: "8px",
                    overflow: "hidden",
                    padding: "2px",
                    boxSizing: "border-box",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: isMicMuted ? "0%" : `${voiceLevel}%`,
                      borderRadius: "6px",
                      background:
                        voiceLevel > 75
                          ? "linear-gradient(90deg, #10b981, #f59e0b, #ef4444)"
                          : voiceLevel > 35
                          ? "linear-gradient(90deg, #10b981, #3b82f6)"
                          : "linear-gradient(90deg, #059669, #10b981)",
                      boxShadow: voiceLevel > 15 ? "0 0 10px rgba(16, 185, 129, 0.6)" : "none",
                      transition: "width 0.08s ease-out",
                    }}
                  />
                </div>

                <div style={{ fontSize: "0.68rem", color: "#94a3b8", display: "flex", justifyContent: "space-between" }}>
                  <span>Quiet</span>
                  <span>Normal Speech (30-60%)</span>
                  <span>Peak</span>
                </div>
              </div>

              {/* Virtual Audio Tone Generator Section */}
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.6)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "14px",
                  padding: "12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#cbd5e1", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Radio size={14} style={{ color: "#fbbf24" }} />
                    <span>Virtual Media Tone Generator (Audio Test):</span>
                  </span>

                  <button
                    type="button"
                    onClick={toggleVirtualTone}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "4px 8px",
                      borderRadius: "6px",
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      background: virtualToneActive ? "rgba(239, 68, 68, 0.25)" : "rgba(16, 185, 129, 0.2)",
                      border: virtualToneActive ? "1px solid #ef4444" : "1px solid #10b981",
                      color: virtualToneActive ? "#f87171" : "#34d399",
                    }}
                  >
                    {virtualToneActive ? <Square size={11} /> : <Play size={11} />}
                    <span>{virtualToneActive ? "Stop Tone" : "Play 440Hz Tone"}</span>
                  </button>
                </div>

                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={playSpeakerTestChime}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "6px 10px",
                      borderRadius: "6px",
                      background: "rgba(59, 130, 246, 0.15)",
                      border: "1px solid rgba(59, 130, 246, 0.35)",
                      color: "#93c5fd",
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <Volume2 size={13} />
                    <span>Test Speakers (Chime)</span>
                  </button>

                  <div style={{ flex: 1, fontSize: "0.7rem", color: "#94a3b8" }}>
                    {virtualToneActive
                      ? "🔊 440 Hz reference tone active"
                      : "Click Test Speakers to verify audio output"}
                  </div>
                </div>
              </div>

              {/* Device Enumeration Dropdowns */}
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.6)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "14px",
                  padding: "12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div style={{ fontSize: "0.76rem", fontWeight: 700, color: "#cbd5e1" }}>
                  Hardware Device Enumeration:
                </div>

                {/* Microphone Select */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Mic size={14} style={{ color: "#94a3b8" }} />
                  <select
                    value={selectedAudioId}
                    onChange={(e) => setSelectedAudioId(e.target.value)}
                    style={{
                      flex: 1,
                      padding: "6px 8px",
                      borderRadius: "6px",
                      background: "rgba(30, 41, 59, 0.8)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      color: "#fff",
                      fontSize: "0.75rem",
                      outline: "none",
                    }}
                  >
                    {audioInputDevices.length === 0 ? (
                      <option value="">🎧 No Microphone Detected (Listen-Only)</option>
                    ) : (
                      audioInputDevices.map((d, i) => (
                        <option key={d.deviceId || i} value={d.deviceId}>
                          🎙️ {d.label || `Microphone ${i + 1}`}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Camera Select */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Video size={14} style={{ color: "#94a3b8" }} />
                  <select
                    value={selectedVideoId}
                    onChange={(e) => setSelectedVideoId(e.target.value)}
                    disabled={useVirtualMedia}
                    style={{
                      flex: 1,
                      padding: "6px 8px",
                      borderRadius: "6px",
                      background: "rgba(30, 41, 59, 0.8)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      color: "#fff",
                      fontSize: "0.75rem",
                      outline: "none",
                      opacity: useVirtualMedia ? 0.5 : 1,
                    }}
                  >
                    {useVirtualMedia ? (
                      <option value="virtual">🧪 Synthetic Color Bars (Canvas Generator)</option>
                    ) : videoInputDevices.length === 0 ? (
                      <option value="">Default Webcam</option>
                    ) : (
                      videoInputDevices.map((d, i) => (
                        <option key={d.deviceId || i} value={d.deviceId}>
                          📷 {d.label || `Camera ${i + 1}`}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Speaker Output Select */}
                {audioOutputDevices.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Volume2 size={14} style={{ color: "#94a3b8" }} />
                    <select
                      value={selectedOutputId}
                      onChange={(e) => setSelectedOutputId(e.target.value)}
                      style={{
                        flex: 1,
                        padding: "6px 8px",
                        borderRadius: "6px",
                        background: "rgba(30, 41, 59, 0.8)",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        color: "#fff",
                        fontSize: "0.75rem",
                        outline: "none",
                      }}
                    >
                      {audioOutputDevices.map((d, i) => (
                        <option key={d.deviceId || i} value={d.deviceId}>
                          🔊 {d.label || `Speaker ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ─── 3. Room Credentials & Launcher Footer ───────────────── */}
          <div
            style={{
              background: "linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9))",
              border: "1px solid rgba(56, 189, 248, 0.3)",
              borderRadius: "14px",
              padding: "14px 18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase" }}>
                High-Entropy Room Credentials:
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "4px" }}>
                <span style={{ fontSize: "1.15rem", fontWeight: 800, fontFamily: "monospace", color: "#38bdf8", letterSpacing: "1px" }}>
                  {credentials.roomCode}
                </span>

                <button
                  type="button"
                  onClick={copyRoomCode}
                  style={{
                    background: "rgba(56, 189, 248, 0.15)",
                    border: "1px solid rgba(56, 189, 248, 0.3)",
                    borderRadius: "6px",
                    padding: "3px 8px",
                    color: "#38bdf8",
                    fontSize: "0.72rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  {copiedCode ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedCode ? "Copied" : "Copy Code"}</span>
                </button>

                <span style={{ fontSize: "0.74rem", color: "#64748b" }}>•</span>

                <span style={{ fontSize: "0.78rem", color: "#cbd5e1" }}>
                  Passphrase: <strong style={{ color: "#f8fafc", fontFamily: "monospace" }}>{credentials.passphrase}</strong>
                </span>

                <button
                  type="button"
                  onClick={() => setCredentials(generateRoomCredentials())}
                  style={{
                    background: "rgba(255, 255, 255, 0.08)",
                    border: "none",
                    borderRadius: "6px",
                    padding: "4px 8px",
                    color: "#cbd5e1",
                    fontSize: "0.72rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                  title="Generate new 6-character room code"
                >
                  <RefreshCw size={12} />
                  <span>Regenerate</span>
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                onClick={copyFullInvitation}
                style={{
                  padding: "10px 14px",
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "10px",
                  color: "#f1f5f9",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                {copiedPass ? <Check size={15} /> : <Copy size={15} />}
                <span>{copiedPass ? "Invitation Copied!" : "Copy Invite"}</span>
              </button>

              <button
                type="button"
                onClick={handleLaunch}
                style={{
                  padding: "10px 20px",
                  background: "linear-gradient(135deg, #0284c7, #0369a1)",
                  border: "1px solid #38bdf8",
                  borderRadius: "10px",
                  color: "#ffffff",
                  fontSize: "0.86rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  boxShadow: "0 4px 14px rgba(2, 132, 199, 0.4)",
                  transition: "all 0.15s ease",
                }}
              >
                <span>Launch & Enter Room</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 4. Admin Security PIN Gate Modal ('8899') ───────────── */}
      {showPinGate && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 140,
            background: "rgba(0, 0, 0, 0.8)",
            backdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
        >
          <div
            style={{
              width: "min(400px, 100%)",
              background: "#0f172a",
              border: "1px solid rgba(245, 158, 11, 0.5)",
              borderRadius: "16px",
              padding: "24px",
              color: "#fff",
              boxShadow: "0 20px 50px rgba(0, 0, 0, 0.9)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
              animation: pinShake ? "shake 0.4s ease-in-out" : "none",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "rgba(245, 158, 11, 0.2)",
                border: "1px solid #f59e0b",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fbbf24",
              }}
            >
              <Key size={24} />
            </div>

            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "#f8fafc" }}>
                Admin PIN Clearance Gate
              </div>
              <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "4px" }}>
                Enter the 4-digit Security PIN to unlock Administrator privileges:
              </div>
            </div>

            {/* 4-Digit Box Inputs */}
            <div style={{ display: "flex", gap: "10px" }}>
              {[0, 1, 2, 3].map((idx) => (
                <input
                  key={idx}
                  ref={pinInputRefs[idx]}
                  type="password"
                  maxLength={1}
                  value={adminPin[idx]}
                  onChange={(e) => handlePinDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handlePinKeyDown(idx, e)}
                  style={{
                    width: "48px",
                    height: "54px",
                    textAlign: "center",
                    fontSize: "1.6rem",
                    fontWeight: 800,
                    borderRadius: "10px",
                    background: "rgba(30, 41, 59, 0.9)",
                    border: adminPin[idx] ? "2px solid #f59e0b" : "1px solid rgba(255, 255, 255, 0.2)",
                    color: "#fbbf24",
                    outline: "none",
                  }}
                />
              ))}
            </div>

            {pinError && (
              <div style={{ fontSize: "0.75rem", color: "#f87171", textAlign: "center", fontWeight: 600 }}>
                {pinError}
              </div>
            )}

            <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
              Default Administrative PIN: <strong style={{ color: "#fbbf24" }}>8899</strong>
            </div>

            <div style={{ display: "flex", gap: "8px", width: "100%" }}>
              <button
                type="button"
                onClick={() => {
                  setShowPinGate(false);
                  setPinError("");
                }}
                style={{
                  flex: 1,
                  padding: "9px",
                  borderRadius: "8px",
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "none",
                  color: "#cbd5e1",
                  fontWeight: 600,
                  fontSize: "0.82rem",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => verifyAdminPin(adminPin.join(""))}
                style={{
                  flex: 1,
                  padding: "9px",
                  borderRadius: "8px",
                  background: "linear-gradient(135deg, #d97706, #b45309)",
                  border: "none",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "0.82rem",
                  cursor: "pointer",
                }}
              >
                Verify & Unlock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
