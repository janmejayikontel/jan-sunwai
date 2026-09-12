import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

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
      <TouchableOpacity
        style={[styles.btn, isMuted ? styles.btnDanger : styles.btnDefault]}
        onPress={onToggleMic}
        activeOpacity={0.8}
      >
        <Text style={styles.btnIcon}>{isMuted ? '🔇' : '🎤'}</Text>
        <Text style={styles.btnLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
      </TouchableOpacity>

      {/* Camera Button */}
      <TouchableOpacity
        style={[styles.btn, isCameraOff ? styles.btnDanger : styles.btnDefault]}
        onPress={onToggleCamera}
        activeOpacity={0.8}
      >
        <Text style={styles.btnIcon}>{isCameraOff ? '📷' : '📹'}</Text>
        <Text style={styles.btnLabel}>{isCameraOff ? 'Cam On' : 'Cam Off'}</Text>
      </TouchableOpacity>

      {/* Screen Share Button (WhatsApp style native Android screen capture!) */}
      <TouchableOpacity
        style={[styles.btn, isScreenSharing ? styles.btnActiveShare : styles.btnDefault]}
        onPress={onToggleScreenShare}
        activeOpacity={0.8}
      >
        <Text style={styles.btnIcon}>{isScreenSharing ? '⏹️' : '📱'}</Text>
        <Text style={[styles.btnLabel, isScreenSharing && styles.btnLabelActive]}>
          {isScreenSharing ? 'Stop' : 'Share'}
        </Text>
      </TouchableOpacity>

      {/* Add Participant / Official Button */}
      {onAddParticipant && (
        <TouchableOpacity
          style={[styles.btn, styles.btnAddOfficial]}
          onPress={onAddParticipant}
          activeOpacity={0.8}
        >
          <Text style={styles.btnIcon}>➕</Text>
          <Text style={[styles.btnLabel, { color: '#38bdf8' }]}>Add Person</Text>
        </TouchableOpacity>
      )}

      {/* Flip Camera Button */}
      {onFlipCamera && (
        <TouchableOpacity
          style={[styles.btn, styles.btnDefault]}
          onPress={onFlipCamera}
          activeOpacity={0.8}
        >
          <Text style={styles.btnIcon}>🔄</Text>
          <Text style={styles.btnLabel}>Flip</Text>
        </TouchableOpacity>
      )}

      {/* Leave / End Hearing Button */}
      <TouchableOpacity
        style={[styles.btn, styles.btnEndCall]}
        onPress={onLeaveCall}
        activeOpacity={0.8}
      >
        <Text style={styles.btnIcon}>📞</Text>
        <Text style={[styles.btnLabel, { color: '#ffffff', fontWeight: '700' }]}>Leave</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    minWidth: 62,
  },
  btnDefault: {
    backgroundColor: '#1e293b',
  },
  btnDanger: {
    backgroundColor: '#7f1d1d',
  },
  btnActiveShare: {
    backgroundColor: '#047857',
  },
  btnEndCall: {
    backgroundColor: '#dc2626',
  },
  btnAddOfficial: {
    backgroundColor: '#075985',
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  btnIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  btnLabel: {
    fontSize: 10,
    color: '#cbd5e1',
    fontWeight: '600',
  },
  btnLabelActive: {
    color: '#34d399',
    fontWeight: '700',
  },
});
