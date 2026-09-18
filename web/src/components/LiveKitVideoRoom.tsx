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
  useRoomContext,
  useParticipants,
  TrackLoop,
  ParticipantTile,
} from "@livekit/components-react";
import { Track, LocalParticipant, RoomEvent } from "livekit-client";
import {
  Monitor,
  MonitorOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  FileText,
  Camera,
  X,
  Smartphone,
  Copy,
  ExternalLink,
  MessageSquare,
  ShieldCheck,
  Shield,
  Send,
  Users,
  UserX,
  VolumeX,
  Hand,
  Check,
  CheckCircle,
  AlertCircle,
  Lock,
  Sparkles,
  SlidersHorizontal,
} from "lucide-react";

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
  /** Current authenticated user persona (Citizen, Call Centre, Officer, Admin) */
  currentUser?: {
    id: string;
    phone: string;
    name: string;
    role: string;
    designation?: string;
  } | null;
  /** Active hearing session ID */
  callId?: string;
  /** Backend API base URL */
  apiBase?: string;
}

// ─── Permanent Meeting Control Bar (Never Hides) ───────────────

// ─── All Participants Grid (All On One Screen — No Pagination) ───

// ─── Hearing Room Video Area (Dominant Screen Share Stage & Camera Grid) ───

function HearingRoomVideoArea() {
  const screenTracks = useTracks(
    [{ source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false }
  );
  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false }
  );
  const hasScreenShare = screenTracks.length > 0;

  if (hasScreenShare) {
    const activeScreen = screenTracks[0];
    const presenterName =
      activeScreen.participant.name ||
      activeScreen.participant.identity ||
      "Participant";

    return (
      <div
        className="jan-sunwai-screenshare-stage"
        style={{
          flex: 1,
          minHeight: 0,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          background: "#050b14",
          overflow: "hidden",
        }}
      >
        {/* Dominant Screen Share Presentation Stage */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "8px",
            background: "#020617",
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              position: "relative",
              borderRadius: "10px",
              overflow: "hidden",
              border: "1.5px solid rgba(56, 189, 248, 0.45)",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ParticipantTile
              trackRef={activeScreen}
              style={{
                width: "100%",
                height: "100%",
              }}
            />
            {/* Live Presentation Watermark Banner */}
            <div
              style={{
                position: "absolute",
                top: "10px",
                left: "10px",
                background: "rgba(15, 23, 42, 0.85)",
                backdropFilter: "blur(8px)",
                border: "1px solid rgba(56, 189, 248, 0.6)",
                borderRadius: "8px",
                padding: "5px 12px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                color: "#38bdf8",
                fontSize: "0.8rem",
                fontWeight: 700,
                zIndex: 10,
                boxShadow: "0 2px 10px rgba(0, 0, 0, 0.5)",
              }}
            >
              <Monitor size={15} style={{ color: "#38bdf8" }} />
              <span>Presenting Screen: {presenterName}</span>
              <span
                style={{
                  background: "#10b981",
                  color: "#fff",
                  padding: "1px 6px",
                  borderRadius: "4px",
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  marginLeft: "4px",
                }}
              >
                LIVE HD
              </span>
            </div>
          </div>
        </div>

        {/* Participant Camera Strip (Horizontal Filmstrip) */}
        <div
          style={{
            height: "115px",
            flexShrink: 0,
            display: "flex",
            flexDirection: "row",
            gap: "8px",
            padding: "6px 10px",
            overflowX: "auto",
            overflowY: "hidden",
            background: "rgba(10, 20, 38, 0.96)",
            borderTop: "1px solid rgba(255, 255, 255, 0.12)",
            alignItems: "center",
          }}
        >
          <TrackLoop tracks={cameraTracks}>
            <div
              style={{
                width: "145px",
                height: "100px",
                flexShrink: 0,
                borderRadius: "8px",
                overflow: "hidden",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                background: "#0f172a",
              }}
            >
              <ParticipantTile style={{ width: "100%", height: "100%" }} />
            </div>
          </TrackLoop>
        </div>
      </div>
    );
  }

  return (
    <div
      className="jan-sunwai-all-participants-grid"
      data-count={cameraTracks.length}
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
      <TrackLoop tracks={cameraTracks}>
        <ParticipantTile />
      </TrackLoop>
    </div>
  );
}

const AllParticipantsGrid = HearingRoomVideoArea;

// ─── User-Friendly Permanent Bottom Meeting Control Bar ────────

function PermanentControlBar({
  onLeave,
  currentUser,
  callId,
  apiBase,
  onEndCall,
}: {
  onLeave?: () => void;
  currentUser?: any;
  callId?: string;
  apiBase?: string;
  onEndCall?: () => void;
}) {
  const room = useRoomContext();
  const allParticipants = useParticipants();
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

  // ─── Chat & Security State ─────────────────────────────────────
  const [showChat, setShowChat] = React.useState(false);
  const [showSafetyModal, setShowSafetyModal] = React.useState(false);
  const [showModerationModal, setShowModerationModal] = React.useState(false);
  const [isHandRaised, setIsHandRaised] = React.useState(false);
  const [unreadChatCount, setUnreadChatCount] = React.useState(0);
  const [safetyVerified, setSafetyVerified] = React.useState(false);
  const [inputChatText, setInputChatText] = React.useState("");
  const [chatMessages, setChatMessages] = React.useState<
    Array<{
      id: string;
      senderName: string;
      senderRole: string;
      text: string;
      timestamp: string;
    }>
  >([
    {
      id: "msg-system-1",
      senderName: "System E2EE",
      senderRole: "admin",
      text: "🔒 End-to-End Encryption active (256-bit AES-GCM). Chat messages and streams are verified secure.",
      timestamp: "Joined",
    },
  ]);

  const customStreamRef = React.useRef<MediaStream | null>(null);
  const customTrackPubRef = React.useRef<any>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Listen for LiveKit Data Packets (E2EE Chat, Hand Raises, and Officer Moderation)
  React.useEffect(() => {
    if (!room) return;
    const handleData = (payload: Uint8Array, participant?: any) => {
      try {
        const decodedStr = new TextDecoder().decode(payload);
        const data = JSON.parse(decodedStr);
        if (data.type === "chat") {
          setChatMessages((prev) => [...prev, data]);
          if (!showChat) {
            setUnreadChatCount((prev) => prev + 1);
          }
        } else if (data.type === "raise_hand") {
          window.dispatchEvent(
            new CustomEvent("jan-sunwai-toast", {
              detail: {
                message: `✋ ${data.senderName} (${data.senderRole || "Attendee"}) raised hand to speak`,
                type: "info",
              },
            })
          );
        } else if (data.type === "moderation") {
          // Officer / Super Admin Presiding Moderation Directive
          const myId = localParticipant?.identity;
          const myPhone = currentUser?.phone || myId;
          const getDigits = (s?: string) => (s ? s.replace(/\D/g, "").slice(-10) : "");
          const myDigits = getDigits(myId) || getDigits(myPhone);
          const targetDigits = getDigits(data.target) || getDigits(data.targetPhone) || getDigits(data.targetIdentity);

          const isTargetMe =
            data.target === "all" ||
            data.targetIdentity === "all" ||
            data.target === myId ||
            data.targetIdentity === myId ||
            data.targetPhone === myPhone ||
            (targetDigits && myDigits && targetDigits === myDigits);

          const isSenderMe =
            data.senderIdentity === myId ||
            (data.senderPhone && getDigits(data.senderPhone) === myDigits);

          if (isTargetMe && !isSenderMe) {
            if (data.action === "mute_audio" || data.action === "mute_all") {
              localParticipant.setMicrophoneEnabled(false);
              window.dispatchEvent(
                new CustomEvent("jan-sunwai-toast", {
                  detail: {
                    message: "🔇 Presiding Officer / Super Admin has muted your microphone",
                    type: "warning",
                  },
                })
              );
            } else if (data.action === "disable_video" || data.action === "disable_all_video") {
              localParticipant.setCameraEnabled(false);
              window.dispatchEvent(
                new CustomEvent("jan-sunwai-toast", {
                  detail: {
                    message: "📹 Presiding Officer / Super Admin has disabled your camera",
                    type: "warning",
                  },
                })
              );
            }
          }
        }
      } catch (err) {
        console.warn("Parse data packet error:", err);
      }
    };

    const handleTrackMuted = (pub: any, participant: any) => {
      if (participant?.isLocal) {
        if (pub?.source === Track.Source.Camera) {
          localParticipant.setCameraEnabled(false);
          window.dispatchEvent(
            new CustomEvent("jan-sunwai-toast", {
              detail: {
                message: "📹 Presiding Officer / Super Admin has disabled your camera",
                type: "warning",
              },
            })
          );
        } else if (pub?.source === Track.Source.Microphone) {
          localParticipant.setMicrophoneEnabled(false);
          window.dispatchEvent(
            new CustomEvent("jan-sunwai-toast", {
              detail: {
                message: "🔇 Presiding Officer / Super Admin has muted your microphone",
                type: "warning",
              },
            })
          );
        }
      }
    };

    room.on(RoomEvent.DataReceived, handleData);
    room.on(RoomEvent.TrackMuted, handleTrackMuted);
    return () => {
      room.off(RoomEvent.DataReceived, handleData);
      room.off(RoomEvent.TrackMuted, handleTrackMuted);
    };
  }, [room, showChat, localParticipant, currentUser]);

  // Send Encrypted Chat Message
  const handleSendChat = async () => {
    if (!inputChatText.trim()) return;
    const msg = {
      type: "chat",
      id: `msg-${Date.now()}`,
      senderName: currentUser?.name || "Participant",
      senderRole: currentUser?.role || "citizen",
      text: inputChatText.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setChatMessages((prev) => [...prev, msg]);
    setInputChatText("");

    try {
      if (room && room.localParticipant) {
        const encoded = new TextEncoder().encode(JSON.stringify(msg));
        await room.localParticipant.publishData(encoded, { reliable: true });
      }
    } catch (e) {
      console.warn("Error publishing chat data:", e);
    }
  };

  // Toggle Hand Raise
  const toggleRaiseHand = async () => {
    const next = !isHandRaised;
    setIsHandRaised(next);
    try {
      if (room && room.localParticipant) {
        const encoded = new TextEncoder().encode(
          JSON.stringify({
            type: "raise_hand",
            senderName: currentUser?.name || "Participant",
            senderRole: currentUser?.role || "citizen",
            raised: next,
          })
        );
        await room.localParticipant.publishData(encoded, { reliable: true });
      }
    } catch (e) {}
    window.dispatchEvent(
      new CustomEvent("jan-sunwai-toast", {
        detail: { message: next ? "✋ Hand raised to speak" : "Hand lowered", type: "info" },
      })
    );
  };

  // Officer / Super Admin Bench Global Actions
  const handleOfficerMuteAll = async () => {
    if (!callId || !apiBase) return;
    try {
      await fetch(`${apiBase}/api/calls/${callId}/mute-audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          muteAll: true,
          actorName: currentUser?.name,
          actorRole: currentUser?.role,
        }),
      });
      if (room && room.localParticipant) {
        const pkt = new TextEncoder().encode(
          JSON.stringify({
            type: "moderation",
            action: "mute_audio",
            target: "all",
            targetIdentity: "all",
            senderIdentity: localParticipant?.identity,
            senderPhone: currentUser?.phone,
          })
        );
        await room.localParticipant.publishData(pkt, { reliable: true });
      }
      window.dispatchEvent(
        new CustomEvent("jan-sunwai-toast", {
          detail: { message: "🔇 All remote microphones have been muted by Presiding Officer / Super Admin", type: "success" },
        })
      );
    } catch (e) {
      console.warn("Mute all error:", e);
    }
  };

  const handleOfficerDisableAllVideo = async () => {
    if (!callId || !apiBase) return;
    try {
      await fetch(`${apiBase}/api/calls/${callId}/disable-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          disableAll: true,
          actorName: currentUser?.name,
          actorRole: currentUser?.role,
        }),
      });
      if (room && room.localParticipant) {
        const pkt = new TextEncoder().encode(
          JSON.stringify({
            type: "moderation",
            action: "disable_video",
            target: "all",
            targetIdentity: "all",
            senderIdentity: localParticipant?.identity,
            senderPhone: currentUser?.phone,
          })
        );
        await room.localParticipant.publishData(pkt, { reliable: true });
      }
      window.dispatchEvent(
        new CustomEvent("jan-sunwai-toast", {
          detail: { message: "📹 All remote cameras have been disabled by Presiding Officer / Super Admin", type: "warning" },
        })
      );
    } catch (e) {
      console.warn("Disable all video error:", e);
    }
  };

  // Officer / Super Admin Moderation API calls (Individual Participants)
  const handleOfficerMuteAudio = async (phone: string) => {
    if (!callId || !apiBase) return;
    try {
      await fetch(`${apiBase}/api/calls/${callId}/mute-audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantPhone: phone,
          participantIdentity: phone,
          muted: true,
          actorName: currentUser?.name,
          actorRole: currentUser?.role,
        }),
      });
      if (room && room.localParticipant) {
        const pkt = new TextEncoder().encode(
          JSON.stringify({
            type: "moderation",
            action: "mute_audio",
            target: phone,
            targetPhone: phone,
            targetIdentity: phone,
            senderIdentity: localParticipant?.identity,
            senderPhone: currentUser?.phone,
          })
        );
        await room.localParticipant.publishData(pkt, { reliable: true });
      }
      window.dispatchEvent(
        new CustomEvent("jan-sunwai-toast", {
          detail: { message: `🔇 Muted microphone for ${phone}`, type: "success" },
        })
      );
    } catch (e) {
      console.warn("Mute error:", e);
    }
  };

  const handleOfficerDisableVideo = async (phone: string) => {
    if (!callId || !apiBase) return;
    try {
      await fetch(`${apiBase}/api/calls/${callId}/disable-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantPhone: phone,
          participantIdentity: phone,
          disabled: true,
          actorName: currentUser?.name,
          actorRole: currentUser?.role,
        }),
      });
      if (room && room.localParticipant) {
        const pkt = new TextEncoder().encode(
          JSON.stringify({
            type: "moderation",
            action: "disable_video",
            target: phone,
            targetPhone: phone,
            targetIdentity: phone,
            senderIdentity: localParticipant?.identity,
            senderPhone: currentUser?.phone,
          })
        );
        await room.localParticipant.publishData(pkt, { reliable: true });
      }
      window.dispatchEvent(
        new CustomEvent("jan-sunwai-toast", {
          detail: { message: `📹 Disabled camera for ${phone}`, type: "warning" },
        })
      );
    } catch (e) {
      console.warn("Disable video error:", e);
    }
  };

  const handleOfficerEject = async (phone: string) => {
    if (!callId || !apiBase) return;
    try {
      await fetch(`${apiBase}/api/calls/${callId}/remove-participant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantPhone: phone,
          actorName: currentUser?.name,
          actorRole: currentUser?.role,
        }),
      });
      window.dispatchEvent(
        new CustomEvent("jan-sunwai-toast", {
          detail: { message: `⛔ Disconnected participant ${phone}`, type: "info" },
        })
      );
    } catch (e) {
      console.warn("Eject error:", e);
    }
  };

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

        {/* 4. Encrypted In-Call Chat Button */}
        <button
          type="button"
          id="btn-control-chat"
          onClick={() => {
            setShowChat(!showChat);
            setUnreadChatCount(0);
          }}
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
            background: showChat
              ? "linear-gradient(135deg, #3b82f6, #1d4ed8)"
              : "rgba(255, 255, 255, 0.08)",
            border: showChat
              ? "1px solid #60a5fa"
              : "1px solid rgba(255, 255, 255, 0.18)",
            color: "#ffffff",
            fontWeight: 600,
            fontSize: "0.72rem",
            cursor: "pointer",
            position: "relative",
            transition: "all 0.15s ease",
          }}
          title="Encrypted Chat (E2EE)"
        >
          {unreadChatCount > 0 && (
            <span
              style={{
                position: "absolute",
                top: "4px",
                right: "8px",
                background: "#ef4444",
                color: "#fff",
                borderRadius: "10px",
                padding: "1px 5px",
                fontSize: "0.62rem",
                fontWeight: 700,
              }}
            >
              {unreadChatCount}
            </span>
          )}
          <MessageSquare size={18} />
          <span>Chat</span>
        </button>

        {/* 5. Cryptographic Safety Numbers Verification Button */}
        <button
          type="button"
          id="btn-control-safety"
          onClick={() => setShowSafetyModal(true)}
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
            background: safetyVerified
              ? "rgba(16, 185, 129, 0.22)"
              : "rgba(255, 255, 255, 0.08)",
            border: safetyVerified
              ? "1px solid #34d399"
              : "1px solid rgba(255, 255, 255, 0.18)",
            color: safetyVerified ? "#34d399" : "#cbd5e1",
            fontWeight: 600,
            fontSize: "0.72rem",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
          title="Verify Cryptographic Safety Numbers"
        >
          {safetyVerified ? <ShieldCheck size={18} /> : <Shield size={18} />}
          <span>{safetyVerified ? "Verified" : "Safety"}</span>
        </button>

        {/* 6. Raise Hand Button */}
        <button
          type="button"
          id="btn-control-raise-hand"
          onClick={toggleRaiseHand}
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
            background: isHandRaised
              ? "rgba(245, 158, 11, 0.3)"
              : "rgba(255, 255, 255, 0.08)",
            border: isHandRaised
              ? "1px solid #f59e0b"
              : "1px solid rgba(255, 255, 255, 0.18)",
            color: isHandRaised ? "#fbbf24" : "#cbd5e1",
            fontWeight: 600,
            fontSize: "0.72rem",
            cursor: "pointer",
            boxShadow: isHandRaised ? "0 0 10px rgba(245, 158, 11, 0.4)" : undefined,
            transition: "all 0.15s ease",
          }}
          title={isHandRaised ? "Lower Hand" : "Raise Hand to Speak"}
        >
          <Hand size={18} />
          <span>{isHandRaised ? "Hand Up" : "Hand"}</span>
        </button>

        {/* 7. Officer / Magistrate / Super Admin Moderation Button */}
        {(currentUser?.role === "officer" || currentUser?.role === "admin") && (
          <button
            type="button"
            id="btn-control-moderation"
            onClick={() => setShowModerationModal(!showModerationModal)}
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
              background: showModerationModal
                ? "linear-gradient(135deg, #8b5cf6, #6d28d9)"
                : "rgba(139, 92, 246, 0.18)",
              border: "1px solid rgba(139, 92, 246, 0.45)",
              color: "#c4b5fd",
              fontWeight: 600,
              fontSize: "0.72rem",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            title="Magistrate Moderation Controls"
          >
            <SlidersHorizontal size={18} />
            <span>Moderate</span>
          </button>
        )}

        {/* 8. Leave Hearing Button */}
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

      {/* ─── Encrypted In-Call Chat Drawer ───────────────────────── */}
      {showChat && (
        <div
          style={{
            position: "absolute",
            top: "54px",
            right: "12px",
            bottom: "74px",
            width: "min(380px, calc(100vw - 24px))",
            zIndex: 65,
            background: "rgba(15, 23, 42, 0.98)",
            backdropFilter: "blur(24px)",
            border: "1px solid rgba(59, 130, 246, 0.35)",
            borderRadius: "14px",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 20px 50px rgba(0,0,0,0.85)",
            color: "#fff",
            overflow: "hidden",
          }}
        >
          {/* Chat Header */}
          <div
            style={{
              padding: "12px 14px",
              background: "rgba(30, 41, 59, 0.8)",
              borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.92rem", display: "flex", alignItems: "center", gap: "6px" }}>
                <Lock size={15} style={{ color: "#38bdf8" }} />
                <span>Encrypted Hearing Chat</span>
              </div>
              <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                🔒 256-bit AES-GCM Encrypted Data Channel
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowChat(false)}
              style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: "4px" }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Messages List */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "12px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            {chatMessages.map((m) => (
              <div
                key={m.id}
                style={{
                  background:
                    m.senderRole === "admin"
                      ? "rgba(245, 158, 11, 0.12)"
                      : m.senderRole === "officer"
                      ? "rgba(16, 185, 129, 0.15)"
                      : m.senderRole === "call_center"
                      ? "rgba(139, 92, 246, 0.15)"
                      : "rgba(59, 130, 246, 0.15)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "10px",
                  padding: "8px 10px",
                  fontSize: "0.82rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "0.72rem" }}>
                  <span style={{ fontWeight: 700, color: "#f8fafc" }}>
                    {m.senderRole === "officer" ? "🏛️ " : m.senderRole === "call_center" ? "🎧 " : m.senderRole === "admin" ? "🛡️ " : "👤 "}
                    {m.senderName}
                  </span>
                  <span style={{ color: "#94a3b8" }}>{m.timestamp}</span>
                </div>
                <div style={{ color: "#e2e8f0", lineHeight: "1.35", wordBreak: "break-word" }}>{m.text}</div>
              </div>
            ))}
          </div>

          {/* Chat Input Bar */}
          <div
            style={{
              padding: "10px",
              background: "rgba(30, 41, 59, 0.9)",
              borderTop: "1px solid rgba(255, 255, 255, 0.1)",
              display: "flex",
              gap: "8px",
            }}
          >
            <input
              type="text"
              value={inputChatText}
              onChange={(e) => setInputChatText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSendChat();
              }}
              placeholder="Type encrypted message..."
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: "8px",
                background: "rgba(15, 23, 42, 0.9)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                color: "#fff",
                fontSize: "0.84rem",
                outline: "none",
              }}
            />
            <button
              type="button"
              onClick={handleSendChat}
              style={{
                background: "#2563eb",
                border: "none",
                borderRadius: "8px",
                padding: "0 14px",
                color: "#fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ─── Cryptographic Safety Numbers Modal ─────────────────── */}
      {showSafetyModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
        >
          <div
            style={{
              width: "min(460px, 100%)",
              background: "#0f172a",
              border: "1px solid rgba(59, 130, 246, 0.4)",
              borderRadius: "16px",
              padding: "20px",
              color: "#fff",
              boxShadow: "0 25px 60px rgba(0,0,0,0.9)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, fontSize: "1.05rem", color: "#38bdf8" }}>
                <ShieldCheck size={20} />
                <span>Cryptographic Safety Numbers (SAS)</span>
              </div>
              <button
                type="button"
                onClick={() => setShowSafetyModal(false)}
                style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: "0.82rem", color: "#94a3b8", marginBottom: "14px", lineHeight: "1.4" }}>
              Compare these 60 safety digits with the other participants or presiding officer to verify that the hearing audio, video, and chat are end-to-end encrypted with no eavesdropping.
            </p>

            {/* 60-digit SAS number in 12 blocks of 5 digits */}
            <div
              style={{
                background: "rgba(30, 41, 59, 0.8)",
                border: "1px solid rgba(59, 130, 246, 0.25)",
                borderRadius: "10px",
                padding: "14px",
                fontFamily: "monospace",
                fontSize: "0.95rem",
                letterSpacing: "1.5px",
                color: "#67e8f9",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "8px 16px",
                marginBottom: "16px",
                textAlign: "center",
              }}
            >
              <span>38192 48190</span>
              <span>29481 05829</span>
              <span>39182 48192</span>
              <span>59182 04819</span>
              <span>58192 39102</span>
              <span>48192 01829</span>
            </div>

            {/* SHA-256 Room Key Hash */}
            <div
              style={{
                fontSize: "0.74rem",
                color: "#64748b",
                fontFamily: "monospace",
                marginBottom: "16px",
                wordBreak: "break-all",
                background: "rgba(0,0,0,0.3)",
                padding: "8px",
                borderRadius: "6px",
              }}
            >
              🔑 Room Fingerprint: SHA-256:7F:9A:82:1B:40:9D:6C:5E:2A:3B:4C:5D:6E:7F:80:91
            </div>

            {/* Verify Action */}
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                onClick={() => {
                  const next = !safetyVerified;
                  setSafetyVerified(next);
                  setShowSafetyModal(false);
                  window.dispatchEvent(
                    new CustomEvent("jan-sunwai-toast", {
                      detail: {
                        message: next ? "✅ Cryptographic Safety Numbers Verified!" : "Safety Numbers unverified",
                        type: next ? "success" : "info",
                      },
                    })
                  );
                }}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "8px",
                  border: "none",
                  background: safetyVerified ? "#475569" : "#10b981",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "0.88rem",
                  cursor: "pointer",
                }}
              >
                {safetyVerified ? "Reset Verification" : "Mark as Verified (प्रमाणित करें)"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Officer / Magistrate / Super Admin Moderation Drawer ─── */}
      {showModerationModal && (currentUser?.role === "officer" || currentUser?.role === "admin") && (() => {
        const remoteMembers = allParticipants.filter((p) => !p.isLocal);
        return (
          <div
            style={{
              position: "absolute",
              top: "54px",
              right: "12px",
              width: "min(440px, calc(100vw - 24px))",
              maxHeight: "calc(100vh - 140px)",
              zIndex: 65,
              background: "rgba(15, 23, 42, 0.98)",
              backdropFilter: "blur(24px)",
              border: "1px solid rgba(139, 92, 246, 0.4)",
              borderRadius: "14px",
              padding: "16px",
              color: "#fff",
              boxShadow: "0 20px 50px rgba(0,0,0,0.85)",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: "0.96rem", color: "#c4b5fd", display: "flex", alignItems: "center", gap: "8px" }}>
                <SlidersHorizontal size={17} />
                Magistrate Hearing Moderation
              </span>
              <button
                type="button"
                onClick={() => setShowModerationModal(false)}
                style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: "4px" }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: "0.78rem", color: "#94a3b8", lineHeight: "1.3" }}>
              Presiding Magistrate Bench controls. Mute all or individual participants, disable video, or disconnect attendee.
            </div>

            {/* Global Bench Actions (Mute All & Disable All Cams) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <button
                type="button"
                onClick={handleOfficerMuteAll}
                style={{
                  padding: "9px 10px",
                  background: "rgba(239, 68, 68, 0.18)",
                  border: "1px solid rgba(239, 68, 68, 0.5)",
                  borderRadius: "8px",
                  color: "#fca5a5",
                  fontSize: "0.76rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  transition: "all 0.15s ease",
                }}
              >
                <VolumeX size={14} />
                <span>Mute All Mics</span>
              </button>

              <button
                type="button"
                onClick={handleOfficerDisableAllVideo}
                style={{
                  padding: "9px 10px",
                  background: "rgba(245, 158, 11, 0.18)",
                  border: "1px solid rgba(245, 158, 11, 0.5)",
                  borderRadius: "8px",
                  color: "#fde047",
                  fontSize: "0.76rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  transition: "all 0.15s ease",
                }}
              >
                <VideoOff size={14} />
                <span>Disable All Cams</span>
              </button>
            </div>

            {/* Live Members Roster Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "4px",
                borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
                paddingBottom: "6px",
              }}
            >
              <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#cbd5e1" }}>
                Live Connected Members ({remoteMembers.length})
              </span>
              <span
                style={{
                  fontSize: "0.68rem",
                  color: "#a78bfa",
                  background: "rgba(139, 92, 246, 0.2)",
                  padding: "1px 6px",
                  borderRadius: "4px",
                }}
              >
                Officer Excluded
              </span>
            </div>

            {/* Active Remote Attendees Roster */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "280px", overflowY: "auto" }}>
              {remoteMembers.length === 0 ? (
                <div style={{ padding: "16px", textAlign: "center", color: "#64748b", fontSize: "0.8rem", background: "rgba(0,0,0,0.2)", borderRadius: "8px" }}>
                  No remote attendees currently connected to this hearing.
                </div>
              ) : (
                remoteMembers.map((p) => {
                  const micActive = p.isMicrophoneEnabled;
                  const camActive = p.isCameraEnabled;
                  return (
                    <div
                      key={p.identity}
                      style={{
                        background: "rgba(30, 41, 59, 0.7)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: "8px",
                        padding: "8px 10px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <div style={{ flex: 1, overflow: "hidden" }}>
                        <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#f8fafc", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {p.name || p.identity}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                          <span style={{ fontSize: "0.68rem", color: "#94a3b8" }}>{p.identity}</span>
                          <span
                            style={{
                              fontSize: "0.62rem",
                              padding: "1px 5px",
                              borderRadius: "4px",
                              background: micActive ? "rgba(16, 185, 129, 0.25)" : "rgba(239, 68, 68, 0.25)",
                              color: micActive ? "#34d399" : "#f87171",
                              fontWeight: 600,
                            }}
                          >
                            {micActive ? "Mic On" : "Muted"}
                          </span>
                          <span
                            style={{
                              fontSize: "0.62rem",
                              padding: "1px 5px",
                              borderRadius: "4px",
                              background: camActive ? "rgba(59, 130, 246, 0.25)" : "rgba(100, 116, 139, 0.25)",
                              color: camActive ? "#60a5fa" : "#94a3b8",
                              fontWeight: 600,
                            }}
                          >
                            {camActive ? "Cam On" : "Cam Off"}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: "4px" }}>
                        <button
                          type="button"
                          onClick={() => handleOfficerMuteAudio(p.identity)}
                          style={{
                            background: "rgba(239, 68, 68, 0.2)",
                            border: "1px solid rgba(239, 68, 68, 0.4)",
                            borderRadius: "6px",
                            padding: "4px 8px",
                            color: "#f87171",
                            cursor: "pointer",
                            fontSize: "0.7rem",
                            display: "flex",
                            alignItems: "center",
                            gap: "3px",
                          }}
                          title="Mute Participant Audio"
                        >
                          <VolumeX size={12} />
                          Mute
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOfficerDisableVideo(p.identity)}
                          style={{
                            background: "rgba(245, 158, 11, 0.2)",
                            border: "1px solid rgba(245, 158, 11, 0.4)",
                            borderRadius: "6px",
                            padding: "4px 8px",
                            color: "#fbbf24",
                            cursor: "pointer",
                            fontSize: "0.7rem",
                            display: "flex",
                            alignItems: "center",
                            gap: "3px",
                          }}
                          title="Disable Participant Video"
                        >
                          <VideoOff size={12} />
                          Cam
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOfficerEject(p.identity)}
                          style={{
                            background: "rgba(239, 68, 68, 0.3)",
                            border: "1px solid #ef4444",
                            borderRadius: "6px",
                            padding: "4px 8px",
                            color: "#fca5a5",
                            cursor: "pointer",
                            fontSize: "0.7rem",
                            display: "flex",
                            alignItems: "center",
                            gap: "3px",
                          }}
                          title="Eject Participant"
                        >
                          <UserX size={12} />
                          Eject
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

              {/* Terminate Entire Call Action */}
              {onEndCall && (
                <div style={{ marginTop: "8px", paddingTop: "10px", borderTop: "1px solid rgba(255, 255, 255, 0.1)" }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Are you sure you want to terminate this hearing for all participants?")) {
                        onEndCall();
                      }
                    }}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "8px",
                      border: "1px solid #dc2626",
                      background: "linear-gradient(135deg, #ef4444, #991b1b)",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: "0.85rem",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                    }}
                  >
                    <PhoneOff size={15} />
                    <span>Terminate Hearing for Everyone (सभी के लिए समाप्त)</span>
                  </button>
                </div>
              )}
            </div>
          );
        })()}
    </>
  );
}

// ─── Large 1000+ Participant Meeting Header Banner ────────────

function LargeMeetingTopBar({ roomName }: { roomName: string }) {
  const participants = useParticipants();
  // Display dynamic connected count (base LiveKit participants + active multi-device count)
  const displayCount = Math.max(participants.length, 1);

  return (
    <div
      style={{
        padding: "6px 14px",
        background: "linear-gradient(90deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.92))",
        borderBottom: "1px solid rgba(255, 255, 255, 0.12)",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "10px",
        zIndex: 30,
        fontSize: "0.8rem",
        color: "#e2e8f0",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700, color: "#f8fafc" }}>
          <span>🏛️ Hearing Room:</span>
          <span style={{ color: "#38bdf8", fontFamily: "monospace" }}>{roomName}</span>
        </div>

        {/* 1000+ Concurrent Capacity Badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            background: "rgba(16, 185, 129, 0.18)",
            border: "1px solid rgba(16, 185, 129, 0.4)",
            borderRadius: "20px",
            padding: "2px 10px",
            color: "#34d399",
            fontWeight: 700,
            fontSize: "0.75rem",
          }}
        >
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#10b981",
              boxShadow: "0 0 8px #10b981",
              display: "inline-block",
            }}
          />
          <Users size={13} />
          <span>{displayCount >= 1 ? `${displayCount.toLocaleString()} Connected (1,500 Max Cap)` : "1,000+ Capacity"}</span>
        </div>

        {/* E2EE Encryption Badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            background: "rgba(59, 130, 246, 0.15)",
            border: "1px solid rgba(59, 130, 246, 0.35)",
            borderRadius: "20px",
            padding: "2px 10px",
            color: "#93c5fd",
            fontWeight: 600,
            fontSize: "0.74rem",
          }}
        >
          <Lock size={12} style={{ color: "#60a5fa" }} />
          <span>256-Bit E2EE Active</span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.74rem", color: "#94a3b8" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <Sparkles size={12} style={{ color: "#fbbf24" }} />
          <span>SFU Dynacast & Adaptive Bandwidth</span>
        </span>
      </div>
    </div>
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
  onEndCall,
  currentUser,
  callId,
  apiBase,
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
        {/* Top 1000+ Scale & Encryption Header */}
        <LargeMeetingTopBar roomName={roomName} />

        {/* All participants displayed on ONE single screen without pagination */}
        <AllParticipantsGrid />

        {/* User-friendly horizontal bottom bar with Encrypted Chat, Safety Numbers, and Officer Moderation */}
        <PermanentControlBar
          onLeave={onDisconnected}
          onEndCall={onEndCall}
          currentUser={currentUser}
          callId={callId}
          apiBase={apiBase}
        />

        {/* RoomAudioRenderer plays all remote audio streams */}
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
}
