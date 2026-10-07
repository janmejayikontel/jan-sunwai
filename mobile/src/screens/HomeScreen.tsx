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
  Platform,
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
  scheduledDate?: string;
  scheduledTime?: string;
  scheduledOfficer?: string;
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

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const TIME_OPTIONS = [
  '09:00 AM', '09:30 AM', '10:00 AM', '10:15 AM', '10:30 AM', '10:45 AM',
  '11:00 AM', '11:15 AM', '11:30 AM', '11:45 AM', '12:00 PM', '12:30 PM',
  '01:00 PM', '01:30 PM', '02:00 PM', '02:15 PM', '02:30 PM', '02:45 PM',
  '03:00 PM', '03:15 PM', '03:30 PM', '03:45 PM', '04:00 PM', '04:15 PM',
  '04:30 PM', '04:45 PM', '05:00 PM', '05:30 PM', '06:00 PM',
];

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

  // Navigation & 3-Dot Menu State
  const [currentTab, setCurrentTab] = useState<'hearings' | 'cases'>('hearings');
  const [showMenu, setShowMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [directRoomInput, setDirectRoomInput] = useState('RAJ-2024-88421');

  // Home Page Grievance Search & Action State
  const [homeSearchedGrievance, setHomeSearchedGrievance] = useState<GrievanceItem | null>(null);
  const [homeIsSearching, setHomeIsSearching] = useState(false);
  const [homeSearchError, setHomeSearchError] = useState<string | null>(null);

  // Cases Tab Search & Details Modal State
  const [inspectGrievanceId, setInspectGrievanceId] = useState('');
  const [selectedGrievanceDetails, setSelectedGrievanceDetails] = useState<GrievanceItem | null>(null);

  // Hearing Scheduling Modal State (2-Step: Date Calendar -> Time Picker)
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleStep, setScheduleStep] = useState<'date' | 'time'>('date');
  const [schedulingGrievance, setSchedulingGrievance] = useState<GrievanceItem | null>(null);
  const [scheduleDate, setScheduleDate] = useState('2026-09-29');
  const [scheduleTime, setScheduleTime] = useState('11:30 AM');
  const [scheduleNotes, setScheduleNotes] = useState('');
  const [isSubmittingSchedule, setIsSubmittingSchedule] = useState(false);
  const [calendarYear, setCalendarYear] = useState(2026);
  const [calendarMonth, setCalendarMonth] = useState(8); // September = 8
  const [customTimeInput, setCustomTimeInput] = useState('');

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

  const cleanServerUrl = (url: string) => {
    let clean = (url || '').trim().replace(/\/+$/, '');
    if (clean.includes(':9090')) {
      clean = clean.replace(':9090', ':3001');
    }
    if (clean.includes('172.21.77.111') && !clean.includes(':3001') && !clean.includes(':3000')) {
      clean = clean.replace('172.21.77.111', '172.21.77.111:3001');
    }
    return clean;
  };

  const filteredGrievances = inspectGrievanceId.trim()
    ? grievances.filter(
        (g) =>
          g.grievanceId.toLowerCase().includes(inspectGrievanceId.trim().toLowerCase()) ||
          g.title.toLowerCase().includes(inspectGrievanceId.trim().toLowerCase()) ||
          (g.category && g.category.toLowerCase().includes(inspectGrievanceId.trim().toLowerCase())) ||
          (g.district && g.district.toLowerCase().includes(inspectGrievanceId.trim().toLowerCase())) ||
          (g.citizen?.name && g.citizen.name.toLowerCase().includes(inspectGrievanceId.trim().toLowerCase())) ||
          (g.citizen?.phone && g.citizen.phone.includes(inspectGrievanceId.trim()))
      )
    : grievances;

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

  // ─── Home Page Grievance Search Handler ───────────────────────
  const handleHomeSearchGrievance = async (targetId?: string) => {
    const raw = (targetId || directRoomInput).trim().toUpperCase();
    const cleanId = raw.replace(/^JS-/, '');
    if (!cleanId) {
      Alert.alert('Required', 'Please enter a Grievance ID (e.g. RAJ-2024-88421)');
      return;
    }
    setHomeIsSearching(true);
    setHomeSearchError(null);
    try {
      // 1. Check loaded grievances list first
      const localMatch = grievances.find(
        (g) => g.grievanceId.toUpperCase() === cleanId || g.grievanceId.toUpperCase().includes(cleanId)
      );
      if (localMatch) {
        setHomeSearchedGrievance(localMatch);
        setHomeSearchError(null);
        setHomeIsSearching(false);
        return;
      }

      // 2. Fetch from backend API
      const base = cleanServerUrl(serverUrl);
      const res = await fetchWithRetry(`${base}/api/sampark/grievance/${encodeURIComponent(cleanId)}`, {
        headers: {
          'Bypass-Tunnel-Reminder': 'true',
        },
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.grievance) {
        setHomeSearchedGrievance(data.grievance);
        setHomeSearchError(null);
      } else {
        setHomeSearchedGrievance(null);
        setHomeSearchError(data?.error || `Grievance #${cleanId} not found in database.`);
      }
    } catch (err: any) {
      console.warn('Home grievance search error:', err);
      setHomeSearchError('Unable to reach server. Please check internet connection.');
    } finally {
      setHomeIsSearching(false);
    }
  };

  // ─── Hearing Scheduling Handler ────────────────────────────────
  const handleConfirmSchedule = async () => {
    if (!schedulingGrievance) return;
    const finalTime = customTimeInput.trim() ? customTimeInput.trim() : scheduleTime;
    setIsSubmittingSchedule(true);
    try {
      const base = cleanServerUrl(serverUrl);
      const res = await fetchWithRetry(`${base}/api/calls/schedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true',
        },
        body: JSON.stringify({
          grievanceId: schedulingGrievance.grievanceId,
          scheduledDate: scheduleDate,
          scheduledTime: finalTime,
          officerName: user.name || 'Vivek, IAS',
          officerPhone: user.phone,
          notes: scheduleNotes || 'Official Jan Sunwai hearing with District Magistrate',
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to schedule hearing');
      }

      const assignedOfficerName = user.name || 'Vivek, IAS';

      // Update in-memory state so the scheduled banner appears immediately!
      const updatedItem: GrievanceItem = {
        ...schedulingGrievance,
        scheduledDate: scheduleDate,
        scheduledTime: finalTime,
        scheduledOfficer: assignedOfficerName,
      };

      setGrievances((prev) =>
        prev.map((g) =>
          g.grievanceId === schedulingGrievance.grievanceId
            ? { ...g, scheduledDate: scheduleDate, scheduledTime: finalTime, scheduledOfficer: assignedOfficerName }
            : g
        )
      );

      if (homeSearchedGrievance?.grievanceId === schedulingGrievance.grievanceId) {
        setHomeSearchedGrievance(updatedItem);
      }
      if (selectedGrievanceDetails?.grievanceId === schedulingGrievance.grievanceId) {
        setSelectedGrievanceDetails(updatedItem);
      }

      setShowScheduleModal(false);
      setScheduleStep('date');
      setCustomTimeInput('');

      Alert.alert(
        '✅ Hearing Scheduled Successfully!',
        `Case: #${schedulingGrievance.grievanceId}\nDate: ${scheduleDate}\nTime: ${finalTime}\n\nAutomated notifications dispatched to:\n• Citizen: ${data.citizen?.name || 'Citizen'} (${data.citizen?.phone || 'N/A'})\n• Field Officer: ${data.employee?.name || 'Officer'} (${data.employee?.phone || 'N/A'})\n\nWhenever citizen or officer opens this grievance, this scheduled date and time will be prominently shown.`,
        [{ text: 'OK' }]
      );
    } catch (err: any) {
      Alert.alert('Scheduling Error', err.message || 'Unable to schedule hearing. Check network connection.');
    } finally {
      setIsSubmittingSchedule(false);
    }
  };

  // Fetch all grievances so all cases are displayed in the Cases tab
  const fetchGrievances = async () => {
    setIsLoading(true);
    try {
      const base = cleanServerUrl(serverUrl);
      const url = `${base}/api/sampark/grievances`;
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

      // Fallback by phone if /grievances fails
      if (user.phone) {
        const phoneUrl = `${base}/api/sampark/by-phone/${encodeURIComponent(user.phone)}`;
        const pRes = await fetchWithRetry(phoneUrl, {
          headers: { 'Bypass-Tunnel-Reminder': 'true' },
        });
        const pData = await pRes.json().catch(() => null);
        if (pRes.ok && pData?.grievances && Array.isArray(pData.grievances)) {
          setGrievances(pData.grievances);
          return;
        }
      }
      setGrievances([]);
    } catch (e) {
      console.log('Error fetching grievances:', e);
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
    }, 12000);
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
    fetchGrievances();
    if (isCallCenter) {
      fetchCallCenterQueue();
    } else if (isAdmin) {
      fetchAdminData();
    } else if (isOfficer) {
      handleHomeSearchGrievance('RAJ-2024-88421');
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
      if (isOfficer && directRoomInput) {
        await handleHomeSearchGrievance(directRoomInput);
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
    // Tell native service caller is in a call immediately so caller device never rings
    try {
      const JanSunwaiVoIP = require('react-native').NativeModules?.JanSunwaiVoIP;
      JanSunwaiVoIP?.setInCall?.(true);
      JanSunwaiVoIP?.stopRinging?.();
    } catch {}

    try {
      const base = cleanServerUrl(serverUrl);

      const targetGrievance =
        preloadedGrievance ||
        (selectedGrievanceDetails?.grievanceId.toUpperCase() === targetCaseId ? selectedGrievanceDetails : null) ||
        (homeSearchedGrievance?.grievanceId.toUpperCase() === targetCaseId ? homeSearchedGrievance : null) ||
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
        return '#EAB308';
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
      <StatusBar barStyle="light-content" backgroundColor="#1f2c34" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#EAB308" />
        }
      >
        {/* WhatsApp-Style Clean Top App Bar */}
        <View style={styles.topHeader}>
          <View style={styles.topHeaderLeft}>
            <View style={styles.topEmblemCircle}>
              <Text style={styles.topEmblem}>🏛️</Text>
            </View>
            <View>
              <Text style={styles.topTitle}>Jan Sunwai</Text>
              <Text style={styles.topSubtitle}>Rajasthan Portal</Text>
            </View>
          </View>
          <View style={styles.topHeaderRight}>
            <TouchableOpacity
              style={styles.menuDotsBtn}
              onPress={() => setShowMenu(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.menuDotsText}>⋮</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ─── TAB 1: HEARINGS ─── */}
        {currentTab === 'hearings' && (
          <View>
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
                    <Text style={[styles.metricValue, { color: '#10b981' }]}>
                      {Number(adminSettings?.max_meeting_participants || adminDiagnostics?.livekit?.maxParticipants || 1500).toLocaleString()}
                    </Text>
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
                  adminAuditLogs.map((log) => {
                    const formatSafeTime = (val: any) => {
                      if (!val) return 'N/A';
                      try {
                        let d = new Date(val);
                        if (isNaN(d.getTime()) && typeof val === 'string') {
                          d = new Date(val.replace(' ', 'T'));
                        }
                        if (isNaN(d.getTime())) return String(val);
                        return d.toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        });
                      } catch {
                        return String(val || '');
                      }
                    };

                    const actionName = log.action || log.event_type || 'SYSTEM_EVENT';
                    const grievanceId = log.grievance_id || log.target_id;
                    const officerName = log.officer_name || (log.actor_role === 'officer' ? log.actor_name : log.actor_name);
                    const durFormatted = log.duration_formatted || (log.duration_seconds ? `${Math.floor(log.duration_seconds / 60)}m ${log.duration_seconds % 60}s` : null);

                    return (
                      <View key={log.id} style={styles.auditItem}>
                        <View style={styles.queueHeaderRow}>
                          <View style={styles.auditActionBadge}>
                            <Text style={styles.auditActionText}>{actionName}</Text>
                          </View>
                          <Text style={styles.auditTimeText}>
                            {formatSafeTime(log.created_at || log.timestamp)}
                          </Text>
                        </View>

                        {(grievanceId || officerName || durFormatted) && (
                          <View style={{ marginVertical: 4, padding: 6, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 6 }}>
                            {grievanceId ? (
                              <Text style={{ color: '#38bdf8', fontSize: 12, fontWeight: '700' }}>
                                📋 Grievance ID: {grievanceId}
                              </Text>
                            ) : null}
                            {officerName ? (
                              <Text style={{ color: '#FACC15', fontSize: 12, fontWeight: '700', marginTop: 2 }}>
                                👤 Officer: {officerName}
                              </Text>
                            ) : null}
                            {durFormatted ? (
                              <Text style={{ color: '#4ade80', fontSize: 12, fontWeight: '700', marginTop: 2 }}>
                                ⏱️ Duration: {durFormatted}
                              </Text>
                            ) : null}
                          </View>
                        )}

                        <Text style={styles.auditActorText}>Actor: {log.actor_name || 'System'} ({log.actor_role || 'system'})</Text>
                        {log.details && <Text style={styles.auditDetailsText}>{log.details}</Text>}
                      </View>
                    );
                  })
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
              /* Officer Hearing Bench Card */
              <View style={styles.hearingBenchCard}>
                <View style={styles.hearingBenchHeader}>
                  <Text style={styles.hearingBenchTitle}>🏛️ Hearing Bench Room</Text>
                  <View style={styles.hearingBenchLiveBadge}>
                    <Text style={styles.hearingBenchLiveText}>● SFU ONLINE</Text>
                  </View>
                </View>
                <Text style={styles.hearingBenchDesc}>
                  Enter a Grievance ID below to search details, initiate an immediate video call hearing, or schedule a future hearing.
                </Text>

                <View style={styles.directRoomRow}>
                  <TextInput
                    style={styles.directRoomInput}
                    value={directRoomInput}
                    onChangeText={setDirectRoomInput}
                    placeholder="Grievance ID (e.g. RAJ-2024-88421)"
                    placeholderTextColor="#8696a0"
                    autoCapitalize="characters"
                  />
                  <TouchableOpacity
                    style={[styles.directRoomBtn, homeIsSearching && styles.btnDisabled]}
                    onPress={() => handleHomeSearchGrievance(directRoomInput)}
                    disabled={homeIsSearching}
                    activeOpacity={0.8}
                  >
                    {homeIsSearching ? (
                      <ActivityIndicator color="#111b21" size="small" />
                    ) : (
                      <Text style={styles.directRoomBtnText}>Search 🔍</Text>
                    )}
                  </TouchableOpacity>
                </View>

                {homeSearchError && (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorBoxText}>⚠️ {homeSearchError}</Text>
                  </View>
                )}

                {/* Searched Grievance Details & Action Buttons */}
                {homeSearchedGrievance && (
                  <View style={styles.homeFoundCard}>
                    <View style={styles.caseHeader}>
                      <View style={styles.caseIdBadge}>
                        <Text style={styles.caseIdText}>{homeSearchedGrievance.grievanceId}</Text>
                      </View>
                      <View style={styles.statusBadge}>
                        <Text style={styles.statusText}>{homeSearchedGrievance.status}</Text>
                      </View>
                    </View>

                    {/* Prominent Executive Scheduled Hearing Card if call has been scheduled */}
                    {homeSearchedGrievance.scheduledDate && homeSearchedGrievance.scheduledTime && (
                      <View style={styles.execScheduleCardMini}>
                        <View style={styles.execHeaderRow}>
                          <View style={styles.execGovBadge}>
                            <Text style={styles.execGovIcon}>🏛️</Text>
                            <View>
                              <Text style={styles.execGovTitle}>OFFICIAL HEARING SCHEDULED</Text>
                              <Text style={styles.execGovSub}>Rajasthan Sampark • Jan Sunwai</Text>
                            </View>
                          </View>
                          <View style={styles.execStatusPill}>
                            <Text style={styles.execStatusDot}>●</Text>
                            <Text style={styles.execStatusPillText}>SCHEDULED</Text>
                          </View>
                        </View>

                        <View style={styles.execGridRow}>
                          <View style={styles.execGridBox}>
                            <Text style={styles.execGridLabel}>HEARING DATE (दिनांक)</Text>
                            <Text style={styles.execGridValue}>🗓️ {homeSearchedGrievance.scheduledDate}</Text>
                          </View>
                          <View style={styles.execGridBox}>
                            <Text style={styles.execGridLabel}>HEARING TIME (समय)</Text>
                            <Text style={styles.execGridValue}>⏰ {homeSearchedGrievance.scheduledTime}</Text>
                          </View>
                        </View>

                        <View style={styles.execOfficerBox}>
                          <Text style={styles.execOfficerLabel}>PRESIDING BENCH (अध्यक्षीय पीठ)</Text>
                          <Text style={styles.execOfficerValue}>
                            🏛️ {homeSearchedGrievance.scheduledOfficer || 'Vivek, IAS • District Magistrate'}
                          </Text>
                        </View>
                      </View>
                    )}

                    <Text style={styles.caseTitle}>{homeSearchedGrievance.title}</Text>

                    {homeSearchedGrievance.category && (
                      <Text style={styles.caseCategory}>
                        📁 {homeSearchedGrievance.category} {homeSearchedGrievance.location ? `• 📍 ${homeSearchedGrievance.location}` : ''}
                      </Text>
                    )}

                    <View style={styles.partiesGrid}>
                      {homeSearchedGrievance.citizen && (
                        <View style={styles.partyBox}>
                          <Text style={styles.partyBoxHeader}>Citizen</Text>
                          <Text style={styles.partyName}>{homeSearchedGrievance.citizen.name}</Text>
                          <Text style={styles.partyPhone}>📞 {homeSearchedGrievance.citizen.phone}</Text>
                        </View>
                      )}
                      {homeSearchedGrievance.assignedEmployee && (
                        <View style={[styles.partyBox, styles.partyBoxOfficer]}>
                          <Text style={styles.partyBoxHeader}>Field Officer</Text>
                          <Text style={styles.partyName}>{homeSearchedGrievance.assignedEmployee.name}</Text>
                          <Text style={styles.partyDesig}>{homeSearchedGrievance.assignedEmployee.designation}</Text>
                        </View>
                      )}
                    </View>

                    {/* Start Video Call & Schedule Call Buttons */}
                    <View style={styles.homeActionsRow}>
                      <TouchableOpacity
                        style={[styles.homeStartCallBtn, isJoining && styles.btnDisabled]}
                        onPress={() => handleConnectHearing(homeSearchedGrievance.grievanceId, homeSearchedGrievance)}
                        disabled={isJoining}
                        activeOpacity={0.85}
                      >
                        {isJoining ? (
                          <ActivityIndicator color="#111b21" size="small" />
                        ) : (
                          <Text style={styles.homeStartCallBtnText}>📞 Start Video Call</Text>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.homeScheduleBtn}
                        onPress={() => {
                          setSchedulingGrievance(homeSearchedGrievance);
                          setScheduleStep('date');
                          setShowScheduleModal(true);
                        }}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.homeScheduleBtnText}>📅 Schedule Call</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            ) : (
              /* Citizen Home View */
              <View>
                {/* 1. General Active Bench Notice Card */}
                <View style={styles.citizenNoticeCard}>
                  <View style={styles.noticeHeaderRow}>
                    <Text style={styles.noticeEmblem}>🔔</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.noticeTitle}>Hearing Bench Active</Text>
                      <Text style={styles.noticeDesc}>
                        You will receive an incoming video call directly when your case is called by the District Magistrate.
                      </Text>
                    </View>
                  </View>
                </View>

                {/* 2. Standalone Official Scheduled Hearing Card (Generous Spacing, Executive Design) */}
                {grievances.filter(g => g.scheduledDate && g.scheduledTime).map(sg => (
                  <View key={sg.grievanceId} style={styles.execScheduleCard}>
                    {/* Official Top Emblem & Status Badge */}
                    <View style={styles.execHeaderRow}>
                      <View style={styles.execGovBadge}>
                        <Text style={styles.execGovIcon}>🏛️</Text>
                        <View>
                          <Text style={styles.execGovTitle}>GOVERNMENT OF RAJASTHAN</Text>
                          <Text style={styles.execGovSub}>Rajasthan Sampark • Jan Sunwai</Text>
                        </View>
                      </View>
                      <View style={styles.execStatusPill}>
                        <Text style={styles.execStatusDot}>●</Text>
                        <Text style={styles.execStatusPillText}>SCHEDULED</Text>
                      </View>
                    </View>

                    {/* Notice Title Banner */}
                    <View style={styles.execBannerHeader}>
                      <Text style={styles.execNoticeTitle}>📅 Official Video Hearing Scheduled</Text>
                      <Text style={styles.execNoticeSub}>जनसुनवाई सुनवाई नियत आदेश</Text>
                    </View>

                    {/* Case ID & Subject */}
                    <View style={styles.execCaseBox}>
                      <View style={styles.execCaseIdTag}>
                        <Text style={styles.execCaseIdTagText}>#{sg.grievanceId}</Text>
                      </View>
                      <Text style={styles.execCaseSubject} numberOfLines={2}>
                        {sg.title}
                      </Text>
                    </View>

                    {/* 2-Column Schedule Grid */}
                    <View style={styles.execGridRow}>
                      <View style={styles.execGridBox}>
                        <Text style={styles.execGridLabel}>HEARING DATE (दिनांक)</Text>
                        <Text style={styles.execGridValue}>🗓️ {sg.scheduledDate}</Text>
                      </View>
                      <View style={styles.execGridBox}>
                        <Text style={styles.execGridLabel}>HEARING TIME (समय)</Text>
                        <Text style={styles.execGridValue}>⏰ {sg.scheduledTime}</Text>
                      </View>
                    </View>

                    {/* Presiding Magistrate / Officer */}
                    <View style={styles.execOfficerBox}>
                      <Text style={styles.execOfficerLabel}>PRESIDING BENCH (अध्यक्षीय पीठ)</Text>
                      <Text style={styles.execOfficerValue}>
                        🏛️ {sg.scheduledOfficer || 'Vivek, IAS • District Magistrate'}
                      </Text>
                    </View>

                    {/* Alert notice strip */}
                    <View style={styles.execNoticeStrip}>
                      <Text style={styles.execNoticeStripText}>
                        🔔 An automated high-priority video call will connect on this device at the scheduled time. Please keep the app open.
                      </Text>
                    </View>

                    {/* Action Button */}
                    <TouchableOpacity
                      style={styles.execActionBtn}
                      onPress={() => setSelectedGrievanceDetails(sg)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.execActionBtnText}>📋 View Complete Case Details ➔</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                {/* 3. Button to View Registered Grievances */}
                <TouchableOpacity
                  style={[styles.casesBannerBtn, { marginTop: 14 }]}
                  onPress={() => setCurrentTab('cases')}
                  activeOpacity={0.75}
                >
                  <Text style={styles.casesBannerText}>
                    📋 View Your Registered Grievances ({grievances.length})
                  </Text>
                  <Text style={styles.casesBannerArrow}>→</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* ─── TAB 2: CASES ─── */}
        {currentTab === 'cases' && (
          <View>
            {/* Search Input Bar (No quick chips, no preview card below!) */}
            <View style={styles.casesSearchContainer}>
              <View style={styles.inspectInputRow}>
                <TextInput
                  style={styles.inspectInput}
                  value={inspectGrievanceId}
                  onChangeText={setInspectGrievanceId}
                  placeholder="Search Grievance ID (e.g. RAJ-2024-88421)"
                  placeholderTextColor="#8696a0"
                  autoCapitalize="characters"
                />
                {inspectGrievanceId.length > 0 ? (
                  <TouchableOpacity
                    style={styles.searchClearBtn}
                    onPress={() => setInspectGrievanceId('')}
                  >
                    <Text style={styles.searchClearText}>✕</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.inspectBtn}>
                    <Text style={styles.inspectBtnText}>Search</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Cases Compact List */}
            <View style={styles.listSection}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeading}>
                  Cases ({filteredGrievances.length})
                </Text>
                <TouchableOpacity onPress={fetchGrievances} activeOpacity={0.7}>
                  <Text style={styles.refreshLink}>Refresh ↻</Text>
                </TouchableOpacity>
              </View>

              {isLoading && grievances.length === 0 ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator color="#EAB308" size="small" />
                  <Text style={styles.loadingText}>Loading cases...</Text>
                </View>
              ) : filteredGrievances.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyIcon}>📂</Text>
                  <Text style={styles.emptyTitle}>
                    {inspectGrievanceId ? 'No Matching Grievance' : 'No Active Cases'}
                  </Text>
                  <Text style={styles.emptyDesc}>
                    {inspectGrievanceId
                      ? `No grievance matches "${inspectGrievanceId}".`
                      : 'No cases found in database.'}
                  </Text>
                  {inspectGrievanceId ? (
                    <TouchableOpacity
                      style={[styles.chipBtn, { alignSelf: 'center', marginTop: 12, backgroundColor: '#EAB308', borderColor: '#EAB308' }]}
                      onPress={() => setInspectGrievanceId('')}
                    >
                      <Text style={{ color: '#111827', fontWeight: '800' }}>Show All Cases</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : (
                filteredGrievances.map((item) => (
                  <View key={item.grievanceId} style={styles.compactCaseRow}>
                    <View style={styles.compactCaseInfo}>
                      <View style={styles.compactCaseHeaderRow}>
                        <View style={styles.caseIdBadge}>
                          <Text style={styles.caseIdText}>{item.grievanceId}</Text>
                        </View>
                        <Text style={styles.compactCaseStatus} numberOfLines={1}>
                          {item.status}
                        </Text>
                      </View>
                      {item.scheduledDate && item.scheduledTime ? (
                        <View style={styles.compactScheduledBadge}>
                          <Text style={styles.compactScheduledText} numberOfLines={1}>
                            📅 Scheduled: {item.scheduledDate} • {item.scheduledTime}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <TouchableOpacity
                      style={styles.compactViewDetailsBtn}
                      onPress={() => setSelectedGrievanceDetails(item)}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.compactViewDetailsBtnText}>View Details ➔</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          </View>
        )}

        {/* Minimal WhatsApp Footer */}
        <View style={styles.infoCard}>
          <Text style={styles.infoDesc}>
            Jan Sunwai • Helpline: 181 • 🔒 End-to-end encrypted
          </Text>
        </View>
      </ScrollView>

      {/* ─── WhatsApp-Style Bottom Tab Bar ─── */}
      <View style={styles.bottomTabBar}>
        <TouchableOpacity
          style={styles.bottomTabItem}
          onPress={() => setCurrentTab('hearings')}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.bottomTabPill,
              currentTab === 'hearings' && styles.bottomTabPillActive,
            ]}
          >
            <Text style={styles.bottomTabIcon}>🏛️</Text>
          </View>
          <Text
            style={[
              styles.bottomTabLabel,
              currentTab === 'hearings' && styles.bottomTabLabelActive,
            ]}
          >
            Hearings
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.bottomTabItem}
          onPress={() => {
            setCurrentTab('cases');
            if (grievances.length === 0) {
              fetchGrievances();
            }
          }}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.bottomTabPill,
              currentTab === 'cases' && styles.bottomTabPillActive,
            ]}
          >
            <Text style={styles.bottomTabIcon}>📋</Text>
            {grievances.length > 0 && (
              <View style={styles.bottomTabBadge}>
                <Text style={styles.bottomTabBadgeText}>{grievances.length}</Text>
              </View>
            )}
          </View>
          <Text
            style={[
              styles.bottomTabLabel,
              currentTab === 'cases' && styles.bottomTabLabelActive,
            ]}
          >
            Cases
          </Text>
        </TouchableOpacity>
      </View>

      {/* ─── Top Right 3-Dot Popup Menu ─── */}
      <Modal
        visible={showMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setShowMenu(false)}
        >
          <View style={styles.menuDropdownCard}>
            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => {
                setShowMenu(false);
                setShowProfileModal(true);
              }}
            >
              <Text style={styles.menuItemIcon}>👤</Text>
              <Text style={styles.menuItemText}>Profile (प्रोफाइल)</Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => {
                setShowMenu(false);
                onRefresh();
              }}
            >
              <Text style={styles.menuItemIcon}>↻</Text>
              <Text style={styles.menuItemText}>Refresh (रिफ्रेश)</Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => {
                setShowMenu(false);
                onLogout();
              }}
            >
              <Text style={[styles.menuItemIcon, { color: '#ea0038' }]}>🚪</Text>
              <Text style={[styles.menuItemText, { color: '#ea0038' }]}>Logout (लॉगआउट)</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ─── Profile Details Modal (Responsive & Polished) ─── */}
      <Modal
        visible={showProfileModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowProfileModal(false)}
      >
        <View style={styles.profileModalOverlay}>
          <View style={styles.profileModalCard}>
            <View style={styles.profileModalHeader}>
              <Text style={styles.profileModalHeaderTitle}>User Profile</Text>
              <TouchableOpacity
                style={styles.profileModalCloseBtn}
                onPress={() => setShowProfileModal(false)}
              >
                <Text style={styles.profileModalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center' }}>
              <View style={styles.profileModalAvatarCircle}>
                <Text style={styles.profileModalAvatarText}>
                  {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                </Text>
              </View>

              <Text style={styles.profileModalName}>{user.name || 'User'}</Text>
              <View style={styles.profileModalRoleBadge}>
                <Text style={styles.profileModalRoleText}>
                  {getRoleLabel(user.role).toUpperCase()}
                </Text>
              </View>

              <View style={styles.profileModalDetailsBox}>
                <View style={styles.profileDetailItem}>
                  <Text style={styles.profileDetailLabel}>Designation</Text>
                  <Text style={styles.profileDetailValue}>
                    {user.designation || getRoleLabel(user.role)}
                  </Text>
                </View>

                {user.department && (
                  <View style={styles.profileDetailItem}>
                    <Text style={styles.profileDetailLabel}>Department</Text>
                    <Text style={styles.profileDetailValue}>{user.department}</Text>
                  </View>
                )}

                <View style={styles.profileDetailItem}>
                  <Text style={styles.profileDetailLabel}>Mobile Number</Text>
                  <Text style={styles.profileDetailValue}>
                    +91 {user.phone.replace(/\D/g, '').slice(-10)}
                  </Text>
                </View>

                <View style={styles.profileDetailItem}>
                  <Text style={styles.profileDetailLabel}>Portal Role</Text>
                  <Text style={styles.profileDetailValue}>{user.role}</Text>
                </View>

                {user.district && (
                  <View style={styles.profileDetailItem}>
                    <Text style={styles.profileDetailLabel}>District</Text>
                    <Text style={styles.profileDetailValue}>{user.district}</Text>
                  </View>
                )}
              </View>
            </ScrollView>

            <TouchableOpacity
              style={styles.profileCloseBtn}
              onPress={() => setShowProfileModal(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.profileCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ─── MODAL: GRIEVANCE FULL DETAILS ─── */}
      <Modal
        visible={!!selectedGrievanceDetails}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSelectedGrievanceDetails(null)}
      >
        <View style={styles.detailsModalOverlay}>
          <View style={styles.detailsModalCard}>
            <View style={styles.detailsModalHeader}>
              <View style={{ flex: 1 }}>
                <View style={styles.previewHeaderRow}>
                  <View style={styles.caseIdBadge}>
                    <Text style={styles.caseIdText}>#{selectedGrievanceDetails?.grievanceId}</Text>
                  </View>
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusText}>{selectedGrievanceDetails?.status}</Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity
                style={styles.profileModalCloseBtn}
                onPress={() => setSelectedGrievanceDetails(null)}
              >
                <Text style={styles.profileModalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {/* Prominent Executive Hearing Scheduled Card */}
              {selectedGrievanceDetails?.scheduledDate && selectedGrievanceDetails?.scheduledTime ? (
                <View style={[styles.execScheduleCardMini, { marginBottom: 14 }]}>
                  <View style={styles.execHeaderRow}>
                    <View style={styles.execGovBadge}>
                      <Text style={styles.execGovIcon}>🏛️</Text>
                      <View>
                        <Text style={styles.execGovTitle}>OFFICIAL HEARING SCHEDULED</Text>
                        <Text style={styles.execGovSub}>Rajasthan Sampark • Jan Sunwai</Text>
                      </View>
                    </View>
                    <View style={styles.execStatusPill}>
                      <Text style={styles.execStatusDot}>●</Text>
                      <Text style={styles.execStatusPillText}>SCHEDULED</Text>
                    </View>
                  </View>

                  <View style={styles.execGridRow}>
                    <View style={styles.execGridBox}>
                      <Text style={styles.execGridLabel}>HEARING DATE (दिनांक)</Text>
                      <Text style={styles.execGridValue}>🗓️ {selectedGrievanceDetails.scheduledDate}</Text>
                    </View>
                    <View style={styles.execGridBox}>
                      <Text style={styles.execGridLabel}>HEARING TIME (समय)</Text>
                      <Text style={styles.execGridValue}>⏰ {selectedGrievanceDetails.scheduledTime}</Text>
                    </View>
                  </View>

                  <View style={styles.execOfficerBox}>
                    <Text style={styles.execOfficerLabel}>PRESIDING BENCH (अध्यक्षीय पीठ)</Text>
                    <Text style={styles.execOfficerValue}>
                      🏛️ {selectedGrievanceDetails.scheduledOfficer || 'Vivek, IAS • District Magistrate'}
                    </Text>
                  </View>

                  <View style={styles.execNoticeStrip}>
                    <Text style={styles.execNoticeStripText}>
                      🔔 Citizen & Field Officer will receive an automated video call notification at this scheduled time.
                    </Text>
                  </View>
                </View>
              ) : null}

              <Text style={styles.detailsModalTitle}>{selectedGrievanceDetails?.title}</Text>

              {selectedGrievanceDetails?.category && (
                <Text style={styles.detailsModalCategory}>
                  📁 {selectedGrievanceDetails.category}{' '}
                  {selectedGrievanceDetails.location ? `• 📍 ${selectedGrievanceDetails.location}` : ''}
                </Text>
              )}

              {selectedGrievanceDetails?.description && (
                <View style={styles.descriptionBox}>
                  <Text style={styles.descriptionLabel}>Grievance Summary / Problem Statement</Text>
                  <Text style={styles.descriptionText}>{selectedGrievanceDetails.description}</Text>
                </View>
              )}

              {/* Parties Grid */}
              <View style={styles.partiesGrid}>
                {selectedGrievanceDetails?.citizen && (
                  <View style={styles.partyBox}>
                    <Text style={styles.partyBoxHeader}>Citizen Complainant</Text>
                    <Text style={styles.partyName}>{selectedGrievanceDetails.citizen.name}</Text>
                    <Text style={styles.partyPhone}>📞 {selectedGrievanceDetails.citizen.phone}</Text>
                    {selectedGrievanceDetails.citizen.village && (
                      <Text style={styles.partyMeta}>
                        📍 {selectedGrievanceDetails.citizen.village}, {selectedGrievanceDetails.citizen.district}
                      </Text>
                    )}
                  </View>
                )}

                {selectedGrievanceDetails?.assignedEmployee && (
                  <View style={[styles.partyBox, styles.partyBoxOfficer]}>
                    <Text style={styles.partyBoxHeader}>Assigned Field Official</Text>
                    <Text style={styles.partyName}>{selectedGrievanceDetails.assignedEmployee.name}</Text>
                    <Text style={styles.partyDesig}>{selectedGrievanceDetails.assignedEmployee.designation}</Text>
                    <Text style={styles.partyPhone}>📞 {selectedGrievanceDetails.assignedEmployee.phone}</Text>
                    {selectedGrievanceDetails.assignedEmployee.department && (
                      <Text style={styles.partyMeta} numberOfLines={2}>
                        🏢 {selectedGrievanceDetails.assignedEmployee.department}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            </ScrollView>

            {/* Officer Action Buttons or Citizen Notice */}
            {isOfficer ? (
              <View style={styles.detailsActionsRow}>
                <TouchableOpacity
                  style={[styles.homeStartCallBtn, isJoining && styles.btnDisabled]}
                  onPress={() => {
                    const g = selectedGrievanceDetails;
                    setSelectedGrievanceDetails(null);
                    if (g) handleConnectHearing(g.grievanceId, g);
                  }}
                  disabled={isJoining}
                  activeOpacity={0.85}
                >
                  {isJoining ? (
                    <ActivityIndicator color="#111b21" size="small" />
                  ) : (
                    <Text style={styles.homeStartCallBtnText}>📞 Start Video Call</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.homeScheduleBtn}
                  onPress={() => {
                    const g = selectedGrievanceDetails;
                    setSelectedGrievanceDetails(null);
                    if (g) {
                      setSchedulingGrievance(g);
                      setScheduleStep('date');
                      setShowScheduleModal(true);
                    }
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.homeScheduleBtnText}>📅 Schedule Call</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.awaitingCallBadge}>
                <Text style={styles.awaitingCallTitle}>⏳ Hearing Call Pending</Text>
                <Text style={styles.awaitingCallDesc}>
                  You will receive an automated video call directly when your case is called by the District Magistrate.
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ─── MODAL: SCHEDULE HEARING CALL (2-Step Flow) ─── */}
      <Modal
        visible={showScheduleModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowScheduleModal(false)}
      >
        <View style={styles.scheduleModalOverlay}>
          <View style={styles.scheduleModalCard}>
            {/* Header */}
            <View style={styles.scheduleModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.scheduleModalTitle}>
                  {scheduleStep === 'date' ? '📅 Step 1/2: Choose Hearing Date' : '⏰ Step 2/2: Choose Hearing Time'}
                </Text>
                <Text style={styles.scheduleModalSubtitle}>
                  Case #{schedulingGrievance?.grievanceId}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.scheduleModalCloseBtn}
                onPress={() => setShowScheduleModal(false)}
              >
                <Text style={styles.scheduleModalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.scheduleCaseTitle} numberOfLines={1}>
              {schedulingGrievance?.title}
            </Text>

            {/* ─── STEP 1: INTERACTIVE CALENDAR (Select date to proceed) ─── */}
            {scheduleStep === 'date' && (
              <View>
                <Text style={styles.scheduleStepPrompt}>
                  Tap any date on the calendar. Time options will appear automatically:
                </Text>

                <View style={styles.calendarCard}>
                  {/* Month & Year Navigation Header */}
                  <View style={styles.calendarNavHeader}>
                    <TouchableOpacity
                      style={styles.calendarNavBtn}
                      onPress={() => {
                        if (calendarMonth === 0) {
                          setCalendarMonth(11);
                          setCalendarYear((y) => y - 1);
                        } else {
                          setCalendarMonth((m) => m - 1);
                        }
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.calendarNavArrow}>◀</Text>
                    </TouchableOpacity>

                    <Text style={styles.calendarMonthTitle}>
                      {MONTH_NAMES[calendarMonth]} {calendarYear}
                    </Text>

                    <TouchableOpacity
                      style={styles.calendarNavBtn}
                      onPress={() => {
                        if (calendarMonth === 11) {
                          setCalendarMonth(0);
                          setCalendarYear((y) => y + 1);
                        } else {
                          setCalendarMonth((m) => m + 1);
                        }
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.calendarNavArrow}>▶</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Weekday Names Header */}
                  <View style={styles.calendarWeekRow}>
                    {DAYS_OF_WEEK.map((d, idx) => (
                      <Text key={idx} style={[styles.calendarWeekDay, (idx === 0 || idx === 6) && styles.calendarWeekendDay]}>
                        {d}
                      </Text>
                    ))}
                  </View>

                  {/* Day Grid: Clicking any day automatically advances to Time */}
                  <View style={styles.calendarGrid}>
                    {Array.from({ length: new Date(calendarYear, calendarMonth, 1).getDay() }).map((_, i) => (
                      <View key={`empty-${i}`} style={styles.calendarDayCellEmpty} />
                    ))}
                    {Array.from({ length: new Date(calendarYear, calendarMonth + 1, 0).getDate() }).map((_, i) => {
                      const dayNum = i + 1;
                      const mm = String(calendarMonth + 1).padStart(2, '0');
                      const dd = String(dayNum).padStart(2, '0');
                      const cellDate = `${calendarYear}-${mm}-${dd}`;
                      const isSelected = scheduleDate === cellDate;
                      return (
                        <TouchableOpacity
                          key={`day-${dayNum}`}
                          style={[styles.calendarDayCell, isSelected && styles.calendarDayCellSelected]}
                          onPress={() => {
                            setScheduleDate(cellDate);
                            setScheduleStep('time'); // Automatic transition to time!
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.calendarDayCellText, isSelected && styles.calendarDayCellTextSelected]}>
                            {dayNum}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Quick Presets: Clicking either automatically advances to Time */}
                  <View style={styles.calendarFooter}>
                    <Text style={styles.quickPresetHeading}>Quick Select:</Text>
                    <View style={styles.quickPresetsRow}>
                      <TouchableOpacity
                        style={styles.quickPresetBtn}
                        onPress={() => {
                          const now = new Date();
                          const mm = String(now.getMonth() + 1).padStart(2, '0');
                          const dd = String(now.getDate()).padStart(2, '0');
                          const cellDate = `${now.getFullYear()}-${mm}-${dd}`;
                          setScheduleDate(cellDate);
                          setCalendarMonth(now.getMonth());
                          setCalendarYear(now.getFullYear());
                          setScheduleStep('time'); // Automatic transition
                        }}
                      >
                        <Text style={styles.quickPresetText}>⚡ Today</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.quickPresetBtn}
                        onPress={() => {
                          const tm = new Date();
                          tm.setDate(tm.getDate() + 1);
                          const mm = String(tm.getMonth() + 1).padStart(2, '0');
                          const dd = String(tm.getDate()).padStart(2, '0');
                          const cellDate = `${tm.getFullYear()}-${mm}-${dd}`;
                          setScheduleDate(cellDate);
                          setCalendarMonth(tm.getMonth());
                          setCalendarYear(tm.getFullYear());
                          setScheduleStep('time'); // Automatic transition
                        }}
                      >
                        <Text style={styles.quickPresetText}>⚡ Tomorrow</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.scheduleCancelBtn}
                  onPress={() => setShowScheduleModal(false)}
                >
                  <Text style={styles.scheduleCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ─── STEP 2: TIME SELECTION (NO SCROLLING - Full flexibility with slots & custom input) ─── */}
            {scheduleStep === 'time' && (
              <View>
                {/* Selected Date Indicator with Change Date action */}
                <View style={styles.chosenDateBanner}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.chosenDateLabel}>Selected Date</Text>
                    <Text style={styles.chosenDateValue}>🗓️ {scheduleDate}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.changeDateBtn}
                    onPress={() => setScheduleStep('date')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.changeDateBtnText}>◀ Change Date</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.scheduleStepPrompt}>
                  Choose hearing slot or type any custom time below:
                </Text>

                {/* Non-scrollable flexible slots grid (16 popular hearing slots) */}
                <View style={styles.flexibleTimeGrid}>
                  {[
                    '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM',
                    '11:30 AM', '12:00 PM', '12:30 PM', '01:00 PM',
                    '02:30 PM', '03:00 PM', '03:30 PM', '04:00 PM',
                    '04:30 PM', '05:00 PM', '05:30 PM', '06:00 PM',
                  ].map((t) => {
                    const isSelected = !customTimeInput.trim() && scheduleTime === t;
                    return (
                      <TouchableOpacity
                        key={t}
                        style={[styles.flexibleTimeChip, isSelected && styles.flexibleTimeChipSelected]}
                        onPress={() => {
                          setScheduleTime(t);
                          setCustomTimeInput('');
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.flexibleTimeChipText, isSelected && styles.flexibleTimeChipTextSelected]}>
                          {t}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Custom Time Field for complete flexibility */}
                <View style={styles.flexibleCustomRow}>
                  <Text style={styles.flexibleCustomLabel}>✏️ Or Enter Custom Time:</Text>
                  <TextInput
                    style={styles.flexibleCustomInput}
                    value={customTimeInput}
                    onChangeText={setCustomTimeInput}
                    placeholder="e.g. 10:45 AM or 03:15 PM"
                    placeholderTextColor="#8696a0"
                  />
                </View>

                {/* Notification Alert Info Box */}
                <View style={styles.notificationNoticeBoxCompact}>
                  <Text style={styles.notificationNoticeTitleCompact}>🔔 Automated Notification Alerts</Text>
                  <Text style={styles.notificationNoticeDescCompact} numberOfLines={2}>
                    Citizen ({schedulingGrievance?.citizen?.name || 'Citizen'}) & Officer ({schedulingGrievance?.assignedEmployee?.name || 'Officer'}) will receive immediate notification with this date and time.
                  </Text>
                </View>

                {/* Action Buttons */}
                <View style={styles.scheduleActionsRow}>
                  <TouchableOpacity
                    style={[styles.scheduleCancelBtn, { flex: 1 }]}
                    onPress={() => setScheduleStep('date')}
                  >
                    <Text style={styles.scheduleCancelText}>◀ Back</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.scheduleCancelBtn, { flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderColor: 'rgba(255, 255, 255, 0.15)' }]}
                    onPress={() => setShowScheduleModal(false)}
                  >
                    <Text style={[styles.scheduleCancelText, { color: '#8696a0' }]}>✕ Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.scheduleConfirmBtn, { flex: 2 }, isSubmittingSchedule && styles.btnDisabled]}
                    onPress={handleConfirmSchedule}
                    disabled={isSubmittingSchedule}
                    activeOpacity={0.85}
                  >
                    {isSubmittingSchedule ? (
                      <ActivityIndicator color="#111827" size="small" />
                    ) : (
                      <Text style={styles.scheduleConfirmText}>
                        Confirm ({customTimeInput.trim() || scheduleTime}) ➔
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

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
    backgroundColor: '#111b21',
  },
  scroll: {
    padding: 14,
    paddingBottom: 85,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: -14,
    marginTop: -14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1f2c34',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(134, 150, 160, 0.15)',
    marginBottom: 14,
  },
  topHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topEmblemCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#202c33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topEmblem: {
    fontSize: 18,
  },
  topTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#e9edef',
  },
  topSubtitle: {
    fontSize: 11,
    color: '#8696a0',
  },
  topHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuDotsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  menuDotsText: {
    fontSize: 22,
    color: '#e9edef',
    fontWeight: '900',
    marginTop: -2,
  },
  // 3-Dot Dropdown Menu Modal
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  menuDropdownCard: {
    position: 'absolute',
    top: 52,
    right: 14,
    backgroundColor: '#202c33',
    borderRadius: 14,
    paddingVertical: 4,
    width: 190,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 12,
    borderWidth: 1,
    borderColor: 'rgba(134, 150, 160, 0.2)',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  menuItemIcon: {
    fontSize: 16,
    color: '#8696a0',
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e9edef',
  },
  menuDivider: {
    height: 1,
    backgroundColor: 'rgba(134, 150, 160, 0.12)',
    marginHorizontal: 12,
  },
  // Profile Details Modal
  profileModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  profileModalCard: {
    backgroundColor: '#1f2c34',
    borderRadius: 20,
    padding: 22,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(134, 150, 160, 0.2)',
  },
  profileModalHeader: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  profileModalHeaderTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#e9edef',
  },
  profileModalCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileModalCloseText: {
    fontSize: 13,
    color: '#8696a0',
    fontWeight: '700',
  },
  profileModalAvatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EAB308',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  profileModalAvatarText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
  },
  profileModalName: {
    fontSize: 19,
    fontWeight: '700',
    color: '#e9edef',
    marginBottom: 6,
    textAlign: 'center',
  },
  profileModalRoleBadge: {
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.4)',
    marginBottom: 16,
  },
  profileModalRoleText: {
    color: '#EAB308',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  profileModalDetailsBox: {
    width: '100%',
    backgroundColor: '#111b21',
    borderRadius: 14,
    padding: 14,
    gap: 12,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(134, 150, 160, 0.1)',
  },
  profileDetailItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  profileDetailLabel: {
    fontSize: 12,
    color: '#8696a0',
    width: 105,
    flexShrink: 0,
    fontWeight: '500',
  },
  profileDetailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#e9edef',
    flex: 1,
    textAlign: 'right',
    flexWrap: 'wrap',
  },
  profileCloseBtn: {
    width: '100%',
    backgroundColor: '#202c33',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.3)',
  },
  profileCloseBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FACC15',
  },

  // ─── Home Page Search & Actions Styles ───
  homeFoundCard: {
    backgroundColor: '#111b21',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#2a3942',
  },
  homeActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  homeStartCallBtn: {
    flex: 1.2,
    backgroundColor: '#EAB308',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeStartCallBtnText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
  },
  homeScheduleBtn: {
    flex: 1,
    backgroundColor: '#202c33',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#EAB308',
  },
  homeScheduleBtnText: {
    color: '#EAB308',
    fontSize: 13,
    fontWeight: '700',
  },

  // ─── Cases Tab Compact Row Styles ───
  casesSearchContainer: {
    backgroundColor: '#202c33',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(134, 150, 160, 0.15)',
  },
  searchClearBtn: {
    backgroundColor: '#111b21',
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2a3942',
  },
  searchClearText: {
    color: '#8696a0',
    fontSize: 14,
    fontWeight: '700',
  },
  compactCaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#202c33',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(134, 150, 160, 0.15)',
  },
  compactCaseInfo: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 6,
    marginRight: 10,
  },
  compactCaseHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  compactCaseStatus: {
    fontSize: 11,
    color: '#8696a0',
  },
  compactViewDetailsBtn: {
    backgroundColor: 'rgba(234, 179, 8, 0.18)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#EAB308',
    flexShrink: 0,
    alignSelf: 'center',
  },
  compactViewDetailsBtnText: {
    color: '#FACC15',
    fontSize: 12,
    fontWeight: '700',
  },

  // ─── Details Modal Styles ───
  detailsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  detailsModalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#1f2c34',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(134, 150, 160, 0.2)',
  },
  detailsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailsModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#e9edef',
    marginBottom: 6,
  },
  detailsModalCategory: {
    fontSize: 12,
    color: '#8696a0',
    marginBottom: 10,
  },
  detailsActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },

  // ─── Hearing Schedule Modal Styles ───
  scheduleModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  scheduleModalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#1f2c34',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(134, 150, 160, 0.2)',
  },
  scheduleModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  scheduleModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#e9edef',
  },
  scheduleModalSubtitle: {
    fontSize: 12,
    color: '#EAB308',
    fontWeight: '700',
    marginTop: 2,
  },
  scheduleModalCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleModalCloseText: {
    color: '#8696a0',
    fontSize: 13,
    fontWeight: '700',
  },
  scheduleSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8696a0',
    marginTop: 10,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scheduleCaseTitle: {
    fontSize: 13,
    color: '#e9edef',
    fontWeight: '600',
    marginBottom: 8,
  },

  // Interactive Calendar Styles
  calendarCard: {
    backgroundColor: '#111b21',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2a3942',
    marginBottom: 12,
  },
  calendarNavHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  calendarNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#202c33',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(134, 150, 160, 0.2)',
  },
  calendarNavArrow: {
    fontSize: 14,
    color: '#EAB308',
    fontWeight: '700',
  },
  calendarMonthTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#e9edef',
    letterSpacing: 0.3,
  },
  calendarWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    paddingBottom: 6,
  },
  calendarWeekDay: {
    width: 34,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: '#8696a0',
  },
  calendarWeekendDay: {
    color: '#f87171',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  calendarDayCellEmpty: {
    width: 34,
    height: 34,
  },
  calendarDayCell: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDayCellSelected: {
    backgroundColor: '#EAB308',
    shadowColor: '#EAB308',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },
  calendarDayCellText: {
    fontSize: 12,
    color: '#e9edef',
    fontWeight: '600',
  },
  calendarDayCellTextSelected: {
    color: '#111827',
    fontWeight: '900',
  },
  calendarFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  selectedDatePill: {
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.3)',
  },
  selectedDatePillText: {
    color: '#EAB308',
    fontSize: 11,
    fontWeight: '700',
  },
  quickPresetsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  quickPresetBtn: {
    backgroundColor: '#202c33',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(134, 150, 160, 0.2)',
  },
  quickPresetText: {
    color: '#8696a0',
    fontSize: 10,
    fontWeight: '700',
  },

  scheduleStepPrompt: {
    fontSize: 12,
    color: '#8696a0',
    marginBottom: 8,
    lineHeight: 16,
  },
  quickPresetHeading: {
    fontSize: 11,
    color: '#8696a0',
    fontWeight: '600',
  },

  // ─── Step 2: Time Selection Styles (No Scrolling, Full Flexibility) ───
  chosenDateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111b21',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#EAB308',
  },
  chosenDateLabel: {
    fontSize: 11,
    color: '#8696a0',
    fontWeight: '600',
  },
  chosenDateValue: {
    fontSize: 14,
    color: '#EAB308',
    fontWeight: '800',
    marginTop: 2,
  },
  changeDateBtn: {
    backgroundColor: '#202c33',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.4)',
  },
  changeDateBtnText: {
    color: '#EAB308',
    fontSize: 11,
    fontWeight: '700',
  },
  flexibleTimeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
    justifyContent: 'space-between',
  },
  flexibleTimeChip: {
    width: '23%',
    backgroundColor: '#111b21',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a3942',
  },
  flexibleTimeChipSelected: {
    backgroundColor: '#EAB308',
    borderColor: '#EAB308',
    shadowColor: '#EAB308',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 2,
  },
  flexibleTimeChipText: {
    color: '#8696a0',
    fontSize: 10.5,
    fontWeight: '700',
  },
  flexibleTimeChipTextSelected: {
    color: '#111827',
    fontWeight: '900',
  },
  flexibleCustomRow: {
    backgroundColor: '#111b21',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(134, 150, 160, 0.25)',
  },
  flexibleCustomLabel: {
    color: '#EAB308',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  flexibleCustomInput: {
    backgroundColor: '#202c33',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: '#e9edef',
    fontSize: 12,
    borderWidth: 1,
    borderColor: '#2a3942',
  },
  notificationNoticeBoxCompact: {
    backgroundColor: 'rgba(234, 179, 8, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.25)',
  },
  notificationNoticeTitleCompact: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EAB308',
    marginBottom: 2,
  },
  notificationNoticeDescCompact: {
    fontSize: 10,
    color: '#8696a0',
    lineHeight: 14,
  },

  // ─── Executive Professional Scheduled Hearing Card Styles ───
  execScheduleCard: {
    backgroundColor: '#16222a',
    borderRadius: 16,
    padding: 16,
    marginTop: 18,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#EAB308',
    borderLeftWidth: 5,
    borderLeftColor: '#EAB308',
    shadowColor: '#EAB308',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  execScheduleCardMini: {
    backgroundColor: '#16222a',
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#EAB308',
    borderLeftWidth: 4,
    borderLeftColor: '#EAB308',
  },
  execHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(234, 179, 8, 0.2)',
    marginBottom: 12,
  },
  execGovBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  execGovIcon: {
    fontSize: 20,
  },
  execGovTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#EAB308',
    letterSpacing: 0.6,
  },
  execGovSub: {
    fontSize: 10,
    color: '#8696a0',
    marginTop: 1,
  },
  execStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(234, 179, 8, 0.18)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EAB308',
  },
  execStatusDot: {
    fontSize: 8,
    color: '#22c55e',
  },
  execStatusPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FACC15',
    letterSpacing: 0.4,
  },
  execBannerHeader: {
    marginBottom: 10,
  },
  execNoticeTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#e9edef',
    letterSpacing: 0.2,
  },
  execNoticeSub: {
    fontSize: 11,
    color: '#EAB308',
    fontWeight: '600',
    marginTop: 2,
  },
  execCaseBox: {
    backgroundColor: '#111b21',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2a3942',
  },
  execCaseIdTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.35)',
    marginBottom: 4,
  },
  execCaseIdTagText: {
    color: '#EAB308',
    fontSize: 11,
    fontWeight: '800',
  },
  execCaseSubject: {
    color: '#e9edef',
    fontSize: 12.5,
    fontWeight: '600',
    lineHeight: 17,
  },
  execGridRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  execGridBox: {
    flex: 1,
    backgroundColor: '#111b21',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.3)',
  },
  execGridLabel: {
    fontSize: 9.5,
    color: '#8696a0',
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  execGridValue: {
    fontSize: 13,
    color: '#FACC15',
    fontWeight: '800',
  },
  execOfficerBox: {
    backgroundColor: '#111b21',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2a3942',
  },
  execOfficerLabel: {
    fontSize: 9.5,
    color: '#8696a0',
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  execOfficerValue: {
    fontSize: 12,
    color: '#e9edef',
    fontWeight: '700',
  },
  execNoticeStrip: {
    backgroundColor: 'rgba(234, 179, 8, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.25)',
  },
  execNoticeStripText: {
    fontSize: 10.5,
    color: '#e9edef',
    lineHeight: 14.5,
  },
  execActionBtn: {
    backgroundColor: '#EAB308',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  execActionBtnText: {
    color: '#111827',
    fontSize: 12.5,
    fontWeight: '800',
  },
  scheduledBanner: {
    backgroundColor: 'rgba(234, 179, 8, 0.14)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#EAB308',
  },
  scheduledBannerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  scheduledBannerIcon: {
    fontSize: 22,
  },
  scheduledBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#EAB308',
    letterSpacing: 0.3,
  },
  scheduledBannerCaseId: {
    fontSize: 12,
    color: '#e9edef',
    fontWeight: '700',
    marginTop: 2,
  },
  scheduledBannerText: {
    fontSize: 11,
    color: '#8696a0',
    marginTop: 2,
  },
  scheduledBannerHighlight: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FACC15',
    marginTop: 4,
  },
  scheduledBannerOfficer: {
    fontSize: 11.5,
    color: '#e9edef',
    fontWeight: '600',
    marginTop: 2,
  },
  scheduledBannerNotice: {
    fontSize: 10.5,
    color: '#8696a0',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(234, 179, 8, 0.2)',
    lineHeight: 14,
  },
  compactScheduledBadge: {
    backgroundColor: 'rgba(234, 179, 8, 0.16)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.4)',
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  compactScheduledText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#EAB308',
  },
  scheduleActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  scheduleCancelBtn: {
    flex: 1,
    backgroundColor: '#202c33',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(134, 150, 160, 0.2)',
  },
  scheduleCancelText: {
    color: '#8696a0',
    fontSize: 13,
    fontWeight: '600',
  },
  scheduleConfirmBtn: {
    flex: 1.5,
    backgroundColor: '#EAB308',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleConfirmText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
  },
  // Bottom Tab Bar
  bottomTabBar: {
    flexDirection: 'row',
    backgroundColor: '#1f2c34',
    borderTopWidth: 1,
    borderTopColor: 'rgba(134, 150, 160, 0.15)',
    paddingVertical: 6,
    paddingBottom: Platform.OS === 'android' ? 10 : 20,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  bottomTabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  bottomTabPill: {
    width: 56,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  bottomTabPillActive: {
    backgroundColor: 'rgba(234, 179, 8, 0.18)',
  },
  bottomTabIcon: {
    fontSize: 18,
  },
  bottomTabLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8696a0',
  },
  bottomTabLabelActive: {
    color: '#FACC15',
    fontWeight: '700',
  },
  bottomTabBadge: {
    position: 'absolute',
    top: -3,
    right: 4,
    backgroundColor: '#EAB308',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  bottomTabBadgeText: {
    color: '#111827',
    fontSize: 9,
    fontWeight: '800',
  },
  // Hearing Bench Card
  hearingBenchCard: {
    backgroundColor: '#1f2c34',
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(134, 150, 160, 0.15)',
  },
  hearingBenchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  hearingBenchTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#e9edef',
  },
  hearingBenchLiveBadge: {
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.35)',
  },
  hearingBenchLiveText: {
    fontSize: 10,
    color: '#EAB308',
    fontWeight: '800',
  },
  hearingBenchDesc: {
    fontSize: 12,
    color: '#8696a0',
    marginBottom: 16,
    lineHeight: 17,
  },
  directRoomRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  directRoomInput: {
    flex: 1,
    backgroundColor: '#111b21',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#e9edef',
    fontSize: 13,
    borderWidth: 1,
    borderColor: 'rgba(134, 150, 160, 0.2)',
  },
  directRoomBtn: {
    backgroundColor: '#EAB308',
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  directRoomBtnText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  featurePill: {
    backgroundColor: '#111b21',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(134, 150, 160, 0.1)',
  },
  featurePillText: {
    color: '#8696a0',
    fontSize: 11,
    fontWeight: '600',
  },
  casesBannerBtn: {
    backgroundColor: 'rgba(234, 179, 8, 0.12)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.25)',
  },
  casesBannerText: {
    color: '#EAB308',
    fontSize: 13,
    fontWeight: '700',
  },
  casesBannerArrow: {
    color: '#EAB308',
    fontSize: 16,
    fontWeight: '700',
  },
  profileCard: {
    backgroundColor: '#202c33',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(134, 150, 160, 0.15)',
    marginBottom: 14,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EAB308',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  profileInfo: {
    flex: 1,
  },
  userNameText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#e9edef',
  },
  userDesigText: {
    fontSize: 12,
    color: '#8696a0',
    marginTop: 1,
  },
  userPhoneText: {
    fontSize: 11,
    color: '#EAB308',
    marginTop: 2,
    fontWeight: '500',
  },
  roleBadge: {
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  roleBadgeText: {
    color: '#EAB308',
    fontSize: 10,
    fontWeight: '700',
  },
  districtText: {
    fontSize: 11,
    color: '#8696a0',
  },

  // Officer Inspector Styles
  officerInspectCard: {
    backgroundColor: '#202c33',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(134, 150, 160, 0.15)',
    marginBottom: 14,
  },
  officerInspectHeader: {
    marginBottom: 10,
  },
  inspectHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#e9edef',
  },
  inspectInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  inspectInput: {
    flex: 1,
    backgroundColor: '#111b21',
    borderWidth: 1,
    borderColor: '#2a3942',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#e9edef',
    fontSize: 14,
    fontWeight: '500',
  },
  inspectBtn: {
    backgroundColor: '#EAB308',
    borderRadius: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inspectBtnText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
  },
  quickChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  chipBtn: {
    backgroundColor: '#111b21',
    borderWidth: 1,
    borderColor: '#2a3942',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipBtnText: {
    fontSize: 11,
    color: '#EAB308',
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
    backgroundColor: '#111b21',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2a3942',
    marginTop: 8,
  },
  previewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  previewIdBadge: {
    backgroundColor: '#202c33',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  previewIdText: {
    color: '#EAB308',
    fontSize: 11,
    fontWeight: '700',
  },
  previewStatusBadge: {
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  previewStatusText: {
    color: '#EAB308',
    fontSize: 10,
    fontWeight: '700',
  },
  previewTitle: {
    color: '#e9edef',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  previewCategory: {
    color: '#8696a0',
    fontSize: 11,
    marginBottom: 8,
  },
  previewLocation: {
    color: '#8696a0',
    fontSize: 11,
    marginBottom: 8,
  },
  partiesGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  partyBox: {
    flex: 1,
    backgroundColor: '#202c33',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#2a3942',
  },
  partyBoxOfficer: {
    borderColor: 'rgba(234, 179, 8, 0.35)',
  },
  partyBoxHeader: {
    fontSize: 10,
    color: '#8696a0',
    fontWeight: '600',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  partyName: {
    fontSize: 13,
    color: '#e9edef',
    fontWeight: '600',
  },
  partyDesig: {
    fontSize: 11,
    color: '#8696a0',
    marginTop: 1,
  },
  partyPhone: {
    fontSize: 11,
    color: '#EAB308',
    fontWeight: '500',
    marginTop: 1,
  },
  partyMeta: {
    fontSize: 10,
    color: '#8696a0',
    marginTop: 1,
  },
  descriptionBox: {
    backgroundColor: '#202c33',
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
  },
  descriptionLabel: {
    fontSize: 10,
    color: '#8696a0',
    fontWeight: '600',
    marginBottom: 2,
  },
  descriptionText: {
    fontSize: 11,
    color: '#e9edef',
    lineHeight: 15,
  },
  primaryCallBtn: {
    backgroundColor: '#EAB308',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryCallBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryCallIcon: {
    fontSize: 16,
  },
  primaryCallTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
  },
  primaryCallSub: {
    color: '#111827',
    fontSize: 11,
    marginTop: 1,
  },

  // Citizen / Employee Notice Card
  citizenNoticeCard: {
    backgroundColor: '#202c33',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(134, 150, 160, 0.15)',
    marginBottom: 14,
  },
  noticeHeaderRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  noticeEmblem: {
    fontSize: 22,
  },
  noticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#e9edef',
    marginBottom: 2,
  },
  noticeDesc: {
    fontSize: 11,
    color: '#8696a0',
    lineHeight: 15,
  },

  // List Section
  listSection: {
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#8696a0',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  refreshLink: {
    fontSize: 12,
    color: '#EAB308',
    fontWeight: '600',
  },
  loadingBox: {
    padding: 24,
    alignItems: 'center',
    gap: 6,
  },
  loadingText: {
    color: '#8696a0',
    fontSize: 12,
  },
  emptyCard: {
    backgroundColor: '#202c33',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(134, 150, 160, 0.15)',
  },
  emptyIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#e9edef',
    marginBottom: 2,
  },
  emptyDesc: {
    fontSize: 11,
    color: '#8696a0',
    textAlign: 'center',
  },
  caseCard: {
    backgroundColor: '#202c33',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(134, 150, 160, 0.15)',
    marginBottom: 10,
  },
  caseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  caseIdBadge: {
    backgroundColor: '#111b21',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  caseIdText: {
    color: '#EAB308',
    fontSize: 11,
    fontWeight: '700',
  },
  statusBadge: {
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusText: {
    color: '#EAB308',
    fontSize: 10,
    fontWeight: '700',
  },
  caseTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e9edef',
    marginBottom: 4,
  },
  caseCategory: {
    fontSize: 11,
    color: '#8696a0',
    marginBottom: 4,
  },
  caseLocation: {
    fontSize: 11,
    color: '#8696a0',
    marginBottom: 4,
  },
  officerBox: {
    backgroundColor: '#111b21',
    borderRadius: 6,
    padding: 6,
    marginBottom: 6,
  },
  officerLabel: {
    fontSize: 10,
    color: '#8696a0',
    fontWeight: '600',
  },
  officerName: {
    fontSize: 11,
    color: '#8696a0',
    marginBottom: 6,
  },
  startHearingBtn: {
    backgroundColor: '#EAB308',
    borderRadius: 18,
    paddingVertical: 9,
    alignItems: 'center',
    marginTop: 6,
  },
  startHearingBtnText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
  },
  awaitingCallBadge: {
    backgroundColor: '#111b21',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginTop: 4,
    alignItems: 'center',
  },
  awaitingCallIcon: {
    fontSize: 16,
  },
  awaitingCallTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8696a0',
  },
  awaitingCallDesc: {
    fontSize: 10,
    color: '#8696a0',
    marginTop: 1,
  },
  btnDisabled: {
    opacity: 0.5,
  },

  // Footer Card
  infoCard: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 6,
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#e9edef',
    marginBottom: 2,
  },
  infoDesc: {
    fontSize: 11,
    color: '#8696a0',
    textAlign: 'center',
  },
  helplineHighlight: {
    fontSize: 11,
    color: '#EAB308',
    fontWeight: '700',
  },

  // Role Container & Tabs
  roleContainer: {
    marginBottom: 16,
  },
  tabBar: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  tabBtn: {
    flex: 1,
    backgroundColor: '#202c33',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(134, 150, 160, 0.15)',
  },
  tabBtnActiveOrange: {
    backgroundColor: '#EAB308',
    borderColor: '#EAB308',
  },
  tabBtnActiveRed: {
    backgroundColor: '#EAB308',
    borderColor: '#EAB308',
  },
  tabBtnText: {
    color: '#8696a0',
    fontSize: 11,
    fontWeight: '700',
  },
  tabBtnTextActive: {
    color: '#111827',
  },
  panelCard: {
    backgroundColor: '#202c33',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(134, 150, 160, 0.15)',
  },
  panelHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#e9edef',
  },
  panelSub: {
    fontSize: 11,
    color: '#8696a0',
    marginBottom: 10,
    lineHeight: 15,
  },
  refreshSmall: {
    fontSize: 11,
    color: '#EAB308',
    fontWeight: '600',
  },
  queueCard: {
    backgroundColor: '#111b21',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2a3942',
  },
  queueHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  priorityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priorityBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  queueTimeText: {
    color: '#8696a0',
    fontSize: 11,
  },
  queueCitizenName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#e9edef',
  },
  queuePhone: {
    fontSize: 11,
    color: '#EAB308',
    marginTop: 2,
  },
  queueTitle: {
    fontSize: 11,
    color: '#8696a0',
    marginTop: 2,
    marginBottom: 8,
  },
  dispatchBtn: {
    backgroundColor: '#EAB308',
    borderRadius: 16,
    paddingVertical: 8,
    alignItems: 'center',
  },
  dispatchBtnText: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '800',
  },
  emptyCardSmall: {
    padding: 16,
    alignItems: 'center',
  },
  inputFieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8696a0',
    marginTop: 8,
    marginBottom: 3,
  },
  formInput: {
    backgroundColor: '#111b21',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#e9edef',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#2a3942',
  },
  primaryActionBtn: {
    backgroundColor: '#EAB308',
    borderRadius: 18,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryActionBtnText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
  },
  consultCard: {
    backgroundColor: '#111b21',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#2a3942',
  },
  consultName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#e9edef',
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
    color: '#EAB308',
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
    backgroundColor: '#EAB308',
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
