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
          {/* Top header subtitle */}
          <Text style={styles.topCallLabel}>Jan Sunwai Video Call</Text>

          {/* Pulse Ring + Avatar */}
          <View style={styles.avatarArea}>
            <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]} />
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </View>

          {/* Caller name & designation */}
          <Text style={styles.callerName}>{incomingCall.callerName}</Text>
          <Text style={styles.callerDesig}>{incomingCall.callerDesignation || 'Presiding Officer'}</Text>

          {/* Case pill */}
          <View style={styles.caseBox}>
            <Text style={styles.caseId}>Case #{incomingCall.grievanceId}</Text>
            {!!incomingCall.title && (
              <Text style={styles.caseTitle} numberOfLines={2}>{incomingCall.title}</Text>
            )}
          </View>

          {/* WhatsApp Iconic Circular Call Action Buttons */}
          <View style={styles.actionRow}>
            <View style={styles.actionBtnWrapper}>
              <TouchableOpacity style={styles.declineBtn} onPress={onDecline} activeOpacity={0.8}>
                <View style={styles.iconX}>
                  <View style={[styles.xBar, { transform: [{ rotate: '45deg' }] }]} />
                  <View style={[styles.xBar, { transform: [{ rotate: '-45deg' }] }]} />
                </View>
              </TouchableOpacity>
              <Text style={styles.declineTxt}>Decline</Text>
            </View>

            <View style={styles.actionBtnWrapper}>
              <TouchableOpacity style={styles.acceptBtn} onPress={onAccept} activeOpacity={0.8}>
                <View style={styles.phoneIcon}>
                  <View style={styles.phoneBody} />
                </View>
              </TouchableOpacity>
              <Text style={styles.acceptTxt}>Accept</Text>
            </View>
          </View>

          <Text style={styles.footNote}>🔒 End-to-end encrypted</Text>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#111b21',
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(134, 150, 160, 0.2)',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 15,
  },
  topCallLabel: {
    color: '#8696a0',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 20,
    textTransform: 'uppercase',
  },
  avatarArea: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    width: 96,
    height: 96,
  },
  pulseRing: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: 'rgba(0, 168, 132, 0.4)',
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#202c33',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#00a884',
  },
  avatarText: {
    color: '#00a884',
    fontSize: 24,
    fontWeight: '700',
  },
  callerName: {
    color: '#e9edef',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  callerDesig: {
    color: '#8696a0',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 16,
  },
  caseBox: {
    width: '100%',
    backgroundColor: '#202c33',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginBottom: 26,
    borderWidth: 1,
    borderColor: 'rgba(134, 150, 160, 0.1)',
  },
  caseId: {
    color: '#00a884',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  caseTitle: {
    color: '#8696a0',
    fontSize: 11,
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: 30,
    marginBottom: 18,
  },
  actionBtnWrapper: {
    alignItems: 'center',
    gap: 6,
  },
  declineBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#ea0038',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ea0038',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  acceptBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#00a884',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00a884',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  declineTxt: {
    color: '#ea0038',
    fontSize: 12,
    fontWeight: '600',
  },
  acceptTxt: {
    color: '#00a884',
    fontSize: 12,
    fontWeight: '600',
  },
  iconX: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xBar: {
    position: 'absolute',
    width: 18,
    height: 3,
    backgroundColor: '#ffffff',
    borderRadius: 2,
  },
  phoneIcon: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneBody: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: '#ffffff',
    borderTopColor: 'transparent',
    transform: [{ rotate: '-45deg' }],
  },
  footNote: {
    color: '#8696a0',
    fontSize: 11,
    textAlign: 'center',
  },
});
