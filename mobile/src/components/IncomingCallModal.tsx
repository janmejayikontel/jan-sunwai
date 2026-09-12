import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Vibration,
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
  onAccept: () => void;
  onDecline: () => void;
}

export const IncomingCallModal: React.FC<IncomingCallModalProps> = ({
  incomingCall,
  onAccept,
  onDecline,
}) => {
  useEffect(() => {
    if (incomingCall) {
      // Vibrate like an incoming phone call
      const ONE_SECOND_IN_MS = 1000;
      const PATTERN = [
        0,
        ONE_SECOND_IN_MS,
        ONE_SECOND_IN_MS,
        ONE_SECOND_IN_MS,
        ONE_SECOND_IN_MS,
      ];
      Vibration.vibrate(PATTERN, true);
    } else {
      Vibration.cancel();
    }

    return () => {
      Vibration.cancel();
    };
  }, [incomingCall]);

  if (!incomingCall) return null;

  return (
    <Modal
      transparent
      animationType="slide"
      visible={!!incomingCall}
      onRequestClose={onDecline}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Pulsing ring emblem */}
          <View style={styles.ringIndicator}>
            <Text style={styles.ringIcon}>📞</Text>
          </View>

          <Text style={styles.callBadge}>INCOMING VIDEO HEARING</Text>
          <Text style={styles.hindiSubtitle}>जन सुनवाई वीडियो कॉल आमंत्रण</Text>

          {/* Caller Details */}
          <View style={styles.callerBox}>
            <Text style={styles.callerName}>{incomingCall.callerName}</Text>
            <View style={styles.designationBadge}>
              <Text style={styles.designationText}>
                🏛️ {incomingCall.callerDesignation || 'District Collector & DM'}
              </Text>
            </View>
          </View>

          {/* Grievance Info */}
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>GRIEVANCE / CASE DETAILS</Text>
            <Text style={styles.caseId}>#{incomingCall.grievanceId}</Text>
            <Text style={styles.caseTitle} numberOfLines={2}>
              {incomingCall.title}
            </Text>
          </View>

          <Text style={styles.helpNote}>
            The Presiding Officer has called you into the active hearing session.
          </Text>

          {/* Action Buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.btn, styles.declineBtn]}
              onPress={onDecline}
              activeOpacity={0.8}
            >
              <Text style={styles.declineIcon}>✕</Text>
              <Text style={styles.declineText}>Decline</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.acceptBtn]}
              onPress={onAccept}
              activeOpacity={0.8}
            >
              <Text style={styles.acceptIcon}>📞</Text>
              <Text style={styles.acceptText}>Join Hearing</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#0f172a',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#38bdf8',
    shadowColor: '#38bdf8',
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  ringIndicator: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#0369a1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 3,
    borderColor: '#38bdf8',
  },
  ringIcon: {
    fontSize: 34,
  },
  callBadge: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  hindiSubtitle: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 16,
  },
  callerBox: {
    alignItems: 'center',
    marginBottom: 18,
  },
  callerName: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  designationBadge: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderColor: '#8b5cf6',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
  },
  designationText: {
    color: '#c084fc',
    fontSize: 12,
    fontWeight: '700',
  },
  infoBox: {
    width: '100%',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
  },
  infoLabel: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  caseId: {
    color: '#f59e0b',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  caseTitle: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 18,
  },
  helpNote: {
    color: '#64748b',
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 20,
  },
  actionRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  declineBtn: {
    backgroundColor: '#dc2626',
  },
  declineIcon: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  declineText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  acceptBtn: {
    backgroundColor: '#059669',
  },
  acceptIcon: {
    fontSize: 18,
  },
  acceptText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
