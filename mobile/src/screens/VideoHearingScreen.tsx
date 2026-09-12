import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import {
  LiveKitRoom,
  useTracks,
  useRoomContext,
  AudioSession,
} from '@livekit/react-native';
import { Track } from 'livekit-client';
import { ParticipantView } from '../components/ParticipantView';
import { ControlBar } from '../components/ControlBar';
import { AddParticipantModal } from '../components/AddParticipantModal';

interface VideoHearingScreenProps {
  serverUrl: string;
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
  grievanceId: string;
  callId?: string;
  role?: string;
  onLeave: () => void;
}> = ({ serverUrl, grievanceId, callId, role, onLeave }) => {
  const room = useRoomContext();
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showAddParticipant, setShowAddParticipant] = useState(false);

  const isOfficer = role === 'officer' || role === 'collector' || !role;

  // Subscribe to all camera feeds and screen share feeds
  const cameraTracks = useTracks([Track.Source.Camera]);
  const screenShareTracks = useTracks([Track.Source.ScreenShare]);

  // Sync state with local participant
  useEffect(() => {
    if (room?.localParticipant) {
      setIsMuted(!room.localParticipant.isMicrophoneEnabled);
      setIsCameraOff(!room.localParticipant.isCameraEnabled);
      setIsScreenSharing(room.localParticipant.isScreenShareEnabled);
    }
  }, [room]);

  // 1-Click Native Screen Sharing (MediaProjection on Android)
  const handleToggleScreenShare = async () => {
    if (!room?.localParticipant) return;
    try {
      const nextState = !isScreenSharing;
      // Triggers native Android MediaProjectionManager prompt
      await room.localParticipant.setScreenShareEnabled(nextState);
      setIsScreenSharing(nextState);
    } catch (err: any) {
      console.error('[JanSunwai Mobile] Screen share error:', err);
      Alert.alert(
        'Screen Share',
        err?.message || 'Unable to start native screen capture. Please allow system permission.'
      );
    }
  };

  const handleToggleMic = async () => {
    if (!room?.localParticipant) return;
    try {
      const nextMuted = !isMuted;
      await room.localParticipant.setMicrophoneEnabled(!nextMuted);
      setIsMuted(nextMuted);
    } catch (err) {
      console.error('Failed to toggle mic:', err);
    }
  };

  const handleToggleCamera = async () => {
    if (!room?.localParticipant) return;
    try {
      const nextOff = !isCameraOff;
      await room.localParticipant.setCameraEnabled(!nextOff);
      setIsCameraOff(nextOff);
    } catch (err) {
      console.error('Failed to toggle camera:', err);
    }
  };

  // Flip between front and back camera (ideal for site inspection & inspecting documents)
  const handleFlipCamera = async () => {
    if (!room?.localParticipant) return;
    try {
      const videoTrack = room.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack;
      if (videoTrack && typeof (videoTrack as any).restart === 'function') {
        // Toggle camera device
        const currentFacingMode = (videoTrack as any).mediaStreamTrack?.getSettings?.()?.facingMode;
        const newFacing = currentFacingMode === 'environment' ? 'user' : 'environment';
        await (videoTrack as any).restart({ facingMode: newFacing });
      }
    } catch (err) {
      console.log('Camera switch fallback:', err);
    }
  };

  const hasActiveScreenShare = screenShareTracks.length > 0;

  return (
    <View style={styles.roomContainer}>
      {/* Hearing Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>🏛️ Jan Sunwai Hearing</Text>
          <Text style={styles.headerSub}>Grievance ID: {grievanceId}</Text>
        </View>
        <View style={styles.badgeLive}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>

      {/* Main Video View Area */}
      <View style={styles.videoArea}>
        {hasActiveScreenShare ? (
          // Screen share dominant layout
          <View style={styles.screenShareContainer}>
            <View style={styles.mainScreenShare}>
              <ParticipantView trackRef={screenShareTracks[0]} isScreenShare={true} />
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
          // Standard Grid layout
          <ScrollView contentContainerStyle={styles.grid}>
            {cameraTracks.map((track) => (
              <ParticipantView
                key={track.publication?.trackSid || track.participant.identity}
                trackRef={track}
                style={
                  cameraTracks.length <= 1
                    ? styles.singleVideo
                    : cameraTracks.length === 2
                    ? styles.dualVideo
                    : styles.quadVideo
                }
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
        isMuted={isMuted}
        isCameraOff={isCameraOff}
        isScreenSharing={isScreenSharing}
        onToggleMic={handleToggleMic}
        onToggleCamera={handleToggleCamera}
        onFlipCamera={handleFlipCamera}
        onToggleScreenShare={handleToggleScreenShare}
        onLeaveCall={onLeave}
        onAddParticipant={isOfficer ? () => setShowAddParticipant(true) : undefined}
      />

      {/* Add Participant Modal for Officers */}
      <AddParticipantModal
        visible={showAddParticipant}
        grievanceId={grievanceId}
        callId={callId}
        serverUrl={serverUrl}
        onClose={() => setShowAddParticipant(false)}
      />
    </View>
  );
};

export const VideoHearingScreen: React.FC<VideoHearingScreenProps> = ({
  serverUrl,
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
            grievanceId={grievanceId}
            callId={callId}
            role={role}
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
  },
  grid: {
    flexGrow: 1,
    padding: 8,
    gap: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  singleVideo: {
    width: '100%',
    height: SCREEN_HEIGHT * 0.65,
  },
  dualVideo: {
    width: '100%',
    height: (SCREEN_HEIGHT * 0.65) / 2 - 8,
  },
  quadVideo: {
    width: (SCREEN_WIDTH - 24) / 2,
    height: (SCREEN_HEIGHT * 0.65) / 2 - 8,
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
});
