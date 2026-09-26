import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Vibration,
  Animated,
  Platform,
} from 'react-native';

export interface IncomingCallData {
  callId: string;
  grievanceId: string;
  title: string;
  callerName: string;
  callerDesignation: string;
  roomName: string;
  participantCount: number;
  yourRole: string;
}

interface IncomingCallModalProps {
  incomingCall: IncomingCallData | null;
  isInCall?: boolean;
  isConnecting?: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export const IncomingCallModal: React.FC<IncomingCallModalProps> = ({
  incomingCall,
  isInCall = false,
  isConnecting = false,
  onAccept,
  onDecline,
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(60)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (incomingCall && !isInCall && !isConnecting) {
      Vibration.vibrate([0, 1000, 1000, 1000, 1000], true);

      // Slide in
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 10 }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();

      // Pulse ring
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else {
      Vibration.cancel();
    }
    return () => { Vibration.cancel(); };
  }, [incomingCall, isInCall, isConnecting]);

  if (!incomingCall || isInCall || isConnecting) return null;

  const initials = (incomingCall.callerName || 'DC')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0])
    .join('')
    .toUpperCase();

  return (
    <Modal
      transparent
      animationType="none"
      visible={!!incomingCall && !isInCall && !isConnecting}
      onRequestClose={onDecline}
    >
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <Animated.View style={[styles.card, { transform: [{ translateY: slideAnim }] }]}>

          {/* Pulse Ring + Avatar */}
          <View style={styles.avatarArea}>
            <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]} />
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </View>

          {/* Call label */}
          <View style={styles.callTypeTag}>
            <View style={styles.liveRingDot} />
            <Text style={styles.callTypeText}>INCOMING VIDEO HEARING</Text>
          </View>

          {/* Caller name */}
          <Text style={styles.callerName}>{incomingCall.callerName}</Text>
          <Text style={styles.callerDesig}>{incomingCall.callerDesignation || 'Presiding Officer'}</Text>

          {/* Case info */}
          <View style={styles.caseBox}>
            <Text style={styles.caseLabel}>CASE</Text>
            <Text style={styles.caseId}>#{incomingCall.grievanceId}</Text>
            {!!incomingCall.title && (
              <Text style={styles.caseTitle} numberOfLines={2}>{incomingCall.title}</Text>
            )}
          </View>

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.declineBtn} onPress={onDecline} activeOpacity={0.8}>
              {/* X icon */}
              <View style={styles.iconX}>
                <View style={[styles.xBar, { transform: [{ rotate: '45deg' }] }]} />
                <View style={[styles.xBar, { transform: [{ rotate: '-45deg' }] }]} />
              </View>
              <Text style={styles.declineTxt}>Decline</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.acceptBtn} onPress={onAccept} activeOpacity={0.8}>
              {/* Phone icon */}
              <View style={styles.phoneIcon}>
                <View style={styles.phoneBody} />
              </View>
              <Text style={styles.acceptTxt}>Join Hearing</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footNote}>जन सुनवाई • Government of Rajasthan</Text>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#0d1526',
    borderRadius: 28,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.25)',
    shadowColor: '#38bdf8',
    shadowOpacity: 0.2,
    shadowRadius: 30,
    elevation: 20,
  },

  // Avatar
  avatarArea: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    width: 96,
    height: 96,
  },
  pulseRing: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: 'rgba(56,189,248,0.35)',
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1e40af',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#38bdf8',
  },
  avatarText: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Call type tag
  callTypeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  liveRingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#38bdf8',
  },
  callTypeText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  // Caller info
  callerName: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
  },
  callerDesig: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
  },

  // Case box
  caseBox: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 24,
  },
  caseLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 3,
  },
  caseId: {
    color: '#f59e0b',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 3,
  },
  caseTitle: {
    color: '#cbd5e1',
    fontSize: 12,
    lineHeight: 18,
  },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
    marginBottom: 18,
  },
  declineBtn: {
    flex: 1,
    height: 56,
    backgroundColor: '#7f1d1d',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ef4444',
    gap: 6,
  },
  acceptBtn: {
    flex: 1.5,
    height: 56,
    backgroundColor: '#064e3b',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#10b981',
    gap: 10,
    shadowColor: '#10b981',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  declineTxt: {
    color: '#fca5a5',
    fontSize: 13,
    fontWeight: '700',
  },
  acceptTxt: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },

  // X icon
  iconX: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xBar: {
    position: 'absolute',
    width: 18,
    height: 2.5,
    backgroundColor: '#fca5a5',
    borderRadius: 2,
  },

  // Phone icon (simple)
  phoneIcon: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneBody: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2.5,
    borderColor: '#34d399',
    borderTopColor: 'transparent',
    transform: [{ rotate: '-45deg' }],
  },

  footNote: {
    color: '#334155',
    fontSize: 11,
    textAlign: 'center',
  },
});
