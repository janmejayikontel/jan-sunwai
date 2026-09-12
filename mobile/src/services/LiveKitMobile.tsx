/**
 * LiveKit Mobile Video Room — Jan Sunwai React Native Client
 *
 * Implements the video conference screen for the React Native mobile app
 * using the official @livekit/react-native SDK.
 *
 * Setup Requirements (per LiveKit React Native docs):
 * 1. Install packages:
 *    npm install @livekit/react-native @livekit/react-native-webrtc livekit-client
 *
 * 2. Call registerGlobals() in your entry file (index.js) BEFORE any
 *    other LiveKit imports to polyfill WebRTC APIs.
 *
 * 3. Native configuration:
 *    - Android: Camera & microphone permissions in AndroidManifest.xml
 *    - iOS: NSCameraUsageDescription & NSMicrophoneUsageDescription in Info.plist
 *    - iOS: Add LivekitReactNative.setup() in AppDelegate
 *
 * Reference: https://docs.livekit.io/client-sdk-react-native/overview/
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Dimensions,
  Platform,
} from 'react-native';

// LiveKit React Native SDK imports
// Note: registerGlobals() must be called in index.js before this file is imported
import {
  LiveKitRoom,
  VideoTrack,
  useTracks,
  useParticipants,
  useRoomContext,
  AudioSession,
} from '@livekit/react-native';
import { Track, RoomEvent } from 'livekit-client';

// ─── Types ────────────────────────────────────────────────────

interface MobileVideoCallScreenProps {
  route: {
    params: {
      token: string;
      livekitUrl: string;
      roomName: string;
      callId: string;
      grievanceId: string;
      callerName: string;
    };
  };
  navigation: {
    goBack: () => void;
  };
}

// ─── Constants ────────────────────────────────────────────────

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TILE_SIZE = (SCREEN_WIDTH - 48) / 2;

// ═══════════════════════════════════════════════════════════════
// MAIN VIDEO CALL SCREEN
// ═══════════════════════════════════════════════════════════════

/**
 * Full-screen video call screen for the Jan Sunwai hearing.
 *
 * This screen is opened after the user accepts an incoming call
 * from the full-screen notification / ConnectionService / CallKit.
 *
 * It uses LiveKitRoom as the provider and renders participant
 * video tiles in a responsive grid.
 */
export default function MobileVideoCallScreen({
  route,
  navigation,
}: MobileVideoCallScreenProps) {
  const { token, livekitUrl, roomName, callId, grievanceId, callerName } =
    route.params;

  const [isConnecting, setIsConnecting] = useState(true);

  /**
   * Per LiveKit React Native docs:
   * Configure the audio session for voice call mode before connecting.
   * This ensures proper audio routing through earpiece/speaker on both platforms.
   */
  useEffect(() => {
    const setupAudio = async () => {
      try {
        await AudioSession.startAudioSession();
      } catch (err) {
        console.error('[LiveKit Mobile] Failed to start audio session:', err);
      }
    };

    setupAudio();

    return () => {
      AudioSession.stopAudioSession();
    };
  }, []);

  /**
   * Handle disconnect — go back to the previous screen.
   * Also posts the hearing completion back to the backend.
   */
  const handleDisconnect = async () => {
    try {
      // Notify backend that we've left the hearing
      await fetch(`${livekitUrl.replace('ws://', 'http://').replace('wss://', 'https://')}/api/calls/${callId}/end`, {
        method: 'POST',
      });
    } catch (err) {
      console.warn('[LiveKit Mobile] Failed to notify backend of call end:', err);
    }

    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#020617" />

      {/*
        LiveKitRoom from @livekit/react-native works similarly to the web version.
        It manages the WebRTC connection, track subscriptions, and room state.

        Per the official docs:
        - serverUrl: WebSocket URL of the LiveKit server
        - token: Signed JWT access token
        - connect: Whether to auto-connect on mount
        - audio/video: Enable local media tracks on join
      */}
      <LiveKitRoom
        serverUrl={livekitUrl}
        token={token}
        connect={true}
        audio={true}
        video={true}
        onConnected={() => setIsConnecting(false)}
        onDisconnected={handleDisconnect}
      >
        {/* Header Bar */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>🏛️ Jan Sunwai Hearing</Text>
            <Text style={styles.headerSubtitle}>
              Grievance #{grievanceId}
            </Text>
          </View>
          <View style={styles.recBadge}>
            <View style={styles.recDot} />
            <Text style={styles.recText}>REC</Text>
          </View>
        </View>

        {/* Video Grid */}
        {isConnecting ? (
          <View style={styles.connecting}>
            <Text style={styles.connectingText}>Connecting to hearing...</Text>
          </View>
        ) : (
          <MeetingGrid />
        )}

        {/* Bottom Controls */}
        <BottomControls onEndCall={handleDisconnect} />
      </LiveKitRoom>
    </SafeAreaView>
  );
}

// ─── Meeting Grid (Participant Video Tiles) ──────────────────

/**
 * Renders a 2-column grid of all participant video feeds.
 *
 * Uses the `useTracks` hook from @livekit/react-native to subscribe
 * to all Camera tracks in the room, then renders each with `VideoView`.
 *
 * Per LiveKit docs:
 * - useTracks([Track.Source.Camera]) returns all camera tracks
 * - VideoView renders a single video track referenced by trackRef
 */
function MeetingGrid() {
  const tracks = useTracks([Track.Source.Camera]);
  const participants = useParticipants();

  return (
    <View style={styles.gridContainer}>
      <FlatList
        data={tracks}
        numColumns={2}
        keyExtractor={(item) => item.publication?.trackSid || item.participant.identity}
        contentContainerStyle={styles.gridContent}
        renderItem={({ item }) => (
          <View style={styles.tileWrapper}>
            {/*
              VideoView from @livekit/react-native renders a native video surface.
              - trackRef: The track reference from useTracks
              - mirror: Mirror the local participant's camera (selfie view)
              - objectFit: 'cover' fills the container, 'contain' fits within
            */}
            <VideoTrack
              trackRef={item}
              mirror={item.participant.isLocal}
              objectFit="cover"
              style={styles.videoTile}
            />

            {/* Participant label overlay */}
            <View style={styles.tileLabelContainer}>
              <Text style={styles.tileLabel} numberOfLines={1}>
                {item.participant.name || item.participant.identity}
                {item.participant.isLocal ? ' (You)' : ''}
              </Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              Waiting for other participants to join...
            </Text>
          </View>
        }
      />

      {/* Participant count badge */}
      <View style={styles.participantBadge}>
        <Text style={styles.participantBadgeText}>
          👥 {participants.length} connected
        </Text>
      </View>
    </View>
  );
}

// ─── Bottom Controls Bar ─────────────────────────────────────

function BottomControls({ onEndCall }: { onEndCall: () => void }) {
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const room = useRoomContext();

  const toggleMicrophone = async () => {
    try {
      await room.localParticipant.setMicrophoneEnabled(isMuted);
      setIsMuted(!isMuted);
    } catch (err) {
      console.error('Failed to toggle microphone:', err);
    }
  };

  const toggleCamera = async () => {
    try {
      await room.localParticipant.setCameraEnabled(isCameraOff);
      setIsCameraOff(!isCameraOff);
    } catch (err) {
      console.error('Failed to toggle camera:', err);
    }
  };

  return (
    <View style={styles.controls}>
      {/* Mute Button */}
      <TouchableOpacity
        style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
        onPress={toggleMicrophone}
      >
        <Text style={styles.controlBtnIcon}>{isMuted ? '🔇' : '🎤'}</Text>
        <Text style={styles.controlBtnLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
      </TouchableOpacity>

      {/* Camera Button */}
      <TouchableOpacity
        style={[styles.controlBtn, isCameraOff && styles.controlBtnActive]}
        onPress={toggleCamera}
      >
        <Text style={styles.controlBtnIcon}>{isCameraOff ? '📷' : '📹'}</Text>
        <Text style={styles.controlBtnLabel}>
          {isCameraOff ? 'Camera On' : 'Camera Off'}
        </Text>
      </TouchableOpacity>

      {/* End Call Button */}
      <TouchableOpacity style={styles.endCallBtn} onPress={onEndCall}>
        <Text style={styles.controlBtnIcon}>📞</Text>
        <Text style={[styles.controlBtnLabel, { color: '#fff' }]}>End</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    marginTop: 2,
  },
  recBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 20,
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  recText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '700',
  },
  gridContainer: {
    flex: 1,
    position: 'relative',
  },
  gridContent: {
    padding: 8,
  },
  tileWrapper: {
    flex: 1,
    aspectRatio: 3 / 4,
    margin: 4,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1e293b',
    position: 'relative',
  },
  videoTile: {
    width: '100%',
    height: '100%',
  },
  tileLabelContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 8,
    paddingBottom: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  tileLabel: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
  },
  emptyStateText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 16,
  },
  participantBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  participantBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  connecting: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectingText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  controlBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  controlBtnActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  controlBtnIcon: {
    fontSize: 24,
  },
  controlBtnLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 10,
    marginTop: 4,
    fontWeight: '500',
  },
  endCallBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ef4444',
  },
});
