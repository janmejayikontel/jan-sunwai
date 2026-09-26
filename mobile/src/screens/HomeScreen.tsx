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
  Modal,
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

  // Role identification
  const isOfficer = user.role === 'officer' || user.role === 'collector';
  const isCallCenter = user.role === 'call_center';
  const isAdmin = user.role === 'admin';

  // Officer Grievance Inspector State
  const [inspectGrievanceId, setInspectGrievanceId] = useState('RAJ-2024-88421');
  const [inspectedGrievance, setInspectedGrievance] = useState<GrievanceItem | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);

  // ─── Call Centre Representative State ──────────────────────────
  const [ccTab, setCcTab] = useState<'queue' | 'kyc' | 'records'>('queue');
  const [queueItems, setQueueItems] = useState<any[]>([]);
  const [isLoadingQueue, setIsLoadingQueue] = useState(false);
  const [kycPhone, setKycPhone] = useState('+917735807328');
  const [kycJanAadhaar, setKycJanAadhaar] = useState('JA-88492011');
  const [kycAadhaarLast4, setKycAadhaarLast4] = useState('7328');
  const [kycNotes, setKycNotes] = useState('Biometric verified at Tehsil counter');
  const [isVerifyingKyc, setIsVerifyingKyc] = useState(false);
  const [consultPhone, setConsultPhone] = useState('+917735807328');
  const [consultRecord, setConsultRecord] = useState<any | null>(null);
  const [isConsulting, setIsConsulting] = useState(false);

  // ─── Super Admin State ─────────────────────────────────────────
  const [adminTab, setAdminTab] = useState<'diagnostics' | 'audit' | 'security'>('diagnostics');
  const [adminDiagnostics, setAdminDiagnostics] = useState<any | null>(null);
  const [adminAuditLogs, setAdminAuditLogs] = useState<any[]>([]);
  const [adminSettings, setAdminSettings] = useState<Record<string, string>>({
    max_meeting_participants: '1500',
    e2ee_encryption_enabled: 'true',
    sas_safety_numbers_required: 'true',
  });
  const [isLoadingAdmin, setIsLoadingAdmin] = useState(false);
  const [activeMeetings, setActiveMeetings] = useState<any[]>([]);
  const [showActiveMeetingsModal, setShowActiveMeetingsModal] = useState(false);
  const [isJoiningMeeting, setIsJoiningMeeting] = useState<string | null>(null);

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

  // ─── Call Centre Representative Handlers ───────────────────────
  const fetchCallCenterQueue = async () => {
    setIsLoadingQueue(true);
    try {
      const base = cleanServerUrl(serverUrl);
      const res = await fetchWithRetry(`${base}/api/call-center/queue`, {
        headers: { 'Bypass-Tunnel-Reminder': 'true' },
      });
      const data = await res.json();
      if (data.queue) setQueueItems(data.queue);
    } catch (e) {
      console.warn('Queue error:', e);
    } finally {
      setIsLoadingQueue(false);
    }
  };

  const handleDispatchQueue = async (queueId: string) => {
    try {
      const base = cleanServerUrl(serverUrl);
      const res = await fetchWithRetry(`${base}/api/call-center/dispatch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true',
        },
        body: JSON.stringify({
          queueId,
          officerId: 'off-001',
          queueStatus: 'dispatched',
          agentName: user.name || '181 Agent',
          agentPhone: user.phone,
        }),
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert('✅ Dispatched (भेजा गया)', 'Citizen has been dispatched to Magistrate hearing bench.');
        fetchCallCenterQueue();
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to dispatch citizen to hearing');
    }
  };

  const handleVerifyCitizenKyc = async () => {
    if (!kycPhone.trim()) {
      Alert.alert('Required', 'Please enter citizen mobile number');
      return;
    }
    setIsVerifyingKyc(true);
    try {
      const base = cleanServerUrl(serverUrl);
      const res = await fetchWithRetry(`${base}/api/call-center/verify-citizen`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true',
        },
        body: JSON.stringify({
          citizenPhone: kycPhone,
          janAadhaarId: kycJanAadhaar,
          aadhaarLast4: kycAadhaarLast4,
          notes: kycNotes,
          status: 'verified',
          agentName: user.name || '181 Agent',
        }),
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert('✅ KYC Verified (सत्यापित)', 'Citizen Jan Aadhaar KYC successfully verified in SQLite database!');
        fetchCallCenterQueue();
      } else {
        Alert.alert('Verification Failed', data.error || 'Could not verify citizen.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Network error');
    } finally {
      setIsVerifyingKyc(false);
    }
  };

  const handleConsultCitizen = async () => {
    if (!consultPhone.trim()) return;
    setIsConsulting(true);
    try {
      const base = cleanServerUrl(serverUrl);
      const res = await fetchWithRetry(`${base}/api/call-center/citizen-records/${encodeURIComponent(consultPhone.trim())}`, {
        headers: { 'Bypass-Tunnel-Reminder': 'true' },
      });
      const data = await res.json();
      if (data.success) {
        setConsultRecord(data);
      } else {
        Alert.alert('Not Found', 'Citizen records not found for this number.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Consultation error');
    } finally {
      setIsConsulting(false);
    }
  };

  // ─── Super Admin Handlers ─────────────────────────────────────
  const fetchAdminData = async () => {
    setIsLoadingAdmin(true);
    try {
      const base = cleanServerUrl(serverUrl);
      const [diagRes, auditRes, settingsRes, meetingsRes] = await Promise.all([
        fetchWithRetry(`${base}/api/admin/diagnostics`, { headers: { 'Bypass-Tunnel-Reminder': 'true' } }).catch(() => null),
        fetchWithRetry(`${base}/api/admin/audit-logs?limit=25`, { headers: { 'Bypass-Tunnel-Reminder': 'true' } }).catch(() => null),
        fetchWithRetry(`${base}/api/admin/settings`, { headers: { 'Bypass-Tunnel-Reminder': 'true' } }).catch(() => null),
        fetchWithRetry(`${base}/api/admin/active-meetings`, { headers: { 'Bypass-Tunnel-Reminder': 'true' } }).catch(() => null),
      ]);
      if (diagRes && diagRes.ok) {
        const diagData = await diagRes.json().catch(() => null);
        if (diagData?.success) setAdminDiagnostics(diagData);
      }
      if (auditRes && auditRes.ok) {
        const auditData = await auditRes.json().catch(() => null);
        if (auditData?.success) setAdminAuditLogs(auditData.logs || []);
      }
      if (settingsRes && settingsRes.ok) {
        const settingsData = await settingsRes.json().catch(() => null);
        if (settingsData?.success && settingsData.settings) setAdminSettings(settingsData.settings);
      }
      if (meetingsRes && meetingsRes.ok) {
        const meetingsData = await meetingsRes.json().catch(() => null);
        if (meetingsData?.success && Array.isArray(meetingsData.meetings)) {
          setActiveMeetings(meetingsData.meetings);
        }
      }
    } catch (e) {
      console.warn('Admin fetch error:', e);
    } finally {
      setIsLoadingAdmin(false);
    }
  };

  // Real-time active meetings poller for Super Admin (every 4 seconds)
  useEffect(() => {
    if (!isAdmin) return;
    const interval = setInterval(async () => {
      try {
        const base = cleanServerUrl(serverUrl);
        const res = await fetch(`${base}/api/admin/active-meetings`, {
          headers: { 'Bypass-Tunnel-Reminder': 'true' },
        });
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data?.success && Array.isArray(data.meetings)) {
            setActiveMeetings(data.meetings);
          }
        }
      } catch (e) {
        // silent polling
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [isAdmin, serverUrl]);

  const handleSuperAdminJoinMeeting = async (meeting: any) => {
    const targetRoom = meeting.roomName || meeting.id;
    if (!targetRoom) return;

    setIsJoiningMeeting(targetRoom);
    try {
      const base = cleanServerUrl(serverUrl);
      const res = await fetchWithRetry(`${base}/api/admin/join-meeting`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true',
        },
        body: JSON.stringify({
          roomName: targetRoom,
          adminPhone: user.phone,
          adminName: user.name,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success || !data?.token) {
        throw new Error(data?.error || 'Failed to generate Super Admin token');
      }

      setShowActiveMeetingsModal(false);

      onJoinHearing({
        serverUrl: data.url || base,
        token: data.token,
        roomName: targetRoom,
        grievanceId: meeting.grievanceId || targetRoom,
        userName: `${user.name || 'Super Admin'} (Admin)`,
        role: 'admin',
        callId: meeting.id,
      });
    } catch (err: any) {
      console.error('Super Admin join error:', err);
      Alert.alert('Join Failed', err?.message || 'Unable to join meeting as Super Admin');
    } finally {
      setIsJoiningMeeting(null);
    }
  };

  const handleUpdateAdminSetting = async (key: string, value: string) => {
    try {
      const base = cleanServerUrl(serverUrl);
      const res = await fetchWithRetry(`${base}/api/admin/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true',
        },
        body: JSON.stringify({ key, value, actorName: user.name, actorRole: user.role }),
      });
      const data = await res.json();
      if (data.success) {
        setAdminSettings((prev) => ({ ...prev, [key]: value }));
        Alert.alert('Saved', `Setting ${key} updated successfully.`);
      }
    } catch (e: any) {
      Alert.alert('Error', 'Failed to update setting');
    }
  };

  useEffect(() => {
    if (isCallCenter) {
      fetchCallCenterQueue();
    } else if (isAdmin) {
      fetchAdminData();
    } else if (isOfficer) {
      fetchGrievances();
      handleInspectGrievance('RAJ-2024-88421');
    } else {
      fetchGrievances();
    }
  }, [serverUrl, user.phone, user.role]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (isCallCenter) {
      await fetchCallCenterQueue();
    } else if (isAdmin) {
      await fetchAdminData();
    } else {
      await fetchGrievances();
      if (isOfficer && inspectGrievanceId) {
        await handleInspectGrievance(inspectGrievanceId);
      }
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
      case 'admin':
        return '#ef4444';
      case 'call_center':
        return '#f59e0b';
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
      case 'admin':
        return '🛡️ Super Admin / System Oversight';
      case 'call_center':
        return '🎧 181 Call Centre Representative';
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

        {/* ─── ROLE VIEW 1: CALL CENTRE REPRESENTATIVE PORTAL ─── */}
        {isCallCenter ? (
          <View style={styles.roleContainer}>
            {/* Tabs */}
            <View style={styles.tabBar}>
              <TouchableOpacity
                style={[styles.tabBtn, ccTab === 'queue' && styles.tabBtnActiveOrange]}
                onPress={() => setCcTab('queue')}
              >
                <Text style={[styles.tabBtnText, ccTab === 'queue' && styles.tabBtnTextActive]}>
                  📋 Queue ({queueItems.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabBtn, ccTab === 'kyc' && styles.tabBtnActiveOrange]}
                onPress={() => setCcTab('kyc')}
              >
                <Text style={[styles.tabBtnText, ccTab === 'kyc' && styles.tabBtnTextActive]}>
                  🆔 KYC Verify
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabBtn, ccTab === 'records' && styles.tabBtnActiveOrange]}
                onPress={() => setCcTab('records')}
              >
                <Text style={[styles.tabBtnText, ccTab === 'records' && styles.tabBtnTextActive]}>
                  🔍 Records
                </Text>
              </TouchableOpacity>
            </View>

            {/* TAB 1: QUEUE & DISPATCH */}
            {ccTab === 'queue' && (
              <View style={styles.panelCard}>
                <View style={styles.panelHeaderRow}>
                  <Text style={styles.panelTitle}>🎧 Hearing Queue & Dispatch</Text>
                  <TouchableOpacity onPress={fetchCallCenterQueue}>
                    <Text style={styles.refreshSmall}>Refresh ↻</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.panelSub}>
                  Citizens waiting for live Jan Sunwai. Dispatch them to the active Magistrate hearing bench:
                </Text>

                {isLoadingQueue ? (
                  <ActivityIndicator color="#f59e0b" style={{ marginVertical: 20 }} />
                ) : queueItems.length > 0 ? (
                  queueItems.map((item) => (
                    <View key={item.queueId} style={styles.queueCard}>
                      <View style={styles.queueHeaderRow}>
                        <View style={[styles.priorityBadge, { backgroundColor: item.priority === 'Urgent' ? '#ef4444' : item.priority === 'High' ? '#f59e0b' : '#3b82f6' }]}>
                          <Text style={styles.priorityBadgeText}>{item.priority} Priority</Text>
                        </View>
                        <Text style={styles.queueTimeText}>Wait: {item.wait_time_minutes || 5} min</Text>
                      </View>
                      <Text style={styles.queueCitizenName}>👤 {item.citizen_name || 'Citizen'}</Text>
                      <Text style={styles.queuePhone}>📞 {item.citizen_phone}</Text>
                      <Text style={styles.queueTitle} numberOfLines={2}>📝 {item.title || item.grievance_id}</Text>
                      <TouchableOpacity
                        style={styles.dispatchBtn}
                        onPress={() => handleDispatchQueue(item.queueId)}
                      >
                        <Text style={styles.dispatchBtnText}>Dispatch to Magistrate Bench ➔</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                ) : (
                  <View style={styles.emptyCardSmall}>
                    <Text style={styles.emptyDesc}>No citizens waiting in hearing queue.</Text>
                  </View>
                )}
              </View>
            )}

            {/* TAB 2: JAN AADHAAR KYC VERIFY */}
            {ccTab === 'kyc' && (
              <View style={styles.panelCard}>
                <Text style={styles.panelTitle}>🆔 Citizen Identity & KYC Verification</Text>
                <Text style={styles.panelSub}>
                  Verify citizen's Jan Aadhaar Card & biometrics before admission to hearing bench:
                </Text>

                <Text style={styles.inputFieldLabel}>Citizen Mobile Number</Text>
                <TextInput
                  style={styles.formInput}
                  value={kycPhone}
                  onChangeText={setKycPhone}
                  placeholder="+91..."
                  placeholderTextColor="#64748b"
                />

                <Text style={styles.inputFieldLabel}>Jan Aadhaar Family ID (जन आधार कार्ड सं.)</Text>
                <TextInput
                  style={styles.formInput}
                  value={kycJanAadhaar}
                  onChangeText={setKycJanAadhaar}
                  placeholder="JA-88492011"
                  placeholderTextColor="#64748b"
                />

                <Text style={styles.inputFieldLabel}>Aadhaar Number (Last 4 Digits)</Text>
                <TextInput
                  style={styles.formInput}
                  value={kycAadhaarLast4}
                  onChangeText={setKycAadhaarLast4}
                  placeholder="7328"
                  placeholderTextColor="#64748b"
                  maxLength={4}
                  keyboardType="number-pad"
                />

                <Text style={styles.inputFieldLabel}>Verification Notes</Text>
                <TextInput
                  style={styles.formInput}
                  value={kycNotes}
                  onChangeText={setKycNotes}
                  placeholder="Notes..."
                  placeholderTextColor="#64748b"
                />

                <TouchableOpacity
                  style={[styles.primaryActionBtn, isVerifyingKyc && styles.btnDisabled]}
                  onPress={handleVerifyCitizenKyc}
                  disabled={isVerifyingKyc}
                >
                  {isVerifyingKyc ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text style={styles.primaryActionBtnText}>Verify Citizen Identity ✓</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* TAB 3: CONSULT CITIZEN RECORDS */}
            {ccTab === 'records' && (
              <View style={styles.panelCard}>
                <Text style={styles.panelTitle}>🔍 Consult Citizen Records</Text>
                <Text style={styles.panelSub}>
                  Lookup complete citizen profile, past grievances, and verification history:
                </Text>

                <View style={styles.inspectInputRow}>
                  <TextInput
                    style={styles.inspectInput}
                    value={consultPhone}
                    onChangeText={setConsultPhone}
                    placeholder="Enter citizen mobile..."
                    placeholderTextColor="#64748b"
                    keyboardType="phone-pad"
                  />
                  <TouchableOpacity
                    style={[styles.inspectBtn, isConsulting && styles.btnDisabled]}
                    onPress={handleConsultCitizen}
                    disabled={isConsulting}
                  >
                    {isConsulting ? (
                      <ActivityIndicator color="#ffffff" size="small" />
                    ) : (
                      <Text style={styles.inspectBtnText}>Search ➔</Text>
                    )}
                  </TouchableOpacity>
                </View>

                {consultRecord && consultRecord.citizen && (
                  <View style={styles.consultCard}>
                    <View style={styles.queueHeaderRow}>
                      <Text style={styles.consultName}>👤 {consultRecord.citizen.name}</Text>
                      <View style={[styles.priorityBadge, { backgroundColor: consultRecord.kycVerification?.status === 'verified' ? '#10b981' : '#f59e0b' }]}>
                        <Text style={styles.priorityBadgeText}>
                          {consultRecord.kycVerification?.status === 'verified' ? '✓ Verified' : 'Pending'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.consultMeta}>
                      📞 {consultRecord.citizen.phone} • {consultRecord.citizen.village}, {consultRecord.citizen.district}
                    </Text>
                    {consultRecord.kycVerification?.jan_aadhaar_id && (
                      <Text style={styles.consultMeta}>
                        Jan Aadhaar: {consultRecord.kycVerification.jan_aadhaar_id}
                      </Text>
                    )}

                    <Text style={styles.consultSectionTitle}>
                      Grievance History ({consultRecord.grievances?.length || 0}):
                    </Text>
                    {consultRecord.grievances?.map((g: any) => (
                      <View key={g.id} style={styles.consultGrievanceItem}>
                        <Text style={styles.consultGrievanceTitle}>#{g.grievance_id}: {g.title}</Text>
                        <Text style={styles.consultGrievanceStatus}>Status: {g.status}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        ) : isAdmin ? (
          /* ─── ROLE VIEW 2: SUPER ADMIN CONTROL CENTER ─── */
          <View style={styles.roleContainer}>
            {/* Tabs */}
            <View style={styles.tabBar}>
              <TouchableOpacity
                style={[styles.tabBtn, adminTab === 'diagnostics' && styles.tabBtnActiveRed]}
                onPress={() => setAdminTab('diagnostics')}
              >
                <Text style={[styles.tabBtnText, adminTab === 'diagnostics' && styles.tabBtnTextActive]}>
                  📊 Live Benches ({activeMeetings.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabBtn, adminTab === 'audit' && styles.tabBtnActiveRed]}
                onPress={() => setAdminTab('audit')}
              >
                <Text style={[styles.tabBtnText, adminTab === 'audit' && styles.tabBtnTextActive]}>
                  📜 Audit Logs
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabBtn, adminTab === 'security' && styles.tabBtnActiveRed]}
                onPress={() => setAdminTab('security')}
              >
                <Text style={[styles.tabBtnText, adminTab === 'security' && styles.tabBtnTextActive]}>
                  🔐 Security
                </Text>
              </TouchableOpacity>
            </View>

            {/* TAB 1: DIAGNOSTICS */}
            {adminTab === 'diagnostics' && (
              <View style={styles.panelCard}>
                <View style={styles.panelHeaderRow}>
                  <Text style={styles.panelTitle}>🛡️ System Telemetry & SFU Health</Text>
                  <TouchableOpacity onPress={fetchAdminData}>
                    <Text style={styles.refreshSmall}>Refresh ↻</Text>
                  </TouchableOpacity>
                </View>

                {/* 🔴 ACTIVE MEETINGS HERO CARD (CLICKABLE) */}
                <TouchableOpacity
                  style={styles.activeMeetingsCard}
                  activeOpacity={0.85}
                  onPress={() => setShowActiveMeetingsModal(true)}
                >
                  <View style={styles.activeMeetingsHeader}>
                    <View style={styles.livePulseRow}>
                      <View style={[styles.pulsingDot, activeMeetings.length > 0 && styles.pulsingDotActive]} />
                      <Text style={[styles.activeMeetingsBadgeText, activeMeetings.length > 0 && styles.activeMeetingsBadgeTextLive]}>
                        {activeMeetings.length > 0 ? '🔴 LIVE MEETINGS ACTIVE' : '⚪ NO ACTIVE MEETINGS'}
                      </Text>
                    </View>
                    <View style={styles.viewDetailsBtn}>
                      <Text style={styles.viewDetailsBtnText}>
                        {activeMeetings.length > 0 ? 'View & Join ➔' : 'Inspect ➔'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.activeMeetingsBody}>
                    <View style={styles.activeMeetingsCountContainer}>
                      <Text style={styles.activeMeetingsCount}>{activeMeetings.length}</Text>
                      <View>
                        <Text style={styles.activeMeetingsCountLabel}>
                          {activeMeetings.length === 1 ? 'Active Video Meeting' : 'Active Video Meetings'}
                        </Text>
                        <Text style={styles.activeMeetingsSubtext}>
                          {activeMeetings.length > 0
                            ? 'Ongoing Jan Sunwai hearing sessions'
                            : 'Listening for new hearing sessions'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.activeMeetingsHint}>
                      {activeMeetings.length > 0
                        ? '👉 Click to inspect live benches and enter any room with Supreme Super Admin powers.'
                        : 'Tap this card to open live session monitor. When any officer or collector starts a call, it will appear here in real-time.'}
                    </Text>
                  </View>

                  <View style={styles.activeMeetingsFooter}>
                    <Text style={styles.powerBadgeText}>⚡ SUPER ADMIN POWERS: MUTE ALL • EJECT • TERMINATE • MONITOR</Text>
                  </View>
                </TouchableOpacity>

                {/* 4 Metric Pills */}
                <View style={styles.metricsGrid}>
                  <View style={[styles.metricCard, { borderColor: '#10b981' }]}>
                    <Text style={styles.metricLabel}>SFU CONCURRENCY</Text>
                    <Text style={[styles.metricValue, { color: '#10b981' }]}>1,500</Text>
                    <Text style={styles.metricSub}>Max Participants / Room</Text>
                  </View>

                  <View style={[styles.metricCard, { borderColor: '#3b82f6' }]}>
                    <Text style={styles.metricLabel}>SERVER MEMORY</Text>
                    <Text style={[styles.metricValue, { color: '#38bdf8' }]}>
                      {adminDiagnostics?.process?.memoryRssMB || 211} MB
                    </Text>
                    <Text style={styles.metricSub}>Node.js RSS Memory</Text>
                  </View>

                  <View style={[styles.metricCard, { borderColor: '#8b5cf6' }]}>
                    <Text style={styles.metricLabel}>TOTAL DATABASE</Text>
                    <Text style={[styles.metricValue, { color: '#a78bfa' }]}>
                      {((adminDiagnostics?.dbCounts?.citizens || 0) +
                        (adminDiagnostics?.dbCounts?.grievances || 0) +
                        (adminDiagnostics?.dbCounts?.callRecords || 0) +
                        (adminDiagnostics?.dbCounts?.auditLogs || 0)) || 18}
                    </Text>
                    <Text style={styles.metricSub}>Active SQLite Records</Text>
                  </View>

                  <View style={[styles.metricCard, { borderColor: '#f59e0b' }]}>
                    <Text style={styles.metricLabel}>SFU STATUS</Text>
                    <Text style={[styles.metricValue, { color: '#fbbf24', fontSize: 16 }]}>Active</Text>
                    <Text style={styles.metricSub}>LiveKit WebRTC Cloud</Text>
                  </View>
                </View>
              </View>
            )}

            {/* TAB 2: AUDIT LOGS */}
            {adminTab === 'audit' && (
              <View style={styles.panelCard}>
                <Text style={styles.panelTitle}>📜 System Audit Trail (अंकेक्षण विवरण)</Text>
                <Text style={styles.panelSub}>
                  Immutable records of administrative, moderation, and verification actions:
                </Text>

                {isLoadingAdmin ? (
                  <ActivityIndicator color="#ef4444" style={{ marginVertical: 20 }} />
                ) : adminAuditLogs.length > 0 ? (
                  adminAuditLogs.map((log) => (
                    <View key={log.id} style={styles.auditItem}>
                      <View style={styles.queueHeaderRow}>
                        <View style={styles.auditActionBadge}>
                          <Text style={styles.auditActionText}>{log.action}</Text>
                        </View>
                        <Text style={styles.auditTimeText}>
                          {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                      <Text style={styles.auditActorText}>Actor: {log.actor_name} ({log.actor_role})</Text>
                      {log.details && <Text style={styles.auditDetailsText}>{log.details}</Text>}
                    </View>
                  ))
                ) : (
                  <View style={styles.emptyCardSmall}>
                    <Text style={styles.emptyDesc}>No audit logs logged yet.</Text>
                  </View>
                )}
              </View>
            )}

            {/* TAB 3: SECURITY SETTINGS */}
            {adminTab === 'security' && (
              <View style={styles.panelCard}>
                <Text style={styles.panelTitle}>🔐 Security Governance (सुरक्षा मानक)</Text>
                <Text style={styles.panelSub}>
                  Configure statewide cryptographic settings and room capacity limits:
                </Text>

                <View style={styles.securityRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.securityTitle}>256-Bit E2EE Encryption</Text>
                    <Text style={styles.securitySub}>Client-side key derivation for data/media</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.toggleBtn}
                    onPress={() => handleUpdateAdminSetting('e2ee_encryption_enabled', adminSettings.e2ee_encryption_enabled === 'true' ? 'false' : 'true')}
                  >
                    <Text style={styles.toggleBtnText}>
                      {adminSettings.e2ee_encryption_enabled === 'true' ? 'Active ✓' : 'Disabled'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.securityRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.securityTitle}>SAS Safety Numbers Verification</Text>
                    <Text style={styles.securitySub}>Short authentication strings vs MITM attacks</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.toggleBtn}
                    onPress={() => handleUpdateAdminSetting('sas_safety_numbers_required', adminSettings.sas_safety_numbers_required === 'true' ? 'false' : 'true')}
                  >
                    <Text style={styles.toggleBtnText}>
                      {adminSettings.sas_safety_numbers_required === 'true' ? 'Enforced ✓' : 'Optional'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.securityRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.securityTitle}>Room Capacity (1,000+ Concurrency)</Text>
                    <Text style={styles.securitySub}>Max attendees per Jan Sunwai bench</Text>
                  </View>
                  <View style={styles.capacityBadge}>
                    <Text style={styles.capacityText}>{adminSettings.max_meeting_participants || '1500'} Max</Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        ) : isOfficer ? (
          /* ─── ROLE VIEW 3: OFFICER / DISTRICT MAGISTRATE VIEW ─── */
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
          /* ─── ROLE VIEW 4: CITIZEN / EMPLOYEE NOTICE CARD ─── */
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

        {/* Grievances List (Citizen, Field Official & Officer) */}
        {!isCallCenter && !isAdmin && (
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
                    >
                      {isJoining ? (
                        <ActivityIndicator color="#ffffff" size="small" />
                      ) : (
                        <Text style={styles.startHearingBtnText}>
                          📞 Start Live Hearing Call ➔
                        </Text>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.awaitingCallBadge}>
                      <Text style={styles.awaitingCallIcon}>🔔</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.awaitingCallTitle}>Waiting for Hearing Call</Text>
                        <Text style={styles.awaitingCallDesc}>
                          The District Collector will call you into hearing when this case is called.
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}

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

      {/* ─── MODAL: SUPER ADMIN ACTIVE MEETINGS LIST ─── */}
      <Modal
        visible={showActiveMeetingsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowActiveMeetingsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>🔴 Active Hearings & Benches</Text>
                <Text style={styles.modalSubtitle}>
                  {activeMeetings.length} live {activeMeetings.length === 1 ? 'session' : 'sessions'} currently running on LiveKit SFU
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setShowActiveMeetingsModal(false)}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 460, marginVertical: 12 }} showsVerticalScrollIndicator={true}>
              {activeMeetings.length === 0 ? (
                <View style={styles.emptyMeetingsBox}>
                  <Text style={styles.emptyMeetingsIcon}>🏛️</Text>
                  <Text style={styles.emptyMeetingsTitle}>No Active Meetings Right Now</Text>
                  <Text style={styles.emptyMeetingsSub}>
                    When a District Collector or Presiding Officer starts a Jan Sunwai video hearing, it will appear here in real-time.
                  </Text>
                  <TouchableOpacity
                    style={styles.refreshMeetingsBtn}
                    onPress={fetchAdminData}
                  >
                    <Text style={styles.refreshMeetingsBtnText}>Check Again ↻</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                activeMeetings.map((meeting) => (
                  <View key={meeting.id || meeting.roomName} style={styles.meetingCardItem}>
                    <View style={styles.meetingCardHeader}>
                      <View style={styles.meetingRoomBadge}>
                        <Text style={styles.meetingRoomBadgeText}>{meeting.roomName}</Text>
                      </View>
                      <View style={styles.meetingLiveStatusBadge}>
                        <Text style={styles.meetingLiveStatusText}>● {meeting.status || 'Live Hearing'}</Text>
                      </View>
                    </View>

                    <Text style={styles.meetingTitleText}>{meeting.title}</Text>

                    <View style={styles.meetingDetailRow}>
                      <Text style={styles.meetingDetailLabel}>Presiding Officer:</Text>
                      <Text style={styles.meetingDetailVal}>{meeting.hostName} ({meeting.hostDesignation})</Text>
                    </View>

                    <View style={styles.meetingDetailRow}>
                      <Text style={styles.meetingDetailLabel}>Active Connected:</Text>
                      <Text style={styles.meetingDetailVal}>
                        {meeting.participantCount || (meeting.participants ? meeting.participants.length : 1)} Attendees
                      </Text>
                    </View>

                    {meeting.participants && meeting.participants.length > 0 && (
                      <View style={styles.participantsChipsRow}>
                        {meeting.participants.map((p: any, idx: number) => (
                          <View key={idx} style={styles.participantChip}>
                            <Text style={styles.participantChipText}>
                              👤 {p.name} ({p.role || p.status || 'Member'})
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                    <TouchableOpacity
                      style={[
                        styles.joinAsAdminBtn,
                        isJoiningMeeting === (meeting.roomName || meeting.id) && styles.btnDisabled,
                      ]}
                      onPress={() => handleSuperAdminJoinMeeting(meeting)}
                      disabled={isJoiningMeeting === (meeting.roomName || meeting.id)}
                      activeOpacity={0.85}
                    >
                      {isJoiningMeeting === (meeting.roomName || meeting.id) ? (
                        <ActivityIndicator color="#ffffff" size="small" />
                      ) : (
                        <View style={{ alignItems: 'center' }}>
                          <Text style={styles.joinAsAdminBtnText}>⚡ Join Meeting as Super Admin</Text>
                          <Text style={styles.joinAsAdminBtnSub}>Full Host Authority • Mute All • Eject • Terminate</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
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
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 6,
  },
  topHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  topEmblem: {
    fontSize: 30,
  },
  topTitleHindi: {
    fontSize: 20,
    fontWeight: '800',
    color: '#f8fafc',
    letterSpacing: 0.3,
  },
  topTitleEnglish: {
    fontSize: 12,
    color: '#38bdf8',
    fontWeight: '600',
  },
  logoutBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  logoutBtnText: {
    color: '#f87171',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  profileCard: {
    backgroundColor: '#0f172a',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
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
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderWidth: 2,
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
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  startHearingBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
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

  // Role Container & Tabs
  roleContainer: {
    marginBottom: 20,
  },
  tabBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  tabBtn: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  tabBtnActiveOrange: {
    backgroundColor: '#f59e0b',
    borderColor: '#d97706',
  },
  tabBtnActiveRed: {
    backgroundColor: '#dc2626',
    borderColor: '#b91c1c',
  },
  tabBtnText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },
  tabBtnTextActive: {
    color: '#ffffff',
  },
  panelCard: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  panelHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#f8fafc',
  },
  panelSub: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 14,
    lineHeight: 16,
  },
  refreshSmall: {
    fontSize: 12,
    color: '#38bdf8',
    fontWeight: '700',
  },
  queueCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  queueHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  priorityBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  queueTimeText: {
    color: '#94a3b8',
    fontSize: 11,
  },
  queueCitizenName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8fafc',
  },
  queuePhone: {
    fontSize: 12,
    color: '#38bdf8',
    marginTop: 2,
  },
  queueTitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
    marginBottom: 10,
  },
  dispatchBtn: {
    backgroundColor: '#f59e0b',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  dispatchBtnText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '800',
  },
  emptyCardSmall: {
    padding: 20,
    alignItems: 'center',
  },
  inputFieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
    marginTop: 10,
    marginBottom: 4,
  },
  formInput: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#ffffff',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#334155',
  },
  primaryActionBtn: {
    backgroundColor: '#059669',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  primaryActionBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  consultCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  consultName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#f8fafc',
  },
  consultMeta: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  consultSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#38bdf8',
    marginTop: 12,
    marginBottom: 6,
  },
  consultGrievanceItem: {
    backgroundColor: '#0f172a',
    padding: 8,
    borderRadius: 8,
    marginBottom: 6,
  },
  consultGrievanceTitle: {
    fontSize: 12,
    color: '#e2e8f0',
    fontWeight: '600',
  },
  consultGrievanceStatus: {
    fontSize: 11,
    color: '#10b981',
    marginTop: 2,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  metricCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 4,
  },
  metricSub: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },
  auditItem: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  auditActionBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  auditActionText: {
    color: '#ef4444',
    fontSize: 10,
    fontWeight: '700',
  },
  auditTimeText: {
    color: '#64748b',
    fontSize: 10,
  },
  auditActorText: {
    color: '#e2e8f0',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  auditDetailsText: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  securityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  securityTitle: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
  },
  securitySub: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  toggleBtn: {
    backgroundColor: '#0284c7',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  toggleBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  capacityBadge: {
    backgroundColor: '#10b981',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  capacityText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: '800',
  },

  // ─── Super Admin Active Meetings Styles ───
  activeMeetingsCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: '#ef4444',
    marginBottom: 16,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  activeMeetingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  livePulseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pulsingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#64748b',
  },
  pulsingDotActive: {
    backgroundColor: '#ef4444',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
  activeMeetingsBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.5,
  },
  activeMeetingsBadgeTextLive: {
    color: '#f87171',
  },
  viewDetailsBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  viewDetailsBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#f87171',
  },
  activeMeetingsBody: {
    marginBottom: 12,
  },
  activeMeetingsCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  activeMeetingsCount: {
    fontSize: 42,
    fontWeight: '900',
    color: '#ffffff',
  },
  activeMeetingsCountLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#f8fafc',
  },
  activeMeetingsSubtext: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  activeMeetingsHint: {
    fontSize: 12,
    color: '#cbd5e1',
    lineHeight: 18,
  },
  activeMeetingsFooter: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  powerBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fbbf24',
    letterSpacing: 0.5,
  },

  // ─── Super Admin Active Meetings Modal Styles ───
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#f8fafc',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  meetingCardItem: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#334155',
  },
  meetingCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  meetingRoomBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: '#0284c7',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  meetingRoomBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#38bdf8',
    letterSpacing: 0.5,
  },
  meetingLiveStatusBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  meetingLiveStatusText: {
    color: '#f87171',
    fontSize: 11,
    fontWeight: '800',
  },
  meetingTitleText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#f8fafc',
    marginBottom: 8,
  },
  meetingDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  meetingDetailLabel: {
    fontSize: 12,
    color: '#94a3b8',
  },
  meetingDetailVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#e2e8f0',
  },
  participantsChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 10,
  },
  participantChip: {
    backgroundColor: '#0f172a',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  participantChipText: {
    fontSize: 11,
    color: '#94a3b8',
  },
  joinAsAdminBtn: {
    backgroundColor: '#dc2626',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  joinAsAdminBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  joinAsAdminBtnSub: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  emptyMeetingsBox: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyMeetingsIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyMeetingsTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#f8fafc',
    marginBottom: 6,
  },
  emptyMeetingsSub: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  refreshMeetingsBtn: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  refreshMeetingsBtnText: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '700',
  },
});
