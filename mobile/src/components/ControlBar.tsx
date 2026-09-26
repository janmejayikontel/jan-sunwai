import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Image } from 'react-native';

const ICON_CAMERA = require('../../assets/icons/camera.png');
const ICON_CAMERA_OFF = require('../../assets/icons/camera_off.png');
const ICON_MIC = require('../../assets/icons/mic.png');
const ICON_MIC_OFF = require('../../assets/icons/mic_off.png');
const ICON_END_CALL = require('../../assets/icons/end_call.png');
const ICON_CHAT = require('../../assets/icons/chat.png');
const ICON_ADD_USER = require('../../assets/icons/add_user.png');
const ICON_FLIP = require('../../assets/icons/flip.png');
const ICON_SHARE = require('../../assets/icons/share.png');

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
      {/* 1. Microphone */}
      <TouchableOpacity
        style={styles.itemWrapper}
        onPress={onToggleMic}
        activeOpacity={0.7}
      >
        <View style={[styles.btnCircle, isMuted ? styles.btnDanger : styles.btnDefault]}>
          <Image
            source={isMuted ? ICON_MIC_OFF : ICON_MIC}
            style={[styles.icon, isMuted && styles.iconDanger]}
            tintColor={isMuted ? '#f87171' : '#ffffff'}
          />
        </View>
        <Text style={[styles.label, isMuted && styles.labelDanger]}>
          {isMuted ? 'Muted' : 'Mic'}
        </Text>
      </TouchableOpacity>

      {/* 2. Video Camera */}
      <TouchableOpacity
        style={styles.itemWrapper}
        onPress={onToggleCamera}
        activeOpacity={0.7}
      >
        <View style={[styles.btnCircle, isCameraOff ? styles.btnDanger : styles.btnDefault]}>
          <Image
            source={isCameraOff ? ICON_CAMERA_OFF : ICON_CAMERA}
            style={[styles.icon, isCameraOff && styles.iconDanger]}
            tintColor={isCameraOff ? '#f87171' : '#ffffff'}
          />
        </View>
        <Text style={[styles.label, isCameraOff && styles.labelDanger]}>
          {isCameraOff ? 'Cam Off' : 'Video'}
        </Text>
      </TouchableOpacity>

      {/* 3. Flip Camera */}
      {onFlipCamera && (
        <TouchableOpacity
          style={styles.itemWrapper}
          onPress={onFlipCamera}
          activeOpacity={0.7}
        >
          <View style={[styles.btnCircle, styles.btnDefault]}>
            <Image
              source={ICON_FLIP}
              style={styles.icon}
              tintColor="#ffffff"
            />
          </View>
          <Text style={styles.label}>Flip</Text>
        </TouchableOpacity>
      )}

      {/* 4. Add Participant (Officers only) */}
      {onAddParticipant && (
        <TouchableOpacity
          style={styles.itemWrapper}
          onPress={onAddParticipant}
          activeOpacity={0.7}
        >
          <View style={[styles.btnCircle, styles.btnAdd]}>
            <Image
              source={ICON_ADD_USER}
              style={styles.icon}
              tintColor="#38bdf8"
            />
          </View>
          <Text style={[styles.label, styles.labelCyan]}>Add</Text>
        </TouchableOpacity>
      )}

      {/* 5. In-Call Chat */}
      {onToggleChat && (
        <TouchableOpacity
          style={styles.itemWrapper}
          onPress={onToggleChat}
          activeOpacity={0.7}
        >
          <View style={[styles.btnCircle, isChatOpen ? styles.btnActiveChat : styles.btnDefault]}>
            <Image
              source={ICON_CHAT}
              style={styles.icon}
              tintColor={isChatOpen ? '#38bdf8' : '#ffffff'}
            />
            {unreadChatCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {unreadChatCount > 9 ? '9+' : unreadChatCount}
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.label, isChatOpen && styles.labelCyan]}>Chat</Text>
        </TouchableOpacity>
      )}

      {/* 6. Screen Share */}
      <TouchableOpacity
        style={styles.itemWrapper}
        onPress={onToggleScreenShare}
        activeOpacity={0.7}
      >
        <View style={[styles.btnCircle, isScreenSharing ? styles.btnActiveShare : styles.btnDefault]}>
          <Image
            source={ICON_SHARE}
            style={styles.icon}
            tintColor={isScreenSharing ? '#34d399' : '#ffffff'}
          />
        </View>
        <Text style={[styles.label, isScreenSharing && styles.labelGreen]}>
          {isScreenSharing ? 'Sharing' : 'Share'}
        </Text>
      </TouchableOpacity>

      {/* 7. End Call */}
      <TouchableOpacity
        style={styles.itemWrapper}
        onPress={onLeaveCall}
        activeOpacity={0.7}
      >
        <View style={[styles.btnCircle, styles.btnEnd]}>
          <Image
            source={ICON_END_CALL}
            style={styles.iconEnd}
            tintColor="#ffffff"
          />
        </View>
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
    paddingTop: 12,
    paddingBottom: Platform.OS === 'android' ? 22 : 32,
    paddingHorizontal: 6,
    backgroundColor: '#070c1a',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  itemWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  btnDefault: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  btnDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.22)',
    borderWidth: 1.5,
    borderColor: '#ef4444',
  },
  btnActiveChat: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderWidth: 1.5,
    borderColor: '#38bdf8',
  },
  btnActiveShare: {
    backgroundColor: 'rgba(52, 211, 153, 0.2)',
    borderWidth: 1.5,
    borderColor: '#34d399',
  },
  btnAdd: {
    backgroundColor: 'rgba(14, 116, 144, 0.22)',
    borderWidth: 1.5,
    borderColor: 'rgba(56, 189, 248, 0.5)',
  },
  btnEnd: {
    backgroundColor: '#dc2626',
    borderWidth: 0,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  icon: {
    width: 21,
    height: 21,
    resizeMode: 'contain',
  },
  iconDanger: {
    tintColor: '#f87171',
  },
  iconEnd: {
    width: 22,
    height: 22,
    resizeMode: 'contain',
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94a3b8',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  labelDanger: {
    color: '#f87171',
  },
  labelCyan: {
    color: '#38bdf8',
  },
  labelGreen: {
    color: '#34d399',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#070c1a',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '800',
  },
});
