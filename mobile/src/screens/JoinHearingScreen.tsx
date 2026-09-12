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
    label: '👤 Citizen (Ramesh Kumar)',
    phone: '9876543210',
    name: 'Ramesh Kumar',
    grievanceId: 'GRV-2024-001',
    badge: 'Complainant',
    badgeColor: '#10b981',
  },
  {
    role: 'employee',
    label: '👷 Field Officer (Anita Sharma)',
    phone: '9876543212',
    name: 'Anita Sharma',
    grievanceId: 'GRV-2024-001',
    badge: 'Gram Vikas Adhikari',
    badgeColor: '#3b82f6',
  },
  {
    role: 'officer',
    label: '🏛️ District Collector (Rajesh Meena)',
    phone: '9876543211',
    name: 'Rajesh Meena IAS',
    grievanceId: 'GRV-2024-001',
    badge: 'District Magistrate',
    badgeColor: '#8b5cf6',
  },
];

export const JoinHearingScreen: React.FC<JoinHearingScreenProps> = ({ onJoin }) => {
  const [serverBase, setServerBase] = useState(DEFAULT_SERVER_URL);
  const [grievanceId, setGrievanceId] = useState('GRV-2024-001');
  const [userName, setUserName] = useState('Ramesh Kumar');
  const [phone, setPhone] = useState('9876543210');
  const [role, setRole] = useState<'citizen' | 'employee' | 'officer'>('citizen');
  const [isLoading, setIsLoading] = useState(false);
  const [showServerConfig, setShowServerConfig] = useState(false);

  const handleSelectPersona = (persona: (typeof DEMO_PERSONAS)[0]) => {
    setRole(persona.role as any);
    setUserName(persona.name);
    setPhone(persona.phone);
    setGrievanceId(persona.grievanceId);
  };

  const handleConnect = async () => {
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
        headers: { 'Content-Type': 'application/json' },
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

          <Text style={styles.label}>Grievance / Case ID</Text>
          <TextInput
            style={styles.input}
            value={grievanceId}
            onChangeText={setGrievanceId}
            placeholder="e.g. GRV-2024-001"
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
});
