import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { VideoTrack, TrackReferenceOrPlaceholder } from '@livekit/react-native';

interface ParticipantViewProps {
  trackRef: TrackReferenceOrPlaceholder;
  isScreenShare?: boolean;
  style?: object;
}

export const ParticipantView: React.FC<ParticipantViewProps> = ({
  trackRef,
  isScreenShare = false,
  style,
}) => {
  const isLocal = trackRef.participant?.isLocal;
  const name = trackRef.participant?.name || trackRef.participant?.identity || 'Participant';
  const isSpeaking = trackRef.participant?.isSpeaking;

  return (
    <View style={[styles.container, isSpeaking && styles.speakingBorder, style]}>
      {/* Video stream rendering via hardware-accelerated WebRTC */}
      <VideoTrack
        trackRef={trackRef as any}
        mirror={!isScreenShare && isLocal}
        objectFit={isScreenShare ? 'contain' : 'cover'}
        style={styles.video}
      />

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
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1.5,
    borderColor: '#1e293b',
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
    padding: 8,
    pointerEvents: 'none',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  screenShareBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  screenShareText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  speakingBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  speakingText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  nameTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  nameText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
});
