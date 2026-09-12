import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { UserProfile } from './LoginScreen';

interface GrievanceItem {
  grievanceId: string;
  title: string;
  description?: string;
  category?: string;
  location?: string;
  district?: string;
  status: string;
  assignedEmployee?: {
    name: string;
    designation: string;
    phone: string;
  };
}

interface HomeScreenProps {
  user: UserProfile;
  serverUrl: string;
  onJoinHearing: (params: {
    serverUrl: string;
    token: string;
    roomName: string;
    grievanceId: string;
    userName: string;
    role: string;
  }) => void;
  onLogout: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  user,
  serverUrl,
  onJoinHearing,
  onLogout,
}) => {
  const [grievances, setGrievances] = useState<GrievanceItem[]>([]);
  const [customCaseId, setCustomCaseId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const cleanServerUrl = (url: string) => url.trim().replace(/\/+$/, '');

  // Fetch grievances strictly for the authenticated user/officer
  const fetchGrievances = async () => {
    setIsLoading(true);
    try {
      const url = `${cleanServerUrl(serverUrl)}/api/sampark/by-phone/${encodeURIComponent(user.phone)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.grievances && Array.isArray(data.grievances)) {
          setGrievances(data.grievances);
          if (data.grievances.length > 0 && !customCaseId) {
            setCustomCaseId(data.grievances[0].grievanceId);
          }
          return;
        }
      }
      setGrievances([]);
    } catch (e) {
      console.log('Error fetching user grievances:', e);
      setGrievances([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchGrievances();
  }, [serverUrl, user.phone]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchGrievances();
    setRefreshing(false);
  };

  // Join video hearing for a specific grievance ID
  const handleConnectHearing = async (caseId: string) => {
    const targetCaseId = caseId.trim().toUpperCase();
    if (!targetCaseId) {
      Alert.alert('Required', 'Please enter a valid Grievance / Case ID.');
      return;
    }

    setIsJoining(true);
    try {
      const base = cleanServerUrl(serverUrl);
      const tokenUrl = `${base}/api/livekit/token`;

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: `hearing_${targetCaseId}`,
          participantName: user.name || `User (${user.phone.slice(-4)})`,
          participantRole: user.role || 'citizen',
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.token) {
        throw new Error('No LiveKit token received from server');
      }

      onJoinHearing({
        serverUrl: data.serverUrl || data.url || base,
        token: data.token,
        roomName: data.roomName || `hearing_${targetCaseId}`,
        grievanceId: targetCaseId,
        userName: user.name || `User (${user.phone.slice(-4)})`,
        role: user.role || 'citizen',
      });
    } catch (err: any) {
      console.error('Join hearing error:', err);
      Alert.alert(
        'Connection Failed',
        `Could not join hearing room on server at ${serverUrl}.\n\n${err?.message || 'Check server connection'}`
      );
    } finally {
      setIsJoining(false);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'officer':
        return '#8b5cf6';
      case 'employee':
        return '#3b82f6';
      default:
        return '#10b981';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'officer':
        return '🏛️ District Collector';
      case 'employee':
        return '👮 Field Officer';
      default:
        return '👤 Citizen';
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#020617" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38bdf8" />
        }
      >
        {/* Top App Header */}
        <View style={styles.topHeader}>
          <View style={styles.topHeaderLeft}>
            <Text style={styles.topEmblem}>🏛️</Text>
            <View>
              <Text style={styles.topTitleHindi}>संपर्क लाइट</Text>
              <Text style={styles.topTitleEnglish}>Sampark Lite — Rajasthan</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
            <Text style={styles.logoutText}>Sign Out ⎋</Text>
          </TouchableOpacity>
        </View>

        {/* User Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.greetingText}>नमस्ते (Welcome),</Text>
              <Text style={styles.userNameText}>{user.name}</Text>
              {user.designation ? (
                <Text style={styles.userDesigText}>🏛️ {user.designation}</Text>
              ) : null}
              {user.department ? (
                <Text style={styles.userDeptText}>🏢 {user.department}</Text>
              ) : null}
              <Text style={styles.userPhoneText}>📱 {user.phone}</Text>
            </View>
          </View>

          <View style={styles.profileMetaRow}>
            <View
              style={[
                styles.roleBadge,
                { backgroundColor: `${getRoleBadgeColor(user.role)}22`, borderColor: getRoleBadgeColor(user.role) },
              ]}
            >
              <Text style={[styles.roleBadgeText, { color: getRoleBadgeColor(user.role) }]}>
                {user.designation || getRoleLabel(user.role)}
              </Text>
            </View>
            <Text style={styles.districtText}>📍 {user.district || 'Rajasthan'}</Text>
          </View>
        </View>


        {/* Quick Join by Case ID */}
        <View style={styles.actionCard}>
          <Text style={styles.sectionHeading}>⚡ Join Hearing by Case ID</Text>
          <Text style={styles.sectionSub}>
            Enter Grievance / Case ID to join the LiveKit multi-party video hearing:
          </Text>

          <View style={styles.joinInputRow}>
            <TextInput
              style={styles.joinInput}
              value={customCaseId}
              onChangeText={setCustomCaseId}
              placeholder="e.g. RAJ-2024-88421"
              placeholderTextColor="#64748b"
              autoCapitalize="characters"
            />
            <TouchableOpacity
              style={[styles.joinActionBtn, isJoining && styles.btnDisabled]}
              onPress={() => handleConnectHearing(customCaseId)}
              disabled={isJoining}
            >
              {isJoining ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.joinActionBtnText}>Join ➔</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Grievances List */}
        <View style={styles.listSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeading}>
              📋 {user.role === 'officer' ? 'Jurisdiction Cases & Hearings' : user.role === 'employee' ? 'Assigned Cases' : 'My Filed Grievances'}
            </Text>
            <TouchableOpacity onPress={fetchGrievances}>
              <Text style={styles.refreshLink}>Refresh ↻</Text>
            </TouchableOpacity>
          </View>

          {isLoading && grievances.length === 0 ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color="#38bdf8" size="small" />
              <Text style={styles.loadingText}>Loading grievances...</Text>
            </View>
          ) : grievances.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>📂</Text>
              <Text style={styles.emptyTitle}>
                {user.role === 'citizen' ? 'No Grievances Found' : 'No Active Cases Assigned'}
              </Text>
              <Text style={styles.emptyDesc}>
                {user.role === 'citizen'
                  ? `There are no grievances registered under +91 ${user.phone.slice(-10)}. You can enter any Case ID above to join a hearing room.`
                  : 'No active cases currently mapped to your jurisdiction. Enter a Case ID above to join a hearing room directly.'}
              </Text>
            </View>
          ) : (
            grievances.map((item) => (
              <View key={item.grievanceId} style={styles.caseCard}>
                <View style={styles.caseHeader}>
                  <View style={styles.caseIdBadge}>
                    <Text style={styles.caseIdText}>{item.grievanceId}</Text>
                  </View>
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusText}>{item.status}</Text>
                  </View>
                </View>

                <Text style={styles.caseTitle}>{item.title}</Text>

                {item.category && (
                  <Text style={styles.caseCategory}>📁 {item.category}</Text>
                )}

                {item.location && (
                  <Text style={styles.caseLocation}>📍 {item.location}</Text>
                )}

                {item.assignedEmployee && (
                  <View style={styles.officerBox}>
                    <Text style={styles.officerLabel}>Assigned Official:</Text>
                    <Text style={styles.officerName}>
                      {item.assignedEmployee.name} ({item.assignedEmployee.designation})
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.startHearingBtn, isJoining && styles.btnDisabled]}
                  onPress={() => handleConnectHearing(item.grievanceId)}
                  disabled={isJoining}
                  activeOpacity={0.8}
                >
                  <Text style={styles.startHearingBtnText}>🎥 Enter Video Hearing</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Sampark Helpline Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>🏛️ Sampark Lite — Rajasthan</Text>
          <Text style={styles.infoDesc}>
            Citizen Grievance Redressal & Live Video Hearing Platform. Native screen sharing and WebRTC video call enabled.
          </Text>
          <Text style={styles.helplineHighlight}>
            Dial 181 (Toll-Free) for immediate telephonic assistance.
          </Text>
        </View>
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
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 8,
  },
  topHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topEmblem: {
    fontSize: 32,
  },
  topTitleHindi: {
    fontSize: 20,
    fontWeight: '800',
    color: '#f8fafc',
  },
  topTitleEnglish: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
  },
  logoutBtn: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  logoutText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '700',
  },
  profileCard: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 16,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
  },
  profileInfo: {
    flex: 1,
  },
  greetingText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  userNameText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
  },
  userDesigText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#38bdf8',
    marginTop: 2,
  },
  userDeptText: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 1,
  },
  userPhoneText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },

  profileMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  districtText: {
    color: '#94a3b8',
    fontSize: 12,
  },
  actionCard: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 16,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 4,
  },
  sectionSub: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 12,
    lineHeight: 16,
  },
  joinInputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  joinInput: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  joinActionBtn: {
    backgroundColor: '#0284c7',
    borderRadius: 10,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  joinActionBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  listSection: {
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  refreshLink: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '600',
  },
  caseCard: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 12,
  },
  caseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  caseIdBadge: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  caseIdText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statusBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: '#f59e0b',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    color: '#fbbf24',
    fontSize: 10,
    fontWeight: '700',
  },
  caseTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
    lineHeight: 20,
  },
  caseCategory: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 4,
  },
  caseLocation: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 10,
  },
  officerBox: {
    backgroundColor: '#1e293b',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  officerLabel: {
    color: '#64748b',
    fontSize: 11,
    marginBottom: 2,
  },
  officerName: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
  },
  startHearingBtn: {
    backgroundColor: '#059669',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: '#10b981',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  startHearingBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  infoCard: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginTop: 4,
  },
  infoTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  infoDesc: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 8,
  },
  helplineHighlight: {
    color: '#f59e0b',
    fontSize: 12,
    fontWeight: '700',
  },
  loadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  emptyCard: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderStyle: 'dashed',
    marginBottom: 16,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyTitle: {
    color: '#f1f5f9',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyDesc: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
