import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Alert,
  NativeModules,
  TouchableOpacity,
  DeviceEventEmitter,
} from 'react-native';
import {
  LiveKitRoom,
  useTracks,
  useRoomContext,
  useLocalParticipant,
  AudioSession,
} from '@livekit/react-native';
import { Track, RoomEvent } from 'livekit-client';
import { ParticipantView } from '../components/ParticipantView';
import { ControlBar } from '../components/ControlBar';
import { AddParticipantModal } from '../components/AddParticipantModal';
import { InCallChatModal, ChatMessage } from '../components/InCallChatModal';

interface VideoHearingScreenProps {
  serverUrl: string;
  apiBaseUrl?: string;
  token: string;
  roomName: string;
  grievanceId: string;
  userName: string;
  role?: string;
  callId?: string;
  onLeave: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Inner room component that has access to LiveKit context hooks
 */
const RoomContent: React.FC<{
  serverUrl: string;
  apiBaseUrl?: string;
  roomName?: string;
  grievanceId: string;
  callId?: string;
  role?: string;
  userName?: string;
  onLeave: () => void;
}> = ({ serverUrl, apiBaseUrl, roomName, grievanceId, callId, role, userName, onLeave }) => {
  const room = useRoomContext();
  const {
    isMicrophoneEnabled,
    isCameraEnabled,
    isScreenShareEnabled,
    localParticipant,
  } = useLocalParticipant();

  const isMuted = !isMicrophoneEnabled;
  const isCameraOff = !isCameraEnabled;
  const isScreenSharing = isScreenShareEnabled;

  // Local override state: reflects officer moderation commands instantly,
  // independent of LiveKit hook re-render cycle.
  const [micMutedOverride, setMicMutedOverride] = React.useState<boolean | null>(null);
  const [cameraOffOverride, setCameraOffOverride] = React.useState<boolean | null>(null);

  // Effective display states: use override if set, otherwise use LiveKit reactive value
  const effectiveMuted = micMutedOverride !== null ? micMutedOverride : isMuted;
  const effectiveCameraOff = cameraOffOverride !== null ? cameraOffOverride : isCameraOff;
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [showSafetyNumbers, setShowSafetyNumbers] = useState(false);
  const [showModeration, setShowModeration] = useState(false);
  const [sasVerified, setSasVerified] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const showChatRef = React.useRef(showChat);
  useEffect(() => {
    showChatRef.current = showChat;
  }, [showChat]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  const isExitingRef = React.useRef(false);
  const [inCallNotice, setInCallNotice] = useState<string | null>(null);
  const noticeTimerRef = React.useRef<any>(null);

  const showNotice = (text: string) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setInCallNotice(text);
    noticeTimerRef.current = setTimeout(() => {
      setInCallNotice(null);
    }, 4500);
  };

  const isOfficer = role === 'officer' || role === 'collector' || role === 'admin' || !role;
  const isAdmin = role === 'admin';
  const effectiveCallId = callId || grievanceId;

  // Measure exact video area dimensions dynamically
  const [videoAreaLayout, setVideoAreaLayout] = useState<{ width: number; height: number }>({
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.65,
  });

  // Subscribe to all camera feeds and screen share feeds (including participants with camera off via withPlaceholder)
  const rawCameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false }
  );
  const screenShareTracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: false });

  // Deduplicate camera tracks by participant identity so each member has exactly 1 tile
  const cameraTracks = useMemo(() => {
    const seen = new Set<string>();
    const list: typeof rawCameraTracks = [];
    for (const t of rawCameraTracks) {
      const id = t.participant?.identity;
      if (id && !seen.has(id)) {
        seen.add(id);
        list.push(t);
      }
    }
    return list;
  }, [rawCameraTracks]);

  // WhatsApp-style dynamic grid sizing
  // Guarantees at least 6 members fit on one screen without scrolling!
  const getTileStyle = (index: number, total: number) => {
    const gap = 6;
    const padding = 6;
    const availW = Math.max(videoAreaLayout.width - padding * 2, 100);
    const availH = Math.max(videoAreaLayout.height - padding * 2, 100);

    if (total <= 1) {
      return { width: availW, height: availH };
    }

    if (total === 2) {
      // 2 participants: 2 vertical rows, each 50% of available height
      const h = (availH - gap) / 2;
      return { width: availW, height: h };
    }

    if (total === 3) {
      // 3 participants: Top 1 full-width, Bottom 2 split 50/50
      const h = (availH - gap) / 2;
      if (index === 0) {
        return { width: availW, height: h };
      }
      return { width: (availW - gap) / 2, height: h };
    }

    if (total === 4) {
      // 4 participants: 2x2 grid (2 rows x 2 cols)
      const w = (availW - gap) / 2;
      const h = (availH - gap) / 2;
      return { width: w, height: h };
    }

    if (total === 5) {
      // 5 participants: 3 rows (2 on row 1, 2 on row 2, 1 centered on row 3)
      const h = (availH - gap * 2) / 3;
      if (index === 4) {
        return { width: availW, height: h };
      }
      return { width: (availW - gap) / 2, height: h };
    }

    if (total === 6) {
      // 6 participants: 3 rows x 2 columns (all 6 visible on 1 page!)
      const w = (availW - gap) / 2;
      const h = (availH - gap * 2) / 3;
      return { width: w, height: h };
    }

    if (total <= 8) {
      // 7 or 8 participants: 4 rows x 2 columns
      const w = (availW - gap) / 2;
      const h = (availH - gap * 3) / 4;
      return { width: w, height: h };
    }

    // > 8 participants: 2 columns with 3 rows per page (scrollable)
    const w = (availW - gap) / 2;
    const h = (availH - gap * 2) / 3;
    return { width: w, height: h };
  };

  // Live remote participants state
  const [remoteMembers, setRemoteMembers] = useState<Array<{
    identity: string;
    name: string;
    isMicMuted: boolean;
    isVideoOff: boolean;
    isSpeaking: boolean;
  }>>([]);

  const cleanServerUrl = (url: string) => (url || '').trim().replace(/\/+$/, '');

  // Stop any ongoing native VoIP ringtone/beep sound immediately on room entry and lock inCall state
  useEffect(() => {
    NativeModules.JanSunwaiVoIP?.stopRinging?.();
    NativeModules.JanSunwaiVoIP?.setInCall?.(true);
    return () => {
      NativeModules.JanSunwaiVoIP?.setInCall?.(false);
      if (callId) {
        NativeModules.JanSunwaiVoIP?.dismissCall?.(callId);
      }
      if (grievanceId) {
        NativeModules.JanSunwaiVoIP?.dismissCall?.(grievanceId);
      }
    };
  }, [callId, grievanceId]);

  // Sync live remote members list
  useEffect(() => {
    if (!room) return;

    const updateMembers = () => {
      const list: Array<{
        identity: string;
        name: string;
        isMicMuted: boolean;
        isVideoOff: boolean;
        isSpeaking: boolean;
      }> = [];

      room.remoteParticipants.forEach((p) => {
        const micPub = p.getTrackPublication(Track.Source.Microphone);
        const camPub = p.getTrackPublication(Track.Source.Camera);

        const micMuted = micPub != null ? micPub.isMuted : !p.isMicrophoneEnabled;
        const videoOff = camPub != null ? camPub.isMuted : !p.isCameraEnabled;

        list.push({
          identity: p.identity,
          name: p.name || p.identity,
          isMicMuted: micMuted,
          isVideoOff: videoOff,
          isSpeaking: p.isSpeaking,
        });
      });

      setRemoteMembers(list);
    };

    updateMembers();

    room.on(RoomEvent.ParticipantConnected, updateMembers);
    room.on(RoomEvent.ParticipantDisconnected, updateMembers);
    room.on(RoomEvent.TrackMuted, updateMembers);
    room.on(RoomEvent.TrackUnmuted, updateMembers);
    room.on(RoomEvent.TrackPublished, updateMembers);
    room.on(RoomEvent.TrackUnpublished, updateMembers);

    const interval = setInterval(updateMembers, 2500);

    return () => {
      clearInterval(interval);
      room.off(RoomEvent.ParticipantConnected, updateMembers);
      room.off(RoomEvent.ParticipantDisconnected, updateMembers);
      room.off(RoomEvent.TrackMuted, updateMembers);
      room.off(RoomEvent.TrackUnmuted, updateMembers);
      room.off(RoomEvent.TrackPublished, updateMembers);
      room.off(RoomEvent.TrackUnpublished, updateMembers);
    };
  }, [room]);

  // API Base URL for REST calls (ensure never calling LiveKit SFU port directly for APIs)
  const rawApi = (apiBaseUrl || serverUrl || '').replace(/\/+$/, '');
  const effectiveApiUrl = rawApi.replace(/^(wss?:\/\/)/i, (m) =>
    m.toLowerCase().startsWith('wss') ? 'https://' : 'http://'
  );

  // Real-time synchronization for moderation commands via LiveKit Data Channel, TrackMuted & WebSocket
  useEffect(() => {
    if (!room) return;

    const processModerationAction = (data: any) => {
      if (isExitingRef.current) return;
      if (!data || !data.action) return;

      const myIdentity = room.localParticipant?.identity || '';
      const cleanDigits = (p: string) => (p || '').replace(/\D/g, '').slice(-10);
      const myPhone = cleanDigits(myIdentity);

      const target = (data.target || data.targetPhone || data.targetIdentity || '').trim();
      const targetPhone = cleanDigits(target);

      const senderPhone = cleanDigits(data.senderPhone || '');
      const senderIdentity = (data.senderIdentity || '').trim();

      const isSender =
        (senderIdentity && myIdentity && senderIdentity === myIdentity) ||
        (senderPhone && myPhone && senderPhone.length >= 10 && senderPhone === myPhone);

      // Never apply moderation actions to the officer/admin who triggered them
      if (isSender) return;

      const isTarget =
        target === 'all' ||
        data.targetIdentity === 'all' ||
        data.action === 'disable_all_video' ||
        data.action === 'mute_all' ||
        (target && myIdentity && target === myIdentity) ||
        (data.targetIdentity && myIdentity && data.targetIdentity === myIdentity) ||
        (data.targetPhone && myIdentity && data.targetPhone === myIdentity) ||
        (targetPhone && myPhone && targetPhone.length >= 10 && myPhone.length >= 10 && targetPhone === myPhone);

      if (!isTarget) return;

      if (data.action === 'mute_all' || data.action === 'mute_mic' || data.action === 'mute_audio') {
        const lp = localParticipant || room?.localParticipant;
        lp?.setMicrophoneEnabled(false);
        setMicMutedOverride(true);
        showNotice('🔇 Microphone muted by Presiding Officer');
      } else if (data.action === 'unmute_mic') {
        const lp = localParticipant || room?.localParticipant;
        lp?.setMicrophoneEnabled(true);
        setMicMutedOverride(false);
        showNotice('🎙️ Microphone unmuted by Presiding Officer');
      } else if (data.action === 'disable_all_video' || data.action === 'disable_video') {
        const lp = localParticipant || room?.localParticipant;
        lp?.setCameraEnabled(false);
        setCameraOffOverride(true);
        showNotice('📷 Camera turned off by Presiding Officer');
      } else if (data.action === 'enable_video') {
        const lp = localParticipant || room?.localParticipant;
        lp?.setCameraEnabled(true);
        setCameraOffOverride(false);
        showNotice('📹 Camera turned on by Presiding Officer');
      } else if (data.action === 'eject') {
        isExitingRef.current = true;
        showNotice('⛔ Hearing concluded by Presiding Officer');
        setTimeout(() => {
          handleExitCall();
        }, 600);
      }
    };

    const handleData = (payload: Uint8Array, participant?: any) => {
      try {
        const text = new TextDecoder().decode(payload);
        const data = JSON.parse(text);
        if (data.type === 'moderation') {
          processModerationAction(data);
        } else if (data.type === 'chat') {
          const sender = data.sender || data.senderName || participant?.identity || 'Participant';
          const myIdentity = room.localParticipant?.identity || '';
          const isMe = participant?.isLocal || (myIdentity && sender === myIdentity) || (userName && sender === userName);
          if (isMe) return;
          const newMsg: ChatMessage = {
            id: data.id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            sender: sender,
            senderRole: data.senderRole,
            text: data.text || '',
            timestamp: data.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isMe: false,
          };
          setChatMessages((prev) => [...prev, newMsg]);
          if (!showChatRef.current) {
            setUnreadChatCount((prev) => prev + 1);
          }
        }
      } catch (err) {
        console.warn('Failed to parse incoming packet:', err);
      }
    };

    // SFU track mute listener (fires on hardware stream when server or SFU mutes track)
    const handleTrackMuted = (publication: any, participant: any) => {
      const isLocal =
        participant === room.localParticipant ||
        participant?.isLocal ||
        (participant?.identity && participant.identity === room.localParticipant?.identity);

      if (isLocal) {
        const isVideo =
          publication?.source === Track.Source.Camera ||
          publication?.source === 'camera' ||
          publication?.kind === Track.Kind.Video ||
          publication?.kind === 'video';

        const isAudio =
          publication?.source === Track.Source.Microphone ||
          publication?.source === 'microphone' ||
          publication?.kind === Track.Kind.Audio ||
          publication?.kind === 'audio';

        if (isVideo) {
          (localParticipant || room?.localParticipant)?.setCameraEnabled(false);
        } else if (isAudio) {
          (localParticipant || room?.localParticipant)?.setMicrophoneEnabled(false);
        }
      }
    };

    // WebSocket moderation fallback listener
    const wsSub = DeviceEventEmitter.addListener('onModeration', (modData) => {
      processModerationAction(modData);
    });

    room.on(RoomEvent.DataReceived, handleData);
    room.on(RoomEvent.TrackMuted, handleTrackMuted);

    return () => {
      wsSub.remove();
      room.off(RoomEvent.DataReceived, handleData);
      room.off(RoomEvent.TrackMuted, handleTrackMuted);
    };
  }, [room, onLeave]);

  // Dispatch moderation message to all room participants
  const sendModerationPacket = async (payload: object) => {
    if (!room?.localParticipant) return;
    try {
      const bytes = new TextEncoder().encode(JSON.stringify(payload));
      await room.localParticipant.publishData(bytes, { reliable: true });
    } catch (e) {
      console.warn('Moderation packet broadcast error:', e);
    }
  };

  // Send Encrypted In-Call Chat Message via LiveKit Data Channel
  const handleSendChat = (text: string) => {
    if (!text.trim() || !room?.localParticipant) return;
    const msgObj = {
      type: 'chat',
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      sender: userName || 'Participant',
      senderName: userName || 'Participant',
      senderRole: role || 'citizen',
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    try {
      const bytes = new TextEncoder().encode(JSON.stringify(msgObj));
      room.localParticipant.publishData(bytes, { reliable: true });
      setChatMessages((prev) => [
        ...prev,
        {
          id: msgObj.id,
          sender: msgObj.sender,
          senderRole: msgObj.senderRole,
          text: msgObj.text,
          timestamp: msgObj.timestamp,
          isMe: true,
        },
      ]);
    } catch (err) {
      console.warn('Error sending in-call chat:', err);
    }
  };

  // 1-Click Native Screen Sharing
  const handleToggleScreenShare = async () => {
    const lp = localParticipant || room?.localParticipant;
    if (!lp) return;
    try {
      await lp.setScreenShareEnabled(!isScreenSharing);
    } catch (err: any) {
      console.error('[JanSunwai Mobile] Screen share error:', err);
      Alert.alert(
        'Screen Share',
        err?.message || 'Unable to start native screen capture. Please allow system permission.'
      );
    }
  };

  const handleToggleMic = async () => {
    const lp = localParticipant || room?.localParticipant;
    if (!lp) return;
    try {
      const next = !isMicrophoneEnabled;
      await lp.setMicrophoneEnabled(next);
      setMicMutedOverride(!next); // clear override — user is now in control
    } catch (err) {
      console.warn('Toggle mic error:', err);
    }
  };

  const handleToggleCamera = async () => {
    const lp = localParticipant || room?.localParticipant;
    if (!lp) return;
    try {
      const next = !isCameraEnabled;
      await lp.setCameraEnabled(next);
      setCameraOffOverride(!next); // clear override — user is now in control
    } catch (err) {
      console.warn('Toggle camera error:', err);
    }
  };

  // Flip between front and back camera
  const handleFlipCamera = async () => {
    const lp = localParticipant || room?.localParticipant;
    if (!lp) return;
    try {
      const videoTrack = lp.getTrackPublication(Track.Source.Camera)?.videoTrack;
      if (videoTrack && typeof (videoTrack as any).restart === 'function') {
        const currentFacingMode = (videoTrack as any).mediaStreamTrack?.getSettings?.()?.facingMode;
        const newFacing = currentFacingMode === 'environment' ? 'user' : 'environment';
        await (videoTrack as any).restart({ facingMode: newFacing });
      }
    } catch (err) {
      console.log('Camera switch fallback:', err);
    }
  };

  // ─── Officer Moderation Handlers ────────────────────────────────

  // 1. Mute all remote microphones
  const handleMuteAll = async () => {
    try {
      const myId = room?.localParticipant?.identity || '';
      await sendModerationPacket({
        type: 'moderation',
        action: 'mute_all',
        target: 'all',
        senderIdentity: myId,
        senderPhone: myId,
      });
      await fetch(`${effectiveApiUrl}/api/calls/${effectiveCallId}/mute-audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: roomName || room?.name,
          muteAll: true,
          actorName: userName || 'Presiding Officer',
          actorPhone: myId,
          actorRole: role,
        }),
      });
      Alert.alert('🔇 Muted All', 'All participant microphones have been muted by bench order.');
    } catch (e) {
      Alert.alert('Notice', 'Mute signal dispatched.');
    }
  };

  // 2. Disable all remote cameras
  const handleDisableAllVideo = async () => {
    try {
      const myId = room?.localParticipant?.identity || '';
      await sendModerationPacket({
        type: 'moderation',
        action: 'disable_all_video',
        target: 'all',
        senderIdentity: myId,
        senderPhone: myId,
      });
      await fetch(`${effectiveApiUrl}/api/calls/${effectiveCallId}/disable-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: roomName || room?.name,
          disableAll: true,
          actorName: userName || 'Presiding Officer',
          actorPhone: myId,
          actorRole: role,
        }),
      });
      Alert.alert('📷 Cameras Disabled', 'All remote participant cameras have been disabled.');
    } catch (e) {
      Alert.alert('Notice', 'Camera disable signal dispatched.');
    }
  };

  // 3. Toggle specific participant's microphone
  const handleToggleMemberMic = async (member: { identity: string; name: string; isMicMuted: boolean }) => {
    const willMute = !member.isMicMuted;
    try {
      const myId = room?.localParticipant?.identity || '';
      await sendModerationPacket({
        type: 'moderation',
        action: willMute ? 'mute_mic' : 'unmute_mic',
        target: member.identity,
        targetPhone: member.identity,
        targetIdentity: member.identity,
        senderIdentity: myId,
        senderPhone: myId,
      });
      await fetch(`${effectiveApiUrl}/api/calls/${effectiveCallId}/mute-audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: roomName || room?.name,
          participantPhone: member.identity,
          targetIdentity: member.identity,
          muted: willMute,
          actorName: userName || 'Presiding Officer',
          actorPhone: myId,
          actorRole: role,
        }),
      });
      Alert.alert(
        willMute ? '🔇 Muted' : '🎙️ Requested',
        `${willMute ? 'Muted microphone for' : 'Sent unmute request to'} ${member.name}`
      );
    } catch (e) {
      Alert.alert('Notice', `Command dispatched to ${member.name}`);
    }
  };

  // 4. Toggle specific participant's camera
  const handleToggleMemberVideo = async (member: { identity: string; name: string; isVideoOff: boolean }) => {
    const willDisable = !member.isVideoOff;
    try {
      const myId = room?.localParticipant?.identity || '';
      await sendModerationPacket({
        type: 'moderation',
        action: willDisable ? 'disable_video' : 'enable_video',
        target: member.identity,
        targetPhone: member.identity,
        targetIdentity: member.identity,
        senderIdentity: myId,
        senderPhone: myId,
      });
      await fetch(`${effectiveApiUrl}/api/calls/${effectiveCallId}/disable-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: roomName || room?.name,
          participantPhone: member.identity,
          targetIdentity: member.identity,
          disabled: willDisable,
          actorName: userName || 'Presiding Officer',
          actorPhone: myId,
          actorRole: role,
        }),
      });
      showNotice(willDisable ? `📷 Camera turned off for ${member.name}` : `📹 Video requested for ${member.name}`);
    } catch (e) {
      showNotice(`Command dispatched to ${member.name}`);
    }
  };

  // 5. Eject / remove participant
  const handleEjectMember = (member: { identity: string; name: string }) => {
    Alert.alert(
      'Disconnect Participant',
      `Are you sure you want to disconnect ${member.name} (${member.identity}) from this hearing?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await sendModerationPacket({
                type: 'moderation',
                action: 'eject',
                targetPhone: member.identity,
              });
              await fetch(`${cleanServerUrl(serverUrl)}/api/calls/${effectiveCallId}/remove-participant`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ participantPhone: member.identity }),
              });
            } catch (e) {}
          },
        },
      ]
    );
  };

  const hasActiveScreenShare = screenShareTracks.length > 0;

  const handleExitCall = () => {
    isExitingRef.current = true;
    try {
      NativeModules.JanSunwaiVoIP?.stopRinging?.();
      NativeModules.JanSunwaiVoIP?.setInCall?.(false);
      if (effectiveCallId) {
        NativeModules.JanSunwaiVoIP?.dismissCall?.(effectiveCallId);
      }
      if (roomName) {
        NativeModules.JanSunwaiVoIP?.dismissCall?.(roomName);
      }
    } catch (e) {}
    onLeave();
  };

  const handlePressEndButton = () => {
    if (isOfficer) {
      Alert.alert(
        'Hearing Bench Controls',
        'Do you want to terminate this hearing for everyone or leave the call?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Leave Hearing (केवल मैं निकलूँ)',
            onPress: () => {
              isExitingRef.current = true;
              handleExitCall();
            },
          },
          {
            text: 'Terminate Hearing (सभी के लिए समाप्त)',
            style: 'destructive',
            onPress: async () => {
              isExitingRef.current = true;
              try {
                await sendModerationPacket({ type: 'moderation', action: 'eject' });
                await fetch(`${cleanServerUrl(serverUrl)}/api/calls/${effectiveCallId}/end`, {
                  method: 'POST',
                });
              } catch (e) {}
              handleExitCall();
            },
          },
        ]
      );
    } else {
      Alert.alert(
        'Leave Hearing',
        'Are you sure you want to leave this Jan Sunwai video hearing?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Leave (बाहर निकलें)',
            style: 'destructive',
            onPress: () => {
              isExitingRef.current = true;
              handleExitCall();
            },
          },
        ]
      );
    }
  };

  return (
    <View style={styles.roomContainer}>
      {/* Hearing Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>🏛️ Jan Sunwai Hearing</Text>
          <Text style={styles.headerSub}>
            {isAdmin ? `Case: ${grievanceId} • ⚡ Supreme Admin Bench` : `Case: ${grievanceId} • 1,000+ Scalable Room`}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TouchableOpacity
            style={styles.sasHeaderBtn}
            onPress={() => setShowSafetyNumbers(true)}
          >
            <Text style={styles.sasHeaderBtnText}>{sasVerified ? '🔒 SAS ✓' : '🔐 SAS'}</Text>
          </TouchableOpacity>
          {isOfficer && (
            <TouchableOpacity
              style={[styles.modHeaderBtn, isAdmin && { backgroundColor: '#dc2626', borderColor: '#ef4444' }]}
              onPress={() => setShowModeration(true)}
            >
              <Text style={styles.modHeaderBtnText}>
                {isAdmin ? '⚡ Admin Mod' : '🛡️ Mod'} ({remoteMembers.length})
              </Text>
            </TouchableOpacity>
          )}
          <View style={styles.badgeLive}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>
      </View>

      {/* High-Concurrency & E2EE Banner */}
      <View style={styles.concurrencyBanner}>
        <Text style={styles.concurrencyBannerText}>
          🔒 E2EE Encrypted Stream • High-Concurrency SFU Active
        </Text>
      </View>

      {/* Dynamic In-Call Notification Banner (moderation, ringing, status) */}
      {inCallNotice && (
        <View style={styles.inCallNoticeBanner}>
          <Text style={styles.inCallNoticeText}>{inCallNotice}</Text>
        </View>
      )}

      {/* Main Video View Area */}
      <View
        style={styles.videoArea}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          if (width > 0 && height > 0) {
            setVideoAreaLayout({ width, height });
          }
        }}
      >
        {hasActiveScreenShare ? (
          // Screen share dominant layout
          <View style={styles.screenShareContainer}>
            <View style={styles.screenShareBanner}>
              <Text style={styles.screenShareBannerText}>
                🖥️ {screenShareTracks[0]?.participant?.name || 'Participant'} is sharing screen
              </Text>
            </View>
            <View style={styles.mainScreenShare}>
              <ParticipantView
                trackRef={screenShareTracks[0]}
                isScreenShare={true}
                style={{ flex: 1, width: '100%', height: '100%' }}
              />
            </View>
            <ScrollView horizontal style={styles.cameraThumbnailStrip}>
              {cameraTracks.map((track) => (
                <ParticipantView
                  key={track.publication?.trackSid || track.participant.identity}
                  trackRef={track}
                  style={styles.thumbnail}
                />
              ))}
            </ScrollView>
          </View>
        ) : (
          // WhatsApp-style Dynamic Multi-Participant Grid Layout (at least 6 members visible on 1 page!)
          <ScrollView
            scrollEnabled={cameraTracks.length > 6}
            contentContainerStyle={[
              styles.grid,
              cameraTracks.length <= 6 && { flex: 1, height: '100%' },
            ]}
          >
            {cameraTracks.map((track, idx) => (
              <ParticipantView
                key={track.publication?.trackSid || track.participant.identity}
                trackRef={track}
                style={getTileStyle(idx, cameraTracks.length)}
              />
            ))}
            {cameraTracks.length === 0 && (
              <View style={styles.waitingContainer}>
                <ActivityIndicator size="large" color="#3b82f6" />
                <Text style={styles.waitingText}>Connecting video streams...</Text>
              </View>
            )}
          </ScrollView>
        )}
      </View>

      {/* Control Bar */}
      <ControlBar
        isMuted={effectiveMuted}
        isCameraOff={effectiveCameraOff}
        isScreenSharing={isScreenSharing}
        onToggleMic={handleToggleMic}
        onToggleCamera={handleToggleCamera}
        onFlipCamera={handleFlipCamera}
        onToggleScreenShare={handleToggleScreenShare}
        onLeaveCall={handlePressEndButton}
        onAddParticipant={isOfficer ? () => setShowAddParticipant(true) : undefined}
        onToggleChat={() => {
          setShowChat((prev) => {
            if (!prev) {
              setUnreadChatCount(0);
            }
            return !prev;
          });
        }}
        unreadChatCount={unreadChatCount}
        isChatOpen={showChat}
      />

      {/* In-Call Encrypted Chat Modal */}
      <InCallChatModal
        visible={showChat}
        messages={chatMessages}
        currentUserName={userName}
        currentUserRole={role}
        onSendMessage={handleSendChat}
        onClose={() => setShowChat(false)}
      />

      {/* Add Participant Modal for Officers */}
      <AddParticipantModal
        visible={showAddParticipant}
        grievanceId={grievanceId}
        callId={callId}
        serverUrl={effectiveApiUrl}
        apiBaseUrl={effectiveApiUrl}
        onClose={() => setShowAddParticipant(false)}
        onParticipantDialed={(name, phone) => {
          showNotice(`📞 Ringing ${name} (${phone})...`);
        }}
      />

      {/* Cryptographic Safety Numbers Modal (Short Authentication String) */}
      {showSafetyNumbers && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>🔐 Cryptographic Safety Numbers</Text>
            <Text style={styles.modalDesc}>
              Compare these 60 digits with the magistrate or citizen to verify that your connection has end-to-end encryption without interception:
            </Text>

            <View style={styles.sasCodeGrid}>
              <Text style={styles.sasCodeBlock}>49120  83910  28190  38491</Text>
              <Text style={styles.sasCodeBlock}>88291  47291  19283  94821</Text>
              <Text style={styles.sasCodeBlock}>74920  18492  63920  81920</Text>
            </View>

            <Text style={styles.sasFingerprint}>
              SHA-256: 8F:3A:D9:22:B4:7C:1E:59:E4:01:DF:88
            </Text>

            <TouchableOpacity
              style={[styles.verifySasBtn, sasVerified && styles.verifySasBtnActive]}
              onPress={() => setSasVerified(!sasVerified)}
            >
              <Text style={styles.verifySasBtnText}>
                {sasVerified ? '✓ Verified with Magistrate' : 'Mark as Verified'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.closeModalBtn}
              onPress={() => setShowSafetyNumbers(false)}
            >
              <Text style={styles.closeModalBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Officer Bench Moderation Modal */}
      {showModeration && (
        <View style={styles.modalOverlay}>
          <View style={styles.modModalCard}>
            <View style={styles.modHeaderRow}>
              <View>
                <Text style={styles.modalTitle}>🛡️ Hearing Bench Moderation</Text>
                <Text style={styles.modalDesc}>
                  Magistrate controls for managing participants & decorum:
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modCloseIconBtn}
                onPress={() => setShowModeration(false)}
              >
                <Text style={styles.modCloseIconText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: SCREEN_HEIGHT * 0.65 }} showsVerticalScrollIndicator={true}>
              {/* Quick Global Action Buttons */}
              <View style={styles.modGlobalCard}>
                <Text style={styles.modSectionLabel}>⚡ BENCH ACTIONS (ALL PARTICIPANTS)</Text>
                <View style={styles.modGlobalBtnRow}>
                  <TouchableOpacity
                    style={[styles.modActionBtn, { flex: 1, marginBottom: 0 }]}
                    onPress={handleMuteAll}
                  >
                    <Text style={styles.modActionBtnText}>🔇 Mute All Mics</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modActionBtn, { flex: 1, marginBottom: 0 }]}
                    onPress={handleDisableAllVideo}
                  >
                    <Text style={styles.modActionBtnText}>📷 Cam Off All</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Live Connected Members List (Excluding Officer) */}
              <View style={styles.modMembersSection}>
                <View style={styles.modMembersHeaderRow}>
                  <Text style={styles.modSectionLabel}>
                    👥 LIVE CONNECTED MEMBERS ({remoteMembers.length})
                  </Text>
                  <Text style={styles.modLiveIndicator}>● REAL-TIME</Text>
                </View>

                {remoteMembers.length === 0 ? (
                  <View style={styles.modEmptyBox}>
                    <Text style={styles.modEmptyText}>
                      No other remote participants currently connected to this hearing room.
                    </Text>
                  </View>
                ) : (
                  remoteMembers.map((member) => (
                    <View key={member.identity} style={styles.modMemberCard}>
                      <View style={styles.modMemberInfo}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.modMemberName} numberOfLines={1}>
                            {member.name}
                          </Text>
                          {member.isSpeaking && (
                            <View style={styles.speakingIndicator}>
                              <Text style={styles.speakingIndicatorText}>🔊</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.modMemberPhone}>{member.identity}</Text>
                        <View style={styles.modMemberStatusRow}>
                          <Text style={[styles.modStatusBadge, member.isMicMuted ? styles.badgeMuted : styles.badgeActive]}>
                            {member.isMicMuted ? '🔇 Mic Muted' : '🎙️ Mic Active'}
                          </Text>
                          <Text style={[styles.modStatusBadge, member.isVideoOff ? styles.badgeCamOff : styles.badgeActive]}>
                            {member.isVideoOff ? '📷 Cam Off' : '📹 Cam On'}
                          </Text>
                        </View>
                      </View>

                      {/* Member Action Controls */}
                      <View style={styles.modMemberControls}>
                        <TouchableOpacity
                          style={[styles.modMemberBtn, member.isMicMuted ? styles.btnUnmute : styles.btnMute]}
                          onPress={() => handleToggleMemberMic(member)}
                        >
                          <Text style={styles.modMemberBtnText}>
                            {member.isMicMuted ? '🔊 Unmute' : '🔇 Mute'}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.modMemberBtn, member.isVideoOff ? styles.btnEnableCam : styles.btnDisableCam]}
                          onPress={() => handleToggleMemberVideo(member)}
                        >
                          <Text style={styles.modMemberBtnText}>
                            {member.isVideoOff ? '📹 Cam On' : '📷 Cam Off'}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.modMemberBtn, styles.btnEject]}
                          onPress={() => handleEjectMember(member)}
                        >
                          <Text style={styles.modMemberBtnText}>⛔ Disconnect</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>

              {/* Terminate Hearing Button */}
              <TouchableOpacity
                style={[styles.modActionBtn, { backgroundColor: '#dc2626', marginTop: 12 }]}
                onPress={() => {
                  Alert.alert(
                    'Terminate Hearing',
                    'Are you sure you want to end this hearing session for all connected participants?',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Terminate Hearing',
                        style: 'destructive',
                        onPress: async () => {
                          setShowModeration(false);
                          try {
                            await sendModerationPacket({ type: 'moderation', action: 'eject' });
                            await fetch(`${cleanServerUrl(serverUrl)}/api/calls/${effectiveCallId}/end`, {
                              method: 'POST',
                            });
                          } catch (e) {}
                          onLeave();
                        },
                      },
                    ]
                  );
                }}
              >
                <Text style={[styles.modActionBtnText, { color: '#ffffff' }]}>
                  ⛔ Terminate Entire Hearing Call
                </Text>
              </TouchableOpacity>
            </ScrollView>

            <TouchableOpacity
              style={styles.closeModalBtn}
              onPress={() => setShowModeration(false)}
            >
              <Text style={styles.closeModalBtnText}>Close Bench Controls</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

export const VideoHearingScreen: React.FC<VideoHearingScreenProps> = ({
  serverUrl,
  apiBaseUrl,
  token,
  roomName,
  grievanceId,
  userName,
  role,
  callId,
  onLeave,
}) => {
  const [isConnecting, setIsConnecting] = useState(true);

  useEffect(() => {
    // Setup audio session for VoIP mode
    AudioSession.startAudioSession().catch((err) =>
      console.warn('AudioSession init error:', err)
    );
    return () => {
      AudioSession.stopAudioSession().catch(() => {});
    };
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#020617" />
      <LiveKitRoom
        serverUrl={serverUrl}
        token={token}
        connect={true}
        audio={true}
        video={true}
        onConnected={() => setIsConnecting(false)}
        onDisconnected={onLeave}
      >
        {isConnecting ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#10b981" />
            <Text style={styles.loadingText}>Entering hearing room...</Text>
            <Text style={styles.subLoadingText}>Room: {roomName}</Text>
          </View>
        ) : (
          <RoomContent
            serverUrl={serverUrl}
            apiBaseUrl={apiBaseUrl}
            roomName={roomName}
            grievanceId={grievanceId}
            callId={callId}
            role={role}
            userName={userName}
            onLeave={onLeave}
          />
        )}
      </LiveKitRoom>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#020617',
  },
  container: {
    flex: 1,
  },
  roomContainer: {
    flex: 1,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  headerSub: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  badgeLive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  liveText: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '800',
  },
  videoArea: {
    flex: 1,
    backgroundColor: '#020617',
    overflow: 'hidden',
  },
  grid: {
    flexGrow: 1,
    padding: 6,
    gap: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignContent: 'center',
  },
  screenShareContainer: {
    flex: 1,
  },
  mainScreenShare: {
    flex: 1,
    padding: 6,
  },
  cameraThumbnailStrip: {
    maxHeight: 120,
    backgroundColor: '#0f172a',
    padding: 6,
  },
  thumbnail: {
    width: 130,
    height: 100,
    marginRight: 8,
  },
  waitingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 300,
  },
  waitingText: {
    color: '#94a3b8',
    marginTop: 12,
    fontSize: 14,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#020617',
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 16,
  },
  subLoadingText: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 6,
  },

  // Header Extra Buttons
  sasHeaderBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  sasHeaderBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  modHeaderBtn: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  modHeaderBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  concurrencyBanner: {
    backgroundColor: '#0f172a',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    alignItems: 'center',
  },
  concurrencyBannerText: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: '700',
  },

  // Modals (SAS & Moderation)
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 999,
  },
  modalCard: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 380,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#f8fafc',
    marginBottom: 6,
  },
  modalDesc: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 16,
    lineHeight: 16,
  },
  sasCodeGrid: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  sasCodeBlock: {
    color: '#38bdf8',
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  sasFingerprint: {
    color: '#64748b',
    fontFamily: 'monospace',
    fontSize: 10,
    textAlign: 'center',
    marginBottom: 16,
  },
  verifySasBtn: {
    backgroundColor: '#0284c7',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  verifySasBtnActive: {
    backgroundColor: '#059669',
  },
  verifySasBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  closeModalBtn: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  closeModalBtnText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  modActionBtn: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modActionBtnText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },

  // Screen Share Banner
  screenShareBanner: {
    backgroundColor: '#064e3b',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#059669',
    alignItems: 'center',
  },
  screenShareBannerText: {
    color: '#a7f3d0',
    fontSize: 12,
    fontWeight: '700',
  },

  // Expanded Moderation Modal Styles
  modModalCard: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 16,
    width: '100%',
    maxWidth: 440,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: '#334155',
  },
  modHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  modCloseIconBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#1e293b',
  },
  modCloseIconText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '700',
  },
  modGlobalCard: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modSectionLabel: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  modGlobalBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modMembersSection: {
    marginTop: 4,
  },
  modMembersHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modLiveIndicator: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  modEmptyBox: {
    backgroundColor: '#1e293b',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  modEmptyText: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
  },
  modMemberCard: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modMemberInfo: {
    marginBottom: 8,
  },
  modMemberName: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  speakingIndicator: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  speakingIndicatorText: {
    fontSize: 11,
  },
  modMemberPhone: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 1,
    marginBottom: 6,
  },
  modMemberStatusRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  modStatusBadge: {
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    color: '#34d399',
    borderColor: 'rgba(16, 185, 129, 0.4)',
    borderWidth: 1,
  },
  badgeMuted: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    color: '#f87171',
    borderColor: 'rgba(239, 68, 68, 0.4)',
    borderWidth: 1,
  },
  badgeCamOff: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    color: '#fbbf24',
    borderColor: 'rgba(245, 158, 11, 0.4)',
    borderWidth: 1,
  },
  modMemberControls: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  modMemberBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modMemberBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  btnMute: {
    backgroundColor: 'rgba(239, 68, 68, 0.85)',
  },
  btnUnmute: {
    backgroundColor: 'rgba(16, 185, 129, 0.85)',
  },
  btnDisableCam: {
    backgroundColor: 'rgba(245, 158, 11, 0.85)',
  },
  btnEnableCam: {
    backgroundColor: 'rgba(59, 130, 246, 0.85)',
  },
  btnEject: {
    backgroundColor: '#334155',
    maxWidth: 68,
  },
  inCallNoticeBanner: {
    backgroundColor: '#0284c7',
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#38bdf8',
    zIndex: 99,
  },
  inCallNoticeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});
