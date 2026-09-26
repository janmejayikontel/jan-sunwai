import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ViewStyle } from 'react-native';

// ─── SVG-style Icon Components (pure RN Views, no library needed) ─────────────

const MicIcon = ({ muted, size = 20 }: { muted: boolean; size?: number }) => {
  const color = muted ? '#ef4444' : '#ffffff';
  return (
    <View style={{ width: size, height: size + 6, alignItems: 'center', justifyContent: 'center' }}>
      {/* Capsule body */}
      <View style={{
        width: size * 0.52,
        height: size * 0.72,
        borderRadius: size * 0.26,
        backgroundColor: color,
        position: 'absolute',
        top: 0,
      }} />
      {/* Arc stand */}
      <View style={{
        width: size * 0.78,
        height: size * 0.38,
        borderBottomLeftRadius: size * 0.4,
        borderBottomRightRadius: size * 0.4,
        borderLeftWidth: 2,
        borderRightWidth: 2,
        borderBottomWidth: 2,
        borderColor: color,
        position: 'absolute',
        top: size * 0.46,
      }} />
      {/* Vertical pole */}
      <View style={{
        width: 2,
        height: size * 0.22,
        backgroundColor: color,
        position: 'absolute',
        bottom: 0,
      }} />
      {/* Base line */}
      <View style={{
        width: size * 0.56,
        height: 2,
        backgroundColor: color,
        position: 'absolute',
        bottom: 0,
      }} />
      {/* Slash when muted */}
      {muted && (
        <View style={{
          position: 'absolute',
          width: size * 1.2,
          height: 2.5,
          backgroundColor: '#ef4444',
          borderRadius: 2,
          transform: [{ rotate: '-45deg' }],
          top: size * 0.2,
        }} />
      )}
    </View>
  );
};

const CameraIcon = ({ off, size = 20 }: { off: boolean; size?: number }) => {
  const color = off ? '#ef4444' : '#ffffff';
  return (
    <View style={{ width: size + 6, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Camera body */}
      <View style={{
        width: size * 0.72,
        height: size * 0.58,
        borderRadius: 4,
        borderWidth: 2.5,
        borderColor: color,
        position: 'absolute',
        left: 0,
        top: size * 0.21,
      }}>
        {/* Lens */}
        <View style={{
          width: size * 0.28,
          height: size * 0.28,
          borderRadius: size * 0.15,
          borderWidth: 2,
          borderColor: color,
          position: 'absolute',
          alignSelf: 'center',
          top: size * 0.06,
        }} />
      </View>
      {/* Viewfinder hump */}
      <View style={{
        width: size * 0.3,
        height: size * 0.18,
        borderTopLeftRadius: 3,
        borderTopRightRadius: 3,
        backgroundColor: color,
        position: 'absolute',
        top: size * 0.1,
        left: size * 0.18,
      }} />
      {/* Video triangle play head */}
      <View style={{
        position: 'absolute',
        right: 0,
        top: size * 0.28,
        width: 0,
        height: 0,
        borderTopWidth: size * 0.22,
        borderBottomWidth: size * 0.22,
        borderLeftWidth: size * 0.28,
        borderStyle: 'solid',
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        borderLeftColor: color,
      }} />
      {/* Slash when off */}
      {off && (
        <View style={{
          position: 'absolute',
          width: size * 1.3,
          height: 2.5,
          backgroundColor: '#ef4444',
          borderRadius: 2,
          transform: [{ rotate: '-45deg' }],
        }} />
      )}
    </View>
  );
};

const ScreenShareIcon = ({ active, size = 20 }: { active: boolean; size?: number }) => {
  const color = active ? '#34d399' : '#ffffff';
  return (
    <View style={{ width: size + 4, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Monitor frame */}
      <View style={{
        width: size + 4,
        height: size * 0.7,
        borderRadius: 3,
        borderWidth: 2.5,
        borderColor: color,
        position: 'absolute',
        top: 0,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {active ? (
          // Stop square
          <View style={{ width: size * 0.28, height: size * 0.28, backgroundColor: '#34d399', borderRadius: 2 }} />
        ) : (
          // Arrow up
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 0, height: 0, borderLeftWidth: 5, borderRightWidth: 5, borderBottomWidth: 6, borderStyle: 'solid', borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: color }} />
            <View style={{ width: 2, height: 5, backgroundColor: color }} />
          </View>
        )}
      </View>
      {/* Stand */}
      <View style={{ width: size * 0.36, height: size * 0.22, backgroundColor: color, position: 'absolute', bottom: 0, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 }} />
      <View style={{ width: size * 0.6, height: 2, backgroundColor: color, position: 'absolute', bottom: 0 }} />
    </View>
  );
};

const ChatIcon = ({ active, unread = 0, size = 20 }: { active: boolean; unread?: number; size?: number }) => {
  const color = active ? '#38bdf8' : '#ffffff';
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Bubble */}
      <View style={{
        width: size,
        height: size * 0.78,
        borderRadius: size * 0.22,
        borderWidth: 2.5,
        borderColor: color,
        position: 'absolute',
        top: 0,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 4,
      }}>
        {/* Lines inside bubble */}
        <View style={{ width: '70%', height: 2, backgroundColor: color, borderRadius: 1 }} />
        <View style={{ width: '50%', height: 2, backgroundColor: color, borderRadius: 1 }} />
      </View>
      {/* Tail */}
      <View style={{
        position: 'absolute',
        bottom: 0,
        left: size * 0.15,
        width: 0, height: 0,
        borderTopWidth: size * 0.22,
        borderRightWidth: size * 0.22,
        borderStyle: 'solid',
        borderTopColor: color,
        borderRightColor: 'transparent',
      }} />
      {/* Badge */}
      {unread > 0 && (
        <View style={{
          position: 'absolute',
          top: -4, right: -4,
          minWidth: 16, height: 16,
          borderRadius: 8,
          backgroundColor: '#ef4444',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 3,
          borderWidth: 1.5,
          borderColor: '#0f172a',
        }}>
          <Text style={{ color: '#fff', fontSize: 8, fontWeight: '800' }}>
            {unread > 9 ? '9+' : unread}
          </Text>
        </View>
      )}
    </View>
  );
};

const AddPersonIcon = ({ size = 20 }: { size?: number }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    {/* Head circle */}
    <View style={{
      width: size * 0.42,
      height: size * 0.42,
      borderRadius: size * 0.22,
      borderWidth: 2,
      borderColor: '#38bdf8',
      position: 'absolute',
      top: 0,
      left: size * 0.06,
    }} />
    {/* Shoulders arc */}
    <View style={{
      width: size * 0.62,
      height: size * 0.32,
      borderTopLeftRadius: size * 0.32,
      borderTopRightRadius: size * 0.32,
      borderTopWidth: 2,
      borderLeftWidth: 2,
      borderRightWidth: 2,
      borderColor: '#38bdf8',
      position: 'absolute',
      bottom: 0,
      left: size * 0.0,
    }} />
    {/* Plus sign */}
    <View style={{ position: 'absolute', right: -2, bottom: size * 0.1 }}>
      <View style={{ width: 10, height: 2, backgroundColor: '#38bdf8', borderRadius: 1 }} />
      <View style={{ width: 2, height: 10, backgroundColor: '#38bdf8', borderRadius: 1, position: 'absolute', left: 4, top: -4 }} />
    </View>
  </View>
);

const FlipIcon = ({ size = 20 }: { size?: number }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    {/* Circular arrow */}
    <View style={{
      width: size * 0.78,
      height: size * 0.78,
      borderRadius: size * 0.4,
      borderWidth: 2.5,
      borderColor: '#ffffff',
      borderTopColor: 'transparent',
      transform: [{ rotate: '-30deg' }],
    }} />
    {/* Arrowhead */}
    <View style={{
      position: 'absolute',
      top: 0,
      right: size * 0.08,
      width: 0, height: 0,
      borderLeftWidth: 5, borderRightWidth: 5, borderBottomWidth: 8,
      borderStyle: 'solid',
      borderLeftColor: 'transparent', borderRightColor: 'transparent',
      borderBottomColor: '#ffffff',
      transform: [{ rotate: '60deg' }],
    }} />
  </View>
);

const EndCallIcon = ({ size = 22 }: { size?: number }) => (
  <View style={{ width: size + 4, height: size * 0.7, alignItems: 'center', justifyContent: 'center' }}>
    {/* Horizontal arched bar */}
    <View style={{
      width: size + 2,
      height: size * 0.42,
      borderTopLeftRadius: size * 0.35,
      borderTopRightRadius: size * 0.35,
      backgroundColor: '#ffffff',
    }} />
    {/* Left ear/mouth piece */}
    <View style={{
      position: 'absolute',
      left: 0,
      bottom: 0,
      width: size * 0.32,
      height: size * 0.34,
      borderRadius: 4,
      backgroundColor: '#ffffff',
    }} />
    {/* Right ear/mouth piece */}
    <View style={{
      position: 'absolute',
      right: 0,
      bottom: 0,
      width: size * 0.32,
      height: size * 0.34,
      borderRadius: 4,
      backgroundColor: '#ffffff',
    }} />
  </View>
);

// ─── ControlBar Component ────────────────────────────────────────────────────

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
  onToggleChat?: () => void;
  unreadChatCount?: number;
  isChatOpen?: boolean;
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
  onToggleChat,
  unreadChatCount = 0,
  isChatOpen = false,
}) => {
  return (
    <View style={styles.container}>

      {/* Mic Button */}
      <TouchableOpacity
        style={[styles.btn, isMuted ? styles.btnDanger : styles.btnDefault]}
        onPress={onToggleMic}
        activeOpacity={0.75}
      >
        <MicIcon muted={isMuted} size={20} />
        <Text style={[styles.label, isMuted && styles.labelDanger]}>
          {isMuted ? 'Unmute' : 'Mute'}
        </Text>
      </TouchableOpacity>

      {/* Camera Button */}
      <TouchableOpacity
        style={[styles.btn, isCameraOff ? styles.btnDanger : styles.btnDefault]}
        onPress={onToggleCamera}
        activeOpacity={0.75}
      >
        <CameraIcon off={isCameraOff} size={20} />
        <Text style={[styles.label, isCameraOff && styles.labelDanger]}>
          {isCameraOff ? 'Start Cam' : 'Stop Cam'}
        </Text>
      </TouchableOpacity>

      {/* Chat Button */}
      {onToggleChat && (
        <TouchableOpacity
          style={[styles.btn, isChatOpen ? styles.btnActiveBlue : styles.btnDefault]}
          onPress={onToggleChat}
          activeOpacity={0.75}
        >
          <ChatIcon active={isChatOpen} unread={unreadChatCount} size={20} />
          <Text style={[styles.label, isChatOpen && styles.labelBlue]}>
            Chat{unreadChatCount > 0 ? ` (${unreadChatCount})` : ''}
          </Text>
        </TouchableOpacity>
      )}

      {/* Add Participant (Officers only) */}
      {onAddParticipant && (
        <TouchableOpacity
          style={[styles.btn, styles.btnAddPerson]}
          onPress={onAddParticipant}
          activeOpacity={0.75}
        >
          <AddPersonIcon size={20} />
          <Text style={[styles.label, styles.labelBlue]}>Add</Text>
        </TouchableOpacity>
      )}

      {/* Screen Share */}
      <TouchableOpacity
        style={[styles.btn, isScreenSharing ? styles.btnActiveGreen : styles.btnDefault]}
        onPress={onToggleScreenShare}
        activeOpacity={0.75}
      >
        <ScreenShareIcon active={isScreenSharing} size={20} />
        <Text style={[styles.label, isScreenSharing && styles.labelGreen]}>
          {isScreenSharing ? 'Stop' : 'Share'}
        </Text>
      </TouchableOpacity>

      {/* Flip Camera */}
      {onFlipCamera && (
        <TouchableOpacity
          style={[styles.btn, styles.btnDefault]}
          onPress={onFlipCamera}
          activeOpacity={0.75}
        >
          <FlipIcon size={20} />
          <Text style={styles.label}>Flip</Text>
        </TouchableOpacity>
      )}

      {/* End Call */}
      <TouchableOpacity
        style={[styles.btn, styles.btnEndCall]}
        onPress={onLeaveCall}
        activeOpacity={0.75}
      >
        <EndCallIcon size={22} />
        <Text style={[styles.label, styles.labelDanger]}>End</Text>
      </TouchableOpacity>

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: Platform.OS === 'android' ? 20 : 30,
    paddingHorizontal: 8,
    backgroundColor: '#0a0f1e',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 56,
    height: 68,
    borderRadius: 16,
    gap: 6,
    paddingTop: 10,
    paddingBottom: 6,
  },
  btnDefault: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  btnDanger: {
    backgroundColor: 'rgba(220, 38, 38, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.5)',
  },
  btnEndCall: {
    backgroundColor: '#dc2626',
    borderWidth: 0,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  btnActiveBlue: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.45)',
  },
  btnActiveGreen: {
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.45)',
  },
  btnAddPerson: {
    backgroundColor: 'rgba(14, 116, 144, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.4)',
  },
  label: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '600',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  labelDanger: {
    color: '#f87171',
  },
  labelBlue: {
    color: '#38bdf8',
  },
  labelGreen: {
    color: '#34d399',
  },
});
