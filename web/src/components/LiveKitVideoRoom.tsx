"use client";

/**
 * LiveKit Video Room Component — Jan Sunwai Video Call Platform
 *
 * Integrates the official @livekit/components-react library to provide
 * a full-featured video conferencing experience for Jan Sunwai hearings.
 *
 * Uses the official LiveKit prefab components:
 * - <LiveKitRoom>       — Room connection provider
 * - <VideoConference>   — Full UI with grid, controls, and participant tiles
 * - <RoomAudioRenderer> — Handles audio playback for all participants
 *
 * Reference: https://docs.livekit.io/reference/components/react/
 */

import React from "react";
import "@livekit/components-styles";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useTracks,
  TrackLoop,
  ParticipantTile,
} from "@livekit/components-react";
import { Track, LocalParticipant } from "livekit-client";
import { Monitor, MonitorOff, Mic, MicOff, Video, VideoOff, PhoneOff, FileText, Camera, X, Smartphone, Copy, ExternalLink } from "lucide-react";

// Monkey-patch LocalParticipant prototype once so that:
// 1. Microphone unmute works seamlessly with physical hardware audio capture.
// 2. Screen sharing uses real screen capture on mobile & desktop.
if (typeof window !== "undefined" && !(LocalParticipant.prototype as any).__janSunwaiPatched) {
  (LocalParticipant.prototype as any).__janSunwaiPatched = true;

  const originalSetTrackEnabled = (LocalParticipant.prototype as any).setTrackEnabled;

  (LocalParticipant.prototype as any).setTrackEnabled = async function (
    source: Track.Source,
    enabled: boolean,
    captureOptions?: any,
    publishOptions?: any
  ) {
    // ─── Microphone ──────────────────────────────────────────
    if (source === Track.Source.Microphone) {
      if (enabled) {
        // 1. If publication already exists and is muted, simply unmute it
        const existingPub = this.getTrackPublication(Track.Source.Microphone);
        if (existingPub && existingPub.track) {
          try {
            await existingPub.unmute();
            return existingPub;
          } catch (e) {
            console.warn("[Jan Sunwai] Existing mic track unmute failed, re-acquiring:", e);
          }
        }

        // 2. Try physical hardware microphone first
        try {
          const pub = await originalSetTrackEnabled.call(this, source, enabled, captureOptions, publishOptions);
          window.dispatchEvent(
            new CustomEvent("jan-sunwai-toast", {
              detail: {
                message: "🎙️ Microphone is active and transmitting voice",
                type: "success",
              },
            })
          );
          return pub;
        } catch (hwErr: any) {
          console.warn("[Jan Sunwai] Hardware mic access blocked by system/browser:", hwErr);
          const isWindowsBlocked =
            hwErr.message?.toLowerCase().includes("permission denied by system") ||
            hwErr.name === "NotAllowedError";

          const msg = isWindowsBlocked
            ? "⚠️ Windows ने माइक्रोफ़ोन बंद कर रखा है! Windows Settings > Privacy & security > Microphone खोलकर 'Microphone access' को ON करें।"
            : (hwErr.message || "Microphone access denied. Please allow microphone in your browser settings.");

          window.dispatchEvent(
            new CustomEvent("jan-sunwai-toast", {
              detail: { message: msg, type: "error" },
            })
          );
          window.dispatchEvent(
            new CustomEvent("jan-sunwai-mic-blocked", {
              detail: { isBlocked: true, message: msg },
            })
          );
          return undefined;
        }
      } else {
        // enabled === false -> Mute
        const existingPub = this.getTrackPublication(Track.Source.Microphone);
        if (existingPub && existingPub.track) {
          await existingPub.mute();
          return existingPub;
        }
        return await originalSetTrackEnabled.call(this, source, enabled, captureOptions, publishOptions);
      }
    }

    // ─── Screen Sharing (Real Screen Capture) ─────────────────
    if (source === Track.Source.ScreenShare) {
      if (enabled) {
        try {
          let stream: MediaStream | null = null;

          if (typeof navigator !== "undefined") {
            if (navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === "function") {
              stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            } else if (typeof (navigator as any).getDisplayMedia === "function") {
              stream = await (navigator as any).getDisplayMedia({ video: true });
            }
          }

          if (stream) {
            const track = stream.getVideoTracks()[0];
            if (track) {
              const pub = await this.publishTrack(track, {
                source: Track.Source.ScreenShare,
                name: "screen_share",
              });
              track.onended = () => {
                if (pub && pub.track) {
                  this.unpublishTrack(pub.track);
                }
                window.dispatchEvent(
                  new CustomEvent("jan-sunwai-toast", {
                    detail: { message: "Screen sharing ended", type: "info" },
                  })
                );
              };
              window.dispatchEvent(
                new CustomEvent("jan-sunwai-toast", {
                  detail: { message: "Screen sharing active", type: "success" },
                })
              );
              return pub;
            }
          }

          // If stream is null (e.g. mobile browser where getDisplayMedia is not available)
          // Open the universal document & camera sharing options instead of failing!
          window.dispatchEvent(new CustomEvent("jan-sunwai-open-share-modal"));
          return undefined;
        } catch (err: any) {
          console.warn("[Jan Sunwai] Screen share error:", err);
          // Handled gracefully if user cancels native system screen recording dialog
          if (
            err.name === "NotAllowedError" ||
            err.name === "AbortError" ||
            err.message?.toLowerCase().includes("permission denied") ||
            err.message?.toLowerCase().includes("user denied") ||
            err.message?.toLowerCase().includes("cancelled")
          ) {
            window.dispatchEvent(
              new CustomEvent("jan-sunwai-toast", {
                detail: { message: "Screen sharing cancelled", type: "info" },
              })
            );
            return undefined;
          }

          // If unsupported on mobile or insecure origin, open the universal share modal!
          if (
            err.name === "DeviceUnsupportedError" ||
            err.message?.toLowerCase().includes("not supported")
          ) {
            window.dispatchEvent(new CustomEvent("jan-sunwai-open-share-modal"));
            return undefined;
          }

          window.dispatchEvent(
            new CustomEvent("jan-sunwai-toast", {
              detail: { message: err.message || "Screen sharing not available on this device", type: "error" },
            })
          );
          return undefined;
        }
      } else {
        const existingPub = this.getTrackPublication(Track.Source.ScreenShare);
        if (existingPub && existingPub.track) {
          await this.unpublishTrack(existingPub.track);
        }
        return undefined;
      }
    }

    return originalSetTrackEnabled.call(this, source, enabled, captureOptions, publishOptions);
  };

  (LocalParticipant.prototype as any).setMicrophoneEnabled = async function (
    enabled: boolean,
    captureOptions?: any,
    publishOptions?: any
  ) {
    return (this as any).setTrackEnabled(Track.Source.Microphone, enabled, captureOptions, publishOptions);
  };

  (LocalParticipant.prototype as any).setScreenShareEnabled = async function (
    enabled: boolean,
    captureOptions?: any,
    publishOptions?: any
  ) {
    return (this as any).setTrackEnabled(Track.Source.ScreenShare, enabled, captureOptions, publishOptions);
  };
}

// ─── Props ────────────────────────────────────────────────────

interface LiveKitVideoRoomProps {
  /** LiveKit access token (JWT) for this participant */
  token: string;
  /** LiveKit server WebSocket URL (e.g. ws://localhost:7880) */
  serverUrl: string;
  /** Room name for this hearing session */
  roomName: string;
  /** Callback when participant disconnects from the room */
  onDisconnected: () => void;
  /** Callback to end the call for all participants (host only) */
  onEndCall?: () => void;
}

// ─── Permanent Meeting Control Bar (Never Hides) ───────────────

// ─── All Participants Grid (All On One Screen — No Pagination) ───

function AllParticipantsGrid() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  return (
    <div
      className="jan-sunwai-all-participants-grid"
      data-count={tracks.length}
      style={{
        flex: 1,
        minHeight: 0,
        width: "100%",
        display: "grid",
        gap: "6px",
        padding: "6px",
        boxSizing: "border-box",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <TrackLoop tracks={tracks}>
        <ParticipantTile />
      </TrackLoop>
    </div>
  );
}

// ─── User-Friendly Permanent Bottom Meeting Control Bar ────────

function PermanentControlBar({ onLeave }: { onLeave?: () => void }) {
  const {
    isMicrophoneEnabled,
    isCameraEnabled,
    isScreenShareEnabled,
    localParticipant,
  } = useLocalParticipant();

  const [isTogglingMic, setIsTogglingMic] = React.useState(false);
  const [isTogglingCam, setIsTogglingCam] = React.useState(false);
  const [isTogglingScreen, setIsTogglingScreen] = React.useState(false);
  const [showShareModal, setShowShareModal] = React.useState(false);
  const [showAndroidGuide, setShowAndroidGuide] = React.useState(false);
  const [customSharingType, setCustomSharingType] = React.useState<"screen" | "camera" | "document" | null>(null);

  const customStreamRef = React.useRef<MediaStream | null>(null);
  const customTrackPubRef = React.useRef<any>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Listen for global open share modal events
  React.useEffect(() => {
    const handleOpenModal = () => setShowShareModal(true);
    window.addEventListener("jan-sunwai-open-share-modal", handleOpenModal);
    return () => {
      window.removeEventListener("jan-sunwai-open-share-modal", handleOpenModal);
    };
  }, []);

  const toggleMic = async () => {
    setIsTogglingMic(true);
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch (e) {
      console.warn("Toggle mic error:", e);
    } finally {
      setIsTogglingMic(false);
    }
  };

  const toggleCam = async () => {
    setIsTogglingCam(true);
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
    } catch (e) {
      console.warn("Toggle camera error:", e);
    } finally {
      setIsTogglingCam(false);
    }
  };

  // Stop any active custom or native screen share
  const stopSharing = async () => {
    setIsTogglingScreen(true);
    try {
      if (customTrackPubRef.current) {
        try {
          const trackToUnpub = customTrackPubRef.current.track || customTrackPubRef.current;
          await localParticipant.unpublishTrack(trackToUnpub);
        } catch (e) {
          console.warn("[Jan Sunwai] Error unpublishing custom screen track:", e);
        }
        customTrackPubRef.current = null;
      }
      if (customStreamRef.current) {
        customStreamRef.current.getTracks().forEach((t) => t.stop());
        customStreamRef.current = null;
      }

      // Also unpublish any LiveKit native screen track publication if exists
      const existingPub = localParticipant.getTrackPublication(Track.Source.ScreenShare);
      if (existingPub && existingPub.track) {
        try {
          await localParticipant.unpublishTrack(existingPub.track);
        } catch (e) {
          console.warn("[Jan Sunwai] Error unpublishing native screen track:", e);
        }
      }

      setCustomSharingType(null);
      window.dispatchEvent(
        new CustomEvent("jan-sunwai-toast", {
          detail: { message: "Screen / content sharing ended", type: "info" },
        })
      );
    } catch (e) {
      console.warn("Stop sharing error:", e);
    } finally {
      setIsTogglingScreen(false);
    }
  };

  // Start native screen share
  const startNativeScreenShare = async () => {
    setIsTogglingScreen(true);
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.mediaDevices &&
        typeof navigator.mediaDevices.getDisplayMedia === "function"
      ) {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        setShowShareModal(false);
        setShowAndroidGuide(false);
        customStreamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        track.onended = () => {
          stopSharing();
        };
        const pub = await localParticipant.publishTrack(track, {
          source: Track.Source.ScreenShare,
          name: "screen_share",
        });
        customTrackPubRef.current = pub;
        setCustomSharingType("screen");
        window.dispatchEvent(
          new CustomEvent("jan-sunwai-toast", {
            detail: { message: "Screen sharing active", type: "success" },
          })
        );
      } else {
        // Mobile Chrome / Safari where getDisplayMedia is restricted: open modal & show guide
        setShowShareModal(true);
        setShowAndroidGuide(true);
        window.dispatchEvent(
          new CustomEvent("jan-sunwai-toast", {
            detail: {
              message: "Mobile screen share is restricted by the browser. See guide below or share Document/Camera.",
              type: "warning",
            },
          })
        );
      }
    } catch (err: any) {
      console.warn("[Jan Sunwai] Native screen share error:", err);
      const isMobile =
        typeof navigator !== "undefined" &&
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

      if (
        !isMobile &&
        (err.name === "AbortError" ||
          err.message?.toLowerCase().includes("cancelled"))
      ) {
        window.dispatchEvent(
          new CustomEvent("jan-sunwai-toast", {
            detail: { message: "Screen sharing cancelled", type: "info" },
          })
        );
        return;
      }

      // On mobile or when blocked by mobile Chrome security policy: keep modal open and reveal guide
      setShowShareModal(true);
      setShowAndroidGuide(true);
      window.dispatchEvent(
        new CustomEvent("jan-sunwai-toast", {
          detail: {
            message: "Mobile browser blocked screen capture. See Chrome guide below or share Document/Camera.",
            type: "warning",
          },
        })
      );
    } finally {
      setIsTogglingScreen(false);
    }
  };

  // Start Live Document / Rear Camera Presentation
  const startCameraShare = async () => {
    setShowShareModal(false);
    setIsTogglingScreen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      customStreamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      track.onended = () => {
        stopSharing();
      };
      const pub = await localParticipant.publishTrack(track, {
        source: Track.Source.ScreenShare,
        name: "camera_screen_share",
      });
      customTrackPubRef.current = pub;
      setCustomSharingType("camera");
      window.dispatchEvent(
        new CustomEvent("jan-sunwai-toast", {
          detail: { message: "Live camera presentation active", type: "success" },
        })
      );
    } catch (err: any) {
      console.warn("[Jan Sunwai] Camera share error:", err);
      window.dispatchEvent(
        new CustomEvent("jan-sunwai-toast", {
          detail: { message: err.message || "Could not access camera for sharing", type: "error" },
        })
      );
    } finally {
      setIsTogglingScreen(false);
    }
  };

  // Start Document / Photo File Presentation via Canvas Stream
  const handleDocumentFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setShowShareModal(false);
    setIsTogglingScreen(true);

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 1280;
          canvas.height = 720;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;

          // Draw dark background
          ctx.fillStyle = "#090d16";
          ctx.fillRect(0, 0, 1280, 720);

          // Calculate scaling
          const scale = Math.min(1240 / img.width, 660 / img.height, 1);
          const w = img.width * scale;
          const h = img.height * scale;
          const x = (1280 - w) / 2;
          const y = (720 - h) / 2 + 15;

          ctx.drawImage(img, x, y, w, h);

          // Top label banner
          ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
          ctx.fillRect(0, 0, 1280, 36);
          ctx.fillStyle = "#38bdf8";
          ctx.font = "bold 15px system-ui, sans-serif";
          ctx.fillText(`📄 Document Presentation: ${file.name}`, 16, 24);

          const stream = (canvas as any).captureStream
            ? (canvas as any).captureStream(10)
            : (canvas as any).mozCaptureStream(10);
          customStreamRef.current = stream;
          const track = stream.getVideoTracks()[0];
          track.onended = () => {
            stopSharing();
          };

          const pub = await localParticipant.publishTrack(track, {
            source: Track.Source.ScreenShare,
            name: "document_screen_share",
          });
          customTrackPubRef.current = pub;
          setCustomSharingType("document");
          window.dispatchEvent(
            new CustomEvent("jan-sunwai-toast", {
              detail: { message: `Sharing document: ${file.name}`, type: "success" },
            })
          );
        } catch (err: any) {
          console.warn("[Jan Sunwai] Document share error:", err);
          window.dispatchEvent(
            new CustomEvent("jan-sunwai-toast", {
              detail: { message: "Failed to publish document stream", type: "error" },
            })
          );
        } finally {
          setIsTogglingScreen(false);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);

    // Reset input
    e.target.value = "";
  };

  const isSharing = isScreenShareEnabled || customSharingType !== null;

  const toggleScreen = async () => {
    if (isSharing) {
      await stopSharing();
      return;
    }

    const isMobile =
      typeof navigator !== "undefined" &&
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
      // On mobile devices, open the presentation sheet with 1-tap options:
      // Document/Photo share (100% works on mobile), Live Camera, or attempt Full Screen.
      setShowShareModal(true);
    } else {
      // Desktop: 1-click native screen share directly!
      await startNativeScreenShare();
    }
  };

  return (
    <>
      {/* Hidden file input for document sharing */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleDocumentFileSelect}
      />

      {/* Universal Screen & Content Sharing Modal */}
      {showShareModal && (
        <div
          style={{
            position: "fixed",
            bottom: "76px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "min(460px, calc(100vw - 24px))",
            background: "rgba(15, 23, 42, 0.98)",
            backdropFilter: "blur(24px)",
            border: "1px solid rgba(56, 189, 248, 0.35)",
            borderRadius: "16px",
            padding: "18px",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.85)",
            zIndex: 100,
            color: "#fff",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Monitor size={18} style={{ color: "#38bdf8" }} />
              <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                Screen & Content Sharing (सामग्री / स्क्रीन शेयर)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowShareModal(false)}
              style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: "4px" }}
            >
              <X size={18} />
            </button>
          </div>

          <p style={{ margin: 0, fontSize: "0.78rem", color: "#94a3b8", lineHeight: "1.4" }}>
            Choose how you would like to present in the hearing (प्रस्तुत करने का तरीका चुनें):
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {/* Option 1: Share Document or Photo (Works 100% reliably on all mobile devices) */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "13px 14px",
                background: "linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(5, 150, 105, 0.2))",
                border: "1px solid rgba(52, 211, 153, 0.5)",
                borderRadius: "12px",
                color: "#f8fafc",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s ease",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  background: "linear-gradient(135deg, #10b981, #059669)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  color: "#ffffff",
                  boxShadow: "0 2px 8px rgba(16, 185, 129, 0.4)",
                }}
              >
                <FileText size={22} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "#ffffff" }}>
                    📄 Share Document / Photo (दस्तावेज़ या फोटो)
                  </span>
                  <span
                    style={{
                      fontSize: "0.64rem",
                      padding: "1px 6px",
                      borderRadius: "4px",
                      background: "rgba(16, 185, 129, 0.35)",
                      color: "#34d399",
                      fontWeight: 700,
                    }}
                  >
                    फ़ोन पर 100% समर्थित
                  </span>
                </div>
                <div style={{ fontSize: "0.74rem", color: "#cbd5e1", marginTop: "2px" }}>
                  गैलरी या फ़ाइल से शिकायत का दस्तावेज़, रसीद, आधार या फोटो स्क्रीन पर दिखाएं।
                </div>
              </div>
            </button>

            {/* Option 2: Live Document / Rear Camera */}
            <button
              type="button"
              onClick={startCameraShare}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 14px",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                borderRadius: "10px",
                color: "#f8fafc",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s ease",
              }}
            >
              <div
                style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "8px",
                  background: "rgba(59, 130, 246, 0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  color: "#60a5fa",
                }}
              >
                <Camera size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "#ffffff" }}>
                  📸 Live Camera / Site Inspection (लाइव कैमरा से दिखाएं)
                </div>
                <div style={{ fontSize: "0.74rem", color: "#94a3b8", marginTop: "2px" }}>
                  अपने बैक कैमरे से कोई भी भौतिक दस्तावेज़ या घटनास्थल HD में लाइव दिखाएं।
                </div>
              </div>
            </button>

            {/* Option 3: Share Mobile Screen / Entire Screen (WhatsApp-like) */}
            <button
              type="button"
              onClick={startNativeScreenShare}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 14px",
                background: "rgba(37, 99, 235, 0.15)",
                border: "1px solid rgba(56, 189, 248, 0.35)",
                borderRadius: "10px",
                color: "#f8fafc",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s ease",
              }}
            >
              <div
                style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "8px",
                  background: "rgba(37, 99, 235, 0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  color: "#38bdf8",
                }}
              >
                <Smartphone size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "#ffffff" }}>
                    📱 Share Entire Mobile Screen (पूरा फ़ोन स्क्रीन)
                  </span>
                  <span
                    style={{
                      fontSize: "0.64rem",
                      padding: "1px 6px",
                      borderRadius: "4px",
                      background: "rgba(56, 189, 248, 0.25)",
                      color: "#38bdf8",
                      fontWeight: 700,
                    }}
                  >
                    WhatsApp जैसा
                  </span>
                </div>
                <div style={{ fontSize: "0.74rem", color: "#94a3b8", marginTop: "2px" }}>
                  व्हाट्सएप की तरह पूरे फ़ोन का स्क्रीन शेयर करें (Chrome फ़्लैग आवश्यक)।
                </div>
              </div>
            </button>

            {/* Android Chrome Screen Sharing Guide (Shows if Chrome requires enabling the screen capture flag) */}
            {showAndroidGuide && (
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.95)",
                  border: "1px solid rgba(56, 189, 248, 0.5)",
                  borderRadius: "10px",
                  padding: "12px 14px",
                  fontSize: "0.78rem",
                  color: "#e2e8f0",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span style={{ fontWeight: 700, color: "#38bdf8", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Smartphone size={15} />
                    Android Chrome स्क्रीन शेयर चालू करने का तरीका:
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAndroidGuide(false)}
                    style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: "2px" }}
                  >
                    <X size={14} />
                  </button>
                </div>
                <p style={{ margin: "0 0 8px 0", color: "#cbd5e1", lineHeight: "1.4" }}>
                  WhatsApp की तरह पूरा फ़ोन स्क्रीन शेयर करने के लिए Android Chrome में 1 बार यह फ़्लैग ऑन करें:
                </p>
                <div
                  style={{
                    display: "flex",
                    gap: "6px",
                    background: "rgba(0,0,0,0.6)",
                    padding: "6px 10px",
                    borderRadius: "6px",
                    alignItems: "center",
                    marginBottom: "8px",
                  }}
                >
                  <span style={{ flex: 1, fontFamily: "monospace", fontSize: "0.74rem", color: "#67e8f9", overflow: "hidden", textOverflow: "ellipsis" }}>
                    chrome://flags/#enable-media-screen-capture
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (navigator.clipboard) {
                        navigator.clipboard.writeText("chrome://flags/#enable-media-screen-capture");
                        window.dispatchEvent(
                          new CustomEvent("jan-sunwai-toast", {
                            detail: { message: "Copied! Open new tab in Chrome, paste & tap Enabled", type: "success" },
                          })
                        );
                      }
                    }}
                    style={{
                      background: "#2563eb",
                      color: "#fff",
                      border: "none",
                      borderRadius: "4px",
                      padding: "4px 8px",
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <Copy size={12} />
                    Copy Link
                  </button>
                </div>
                <ol style={{ margin: "0 0 8px 0", paddingLeft: "18px", color: "#94a3b8", lineHeight: "1.4" }}>
                  <li>Chrome के नए टैब में यह लिंक पेस्ट करें।</li>
                  <li><strong>Media Screen Capture</strong> को <strong>Enabled</strong> चुनें।</li>
                  <li>नीचे <strong>Relaunch</strong> पर टैप करें।</li>
                </ol>
                <div style={{ color: "#34d399", fontSize: "0.74rem", fontWeight: 600, paddingTop: "4px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  💡 या बिना सेटिंग बदले ऊपर दिए गए <strong>दस्तावेज़ या फोटो</strong> विकल्प से तुरंत शेयर करें!
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div
        id="jan-sunwai-permanent-controls"
        style={{
          width: "100%",
          height: "64px",
          flexShrink: 0,
          background: "rgba(10, 20, 38, 0.98)",
          backdropFilter: "blur(20px)",
          borderTop: "1px solid rgba(255, 255, 255, 0.15)",
          display: "flex",
          flexDirection: "row",
          flexWrap: "nowrap",
          justifyContent: "center",
          alignItems: "center",
          gap: "10px",
          padding: "6px 12px",
          boxSizing: "border-box",
          zIndex: 50,
          boxShadow: "0 -4px 20px rgba(0, 0, 0, 0.5)",
        }}
      >
        {/* 1. Mute / Unmute Button */}
        <button
          type="button"
          id="btn-control-mic"
          onClick={toggleMic}
          disabled={isTogglingMic}
          style={{
            display: "inline-flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "2px",
            minWidth: "66px",
            maxWidth: "88px",
            flex: 1,
            height: "48px",
            padding: "4px 8px",
            borderRadius: "10px",
            background: isMicrophoneEnabled
              ? "rgba(16, 185, 129, 0.2)"
              : "rgba(239, 68, 68, 0.22)",
            border: isMicrophoneEnabled
              ? "1px solid rgba(16, 185, 129, 0.5)"
              : "1px solid rgba(239, 68, 68, 0.5)",
            color: isMicrophoneEnabled ? "#34d399" : "#f87171",
            fontWeight: 600,
            fontSize: "0.72rem",
            cursor: isTogglingMic ? "wait" : "pointer",
            transition: "all 0.15s ease",
          }}
          title={isMicrophoneEnabled ? "Mute Microphone" : "Unmute Microphone"}
        >
          {isMicrophoneEnabled ? <Mic size={18} /> : <MicOff size={18} />}
          <span>{isMicrophoneEnabled ? "Mute" : "Unmute"}</span>
        </button>

        {/* 2. Video Camera Button */}
        <button
          type="button"
          id="btn-control-camera"
          onClick={toggleCam}
          disabled={isTogglingCam}
          style={{
            display: "inline-flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "2px",
            minWidth: "66px",
            maxWidth: "88px",
            flex: 1,
            height: "48px",
            padding: "4px 8px",
            borderRadius: "10px",
            background: isCameraEnabled
              ? "rgba(59, 130, 246, 0.2)"
              : "rgba(239, 68, 68, 0.22)",
            border: isCameraEnabled
              ? "1px solid rgba(59, 130, 246, 0.5)"
              : "1px solid rgba(239, 68, 68, 0.5)",
            color: isCameraEnabled ? "#60a5fa" : "#f87171",
            fontWeight: 600,
            fontSize: "0.72rem",
            cursor: isTogglingCam ? "wait" : "pointer",
            transition: "all 0.15s ease",
          }}
          title={isCameraEnabled ? "Stop Video" : "Start Video"}
        >
          {isCameraEnabled ? <Video size={18} /> : <VideoOff size={18} />}
          <span>{isCameraEnabled ? "Stop Cam" : "Start Cam"}</span>
        </button>

        {/* 3. Screen / Content Share Button */}
        <button
          type="button"
          id="btn-control-screenshare"
          onClick={toggleScreen}
          disabled={isTogglingScreen}
          style={{
            display: "inline-flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "2px",
            minWidth: "66px",
            maxWidth: "88px",
            flex: 1,
            height: "48px",
            padding: "4px 8px",
            borderRadius: "10px",
            background: isSharing
              ? "linear-gradient(135deg, #10b981, #059669)"
              : "rgba(255, 255, 255, 0.08)",
            border: isSharing
              ? "1px solid #34d399"
              : "1px solid rgba(255, 255, 255, 0.18)",
            color: "#ffffff",
            fontWeight: 600,
            fontSize: "0.72rem",
            cursor: isTogglingScreen ? "wait" : "pointer",
            boxShadow: isSharing
              ? "0 0 12px rgba(16, 185, 129, 0.5)"
              : undefined,
            transition: "all 0.15s ease",
          }}
          title={isSharing ? "Stop Sharing" : "Share Screen or Document"}
        >
          {isSharing ? <MonitorOff size={18} /> : <Monitor size={18} />}
          <span>
            {isTogglingScreen
              ? "Starting..."
              : isSharing
              ? customSharingType === "camera"
                ? "Cam Share"
                : customSharingType === "document"
                ? "Doc Share"
                : "Sharing"
              : "Share"}
          </span>
        </button>

        {/* 4. Leave Hearing Button */}
        <button
          type="button"
          id="btn-control-leave"
          onClick={onLeave}
          style={{
            display: "inline-flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "2px",
            minWidth: "66px",
            maxWidth: "88px",
            flex: 1,
            height: "48px",
            padding: "4px 8px",
            borderRadius: "10px",
            background: "linear-gradient(135deg, #ef4444, #dc2626)",
            border: "1px solid #f87171",
            color: "#ffffff",
            fontWeight: 700,
            fontSize: "0.72rem",
            cursor: "pointer",
            boxShadow: "0 2px 10px rgba(239, 68, 68, 0.4)",
            transition: "all 0.15s ease",
          }}
          title="Leave Hearing"
        >
          <PhoneOff size={18} />
          <span>Leave</span>
        </button>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function LiveKitVideoRoom({
  token,
  serverUrl,
  roomName,
  onDisconnected,
}: LiveKitVideoRoomProps) {
  const wsUrl = serverUrl.startsWith("http")
    ? serverUrl.replace("http://", "ws://").replace("https://", "wss://")
    : serverUrl;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        flex: 1,
        minHeight: 0,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <LiveKitRoom
        serverUrl={wsUrl}
        token={token}
        connect={true}
        video={true}
        audio={true}
        data-lk-theme="default"
        style={{
          height: "100%",
          width: "100%",
          position: "relative",
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onDisconnected={onDisconnected}
      >
        {/* All participants displayed on ONE single screen without pagination */}
        <AllParticipantsGrid />

        {/* User-friendly horizontal bottom bar (never stacked in circle) */}
        <PermanentControlBar onLeave={onDisconnected} />

        {/* RoomAudioRenderer plays all remote audio streams */}
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
}
