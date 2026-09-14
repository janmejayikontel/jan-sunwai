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
  citizen?: {
    name: string;
    phone: string;
    village?: string;
    district?: string;
    tehsil?: string;
  };
  assignedEmployee?: {
    name: string;
    designation: string;
    phone: string;
    department?: string;
    postingLocation?: string;
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
    callId?: string;
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
  const [isLoading, setIsLoading] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Officer Grievance Inspector State
  const isOfficer = user.role === 'officer' || user.role === 'collector';
  const [inspectGrievanceId, setInspectGrievanceId] = useState('RAJ-2024-88421');
  const [inspectedGrievance, setInspectedGrievance] = useState<GrievanceItem | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);

  const cleanServerUrl = (url: string) => url.trim().replace(/\/+$/, '');

  const fetchWithRetry = async (url: string, init?: any, retries = 2): Promise<Response> => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, init);
        if (res.status === 429 || res.status === 503 || res.status === 504) {
          if (attempt < retries) {
            await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
            continue;
          }
        }
        return res;
      } catch (e) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
          continue;
        }
        throw e;
      }
    }
    return fetch(url, init);
  };

  // ─── Grievance Inspection for Officer ────────────────────────
  const handleInspectGrievance = async (targetId?: string) => {
    const idToLookup = (targetId || inspectGrievanceId).trim().toUpperCase();
    if (!idToLookup) return;
    setIsInspecting(true);
    setInspectError(null);
    try {
      const base = cleanServerUrl(serverUrl);
      const res = await fetchWithRetry(`${base}/api/sampark/grievance/${encodeURIComponent(idToLookup)}`, {
        headers: {
          'Bypass-Tunnel-Reminder': 'true',
        },
      });
      const raw = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(raw);
      } catch {
        console.warn('Inspect grievance non-json response:', raw.slice(0, 100));
      }

      if (res.ok && data?.grievance) {
        setInspectedGrievance(data.grievance);
        setInspectError(null);
        return;
      }
      setInspectedGrievance(null);
      setInspectError(data?.message || data?.error || `Grievance #${idToLookup} not found in database.`);
    } catch (err: any) {
      console.warn('Inspect grievance error:', err);
      setInspectError('Unable to reach server to fetch grievance details. Please check connection.');
    } finally {
      setIsInspecting(false);
    }
  };

  // Fetch grievances for the logged in user
  const fetchGrievances = async () => {
    setIsLoading(true);
    try {
      const url = `${cleanServerUrl(serverUrl)}/api/sampark/by-phone/${encodeURIComponent(user.phone)}`;
      const res = await fetchWithRetry(url, {
        headers: {
          'Bypass-Tunnel-Reminder': 'true',
        },
      });
      const raw = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(raw);
      } catch {
        console.warn('Fetch grievances non-json response:', raw.slice(0, 100));
      }

      if (res.ok && data?.grievances && Array.isArray(data.grievances)) {
        setGrievances(data.grievances);
        return;
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
    if (isOfficer) {
      handleInspectGrievance('RAJ-2024-88421');
    }
  }, [serverUrl, user.phone]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchGrievances();
    if (isOfficer && inspectGrievanceId) {
      await handleInspectGrievance(inspectGrievanceId);
    }
    setRefreshing(false);
  };

  // Officer initiates video hearing call for a grievance
  const handleConnectHearing = async (caseId: string, preloadedGrievance?: GrievanceItem | null) => {
    const targetCaseId = caseId.trim().toUpperCase();
    if (!targetCaseId) {
      Alert.alert('Required', 'Please enter a valid Grievance / Case ID.');
      return;
    }

    // Call facility is strictly restricted to Officers/Collectors
    if (!isOfficer) {
      Alert.alert(
        'Access Restricted (पहुंच प्रतिबंधित)',
        'Only the Presiding Officer / District Collector can initiate video hearing calls. Citizens and officials will receive an incoming video call prompt when invited.'
      );
      return;
    }

    setIsJoining(true);
    try {
      const base = cleanServerUrl(serverUrl);

      const targetGrievance =
        preloadedGrievance ||
        (inspectedGrievance?.grievanceId.toUpperCase() === targetCaseId ? inspectedGrievance : null) ||
        grievances.find((g) => g.grievanceId.toUpperCase() === targetCaseId);

      const initiateRes = await fetchWithRetry(`${base}/api/calls/initiate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true',
        },
        body: JSON.stringify({
          grievanceId: targetCaseId,
          title: targetGrievance
            ? `Jan Sunwai — ${targetGrievance.title}`
            : `Jan Sunwai — Hearing #${targetCaseId}`,
          hostUserId: user.id || user.phone || 'officer-001',
          hostName: user.name || 'Vivek, IAS',
          hostPhone: user.phone || '',
          hostDesignation: user.designation || 'District Collector & DM',
          citizenPhone: targetGrievance?.citizen?.phone,
          citizenName: targetGrievance?.citizen?.name,
          employeePhone: targetGrievance?.assignedEmployee?.phone,
          employeeName: targetGrievance?.assignedEmployee?.name,
          employeeDesignation: targetGrievance?.assignedEmployee?.designation,
          employeeDepartment: targetGrievance?.assignedEmployee?.department,
          autoRecord: true,
        }),
      });

      if (!initiateRes.ok) {
        const errData = await initiateRes.json().catch(() => null);
        throw new Error(
          errData?.error || `Failed to initiate hearing call (${initiateRes.status})`
        );
      }

      const initiateData = await initiateRes.json();

      onJoinHearing({
        serverUrl: initiateData.livekit?.url || base,
        token: initiateData.livekit?.token,
        roomName: initiateData.livekit?.roomName || `JS-${targetCaseId}`,
        grievanceId: targetCaseId,
        userName: user.name || `Officer (${user.phone.slice(-4)})`,
        role: user.role || 'officer',
        callId: initiateData.call?.id,
      });
    } catch (err: any) {
      console.error('Initiate hearing error:', err);
      Alert.alert(
        'Call Initiation Failed',
        `Could not connect hearing call: ${err?.message || 'Check server connection'}`
      );
    } finally {
      setIsJoining(false);
    }
  };

  const getRoleBadgeColor = (role?: string) => {
    switch (role) {
      case 'officer':
      case 'collector':
        return '#8b5cf6';
      case 'employee':
        return '#3b82f6';
      default:
        return '#10b981';
    }
  };

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case 'officer':
      case 'collector':
        return '🏛️ Presiding Officer / Collector';
      case 'employee':
        return '👮 Assigned Field Officer';
      default:
        return '👤 Registered Citizen (नागरिक)';
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
        {/* Top Bar */}
        <View style={styles.topHeader}>
          <View style={styles.topHeaderLeft}>
            <Text style={styles.topEmblem}>🏛️</Text>
            <View>
              <Text style={styles.topTitleHindi}>जन सुनवाई</Text>
              <Text style={styles.topTitleEnglish}>Department of Administrative Reforms</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
            <Text style={styles.logoutBtnText}>Logout ⎋</Text>
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
                {
                  backgroundColor: `${getRoleBadgeColor(user.role)}22`,
                  borderColor: getRoleBadgeColor(user.role),
                },
              ]}
            >
              <Text style={[styles.roleBadgeText, { color: getRoleBadgeColor(user.role) }]}>
                {user.designation || getRoleLabel(user.role)}
              </Text>
            </View>
            <Text style={styles.districtText}>📍 {user.district || 'Rajasthan'}</Text>
          </View>
        </View>

        {/* ─── OFFICER ONLY: Grievance Inspection & Video Hearing ─── */}
        {isOfficer ? (
          <View style={styles.officerInspectCard}>
            <View style={styles.officerInspectHeader}>
              <Text style={styles.inspectHeading}>🔍 Grievance Inspection & Call</Text>
              <Text style={styles.inspectSub}>
                Enter Grievance ID to inspect case details and initiate Live Hearing:
              </Text>
            </View>

            <View style={styles.inspectInputRow}>
              <TextInput
                style={styles.inspectInput}
                value={inspectGrievanceId}
                onChangeText={setInspectGrievanceId}
                placeholder="e.g. RAJ-2024-88421"
                placeholderTextColor="#64748b"
                autoCapitalize="characters"
              />
              <TouchableOpacity
                style={[styles.inspectBtn, isInspecting && styles.btnDisabled]}
                onPress={() => handleInspectGrievance(inspectGrievanceId)}
                disabled={isInspecting}
              >
                {isInspecting ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.inspectBtnText}>Inspect ➔</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Quick Grievance Select Chips */}
            <View style={styles.quickChipsRow}>
              <Text style={styles.quickChipsLabel}>Quick Cases:</Text>
              <TouchableOpacity
                style={styles.chipBtn}
                onPress={() => {
                  setInspectGrievanceId('RAJ-2024-88421');
                  handleInspectGrievance('RAJ-2024-88421');
                }}
              >
                <Text style={styles.chipBtnText}>💧 RAJ-2024-88421 (PHED)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.chipBtn}
                onPress={() => {
                  setInspectGrievanceId('RAJ-2024-71205');
                  handleInspectGrievance('RAJ-2024-71205');
                }}
              >
                <Text style={styles.chipBtnText}>📜 RAJ-2024-71205 (Pension)</Text>
              </TouchableOpacity>
            </View>

            {inspectError && (
              <View style={styles.errorBox}>
                <Text style={styles.errorBoxText}>⚠️ {inspectError}</Text>
              </View>
            )}

            {/* Inspected Grievance Preview Card */}
            {inspectedGrievance && (
              <View style={styles.previewBox}>
                <View style={styles.previewHeaderRow}>
                  <View style={styles.previewIdBadge}>
                    <Text style={styles.previewIdText}>#{inspectedGrievance.grievanceId}</Text>
                  </View>
                  <View style={styles.previewStatusBadge}>
                    <Text style={styles.previewStatusText}>{inspectedGrievance.status}</Text>
                  </View>
                </View>

                <Text style={styles.previewTitle}>{inspectedGrievance.title}</Text>

                {inspectedGrievance.category && (
                  <Text style={styles.previewCategory}>📁 {inspectedGrievance.category}</Text>
                )}
                {inspectedGrievance.location && (
                  <Text style={styles.previewLocation}>📍 {inspectedGrievance.location}</Text>
                )}

                {/* Participant Details */}
                <View style={styles.partiesGrid}>
                  {inspectedGrievance.citizen && (
                    <View style={styles.partyBox}>
                      <Text style={styles.partyBoxHeader}>👤 Citizen / Complainant</Text>
                      <Text style={styles.partyName}>{inspectedGrievance.citizen.name}</Text>
                      <Text style={styles.partyPhone}>📞 {inspectedGrievance.citizen.phone}</Text>
                      {inspectedGrievance.citizen.village && (
                        <Text style={styles.partyMeta}>
                          🏡 {inspectedGrievance.citizen.village} ({inspectedGrievance.citizen.district})
                        </Text>
                      )}
                    </View>
                  )}

                  {inspectedGrievance.assignedEmployee && (
                    <View style={[styles.partyBox, styles.partyBoxOfficer]}>
                      <Text style={styles.partyBoxHeader}>👮 Assigned Official</Text>
                      <Text style={styles.partyName}>{inspectedGrievance.assignedEmployee.name}</Text>
                      <Text style={styles.partyDesig}>{inspectedGrievance.assignedEmployee.designation}</Text>
                      <Text style={styles.partyPhone}>📞 {inspectedGrievance.assignedEmployee.phone}</Text>
                      {inspectedGrievance.assignedEmployee.department && (
                        <Text style={styles.partyMeta}>
                          🏢 {inspectedGrievance.assignedEmployee.department}
                        </Text>
                      )}
                    </View>
                  )}
                </View>

                {inspectedGrievance.description && (
                  <View style={styles.descriptionBox}>
                    <Text style={styles.descriptionLabel}>Grievance Summary:</Text>
                    <Text style={styles.descriptionText} numberOfLines={3}>
                      {inspectedGrievance.description}
                    </Text>
                  </View>
                )}

                {/* Direct 1-Tap Video Call Button */}
                <TouchableOpacity
                  style={[styles.primaryCallBtn, isJoining && styles.btnDisabled]}
                  onPress={() => handleConnectHearing(inspectedGrievance.grievanceId, inspectedGrievance)}
                  disabled={isJoining}
                  activeOpacity={0.85}
                >
                  {isJoining ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <View style={styles.primaryCallBtnContent}>
                      <Text style={styles.primaryCallIcon}>📞</Text>
                      <View>
                        <Text style={styles.primaryCallTitle}>Start Video Hearing Call</Text>
                        <Text style={styles.primaryCallSub}>
                          Rings {inspectedGrievance.citizen?.name} & {inspectedGrievance.assignedEmployee?.name}
                        </Text>
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          // ─── CITIZEN / EMPLOYEE NOTICE CARD ───
          <View style={styles.citizenNoticeCard}>
            <View style={styles.noticeHeaderRow}>
              <Text style={styles.noticeEmblem}>🏛️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.noticeTitle}>
                  {user.role === 'employee' ? 'Official Hearing Portal' : 'Citizen Grievance Redressal'}
                </Text>
                <Text style={styles.noticeDesc}>
                  {user.role === 'employee'
                    ? 'Field officials are invited into video hearings by the District Collector or Presiding Officer.'
                    : 'When the Presiding Officer conducts the hearing for your grievance, an incoming video call prompt will ring on your phone automatically.'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Grievances List */}
        <View style={styles.listSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeading}>
              📋 {isOfficer ? 'Jurisdiction Grievances' : user.role === 'employee' ? 'My Assigned Cases' : 'My Filed Grievances'}
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
                  ? `There are no grievances registered under +91 ${user.phone.slice(-10)}.`
                  : 'No active cases currently mapped to your jurisdiction.'}
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

                {/* Call facility strictly for officers */}
                {isOfficer ? (
                  <TouchableOpacity
                    style={[styles.startHearingBtn, isJoining && styles.btnDisabled]}
                    onPress={() => handleConnectHearing(item.grievanceId, item)}
                    disabled={isJoining}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.startHearingBtnText}>📞 Call Citizen & Official ➔</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.awaitingCallBadge}>
                    <Text style={styles.awaitingCallIcon}>⏳</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.awaitingCallTitle}>Hearing Invitation Pending</Text>
                      <Text style={styles.awaitingCallDesc}>
                        Awaiting video call initiation by the Presiding Officer.
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            ))
          )}
        </View>

        {/* Sampark Helpline Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>🏛️ Sampark Lite — Rajasthan</Text>
          <Text style={styles.infoDesc}>
            Citizen Grievance Redressal & Live Video Hearing Platform. Native screen sharing and multi-party hearing enabled.
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
  logoutBtnText: {
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
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1e293b',
    borderWidth: 1.5,
    borderColor: '#38bdf8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#38bdf8',
  },
  profileInfo: {
    flex: 1,
  },
  greetingText: {
    fontSize: 12,
    color: '#64748b',
  },
  userNameText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#f8fafc',
    marginTop: 1,
  },
  userDesigText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#38bdf8',
    marginTop: 2,
  },
  userDeptText: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 1,
  },
  userPhoneText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 3,
  },
  profileMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  roleBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  districtText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },

  // Officer Inspector Styles
  officerInspectCard: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#0284c7',
    marginBottom: 20,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  officerInspectHeader: {
    marginBottom: 12,
  },
  inspectHeading: {
    fontSize: 16,
    fontWeight: '800',
    color: '#f8fafc',
  },
  inspectSub: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 3,
  },
  inspectInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  inspectInput: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  inspectBtn: {
    backgroundColor: '#0284c7',
    borderRadius: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inspectBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  quickChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  quickChipsLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  chipBtn: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chipBtnText: {
    fontSize: 11,
    color: '#38bdf8',
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  errorBoxText: {
    color: '#f87171',
    fontSize: 12,
  },
  previewBox: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    marginTop: 6,
  },
  previewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  previewIdBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  previewIdText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '800',
  },
  previewStatusBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  previewStatusText: {
    color: '#fbbf24',
    fontSize: 11,
    fontWeight: '700',
  },
  previewTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  previewCategory: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 2,
  },
  previewLocation: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 10,
  },
  partiesGrid: {
    gap: 8,
    marginBottom: 10,
  },
  partyBox: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  partyBoxOfficer: {
    borderColor: 'rgba(59, 130, 246, 0.4)',
  },
  partyBoxHeader: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  partyName: {
    fontSize: 14,
    color: '#f8fafc',
    fontWeight: '700',
  },
  partyDesig: {
    fontSize: 12,
    color: '#38bdf8',
    fontWeight: '600',
    marginTop: 1,
  },
  partyPhone: {
    fontSize: 12,
    color: '#10b981',
    fontWeight: '600',
    marginTop: 2,
  },
  partyMeta: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  descriptionBox: {
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderRadius: 8,
    padding: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  descriptionLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '700',
    marginBottom: 2,
  },
  descriptionText: {
    fontSize: 12,
    color: '#cbd5e1',
    lineHeight: 16,
  },
  primaryCallBtn: {
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryCallBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  primaryCallIcon: {
    fontSize: 24,
  },
  primaryCallTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  primaryCallSub: {
    color: '#d1fae5',
    fontSize: 11,
    marginTop: 1,
  },

  // Citizen / Employee Notice Card
  citizenNoticeCard: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 20,
  },
  noticeHeaderRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  noticeEmblem: {
    fontSize: 28,
  },
  noticeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 4,
  },
  noticeDesc: {
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: 17,
  },

  // List Section
  listSection: {
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
  },
  refreshLink: {
    fontSize: 12,
    color: '#38bdf8',
    fontWeight: '600',
  },
  loadingBox: {
    padding: 30,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: '#64748b',
    fontSize: 13,
  },
  emptyCard: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 4,
  },
  emptyDesc: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 17,
  },
  caseCard: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 12,
  },
  caseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  caseIdBadge: {
    backgroundColor: '#1e293b',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  caseIdText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },
  statusBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: {
    color: '#fbbf24',
    fontSize: 11,
    fontWeight: '600',
  },
  caseTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 6,
  },
  caseCategory: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 2,
  },
  caseLocation: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 10,
  },
  officerBox: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 8,
    marginBottom: 12,
  },
  officerLabel: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 2,
  },
  officerName: {
    fontSize: 12,
    color: '#e2e8f0',
    fontWeight: '600',
  },
  startHearingBtn: {
    backgroundColor: '#059669',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  startHearingBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  awaitingCallBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  awaitingCallIcon: {
    fontSize: 18,
  },
  awaitingCallTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fbbf24',
  },
  awaitingCallDesc: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 1,
  },
  btnDisabled: {
    opacity: 0.6,
  },

  // Footer Card
  infoCard: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 4,
  },
  infoDesc: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 16,
    marginBottom: 8,
  },
  helplineHighlight: {
    fontSize: 12,
    color: '#38bdf8',
    fontWeight: '600',
  },
});
