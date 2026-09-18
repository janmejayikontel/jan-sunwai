import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { DEFAULT_SERVER_URL } from '../config';

interface JoinHearingScreenProps {
  onJoin: (params: {
    serverUrl: string;
    token: string;
    roomName: string;
    grievanceId: string;
    userName: string;
    role: string;
  }) => void;
}

const DEMO_PERSONAS = [
  {
    role: 'citizen',
    label: '👤 Citizen (Janmejay Sethi)',
    phone: '7735807328',
    name: 'Janmejay Sethi',
    grievanceId: 'RAJ-2024-88421',
    badge: 'Complainant',
    badgeColor: '#10b981',
  },
  {
    role: 'call_center',
    label: '🎧 181 Rep (Priya Sharma)',
    phone: '7749852013',
    name: 'Priya Sharma',
    grievanceId: 'RAJ-2024-88421',
    badge: '181 Helpdesk Officer',
    badgeColor: '#f59e0b',
  },
  {
    role: 'officer',
    label: '🏛️ District Collector (Sh. Alok Sharma, IAS)',
    phone: '9414000001',
    name: 'Sh. Alok Sharma, IAS',
    grievanceId: 'RAJ-2024-88421',
    badge: 'District Magistrate',
    badgeColor: '#8b5cf6',
  },
  {
    role: 'admin',
    label: '🛡️ Super Admin (Rajasthan DOIT&C)',
    phone: '9999999999',
    name: 'Rajasthan DOIT&C Admin',
    grievanceId: 'RAJ-2024-88421',
    badge: 'State Administrator',
    badgeColor: '#ef4444',
  },
];

export const JoinHearingScreen: React.FC<JoinHearingScreenProps> = ({ onJoin }) => {
  const [serverBase, setServerBase] = useState(DEFAULT_SERVER_URL);
  const [grievanceId, setGrievanceId] = useState('RAJ-2024-88421');
  const [userName, setUserName] = useState('Janmejay Sethi');
  const [phone, setPhone] = useState('7735807328');
  const [role, setRole] = useState<'citizen' | 'call_center' | 'employee' | 'officer' | 'admin'>('citizen');
  const [isLoading, setIsLoading] = useState(false);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [showAdminPinModal, setShowAdminPinModal] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState('');
  const [adminPinError, setAdminPinError] = useState('');
  const [adminVerified, setAdminVerified] = useState(false);

  const generate6CharRoomCode = () => {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setGrievanceId(`JS-${code}`);
  };

  const handleVerifyAdminPin = () => {
    if (adminPinInput.trim() === '8899') {
      setAdminVerified(true);
      setShowAdminPinModal(false);
      setRole('admin');
      const adminPersona = DEMO_PERSONAS.find((p) => p.role === 'admin');
      if (adminPersona) {
        setUserName(adminPersona.name);
        setPhone(adminPersona.phone);
        setGrievanceId(adminPersona.grievanceId);
      }
      setAdminPinInput('');
      setAdminPinError('');
      Alert.alert('PIN Verified', 'Administrator credentials verified (PIN: 8899).');
    } else {
      setAdminPinError('Invalid Security PIN. Enter 8899 to proceed.');
    }
  };

  const handleSelectPersona = (persona: (typeof DEMO_PERSONAS)[0]) => {
    if (persona.role === 'admin' && !adminVerified) {
      setAdminPinInput('');
      setAdminPinError('');
      setShowAdminPinModal(true);
      return;
    }
    setRole(persona.role as any);
    setUserName(persona.name);
    setPhone(persona.phone);
    setGrievanceId(persona.grievanceId);
  };

  const handleConnect = async () => {
    if (role === 'admin' && !adminVerified) {
      setAdminPinInput('');
      setAdminPinError('');
      setShowAdminPinModal(true);
      return;
    }

    if (!grievanceId.trim() || !userName.trim()) {
      Alert.alert('Required', 'Please enter Grievance ID and your Name');
      return;
    }

    setIsLoading(true);
    try {
      const cleanBase = serverBase.replace(/\/+$/, '');
      const tokenUrl = `${cleanBase}/api/livekit/token`;

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true',
        },
        body: JSON.stringify({
          roomName: `hearing_${grievanceId.trim().toUpperCase()}`,
          participantName: userName.trim(),
          participantRole: role,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.token) {
        throw new Error('No LiveKit token received from server');
      }

      onJoin({
        serverUrl: data.serverUrl || data.url || cleanBase,
        token: data.token,
        roomName: data.roomName || `hearing_${grievanceId.trim().toUpperCase()}`,
        grievanceId: grievanceId.trim().toUpperCase(),
        userName: userName.trim(),
        role,
      });
    } catch (err: any) {
      console.error('Connection error:', err);
      Alert.alert(
        'Connection Failed',
        `Could not connect to Jan Sunwai server at ${serverBase}.\n\nDetails: ${err?.message}\n\nPlease check server IP in settings.`
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#020617" />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header Branding */}
        <View style={styles.brandHeader}>
          <Text style={styles.brandEmblem}>🏛️</Text>
          <Text style={styles.brandTitleHindi}>जन सुनवाई पोर्टल</Text>
          <Text style={styles.brandSubtitle}>Government of Rajasthan — Mobile Hearing App</Text>
          <View style={styles.nativeBadge}>
            <Text style={styles.nativeBadgeText}>✨ NATIVE APP WITH 1-CLICK SCREEN SHARE</Text>
          </View>
        </View>

        {/* Quick 1-Click Demo Profiles */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>⚡ Quick 1-Tap Personas</Text>
          <Text style={styles.cardSub}>Select an identity to test multi-device hearings:</Text>
          <View style={styles.personaList}>
            {DEMO_PERSONAS.map((p) => {
              const isSelected = phone === p.phone;
              return (
                <TouchableOpacity
                  key={p.phone}
                  style={[styles.personaBtn, isSelected && styles.personaBtnSelected]}
                  onPress={() => handleSelectPersona(p)}
                >
                  <View style={styles.personaRow}>
                    <Text style={styles.personaLabel}>{p.label}</Text>
                    <View style={[styles.roleBadge, { backgroundColor: p.badgeColor }]}>
                      <Text style={styles.roleBadgeText}>{p.badge}</Text>
                    </View>
                  </View>
                  <Text style={styles.personaDetails}>
                    Phone: {p.phone} • Case: {p.grievanceId}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Hearing Parameters */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📋 Hearing Credentials</Text>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, marginBottom: 6 }}>
            <Text style={[styles.label, { marginTop: 0, marginBottom: 0 }]}>Grievance / Room ID</Text>
            <TouchableOpacity
              onPress={generate6CharRoomCode}
              style={{
                backgroundColor: 'rgba(56, 189, 248, 0.15)',
                borderWidth: 1,
                borderColor: '#38bdf8',
                borderRadius: 6,
                paddingVertical: 3,
                paddingHorizontal: 8,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#38bdf8' }}>🎲 6-Char Code</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.input}
            value={grievanceId}
            onChangeText={setGrievanceId}
            placeholder="e.g. JS-8F2K9M or GRV-2024-001"
            placeholderTextColor="#64748b"
            autoCapitalize="characters"
          />

          <Text style={styles.label}>Your Name</Text>
          <TextInput
            style={styles.input}
            value={userName}
            onChangeText={setUserName}
            placeholder="Enter full name"
            placeholderTextColor="#64748b"
          />

          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="10-digit mobile number"
            placeholderTextColor="#64748b"
            keyboardType="phone-pad"
          />

          {/* Join Hearing Button */}
          <TouchableOpacity
            style={[styles.joinBtn, isLoading && styles.joinBtnDisabled]}
            onPress={handleConnect}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.joinBtnText}>📞 Join Video Hearing Room</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Server Endpoint Settings Toggle */}
        <TouchableOpacity
          style={styles.configToggle}
          onPress={() => setShowServerConfig(!showServerConfig)}
        >
          <Text style={styles.configToggleText}>
            ⚙️ {showServerConfig ? 'Hide Server URL Settings' : 'Configure Server Endpoint'}
          </Text>
        </TouchableOpacity>

        {showServerConfig && (
          <View style={styles.configBox}>
            <Text style={styles.label}>Server Base URL (Backend)</Text>
            <TextInput
              style={styles.input}
              value={serverBase}
              onChangeText={setServerBase}
              placeholder="http://10.0.2.2:3001 or LAN IP"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.configHelp}>
              • Emulator: http://10.0.2.2:3001{'\n'}
              • Physical Phone: http://YOUR_PC_IP:3001{'\n'}
              • Cloud / Tunnel: https://your-server-url.com
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Admin PIN Gate Modal */}
      <Modal
        visible={showAdminPinModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAdminPinModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeaderRow}>
              <Text style={{ fontSize: 30 }}>🛡️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Super Admin Access</Text>
                <Text style={styles.modalSub}>Restricted Administrative Profile</Text>
              </View>
            </View>

            <Text style={styles.modalPrompt}>
              Enter the 4-digit security PIN to unlock Administrator privileges:
            </Text>

            <TextInput
              style={styles.modalPinInput}
              value={adminPinInput}
              onChangeText={(text) => {
                setAdminPinInput(text);
                setAdminPinError('');
              }}
              placeholder="• • • •"
              placeholderTextColor="#64748b"
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
              autoFocus
            />

            {adminPinError ? (
              <Text style={styles.modalErrorText}>{adminPinError}</Text>
            ) : (
              <Text style={styles.modalHelpText}>Security PIN is 8899</Text>
            )}

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setShowAdminPinModal(false);
                  setAdminPinInput('');
                  setAdminPinError('');
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleVerifyAdminPin}
              >
                <Text style={styles.modalConfirmText}>Verify PIN ➔</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#020617',
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  brandHeader: {
    alignItems: 'center',
    marginVertical: 20,
  },
  brandEmblem: {
    fontSize: 44,
    marginBottom: 6,
  },
  brandTitleHindi: {
    fontSize: 24,
    fontWeight: '800',
    color: '#f8fafc',
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 4,
  },
  nativeBadge: {
    marginTop: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  nativeBadgeText: {
    color: '#34d399',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  cardTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardSub: {
    color: '#64748b',
    fontSize: 12,
    marginBottom: 12,
  },
  personaList: {
    gap: 10,
  },
  personaBtn: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  personaBtnSelected: {
    borderColor: '#10b981',
    backgroundColor: '#064e3b33',
  },
  personaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  personaLabel: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  personaDetails: {
    color: '#94a3b8',
    fontSize: 11,
  },
  label: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  joinBtn: {
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 18,
    shadowColor: '#10b981',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  joinBtnDisabled: {
    opacity: 0.6,
  },
  joinBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  configToggle: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  configToggleText: {
    color: '#64748b',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  configBox: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginTop: 8,
  },
  configHelp: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 8,
    lineHeight: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#0f172a',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#ef4444',
    padding: 22,
    shadowColor: '#ef4444',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
  },
  modalSub: {
    fontSize: 11,
    fontWeight: '700',
    color: '#f87171',
    textTransform: 'uppercase',
  },
  modalPrompt: {
    fontSize: 13,
    color: '#cbd5e1',
    lineHeight: 18,
    marginBottom: 16,
  },
  modalPinInput: {
    backgroundColor: '#020617',
    borderWidth: 1.5,
    borderColor: '#38bdf8',
    borderRadius: 12,
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: 10,
    paddingVertical: 12,
    marginBottom: 8,
  },
  modalErrorText: {
    fontSize: 12,
    color: '#f87171',
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalHelpText: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94a3b8',
  },
  modalConfirmBtn: {
    flex: 1.5,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#ef4444',
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
  },
});
