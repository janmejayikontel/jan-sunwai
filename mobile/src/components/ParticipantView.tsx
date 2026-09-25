import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { VideoTrack, TrackReferenceOrPlaceholder } from '@livekit/react-native';
import { Track } from 'livekit-client';

interface ParticipantViewProps {
  trackRef: TrackReferenceOrPlaceholder;
  isScreenShare?: boolean;
  style?: object;
}

const AVATAR_COLORS = ['#2563eb', '#059669', '#7c3aed', '#d97706', '#db2777', '#0891b2', '#4f46e5'];

const getAvatarColor = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

const getInitials = (nameStr: string) => {
  if (!nameStr) return 'P';
  const clean = nameStr.replace(/\(\w+\)/g, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase() || 'P';
};

export const ParticipantView: React.FC<ParticipantViewProps> = ({
  trackRef,
  isScreenShare = false,
  style,
}) => {
  const isLocal = trackRef.participant?.isLocal;
  const name = trackRef.participant?.name || trackRef.participant?.identity || 'Participant';
  const isSpeaking = !!trackRef.participant?.isSpeaking;

  // Check microphone status from track publication
  const micPub = trackRef.participant?.getTrackPublication?.(Track.Source.Microphone);
  const isMicMuted = micPub != null
    ? micPub.isMuted
    : (trackRef.participant ? trackRef.participant.isMicrophoneEnabled === false : false);

  // Track publication video check - show video whenever the track is active and unmuted
  const hasVideoTrack =
    !isScreenShare &&
    !!trackRef.publication?.track &&
    !trackRef.publication?.isMuted;

  return (
    <View
      style={[
        styles.container,
        isSpeaking && styles.speakingBorder,
        isScreenShare && styles.screenShareBox,
        style,
      ]}
    >
      {/* Video stream rendering via hardware-accelerated WebRTC */}
      {hasVideoTrack ? (
        <VideoTrack
          trackRef={trackRef as any}
          mirror={!isScreenShare && isLocal}
          objectFit={isScreenShare ? 'contain' : 'cover'}
          style={styles.video}
        />
      ) : isScreenShare ? (
        <VideoTrack
          trackRef={trackRef as any}
          mirror={false}
          objectFit="contain"
          style={styles.video}
        />
      ) : (
        /* WhatsApp-style Video Off Avatar Profile */
        <View style={styles.avatarContainer}>
          <View
            style={[
              styles.avatarCircle,
              { backgroundColor: getAvatarColor(name) },
              isSpeaking && styles.avatarSpeakingGlow,
            ]}
          >
            <Text style={styles.avatarText}>{getInitials(name)}</Text>
          </View>
          <View style={styles.videoOffPill}>
            <Text style={styles.videoOffPillText}>📷 Video Off</Text>
          </View>
        </View>
      )}

      {isScreenShare && isLocal && (
        <View style={styles.localShareOverlay}>
          <Text style={styles.localShareIcon}>📱</Text>
          <Text style={styles.localShareTitle}>You are sharing your screen</Text>
          <Text style={styles.localShareSubtitle}>
            Participants in the hearing can see your screen in real time.
          </Text>
        </View>
      )}

      {/* Badges / Header overlay */}
      <View style={styles.overlay}>
        <View style={styles.badgeRow}>
          {isScreenShare && (
            <View style={styles.screenShareBadge}>
              <Text style={styles.screenShareText}>📱 SCREEN SHARE</Text>
            </View>
          )}
          {isSpeaking && (
            <View style={styles.speakingBadge}>
              <Text style={styles.speakingText}>🔊 Speaking</Text>
            </View>
          )}
          {isMicMuted && (
            <View style={styles.mutedBadge}>
              <Text style={styles.mutedText}>🔇 Muted</Text>
            </View>
          )}
        </View>

        {/* Participant Name Tag */}
        <View style={styles.nameTag}>
          <Text style={styles.nameText} numberOfLines={1}>
            {name} {isLocal ? '(You)' : ''}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1.5,
    borderColor: '#1e293b',
  },
  screenShareBox: {
    backgroundColor: '#020617',
    borderWidth: 1.5,
    borderColor: '#059669',
    flex: 1,
    width: '100%',
    height: '100%',
  },
  avatarContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0b1329',
  },
  avatarCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#334155',
    elevation: 4,
  },
  avatarSpeakingGlow: {
    borderColor: '#10b981',
    borderWidth: 3,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1,
  },
  videoOffPill: {
    marginTop: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  videoOffPillText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '600',
  },
  localShareOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2, 6, 23, 0.75)',
    padding: 20,
  },
  localShareIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  localShareTitle: {
    color: '#34d399',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  localShareSubtitle: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  speakingBorder: {
    borderColor: '#10b981',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    padding: 6,
    pointerEvents: 'none',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
  },
  screenShareBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.9)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  screenShareText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  speakingBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.9)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  speakingText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700',
  },
  mutedBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  mutedText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700',
  },
  nameTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    maxWidth: '90%',
  },
  nameText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
});
