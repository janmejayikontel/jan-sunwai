import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { VideoTrack, TrackReferenceOrPlaceholder } from '@livekit/react-native';
import { Track } from 'livekit-client';

interface ParticipantViewProps {
  trackRef: TrackReferenceOrPlaceholder;
  isScreenShare?: boolean;
  style?: object;
}

const AVATAR_COLORS = [
  '#1d4ed8', '#0f766e', '#6d28d9', '#b45309',
  '#be185d', '#0e7490', '#4338ca', '#15803d',
];

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
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase() || 'P';
};

// Small mic-off icon using pure Views
const MicOffIcon = () => (
  <View style={{ width: 10, height: 12, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 5, height: 7, borderRadius: 3, backgroundColor: '#f87171', position: 'absolute', top: 0 }} />
    <View style={{ width: 8, height: 4, borderBottomLeftRadius: 4, borderBottomRightRadius: 4, borderLeftWidth: 1.5, borderRightWidth: 1.5, borderBottomWidth: 1.5, borderColor: '#f87171', position: 'absolute', top: 3 }} />
    <View style={{ width: 1.5, height: 2, backgroundColor: '#f87171', position: 'absolute', bottom: 0 }} />
    {/* Slash */}
    <View style={{ position: 'absolute', width: 13, height: 1.5, backgroundColor: '#ef4444', borderRadius: 1, transform: [{ rotate: '-45deg' }] }} />
  </View>
);

// Sound wave speaking indicator
const SpeakingWave = () => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
    {[5, 9, 6].map((h, i) => (
      <View key={i} style={{ width: 2.5, height: h, backgroundColor: '#34d399', borderRadius: 2 }} />
    ))}
  </View>
);

export const ParticipantView: React.FC<ParticipantViewProps> = ({
  trackRef,
  isScreenShare = false,
  style,
}) => {
  const isLocal = trackRef.participant?.isLocal;
  const name = trackRef.participant?.name || trackRef.participant?.identity || 'Participant';
  const isSpeaking = !!trackRef.participant?.isSpeaking;

  const micPub = trackRef.participant?.getTrackPublication?.(Track.Source.Microphone);
  const isMicMuted = micPub != null
    ? micPub.isMuted
    : (trackRef.participant ? trackRef.participant.isMicrophoneEnabled === false : false);

  const hasVideoTrack =
    !isScreenShare &&
    !!trackRef.publication?.track &&
    !trackRef.publication?.isMuted;

  const avatarColor = getAvatarColor(name);
  const initials = getInitials(name);
  const displayName = isLocal ? `${name} (You)` : name;

  return (
    <View
      style={[
        styles.container,
        isSpeaking && styles.speakingBorder,
        isScreenShare && styles.screenShareBox,
        style,
      ]}
    >
      {/* Video layer */}
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
        /* Avatar fallback when camera is off */
        <View style={[styles.avatarBg, { backgroundColor: avatarColor + '22' }]}>
          <View style={[styles.avatarCircle, { borderColor: avatarColor }]}>
            <Text style={[styles.avatarInitials, { color: '#fff' }]}>{initials}</Text>
          </View>
          <View style={styles.camOffTag}>
            <View style={styles.camOffDot} />
            <Text style={styles.camOffText}>Camera Off</Text>
          </View>
        </View>
      )}

      {/* Screen share "You are sharing" overlay */}
      {isScreenShare && isLocal && (
        <View style={styles.localShareOverlay}>
          <View style={styles.shareIconBox}>
            <View style={styles.monitorShape} />
          </View>
          <Text style={styles.localShareTitle}>You are sharing your screen</Text>
          <Text style={styles.localShareSub}>Others can see your screen live</Text>
        </View>
      )}

      {/* Top badges */}
      <View style={styles.topOverlay}>
        {isScreenShare && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>SCREEN SHARE</Text>
          </View>
        )}
        {isSpeaking && !isMicMuted && (
          <View style={[styles.badge, styles.speakingBadge]}>
            <SpeakingWave />
          </View>
        )}
        {isMicMuted && (
          <View style={[styles.badge, styles.mutedBadge]}>
            <MicOffIcon />
          </View>
        )}
      </View>

      {/* Bottom name tag */}
      <View style={styles.nameTagRow}>
        <View style={[styles.nameTag, isSpeaking && { borderColor: '#34d399' }]}>
          <Text style={styles.nameText} numberOfLines={1}>{displayName}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0b1120',
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1.5,
    borderColor: '#1e293b',
  },
  speakingBorder: {
    borderColor: '#34d399',
    borderWidth: 2,
  },
  screenShareBox: {
    backgroundColor: '#020617',
    borderColor: '#059669',
    flex: 1,
    width: '100%',
    height: '100%',
  },
  video: {
    width: '100%',
    height: '100%',
  },

  // Avatar fallback
  avatarBg: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1,
  },
  camOffTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  camOffDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#64748b',
  },
  camOffText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '600',
  },

  // Screen share local overlay
  localShareOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2,6,23,0.8)',
    padding: 20,
  },
  shareIconBox: {
    marginBottom: 12,
  },
  monitorShape: {
    width: 48,
    height: 32,
    borderRadius: 4,
    borderWidth: 2.5,
    borderColor: '#34d399',
  },
  localShareTitle: {
    color: '#34d399',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  localShareSub: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
  },

  // Top badge strip
  topOverlay: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    gap: 4,
  },
  badge: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeText: {
    color: '#94a3b8',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  speakingBadge: {
    borderColor: 'rgba(52,211,153,0.4)',
    backgroundColor: 'rgba(52,211,153,0.12)',
  },
  mutedBadge: {
    borderColor: 'rgba(239,68,68,0.4)',
    backgroundColor: 'rgba(239,68,68,0.12)',
  },

  // Bottom name tag
  nameTagRow: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    right: 6,
  },
  nameTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    maxWidth: '90%',
  },
  nameText: {
    color: '#e2e8f0',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
