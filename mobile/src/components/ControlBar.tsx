import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';

interface ControlBarProps {
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onFlipCamera?: () => void;
  onToggleScreenShare: () => void;
  onLeaveCall: () => void;
  onAddParticipant?: () => void;
  isCollector?: boolean;
}

export const ControlBar: React.FC<ControlBarProps> = ({
  isMuted,
  isCameraOff,
  isScreenSharing,
  onToggleMic,
  onToggleCamera,
  onFlipCamera,
  onToggleScreenShare,
  onLeaveCall,
  onAddParticipant,
}) => {
  return (
    <View style={styles.container}>
      {/* Mic Button */}
      <View style={styles.btnWrapper}>
        <TouchableOpacity
          style={[styles.circleBtn, isMuted ? styles.btnDanger : styles.btnDefault]}
          onPress={onToggleMic}
          activeOpacity={0.7}
        >
          <Text style={styles.btnIcon}>{isMuted ? '🔇' : '🎤'}</Text>
        </TouchableOpacity>
        <Text style={styles.btnLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
      </View>

      {/* Camera Button */}
      <View style={styles.btnWrapper}>
        <TouchableOpacity
          style={[styles.circleBtn, isCameraOff ? styles.btnDanger : styles.btnDefault]}
          onPress={onToggleCamera}
          activeOpacity={0.7}
        >
          <Text style={styles.btnIcon}>{isCameraOff ? '📷' : '📹'}</Text>
        </TouchableOpacity>
        <Text style={styles.btnLabel}>{isCameraOff ? 'Cam Off' : 'Cam On'}</Text>
      </View>

      {/* Add Person Button (Available for Officer / Collector) */}
      {onAddParticipant && (
        <View style={styles.btnWrapper}>
          <TouchableOpacity
            style={[styles.circleBtn, styles.btnAddPerson]}
            onPress={onAddParticipant}
            activeOpacity={0.7}
          >
            <Text style={[styles.btnIcon, { fontSize: 20 }]}>➕</Text>
          </TouchableOpacity>
          <Text style={[styles.btnLabel, { color: '#38bdf8', fontWeight: '700' }]}>Add</Text>
        </View>
      )}

      {/* Screen Share Button */}
      <View style={styles.btnWrapper}>
        <TouchableOpacity
          style={[styles.circleBtn, isScreenSharing ? styles.btnActiveShare : styles.btnDefault]}
          onPress={onToggleScreenShare}
          activeOpacity={0.7}
        >
          <Text style={styles.btnIcon}>{isScreenSharing ? '⏹️' : '📱'}</Text>
        </TouchableOpacity>
        <Text style={[styles.btnLabel, isScreenSharing && { color: '#34d399', fontWeight: '700' }]}>
          {isScreenSharing ? 'Stop' : 'Share'}
        </Text>
      </View>

      {/* Flip Camera Button */}
      {onFlipCamera && (
        <View style={styles.btnWrapper}>
          <TouchableOpacity
            style={[styles.circleBtn, styles.btnDefault]}
            onPress={onFlipCamera}
            activeOpacity={0.7}
          >
            <Text style={styles.btnIcon}>🔄</Text>
          </TouchableOpacity>
          <Text style={styles.btnLabel}>Flip</Text>
        </View>
      )}

      {/* Leave / End Hearing Button */}
      <View style={styles.btnWrapper}>
        <TouchableOpacity
          style={[styles.circleBtn, styles.btnEndCall]}
          onPress={onLeaveCall}
          activeOpacity={0.7}
        >
          <Text style={[styles.btnIcon, { transform: [{ rotate: '135deg' }] }]}>📞</Text>
        </TouchableOpacity>
        <Text style={[styles.btnLabel, { color: '#ef4444', fontWeight: '700' }]}>End</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: Platform.OS === 'android' ? 22 : 32,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(9, 13, 22, 0.96)',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  btnWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  btnDefault: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  btnDanger: {
    backgroundColor: '#991b1b',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  btnAddPerson: {
    backgroundColor: '#0369a1',
    borderWidth: 1.5,
    borderColor: '#38bdf8',
  },
  btnActiveShare: {
    backgroundColor: '#047857',
    borderWidth: 1.5,
    borderColor: '#34d399',
  },
  btnEndCall: {
    backgroundColor: '#dc2626',
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  btnIcon: {
    fontSize: 18,
  },
  btnLabel: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },
});
