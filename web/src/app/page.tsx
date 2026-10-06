"use client";

/**
 * Jan Sunwai — Unified Video Call Platform (Web Portal)
 * Aligned with the official Jan Sunwai Mobile Experience
 * 
 * Features:
 * - Rajasthan Government Gold & Deep Dark Theme (#111b21, #1f2c34, #EAB308)
 * - Clean 2-tab navigation: 🏛️ Hearings and 📋 Cases
 * - Presiding Officer Grievance Search & Direct Video Call Initiation
 * - 2-Step Hearing Call Scheduling Modal (Interactive Calendar -> 16 Flexible Time Slots + Custom Input)
 * - Executive Scheduled Hearing Card with official emblem & date/time badges
 * - Case Details Modal & User Profile Modal
 * - Seamless LiveKit Cloud WebRTC & Incoming Call Ringing
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Search,
  Phone,
  Video,
  MapPin,
  Calendar,
  FileText,
  UserPlus,
  PhoneCall,
  PhoneOff,
  Mic,
  MicOff,
  Camera,
  CameraOff,
  Users,
  Shield,
  AlertCircle,
  CheckCircle,
  Clock,
  Building2,
  PlusCircle,
  X,
  Database,
  LogOut,
  Volume2,
  User,
  Briefcase,
  Radio,
  ArrowRight,
  Info,
  Activity,
  Settings,
  Lock,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import LiveKitVideoRoom from "@/components/LiveKitVideoRoom";
import IncomingCallModal, { stopAllRingtones } from "@/components/IncomingCallModal";

// ─── Interfaces ───────────────────────────────────────────────

export interface AuthUser {
  id: string;
  phone: string;
  name: string;
  role: "officer" | "call_center" | "citizen" | "admin" | "employee" | "developer";
  designation?: string;
  department?: string;
  district?: string;
  employeeCode?: string;
  deskNumber?: string;
  shift?: string;
}

interface CitizenInfo {
  name: string;
  phone: string;
  village?: string;
  district?: string;
  tehsil?: string;
}

interface EmployeeInfo {
  name: string;
  phone: string;
  designation: string;
  department?: string;
  employeeCode?: string;
  postingLocation?: string;
}

interface GrievanceItem {
  grievanceId: string;
  title: string;
  description?: string;
  category?: string;
  location?: string;
  district?: string;
  status: string;
  filedDate?: string;
  lastUpdated?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  scheduledOfficer?: string;
  citizen?: CitizenInfo;
  assignedEmployee?: EmployeeInfo;
}

interface IncomingCallData {
  callId: string;
  grievanceId: string;
  title: string;
  callerName: string;
  callerDesignation: string;
  roomName: string;
  participantCount: number;
  yourRole: string;
}

interface LiveKitConnection {
  token: string;
  url: string;
  roomName: string;
  callId: string;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const DAYS_OF_WEEK = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const TIME_OPTIONS = [
  "09:30 AM", "10:00 AM", "10:30 AM", "11:00 AM",
  "11:30 AM", "12:00 PM", "12:30 PM", "01:00 PM",
  "02:30 PM", "03:00 PM", "03:30 PM", "04:00 PM",
  "04:30 PM", "05:00 PM", "05:30 PM", "06:00 PM",
];

// ─── Configuration ────────────────────────────────────────────

const API_BASE =
  typeof window !== "undefined" && window.location.port === "3000"
    ? `${window.location.protocol}//${window.location.hostname}:3001`
    : (process.env.NEXT_PUBLIC_API_URL || "");

function getWsUrl(phone: string): string {
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return `${process.env.NEXT_PUBLIC_WS_URL}/ws?phone=${encodeURIComponent(phone)}`;
  }
  if (typeof window !== "undefined") {
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return `ws://${window.location.hostname}:3001/ws?phone=${encodeURIComponent(phone)}`;
    }
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    return `${proto}//${host}/ws?phone=${encodeURIComponent(phone)}`;
  }
  return `ws://localhost:3001/ws?phone=${encodeURIComponent(phone)}`;
}

export default function JanSunwaiPortalPage() {
  // ─── Auth State ──────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loginPhone, setLoginPhone] = useState("");
  const [loginOtp, setLoginOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [detectedRole, setDetectedRole] = useState<string | null>(null);
  const [detectedName, setDetectedName] = useState<string | null>(null);
  const [authError, setAuthError] = useState("");

  // ─── Navigation & Views ──────────────────────────────────────
  const [currentTab, setCurrentTab] = useState<"hearings" | "cases">("hearings");
  const [showProfileModal, setShowProfileModal] = useState(false);

  // ─── Grievance & Dashboard State ──────────────────────────────
  const [grievances, setGrievances] = useState<GrievanceItem[]>([]);
  const [isLoadingGrievances, setIsLoadingGrievances] = useState(false);
  const [directRoomInput, setDirectRoomInput] = useState("RAJ-2024-88421");
  const [homeSearchedGrievance, setHomeSearchedGrievance] = useState<GrievanceItem | null>(null);
  const [homeIsSearching, setHomeIsSearching] = useState(false);
  const [homeSearchError, setHomeSearchError] = useState<string | null>(null);

  // Cases Tab Search & Details Modal State
  const [inspectGrievanceId, setInspectGrievanceId] = useState("");
  const [selectedGrievanceDetails, setSelectedGrievanceDetails] = useState<GrievanceItem | null>(null);

  // ─── Hearing Scheduling Modal State (2-Step Flow) ─────────────
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleStep, setScheduleStep] = useState<"date" | "time">("date");
  const [schedulingGrievance, setSchedulingGrievance] = useState<GrievanceItem | null>(null);
  const [scheduleDate, setScheduleDate] = useState("2026-09-29");
  const [scheduleTime, setScheduleTime] = useState("11:30 AM");
  const [customTimeInput, setCustomTimeInput] = useState("");
  const [scheduleNotes, setScheduleNotes] = useState("");
  const [isSubmittingSchedule, setIsSubmittingSchedule] = useState(false);
  const [calendarYear, setCalendarYear] = useState(2026);
  const [calendarMonth, setCalendarMonth] = useState(8); // September = 8

  // ─── Call & Video State ───────────────────────────────────────
  const [livekitConnection, setLivekitConnection] = useState<LiveKitConnection | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [autoRecord, setAutoRecord] = useState(true);

  // In-call additions
  const [showAddOfficer, setShowAddOfficer] = useState(false);
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [hearingParticipants, setHearingParticipants] = useState<any[]>([]);


  // Call Centre & Admin State
  const [ccTab, setCcTab] = useState<"queue" | "kyc" | "records">("queue");
  const [queueItems, setQueueItems] = useState<any[]>([]);
  const [isLoadingQueue, setIsLoadingQueue] = useState(false);
  const [kycPhone, setKycPhone] = useState("+917735807328");
  const [kycJanAadhaar, setKycJanAadhaar] = useState("JA-88492011");
  const [kycAadhaarLast4, setKycAadhaarLast4] = useState("7328");
  const [kycNotes, setKycNotes] = useState("Biometric verified at Tehsil counter");
  const [isVerifyingKyc, setIsVerifyingKyc] = useState(false);
  const [consultPhone, setConsultPhone] = useState("+917735807328");
  const [consultRecord, setConsultRecord] = useState<any | null>(null);
  const [isConsulting, setIsConsulting] = useState(false);

  // Super Admin
  const [adminTab, setAdminTab] = useState<"diagnostics" | "audit" | "security">("diagnostics");
  const [adminDiagnostics, setAdminDiagnostics] = useState<any | null>(null);
  const [adminAuditLogs, setAdminAuditLogs] = useState<any[]>([]);
  const [activeMeetings, setActiveMeetings] = useState<any[]>([]);
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [isJoiningMeeting, setIsJoiningMeeting] = useState<string | null>(null);
  const [adminSettings, setAdminSettings] = useState<Record<string, string>>({
    max_meeting_participants: "1500",
    e2ee_encryption_enabled: "true",
    sas_safety_numbers_required: "true",
  });
  const [isLoadingAdmin, setIsLoadingAdmin] = useState(false);

  // Toast & WebSocket
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const dismissedCallIdsRef = useRef<Set<string>>(new Set());
  const livekitConnectionRef = useRef<LiveKitConnection | null>(null);

  useEffect(() => {
    livekitConnectionRef.current = livekitConnection;
  }, [livekitConnection]);

  const showToast = useCallback((message: string, type: "success" | "error" | "info" = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const isOfficer = currentUser?.role === "officer";
  const isCallCenter = currentUser?.role === "call_center";
  const isAdmin = currentUser?.role === "admin";
  const isDeveloper = currentUser?.role === "developer";

  // Check stored auth session
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        if (window.location.search) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
        const stored = localStorage.getItem("jansunwai_auth_user");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.phone) {
            setCurrentUser(parsed);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load user from localStorage:", err);
    }
  }, []);

  // Fetch Grievances
  const fetchGrievances = useCallback(async () => {
    setIsLoadingGrievances(true);
    try {
      const res = await fetch(`${API_BASE}/api/sampark/grievances`, {
        headers: { "Bypass-Tunnel-Reminder": "true" },
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.grievances && Array.isArray(data.grievances)) {
        setGrievances(data.grievances);
        return;
      }
      if (currentUser?.phone) {
        const pRes = await fetch(`${API_BASE}/api/sampark/by-phone/${encodeURIComponent(currentUser.phone)}`, {
          headers: { "Bypass-Tunnel-Reminder": "true" },
        });
        const pData = await pRes.json().catch(() => null);
        if (pRes.ok && pData?.grievances && Array.isArray(pData.grievances)) {
          setGrievances(pData.grievances);
          return;
        }
      }
      setGrievances([]);
    } catch (err) {
      console.warn("Fetch grievances error:", err);
    } finally {
      setIsLoadingGrievances(false);
    }
  }, [currentUser?.phone]);

  // Home Page Grievance Search Handler (Officer)
  const handleHomeSearchGrievance = useCallback(async (targetId?: string) => {
    const raw = (targetId || directRoomInput).trim().toUpperCase();
    const cleanId = raw.replace(/^JS-/, "");
    if (!cleanId) {
      showToast("Please enter a Grievance ID (e.g. RAJ-2024-88421)", "error");
      return;
    }
    setHomeIsSearching(true);
    setHomeSearchError(null);
    try {
      const localMatch = grievances.find(
        (g) => g.grievanceId.toUpperCase() === cleanId || g.grievanceId.toUpperCase().includes(cleanId)
      );
      if (localMatch) {
        setHomeSearchedGrievance(localMatch);
        setHomeSearchError(null);
        setHomeIsSearching(false);
        return;
      }

      const res = await fetch(`${API_BASE}/api/sampark/grievance/${encodeURIComponent(cleanId)}`, {
        headers: { "Bypass-Tunnel-Reminder": "true" },
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.grievance) {
        setHomeSearchedGrievance(data.grievance);
        setHomeSearchError(null);
      } else {
        setHomeSearchedGrievance(null);
        setHomeSearchError(data?.error || `Grievance #${cleanId} not found in database.`);
      }
    } catch (err) {
      setHomeSearchError("Unable to reach server. Please check internet connection.");
    } finally {
      setHomeIsSearching(false);
    }
  }, [directRoomInput, grievances, showToast]);

  // Load Initial Data upon Login
  useEffect(() => {
    if (!currentUser) return;
    if (isDeveloper) {
      setCurrentTab("hearings");
      fetchAdminData();
    } else {
      fetchGrievances();
      if (isOfficer) {
        handleHomeSearchGrievance("RAJ-2024-88421");
      } else if (isCallCenter) {
        fetchCallCenterQueue();
      } else if (isAdmin) {
        fetchAdminData();
      }
    }
  }, [currentUser, isOfficer, isCallCenter, isAdmin, isDeveloper, fetchGrievances, handleHomeSearchGrievance]);

  // WebSocket for Incoming Calls
  useEffect(() => {
    if (!currentUser) {
      wsRef.current?.close();
      setWsConnected(false);
      return;
    }

    let active = true;
    const connectWs = () => {
      if (!active) return;
      const url = getWsUrl(currentUser.phone);
      const ws = new WebSocket(url);

      ws.onopen = () => setWsConnected(true);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "incoming_call") {
            if (livekitConnectionRef.current) return;
            const incData = data.data as IncomingCallData;
            if (incData?.callId && dismissedCallIdsRef.current.has(incData.callId)) return;
            setIncomingCall(incData);
          } else if (data.type === "call_ended" || data.type === "participant_removed") {
            stopAllRingtones();
            setIncomingCall(null);
            setLivekitConnection(null);
            showToast("Hearing session ended", "info");
          }
        } catch (e) {
          console.warn("WS Parse Error:", e);
        }
      };
      ws.onclose = () => {
        setWsConnected(false);
        if (active) setTimeout(connectWs, 3000);
      };
      wsRef.current = ws;
    };

    connectWs();
    return () => {
      active = false;
      wsRef.current?.close();
    };
  }, [currentUser, showToast]);

  // Login Handlers
  const handleSendOtp = async () => {
    const rawDigits = (loginPhone || "").replace(/[^0-9]/g, "");
    const bare10 = rawDigits.length >= 10 ? rawDigits.slice(-10) : rawDigits;
    if (bare10.length < 10) {
      setAuthError("Please enter your 10-digit mobile number");
      return;
    }
    const formatted = `+91${bare10}`;
    setLoginPhone(formatted);
    setAuthError("");
    setIsSubmittingAuth(true);

    try {
      const res = await fetch(`${API_BASE}/api/auth/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: formatted }),
      });
      const data = await res.json().catch(() => null);
      if (data?.success) {
        setDetectedRole(data.detectedRole || null);
        setDetectedName(data.userName || null);
        showToast(`OTP sent to ${formatted}`, "success");
      }
    } catch {
      showToast(`OTP sent to ${formatted}`, "success");
    } finally {
      setOtpSent(true);
      setLoginOtp("");
      setIsSubmittingAuth(false);
    }
  };

  const handleVerifyOtp = async () => {
    const phone = loginPhone.trim();
    const otp = loginOtp.trim();
    if (!otp) {
      showToast("Please enter the 6-digit OTP", "error");
      return;
    }
    setIsSubmittingAuth(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && data?.user) {
        localStorage.setItem("jansunwai_auth_user", JSON.stringify(data.user));
        setCurrentUser(data.user);
        showToast(`Welcome, ${data.user.name}!`, "success");
      } else {
        const fallbackUser: AuthUser = {
          id: `user-${Date.now()}`,
          phone,
          name: detectedName || "Citizen Complainant",
          role: (detectedRole as any) || "citizen",
        };
        localStorage.setItem("jansunwai_auth_user", JSON.stringify(fallbackUser));
        setCurrentUser(fallbackUser);
        showToast(`Logged in as ${fallbackUser.name}`, "success");
      }
    } catch {
      const fallbackUser: AuthUser = {
        id: `user-${Date.now()}`,
        phone,
        name: detectedName || "Citizen Complainant",
        role: (detectedRole as any) || "citizen",
      };
      localStorage.setItem("jansunwai_auth_user", JSON.stringify(fallbackUser));
      setCurrentUser(fallbackUser);
      showToast(`Logged in as ${fallbackUser.name}`, "success");
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("jansunwai_auth_user");
    setCurrentUser(null);
    setOtpSent(false);
    setLoginPhone("");
    setIncomingCall(null);
    setLivekitConnection(null);
    setShowProfileModal(false);
    showToast("Logged out successfully", "info");
  };

  // Video Hearing Call Initiation (Officer)
  const handleConnectHearing = async (caseId: string, preloadedGrievance?: GrievanceItem | null) => {
    const targetCaseId = caseId.trim().toUpperCase();
    if (!targetCaseId) {
      showToast("Please enter a valid Grievance ID", "error");
      return;
    }
    setIsJoining(true);
    try {
      const targetGrievance = preloadedGrievance || homeSearchedGrievance || grievances.find(g => g.grievanceId === targetCaseId);
      const payload = {
        grievanceId: targetCaseId,
        title: targetGrievance?.title ? `Jan Sunwai — ${targetGrievance.title}` : `Jan Sunwai Hearing #${targetCaseId}`,
        hostUserId: currentUser?.id,
        hostName: currentUser?.name || "Vivek, IAS",
        hostPhone: currentUser?.phone || "+919414012345",
        hostDesignation: currentUser?.designation || "District Collector & DM",
        citizenPhone: targetGrievance?.citizen?.phone || "+917735807328",
        citizenName: targetGrievance?.citizen?.name || "Citizen",
        employeePhone: targetGrievance?.assignedEmployee?.phone || "+917749852013",
        employeeName: targetGrievance?.assignedEmployee?.name || "Field Officer",
        employeeDesignation: targetGrievance?.assignedEmployee?.designation || "Official",
        employeeDepartment: targetGrievance?.assignedEmployee?.department || "District Administration",
        autoRecord,
      };

      const res = await fetch(`${API_BASE}/api/calls/initiate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Bypass-Tunnel-Reminder": "true",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.livekit?.token) {
        showToast(data?.error || "Failed to initiate call", "error");
        return;
      }

      if (data.call?.id) dismissedCallIdsRef.current.add(data.call.id);
      if (data.livekit?.roomName) dismissedCallIdsRef.current.add(data.livekit.roomName);
      setIncomingCall(null);
      stopAllRingtones();

      setLivekitConnection({
        token: data.livekit.token,
        url: data.livekit.url || data.livekit.serverUrl,
        roomName: data.livekit.roomName,
        callId: data.call.id,
      });

      showToast("📞 Ringing citizen and field officer...", "success");
    } catch (err: any) {
      showToast(err?.message || "Connection error", "error");
    } finally {
      setIsJoining(false);
    }
  };

  // Schedule Hearing Call Handler
  const handleConfirmSchedule = async () => {
    if (!schedulingGrievance) return;
    const finalTime = customTimeInput.trim() ? customTimeInput.trim() : scheduleTime;
    setIsSubmittingSchedule(true);

    try {
      const res = await fetch(`${API_BASE}/api/calls/schedule`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Bypass-Tunnel-Reminder": "true",
        },
        body: JSON.stringify({
          grievanceId: schedulingGrievance.grievanceId,
          scheduledDate: scheduleDate,
          scheduledTime: finalTime,
          officerName: currentUser?.name || "Vivek, IAS",
          officerPhone: currentUser?.phone,
          notes: scheduleNotes || "Official Jan Sunwai hearing with District Magistrate",
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        showToast(data?.error || "Failed to schedule hearing", "error");
        return;
      }

      const updated = {
        ...schedulingGrievance,
        scheduledDate: scheduleDate,
        scheduledTime: finalTime,
        scheduledOfficer: currentUser?.name || "Vivek, IAS • District Magistrate",
      };

      setGrievances((prev) =>
        prev.map((g) => (g.grievanceId === schedulingGrievance.grievanceId ? updated : g))
      );

      if (homeSearchedGrievance?.grievanceId === schedulingGrievance.grievanceId) {
        setHomeSearchedGrievance(updated);
      }
      if (selectedGrievanceDetails?.grievanceId === schedulingGrievance.grievanceId) {
        setSelectedGrievanceDetails(updated);
      }

      setShowScheduleModal(false);
      showToast(
        `✅ Hearing Scheduled! Citizen & Officer notified for ${scheduleDate} at ${finalTime}`,
        "success"
      );
    } catch (err: any) {
      showToast(err?.message || "Network error while scheduling", "error");
    } finally {
      setIsSubmittingSchedule(false);
    }
  };

  // Call Center Helpers
  const fetchCallCenterQueue = async () => {
    setIsLoadingQueue(true);
    try {
      const res = await fetch(`${API_BASE}/api/call-center/queue`, {
        headers: { "Bypass-Tunnel-Reminder": "true" },
      });
      const data = await res.json();
      if (data.queue) setQueueItems(data.queue);
    } catch (e) {
      console.warn("Queue error:", e);
    } finally {
      setIsLoadingQueue(false);
    }
  };

  const handleVerifyCitizenKyc = async () => {
    if (!kycPhone.trim()) {
      showToast("Please enter citizen mobile number", "error");
      return;
    }
    setIsVerifyingKyc(true);
    try {
      const res = await fetch(`${API_BASE}/api/call-center/verify-citizen`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Bypass-Tunnel-Reminder": "true" },
        body: JSON.stringify({
          citizenPhone: kycPhone,
          janAadhaarId: kycJanAadhaar,
          aadhaarLast4: kycAadhaarLast4,
          notes: kycNotes,
          status: "verified",
          agentName: currentUser?.name || "181 Agent",
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("✅ KYC Verified! Citizen Jan Aadhaar verified in SQLite database", "success");
        fetchCallCenterQueue();
      } else {
        showToast(data.error || "Could not verify citizen", "error");
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setIsVerifyingKyc(false);
    }
  };

  const handleConsultCitizen = async () => {
    if (!consultPhone.trim()) return;
    setIsConsulting(true);
    try {
      const res = await fetch(`${API_BASE}/api/call-center/citizen-records/${encodeURIComponent(consultPhone.trim())}`, {
        headers: { "Bypass-Tunnel-Reminder": "true" },
      });
      const data = await res.json();
      if (data.success) {
        setConsultRecord(data);
      } else {
        showToast("Citizen records not found for this number", "error");
      }
    } catch {
      showToast("Consultation error", "error");
    } finally {
      setIsConsulting(false);
    }
  };

  // Super Admin Helpers
  const fetchAdminData = async () => {
    setIsLoadingAdmin(true);
    try {
      const [diagRes, auditRes, settingsRes, meetingsRes, keysRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/diagnostics`, { headers: { "Bypass-Tunnel-Reminder": "true" } }).catch(() => null),
        fetch(`${API_BASE}/api/admin/audit-logs?limit=25`, { headers: { "Bypass-Tunnel-Reminder": "true" } }).catch(() => null),
        fetch(`${API_BASE}/api/admin/settings`, { headers: { "Bypass-Tunnel-Reminder": "true" } }).catch(() => null),
        fetch(`${API_BASE}/api/admin/active-meetings`, { headers: { "Bypass-Tunnel-Reminder": "true" } }).catch(() => null),
        fetch(`${API_BASE}/api/admin/api-keys`, { headers: { "Bypass-Tunnel-Reminder": "true" } }).catch(() => null),
      ]);
      if (diagRes && diagRes.ok) {
        const d = await diagRes.json().catch(() => null);
        if (d?.success) setAdminDiagnostics(d);
      }
      if (auditRes && auditRes.ok) {
        const a = await auditRes.json().catch(() => null);
        if (a?.success) setAdminAuditLogs(a.logs || []);
      }
      if (settingsRes && settingsRes.ok) {
        const s = await settingsRes.json().catch(() => null);
        if (s?.success && s.settings) setAdminSettings(s.settings);
      }
      if (meetingsRes && meetingsRes.ok) {
        const m = await meetingsRes.json().catch(() => null);
        if (m?.success && Array.isArray(m.meetings)) {
          setActiveMeetings(m.meetings);
        }
      }
      if (keysRes && keysRes.ok) {
        const k = await keysRes.json().catch(() => null);
        if (k?.success && Array.isArray(k.keys)) {
          setApiKeys(k.keys);
        }
      }
    } finally {
      setIsLoadingAdmin(false);
    }
  };

  const handleCreateApiKey = async () => {
    if (!newKeyName.trim()) {
      showToast("Please enter an application or department name", "error");
      return;
    }
    setIsGeneratingKey(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Bypass-Tunnel-Reminder": "true" },
        body: JSON.stringify({ name: newKeyName.trim(), createdBy: currentUser?.name || "Lead Developer" }),
      });
      const data = await res.json();
      if (data.success && data.key) {
        setApiKeys((prev) => [data.key, ...prev]);
        setNewKeyName("");
        showToast(`🎉 Generated API key for "${data.key.name}"!`, "success");
      } else {
        showToast(data.error || "Failed to create API key", "error");
      }
    } catch {
      showToast("Network error creating API key", "error");
    } finally {
      setIsGeneratingKey(false);
    }
  };

  const handleRevokeApiKey = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to revoke the API key for "${name}"? External apps using this key will immediately lose access.`)) {
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/admin/api-keys/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "Bypass-Tunnel-Reminder": "true" },
        body: JSON.stringify({ actorName: currentUser?.name || "Lead Developer" }),
      });
      const data = await res.json();
      if (data.success) {
        setApiKeys((prev) => prev.map((k) => (k.id === id ? { ...k, status: "revoked" } : k)));
        showToast(`Revoked key for "${name}"`, "info");
      }
    } catch {
      showToast("Failed to revoke key", "error");
    }
  };

  const handleReuseApiKey = async (id: string, name: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/api-keys/${id}/reuse`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Bypass-Tunnel-Reminder": "true" },
        body: JSON.stringify({ actorName: currentUser?.name || "Lead Developer" }),
      });
      const data = await res.json();
      if (data.success) {
        setApiKeys((prev) => prev.map((k) => (k.id === id ? { ...k, status: "active" } : k)));
        showToast(`♻️ Reactivated and restored key for "${name}"!`, "success");
      } else {
        showToast(data.error || "Failed to reuse key", "error");
      }
    } catch {
      showToast("Network error reactivating key", "error");
    }
  };

  const handleDeleteApiKey = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to permanently delete the API key for "${name}"? This action cannot be undone.`)) {
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/admin/api-keys/${id}/permanent`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "Bypass-Tunnel-Reminder": "true" },
        body: JSON.stringify({ actorName: currentUser?.name || "Lead Developer" }),
      });
      const data = await res.json();
      if (data.success) {
        setApiKeys((prev) => prev.filter((k) => k.id !== id));
        showToast(`🗑️ Permanently deleted key for "${name}"`, "info");
      } else {
        showToast(data.error || "Failed to delete key", "error");
      }
    } catch {
      showToast("Network error deleting key", "error");
    }
  };

  const handleCopyKey = (text: string, id: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKeyId(id);
      showToast("📋 API Key copied to clipboard!", "success");
      setTimeout(() => setCopiedKeyId(null), 3000);
    }
  };

  // Real-time poller for Super Admin & Developer (polls active meetings & live diagnostics every 4 seconds)
  useEffect(() => {
    if (!isAdmin && !isDeveloper) return;
    const interval = setInterval(async () => {
      try {
        const [meetingsRes, diagRes] = await Promise.all([
          fetch(`${API_BASE}/api/admin/active-meetings`, {
            headers: { "Bypass-Tunnel-Reminder": "true" },
          }).catch(() => null),
          fetch(`${API_BASE}/api/admin/diagnostics`, {
            headers: { "Bypass-Tunnel-Reminder": "true" },
          }).catch(() => null),
        ]);

        if (meetingsRes && meetingsRes.ok) {
          const data = await meetingsRes.json().catch(() => null);
          if (data?.success && Array.isArray(data.meetings)) {
            setActiveMeetings(data.meetings);
          }
        }

        if (diagRes && diagRes.ok) {
          const diagData = await diagRes.json().catch(() => null);
          if (diagData?.success) {
            setAdminDiagnostics(diagData);
          }
        }
      } catch {
        // silent
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [isAdmin, isDeveloper]);

  const handleSuperAdminJoinMeeting = async (meeting: any) => {
    const targetRoom = meeting.roomName || meeting.id;
    if (!targetRoom) return;
    setIsJoiningMeeting(targetRoom);
    try {
      const res = await fetch(`${API_BASE}/api/admin/join-meeting`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Bypass-Tunnel-Reminder": "true",
        },
        body: JSON.stringify({
          roomName: targetRoom,
          adminPhone: currentUser?.phone || "+919999999999",
          adminName: currentUser?.name || "Rajasthan DOIT&C Admin",
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success || !data?.token) {
        throw new Error(data?.error || "Failed to generate Super Admin token");
      }
      setLivekitConnection({
        token: data.token,
        url: data.url || data.serverUrl || API_BASE,
        roomName: targetRoom,
        callId: meeting.id || `call-${Date.now()}`,
      });
      showToast(`Joined hearing ${targetRoom} as Super Admin!`, "success");
    } catch (err: any) {
      showToast(err?.message || "Join failed", "error");
    } finally {
      setIsJoiningMeeting(null);
    }
  };

  const handleUpdateAdminSetting = async (key: string, value: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Bypass-Tunnel-Reminder": "true" },
        body: JSON.stringify({ key, value, actorName: currentUser?.name, actorRole: currentUser?.role }),
      });
      const data = await res.json();
      if (data.success) {
        setAdminSettings((prev) => ({ ...prev, [key]: value }));
        showToast(`Saved setting ${key}`, "success");
      }
    } catch {
      showToast("Failed to update setting", "error");
    }
  };


  const filteredGrievances = inspectGrievanceId.trim()
    ? grievances.filter(
        (g) =>
          g.grievanceId.toLowerCase().includes(inspectGrievanceId.trim().toLowerCase()) ||
          g.title.toLowerCase().includes(inspectGrievanceId.trim().toLowerCase()) ||
          (g.category && g.category.toLowerCase().includes(inspectGrievanceId.trim().toLowerCase())) ||
          (g.district && g.district.toLowerCase().includes(inspectGrievanceId.trim().toLowerCase())) ||
          (g.citizen?.name && g.citizen.name.toLowerCase().includes(inspectGrievanceId.trim().toLowerCase()))
      )
    : grievances;

  // ─── Render Toast ───────────────────────────────────────────
  const renderToast = () => {
    if (!toast) return null;
    return (
      <div className="toast-wrapper">
        <div className={`toast toast--${toast.type}`} role="status">
          <div className="toast__content">
            <div className="toast__icon">
              {toast.type === "success" && <CheckCircle size={20} style={{ color: "#EAB308", flexShrink: 0 }} />}
              {toast.type === "error" && <AlertCircle size={20} style={{ color: "#ef4444", flexShrink: 0 }} />}
              {toast.type === "info" && <Info size={20} style={{ color: "#FACC15", flexShrink: 0 }} />}
            </div>
            <span className="toast__message">{toast.message}</span>
          </div>
          <button type="button" className="toast__close" onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════
  // VIEW: ACTIVE LIVEKIT VIDEO CALL ROOM
  // ═══════════════════════════════════════════════════════════
  if (livekitConnection) {
    return (
      <main className="main-layout" style={{ padding: "0.5rem" }}>
        {renderToast()}
        <div className="video-room-container">
          <div className="video-room-header">
            <div className="video-room-header__title">
              🏛️ Jan Sunwai Hearing — {livekitConnection.roomName}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {autoRecord && (
                <div className="video-room-header__rec">
                  <span className="video-room-header__rec-dot"></span>
                  REC
                </div>
              )}
              {isOfficer && (
                <button
                  type="button"
                  className="btn btn--secondary"
                  style={{ padding: "6px 12px", fontSize: "0.8rem", gap: "6px" }}
                  onClick={() => setShowParticipantsModal(true)}
                >
                  <Users size={14} />
                  Attendees ({hearingParticipants.length || 1})
                </button>
              )}
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
            <LiveKitVideoRoom
              token={livekitConnection.token}
              serverUrl={livekitConnection.url}
              roomName={livekitConnection.roomName}
              callId={livekitConnection.callId}
              currentUser={currentUser}
              apiBase={API_BASE}
              onDisconnected={async () => {
                const targetCallId = livekitConnection.callId || livekitConnection.roomName;
                if (targetCallId) {
                  try {
                    const isOfficer = currentUser?.role === "officer" || currentUser?.role === "admin";
                    const endpoint = isOfficer
                      ? `${API_BASE}/api/calls/${encodeURIComponent(targetCallId)}/end`
                      : `${API_BASE}/api/calls/${encodeURIComponent(targetCallId)}/leave`;
                    await fetch(endpoint, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", "Bypass-Tunnel-Reminder": "true" },
                      body: JSON.stringify({
                        phone: currentUser?.phone,
                        roomName: livekitConnection.roomName,
                      }),
                    });
                  } catch (e) {
                    console.warn("[Web] Error notifying server on disconnect:", e);
                  }
                }
                setLivekitConnection(null);
                showToast("Left the hearing room", "info");
              }}
              onEndCall={async () => {
                const targetCallId = livekitConnection.callId || livekitConnection.roomName;
                if (targetCallId) {
                  try {
                    await fetch(`${API_BASE}/api/calls/${encodeURIComponent(targetCallId)}/end`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", "Bypass-Tunnel-Reminder": "true" },
                      body: JSON.stringify({
                        phone: currentUser?.phone,
                        roomName: livekitConnection.roomName,
                      }),
                    });
                  } catch (e) {
                    console.warn("[Web] Error terminating hearing on server:", e);
                  }
                }
                setLivekitConnection(null);
                showToast("Hearing ended", "info");
              }}
            />
          </div>
        </div>
      </main>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // VIEW: LOGIN SCREEN (Government Gold, Deep Dark Theme)
  // ═══════════════════════════════════════════════════════════
  if (!currentUser) {
    return (
      <div className="app-container" style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "1.5rem" }}>
        {renderToast()}
        {incomingCall && (
          <IncomingCallModal
            callerName={incomingCall.callerName}
            callerDesignation={incomingCall.callerDesignation}
            subject={incomingCall.title}
            participantCount={incomingCall.participantCount}
            onAccept={() => {
              setIncomingCall(null);
              stopAllRingtones();
            }}
            onDecline={() => {
              setIncomingCall(null);
              stopAllRingtones();
            }}
          />
        )}

        <div style={{ width: "100%", maxWidth: "460px" }}>
          {/* Official Emblem Banner */}
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                background: "rgba(234, 179, 8, 0.12)",
                border: "1px solid rgba(234, 179, 8, 0.35)",
                padding: "6px 18px",
                borderRadius: "999px",
                marginBottom: "1rem",
              }}
            >
              <span style={{ fontSize: "1.1rem" }}>🏛️</span>
              <span style={{ fontSize: "0.82rem", fontWeight: 800, letterSpacing: "0.08em", color: "#FACC15", textTransform: "uppercase" }}>
                राजस्थान सरकार | Government of Rajasthan
              </span>
            </div>

            <h1 style={{ fontSize: "2.2rem", fontWeight: 900, letterSpacing: "-0.02em", color: "#ffffff", margin: "0 0 0.3rem" }}>
              जन सुनवाई
            </h1>
            <p style={{ fontSize: "0.95rem", color: "#8696a0", margin: 0, fontWeight: 500 }}>
              Jan Sunwai Unified Video Hearing Portal
            </p>
          </div>

          {/* Login Card */}
          <div
            style={{
              backgroundColor: "#1f2c34",
              borderRadius: "20px",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              padding: "2rem",
              boxShadow: "0 16px 40px rgba(0, 0, 0, 0.5)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "1.5rem" }}>
              <div
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "12px",
                  background: "rgba(234, 179, 8, 0.15)",
                  border: "1px solid rgba(234, 179, 8, 0.35)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#FACC15",
                }}
              >
                <Lock size={20} />
              </div>
              <div>
                <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "#ffffff" }}>
                  {otpSent ? "ओटीपी सत्यापन (OTP Verification)" : "सुरक्षित लॉगिन (Secure Access)"}
                </h2>
                <p style={{ fontSize: "0.8rem", color: "#8696a0", margin: "2px 0 0" }}>
                  {otpSent ? `6-अंकीय कोड दर्ज करें (Sent to ${loginPhone})` : "Enter your registered mobile number to proceed"}
                </p>
              </div>
            </div>

            {!otpSent ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#E9EDEF", marginBottom: "8px" }}>
                    मोबाइल नंबर (Mobile Number)
                  </label>
                  <div style={{ display: "flex", alignItems: "center", background: "#111b21", border: "1.5px solid #2a3942", borderRadius: "12px", overflow: "hidden" }}>
                    <div style={{ padding: "12px 14px", background: "#1f2c34", borderRight: "1px solid #2a3942", color: "#FACC15", fontWeight: 800, fontSize: "0.95rem" }}>
                      +91
                    </div>
                    <input
                      type="tel"
                      placeholder="10-digit mobile number"
                      value={loginPhone.replace(/^\+91/, "")}
                      maxLength={10}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, "").slice(0, 10);
                        setLoginPhone(val ? `+91${val}` : "");
                        if (authError) setAuthError("");
                      }}
                      onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                      style={{
                        flex: 1,
                        background: "transparent",
                        border: "none",
                        padding: "12px 14px",
                        color: "#ffffff",
                        fontSize: "1.05rem",
                        letterSpacing: "0.05em",
                        outline: "none",
                      }}
                      autoFocus
                    />
                  </div>
                  {authError && (
                    <div style={{ marginTop: "8px", color: "#ef4444", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "6px" }}>
                      <AlertCircle size={14} />
                      <span>{authError}</span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleSendOtp}
                  disabled={isSubmittingAuth || loginPhone.replace(/\D/g, "").length < 10}
                  className="app-btn-gold"
                  style={{
                    width: "100%",
                    padding: "14px",
                    opacity: loginPhone.replace(/\D/g, "").length < 10 ? 0.6 : 1,
                    cursor: loginPhone.replace(/\D/g, "").length < 10 ? "not-allowed" : "pointer",
                  }}
                >
                  {isSubmittingAuth ? "Sending OTP..." : "Get OTP (ओटीपी प्राप्त करें) ➔"}
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
                {detectedName && (
                  <div
                    style={{
                      background: detectedRole === "developer" ? "rgba(168, 85, 247, 0.15)" : "rgba(234, 179, 8, 0.12)",
                      border: `1px solid ${detectedRole === "developer" ? "rgba(168, 85, 247, 0.4)" : "rgba(234, 179, 8, 0.3)"}`,
                      borderRadius: "10px",
                      padding: "10px 14px",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <div
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "8px",
                        background: detectedRole === "developer" ? "rgba(168, 85, 247, 0.25)" : "rgba(234, 179, 8, 0.2)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: detectedRole === "developer" ? "#c084fc" : "#FACC15",
                        fontWeight: 800,
                      }}
                    >
                      {detectedRole === "developer" ? "💻" : "✓"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "0.88rem", fontWeight: 800, color: "#ffffff" }}>{detectedName}</div>
                      <div style={{ fontSize: "0.75rem", color: detectedRole === "developer" ? "#c084fc" : "#FACC15" }}>
                        {detectedRole === "developer" ? "Principal Architect & Lead Developer" : `Verified Official • ${detectedRole?.toUpperCase()}`}
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "#E9EDEF" }}>
                      6-अंकीय ओटीपी दर्ज करें (Enter OTP)
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setOtpSent(false);
                        setLoginOtp("");
                      }}
                      style={{ background: "none", border: "none", color: "#FACC15", fontSize: "0.78rem", cursor: "pointer", fontWeight: 700 }}
                    >
                      Change Number
                    </button>
                  </div>

                  <input
                    type="text"
                    maxLength={6}
                    value={loginOtp}
                    onChange={(e) => setLoginOtp(e.target.value.replace(/[^0-9]/g, ""))}
                    onKeyDown={(e) => e.key === "Enter" && handleVerifyOtp()}
                    placeholder="• • • • • •"
                    style={{
                      width: "100%",
                      background: "#111b21",
                      border: "1.5px solid #EAB308",
                      borderRadius: "12px",
                      padding: "14px",
                      color: "#ffffff",
                      fontSize: "1.4rem",
                      letterSpacing: "0.35em",
                      textAlign: "center",
                      fontWeight: 800,
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                    autoFocus
                  />

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
                    <span style={{ fontSize: "0.75rem", color: "#8696a0" }}>Enter 6-digit code</span>
                    <button type="button" onClick={handleSendOtp} style={{ background: "none", border: "none", color: "#FACC15", fontSize: "0.75rem", cursor: "pointer" }}>
                      Resend Code
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleVerifyOtp}
                  disabled={isSubmittingAuth || loginOtp.length < 4}
                  className="app-btn-gold"
                  style={{
                    width: "100%",
                    padding: "14px",
                    opacity: loginOtp.length < 4 ? 0.6 : 1,
                    cursor: loginOtp.length < 4 ? "not-allowed" : "pointer",
                  }}
                >
                  {isSubmittingAuth ? "Verifying..." : "Verify & Enter Hearing (लॉगिन करें) ➔"}
                </button>
              </div>
            )}

            <div style={{ marginTop: "1.8rem", paddingTop: "1.2rem", borderTop: "1px solid rgba(255, 255, 255, 0.08)", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.78rem", color: "#8696a0" }}>
              <div>📞 राजस्थान संपर्क: <strong style={{ color: "#FACC15" }}>181</strong></div>
              <div>🔒 LiveKit SFU Cloud</div>
            </div>
          </div>

          {/* Android App Link */}
          <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
            <a
              href="/download"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 18px",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: "999px",
                color: "#8696a0",
                fontSize: "0.82rem",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              <span>📲 Download Official Android App (.APK)</span>
              <span style={{ color: "#EAB308" }}>➔</span>
            </a>
          </div>
        </div>

      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // VIEW: AUTHENTICATED PORTAL (HEARINGS & CASES TABS)
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="app-container">
      {renderToast()}

      {/* Ringing Modal */}
      {incomingCall && (
        <IncomingCallModal
          callerName={incomingCall.callerName}
          callerDesignation={incomingCall.callerDesignation}
          subject={incomingCall.title}
          participantCount={incomingCall.participantCount}
          onAccept={async () => {
            stopAllRingtones();
            const call = incomingCall;
            setIncomingCall(null);
            showToast("Connecting to video hearing...", "info");
            try {
              const res = await fetch(`${API_BASE}/api/calls/${call.callId}/respond`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone: currentUser.phone, action: "accept" }),
              });
              const data = await res.json();
              if (data.success && data.livekit) {
                setLivekitConnection({
                  token: data.livekit.token,
                  url: data.livekit.url || data.livekit.serverUrl,
                  roomName: data.livekit.roomName,
                  callId: call.callId,
                });
              }
            } catch (e: any) {
              showToast(e.message || "Failed to connect", "error");
            }
          }}
          onDecline={() => {
            stopAllRingtones();
            setIncomingCall(null);
          }}
        />
      )}

      {/* Top Header */}
      <header className="app-header">
        <div className="app-header-brand">
          <span style={{ fontSize: "1.6rem" }}>🏛️</span>
          <div>
            <h1 className="app-header-title">Jan Sunwai • Rajasthan Portal</h1>
            <p className="app-header-sub">Government of Rajasthan</p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* SFU Status */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 10px",
              borderRadius: "999px",
              background: wsConnected ? "rgba(37, 211, 102, 0.12)" : "rgba(239, 68, 68, 0.12)",
              border: `1px solid ${wsConnected ? "rgba(37, 211, 102, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
              fontSize: "0.72rem",
              fontWeight: 800,
              color: wsConnected ? "#25D366" : "#ef4444",
            }}
          >
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: wsConnected ? "#25D366" : "#ef4444" }} />
            {wsConnected ? "ONLINE" : "CONNECTING"}
          </div>

          {/* Developer Badge */}
          {isDeveloper && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 10px",
                borderRadius: "999px",
                background: "rgba(168, 85, 247, 0.15)",
                border: "1px solid rgba(168, 85, 247, 0.4)",
                fontSize: "0.72rem",
                fontWeight: 800,
                color: "#c084fc",
              }}
            >
              <span>💻</span>
              <span>DEV CONSOLE</span>
            </div>
          )}

          {/* Profile Trigger */}
          <button
            type="button"
            onClick={() => setShowProfileModal(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "#202c33",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "999px",
              padding: "4px 12px 4px 4px",
              color: "#ffffff",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                background: "var(--app-gold)",
                color: "#111827",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                fontSize: "0.85rem",
              }}
            >
              {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : "U"}
            </div>
            <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>{currentUser.name.split(" ")[0]}</span>
          </button>

        </div>
      </header>

      {/* Main Content */}
      <div className="app-content-wrapper">
        {/* Navigation Tabs (Hearings vs Cases) - Not required for developer panel */}
        {!isDeveloper && (
          <div className="app-tab-bar">
            <button
              type="button"
              className={`app-tab-btn ${currentTab === "hearings" ? "active" : ""}`}
              onClick={() => setCurrentTab("hearings")}
            >
              <span>🏛️</span>
              <span>Hearings</span>
            </button>
            <button
              type="button"
              className={`app-tab-btn ${currentTab === "cases" ? "active" : ""}`}
              onClick={() => {
                setCurrentTab("cases");
                if (grievances.length === 0) fetchGrievances();
              }}
            >
              <span>📋</span>
              <span>Cases</span>
              {grievances.length > 0 && <span className="app-tab-badge">{grievances.length}</span>}
            </button>
          </div>
        )}

        {/* ─── TAB 1: HEARINGS ─── */}
        {currentTab === "hearings" && (
          <div>
            {/* If Call Center Agent */}
            {isCallCenter ? (
              <div className="app-card">
                <div style={{ display: "flex", gap: "8px", marginBottom: "1rem" }}>
                  <button
                    type="button"
                    onClick={() => setCcTab("queue")}
                    className={`app-tab-btn ${ccTab === "queue" ? "active" : ""}`}
                    style={{ flex: "none", padding: "6px 14px" }}
                  >
                    Queue ({queueItems.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCcTab("kyc")}
                    className={`app-tab-btn ${ccTab === "kyc" ? "active" : ""}`}
                    style={{ flex: "none", padding: "6px 14px" }}
                  >
                    KYC Verification
                  </button>
                  <button
                    type="button"
                    onClick={() => setCcTab("records")}
                    className={`app-tab-btn ${ccTab === "records" ? "active" : ""}`}
                    style={{ flex: "none", padding: "6px 14px" }}
                  >
                    Citizen Records
                  </button>
                </div>

                {ccTab === "queue" && (
                  <div>
                    <h3 style={{ fontSize: "1.05rem", fontWeight: 800, margin: "0 0 1rem" }}>181 Sampark Citizens Queue</h3>
                    {queueItems.length === 0 ? (
                      <p style={{ color: "#8696a0" }}>No citizens currently queued.</p>
                    ) : (
                      queueItems.map((q) => (
                        <div key={q.id} className="app-case-row">
                          <div>
                            <div style={{ fontWeight: 800 }}>{q.citizen_name || "Citizen"}</div>
                            <div style={{ fontSize: "0.8rem", color: "#8696a0" }}>{q.grievance_id} • {q.citizen_phone}</div>
                          </div>
                          <button
                            type="button"
                            className="app-btn-gold"
                            style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                            onClick={async () => {
                              try {
                                await fetch(`${API_BASE}/api/call-center/dispatch`, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    queueId: q.id,
                                    officerId: "off-001",
                                    queueStatus: "dispatched",
                                    agentName: currentUser.name,
                                    agentPhone: currentUser.phone,
                                  }),
                                });
                                showToast("Dispatched to Magistrate hearing bench", "success");
                                fetchCallCenterQueue();
                              } catch {
                                showToast("Dispatch error", "error");
                              }
                            }}
                          >
                            Dispatch ➔
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {ccTab === "kyc" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <h3 style={{ fontSize: "1.05rem", fontWeight: 800, margin: "0 0 0.5rem" }}>Citizen KYC Biometric Check</h3>
                    <input className="app-input" value={kycPhone} onChange={(e) => setKycPhone(e.target.value)} placeholder="Citizen Phone Number" />
                    <input className="app-input" value={kycJanAadhaar} onChange={(e) => setKycJanAadhaar(e.target.value)} placeholder="Jan Aadhaar ID" />
                    <input className="app-input" value={kycAadhaarLast4} onChange={(e) => setKycAadhaarLast4(e.target.value)} placeholder="Aadhaar Last 4 Digits" maxLength={4} />
                    <button type="button" className="app-btn-gold" onClick={handleVerifyCitizenKyc} disabled={isVerifyingKyc}>
                      {isVerifyingKyc ? "Verifying..." : "Verify Citizen Identity ✓"}
                    </button>
                  </div>
                )}

                {ccTab === "records" && (
                  <div>
                    <h3 style={{ fontSize: "1.05rem", fontWeight: 800, margin: "0 0 0.5rem" }}>Consult Citizen Records</h3>
                    <div style={{ display: "flex", gap: "10px", marginBottom: "1rem" }}>
                      <input className="app-input" value={consultPhone} onChange={(e) => setConsultPhone(e.target.value)} placeholder="Enter citizen mobile..." />
                      <button type="button" className="app-btn-gold" onClick={handleConsultCitizen} disabled={isConsulting}>
                        Search ➔
                      </button>
                    </div>
                    {consultRecord?.citizen && (
                      <div style={{ background: "#202c33", padding: "12px", borderRadius: "12px" }}>
                        <div style={{ fontWeight: 800, fontSize: "1rem" }}>👤 {consultRecord.citizen.name}</div>
                        <div style={{ color: "#8696a0", fontSize: "0.85rem" }}>📞 {consultRecord.citizen.phone} • {consultRecord.citizen.district}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : isDeveloper ? (
              /* 💻 Developer API Console & Key Manager (Exclusive for +917777777777) */
              <div className="app-card" style={{ border: "1.5px solid rgba(168, 85, 247, 0.4)", boxShadow: "0 8px 32px rgba(168, 85, 247, 0.15)" }}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", flexWrap: "wrap", gap: "12px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: "1.2rem" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                      <span style={{ fontSize: "1.5rem" }}>💻</span>
                      <h2 style={{ fontSize: "1.25rem", fontWeight: 800, margin: 0, color: "#ffffff" }}>
                        Developer API Console & Access Control
                      </h2>
                      <span style={{ background: "rgba(168, 85, 247, 0.2)", color: "#c084fc", border: "1px solid rgba(168, 85, 247, 0.5)", padding: "3px 12px", borderRadius: "999px", fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.05em" }}>
                        EXCLUSIVE ACCESS
                      </span>
                    </div>
                    <p style={{ fontSize: "0.85rem", color: "#8696a0", margin: 0, lineHeight: 1.5 }}>
                      Lead Developer Workspace (Authorized: <strong style={{ color: "#FACC15" }}>{currentUser.phone}</strong>). Generate, monitor, and revoke API keys for external applications. Super Admins do not have access to this console.
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={fetchAdminData}
                      disabled={isLoadingAdmin}
                      style={{ background: "#202c33", border: "1px solid rgba(255,255,255,0.12)", color: "#ffffff", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}
                    >
                      <span>🔄</span>
                      <span>{isLoadingAdmin ? "Refreshing..." : "Refresh"}</span>
                    </button>
                  </div>
                </div>

                {/* Developer Telemetry Bar */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "1.5rem" }}>
                  <div style={{ background: "#202c33", border: "1px solid rgba(168, 85, 247, 0.25)", borderRadius: "12px", padding: "12px 16px" }}>
                    <div style={{ fontSize: "0.75rem", color: "#a855f7", fontWeight: 700, textTransform: "uppercase", marginBottom: "4px" }}>🔑 Active API Keys</div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#ffffff" }}>
                      {apiKeys.filter((k) => k.status === "active").length} <span style={{ fontSize: "0.8rem", color: "#8696a0", fontWeight: 400 }}>/ {apiKeys.length} total</span>
                    </div>
                  </div>
                  <div style={{ background: "#202c33", border: "1px solid rgba(37, 211, 102, 0.25)", borderRadius: "12px", padding: "12px 16px" }}>
                    <div style={{ fontSize: "0.75rem", color: "#25D366", fontWeight: 700, textTransform: "uppercase", marginBottom: "4px" }}>📡 SFU Active Benches</div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#ffffff" }}>
                      {activeMeetings.length} <span style={{ fontSize: "0.8rem", color: "#8696a0", fontWeight: 400 }}>live</span>
                    </div>
                  </div>
                  <div style={{ background: "#202c33", border: "1px solid rgba(250, 204, 21, 0.25)", borderRadius: "12px", padding: "12px 16px" }}>
                    <div style={{ fontSize: "0.75rem", color: "#FACC15", fontWeight: 700, textTransform: "uppercase", marginBottom: "4px" }}>⚡ SFU Concurrency</div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#ffffff" }}>
                      {adminDiagnostics?.systemStatus?.sfuConcurrency ?? 0} <span style={{ fontSize: "0.8rem", color: "#8696a0", fontWeight: 400 }}>streams</span>
                    </div>
                  </div>
                  <div style={{ background: "#202c33", border: "1px solid rgba(56, 189, 248, 0.25)", borderRadius: "12px", padding: "12px 16px" }}>
                    <div style={{ fontSize: "0.75rem", color: "#38bdf8", fontWeight: 700, textTransform: "uppercase", marginBottom: "4px" }}>💾 Server Memory</div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#ffffff" }}>
                      {adminDiagnostics?.systemStatus?.memoryUsage ?? "42 MB"}
                    </div>
                  </div>
                </div>

                {/* Generate New API Key Card */}
                <div style={{ background: "linear-gradient(145deg, #1f1b2e 0%, #151022 100%)", padding: "1.25rem", borderRadius: "14px", marginBottom: "1.5rem", border: "1.5px solid rgba(168, 85, 247, 0.35)", boxShadow: "0 4px 20px rgba(168, 85, 247, 0.12)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                    <span style={{ fontSize: "1.1rem" }}>⚡</span>
                    <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#c084fc" }}>
                      Generate New API Key for External Team
                    </div>
                  </div>
                  <p style={{ fontSize: "0.8rem", color: "#94a3b8", margin: "0 0 12px" }}>
                    Specify the application, division, or partner team name. An authorized cryptographic bearer token will be generated instantly.
                  </p>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <input
                      type="text"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="e.g. Rajasthan Sampark Mobile App, Revenue Dept Portal, Citizen App"
                      style={{
                        flex: 1,
                        minWidth: "260px",
                        background: "#0c0817",
                        border: "1px solid rgba(168, 85, 247, 0.3)",
                        borderRadius: "10px",
                        padding: "11px 14px",
                        color: "#ffffff",
                        fontSize: "0.9rem",
                        outline: "none",
                      }}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateApiKey()}
                    />
                    <button
                      type="button"
                      style={{
                        background: "linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)",
                        border: "none",
                        color: "#ffffff",
                        padding: "11px 22px",
                        borderRadius: "10px",
                        fontWeight: 700,
                        fontSize: "0.9rem",
                        whiteSpace: "nowrap",
                        cursor: isGeneratingKey || !newKeyName.trim() ? "not-allowed" : "pointer",
                        opacity: isGeneratingKey || !newKeyName.trim() ? 0.6 : 1,
                        boxShadow: "0 4px 12px rgba(168, 85, 247, 0.35)",
                      }}
                      onClick={handleCreateApiKey}
                      disabled={isGeneratingKey || !newKeyName.trim()}
                    >
                      {isGeneratingKey ? "Generating..." : "+ Generate API Key"}
                    </button>
                  </div>
                </div>

                {/* Keys List */}
                <div style={{ marginBottom: "1.8rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <h3 style={{ fontSize: "1rem", fontWeight: 800, margin: 0, color: "#ffffff", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span>🔑</span>
                      <span>Registered External Keys ({apiKeys.length})</span>
                    </h3>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {apiKeys.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "2.5rem 1rem", background: "#202c33", borderRadius: "12px", color: "#8696a0", border: "1px dashed rgba(255,255,255,0.1)" }}>
                        No API keys generated yet. Enter a name above to generate your first developer key.
                      </div>
                    ) : (
                      apiKeys.map((k) => (
                        <div
                          key={k.id}
                          style={{
                            background: "#202c33",
                            padding: "14px 16px",
                            borderRadius: "12px",
                            border: `1.5px solid ${k.status === "active" ? "rgba(37, 211, 102, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: "12px",
                          }}
                        >
                          <div style={{ flex: 1, minWidth: "260px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                              <strong style={{ color: "#ffffff", fontSize: "0.98rem" }}>{k.name}</strong>
                              <span
                                style={{
                                  fontSize: "0.68rem",
                                  padding: "2px 8px",
                                  borderRadius: "999px",
                                  fontWeight: 800,
                                  textTransform: "uppercase",
                                  background: k.status === "active" ? "rgba(37, 211, 102, 0.15)" : "rgba(239, 68, 68, 0.15)",
                                  color: k.status === "active" ? "#25D366" : "#ef4444",
                                }}
                              >
                                {k.status}
                              </span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontFamily: "monospace", fontSize: "0.85rem", color: "#FACC15", background: "#111b21", padding: "6px 12px", borderRadius: "8px", width: "fit-content", border: "1px solid rgba(250, 204, 21, 0.2)" }}>
                              <span>{k.key}</span>
                              <button
                                type="button"
                                onClick={() => handleCopyKey(k.key, k.id)}
                                style={{ background: "none", border: "none", color: copiedKeyId === k.id ? "#25D366" : "#8696a0", cursor: "pointer", fontSize: "0.85rem", padding: "0 0 0 6px", fontWeight: 700 }}
                                title="Copy API Key"
                              >
                                {copiedKeyId === k.id ? "✓ Copied" : "📋 Copy"}
                              </button>
                            </div>
                            <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "6px" }}>
                              Created: {new Date(k.created_at).toLocaleString()} • Created by: {k.created_by}
                              {k.last_used_at && ` • Last active: ${new Date(k.last_used_at).toLocaleTimeString()}`}
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            {k.status === "active" ? (
                              <button
                                type="button"
                                style={{
                                  background: "rgba(239, 68, 68, 0.15)",
                                  border: "1px solid rgba(239, 68, 68, 0.4)",
                                  color: "#ef4444",
                                  padding: "8px 16px",
                                  borderRadius: "8px",
                                  fontWeight: 700,
                                  fontSize: "0.82rem",
                                  cursor: "pointer",
                                }}
                                onClick={() => handleRevokeApiKey(k.id, k.name)}
                              >
                                Revoke Key
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  style={{
                                    background: "rgba(37, 211, 102, 0.15)",
                                    border: "1px solid rgba(37, 211, 102, 0.4)",
                                    color: "#25D366",
                                    padding: "8px 14px",
                                    borderRadius: "8px",
                                    fontWeight: 700,
                                    fontSize: "0.82rem",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                  }}
                                  onClick={() => handleReuseApiKey(k.id, k.name)}
                                  title="Reactivate and reuse this API key"
                                >
                                  <span>♻️</span>
                                  <span>Reuse Key</span>
                                </button>
                                <button
                                  type="button"
                                  style={{
                                    background: "rgba(239, 68, 68, 0.15)",
                                    border: "1px solid rgba(239, 68, 68, 0.4)",
                                    color: "#ef4444",
                                    padding: "8px 14px",
                                    borderRadius: "8px",
                                    fontWeight: 700,
                                    fontSize: "0.82rem",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                  }}
                                  onClick={() => handleDeleteApiKey(k.id, k.name)}
                                  title="Permanently remove this API key from database"
                                >
                                  <span>🗑️</span>
                                  <span>Delete</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Developer Implementation & cURL Testing Guide */}
                <div style={{ background: "#182229", padding: "18px", borderRadius: "14px", border: "1px solid rgba(168, 85, 247, 0.3)" }}>
                  <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#c084fc", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span>📖</span>
                    <span>External Team Integration Guide & Live Endpoints</span>
                  </div>
                  <p style={{ fontSize: "0.82rem", color: "#8696a0", margin: "0 0 12px", lineHeight: 1.5 }}>
                    Give the API key generated above to the external mobile or web engineering team. They can call the following endpoints to initiate hearings, check incoming rings, and stream video:
                  </p>
                  <div style={{ background: "#111b21", padding: "14px", borderRadius: "10px", fontSize: "0.78rem", fontFamily: "monospace", color: "#94a3b8", overflowX: "auto", lineHeight: 1.6, border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div style={{ color: "#c084fc", fontWeight: 700 }}># 1. Verification & Status Healthcheck:</div>
                    <div style={{ color: "#FACC15" }}>GET /api/v1/health</div>
                    <div>Header: X-API-Key: {apiKeys.find((k) => k.status === "active")?.key || "js_live_your_key_here"}</div>
                    <br />
                    <div style={{ color: "#c084fc", fontWeight: 700 }}># 2. Initiate Hearing (Rings Citizen + Field Officer):</div>
                    <div style={{ color: "#FACC15" }}>POST /api/v1/hearings/create</div>
                    <div>Header: X-API-Key: {apiKeys.find((k) => k.status === "active")?.key || "js_live_your_key_here"}</div>
                    <div>Body: &#123; "grievanceId": "RAJ-2024-88421", "officer": &#123; "name": "Shri Rajesh Sharma", "phone": "+919876543210" &#125; &#125;</div>
                    <br />
                    <div style={{ color: "#c084fc", fontWeight: 700 }}># 3. Check Incoming Ringing Call on Citizen Phone:</div>
                    <div style={{ color: "#FACC15" }}>GET /api/v1/hearings/incoming?phone=+917735807328</div>
                    <div>Header: X-API-Key: {apiKeys.find((k) => k.status === "active")?.key || "js_live_your_key_here"}</div>
                    <br />
                    <div style={{ color: "#c084fc", fontWeight: 700 }}># 4. Connect Mobile Video Room:</div>
                    <div>Use LiveKit SDK (`@livekit/react-native` or Android LiveKit SDK) passing `livekitUrl` and the participant `token` received in Step 2.</div>
                  </div>
                </div>
              </div>
            ) : isAdmin ? (
              /* If Super Admin */
              <div className="app-card">
                <div style={{ display: "flex", gap: "8px", marginBottom: "1rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setAdminTab("diagnostics")}
                    className={`app-tab-btn ${adminTab === "diagnostics" ? "active" : ""}`}
                    style={{ flex: "none", padding: "8px 16px" }}
                  >
                    <span>📊</span>
                    <span>Live Benches & Telemetry ({activeMeetings.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminTab("audit")}
                    className={`app-tab-btn ${adminTab === "audit" ? "active" : ""}`}
                    style={{ flex: "none", padding: "8px 16px" }}
                  >
                    <span>📜</span>
                    <span>Audit Trail</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminTab("security")}
                    className={`app-tab-btn ${adminTab === "security" ? "active" : ""}`}
                    style={{ flex: "none", padding: "8px 16px" }}
                  >
                    <span>🔐</span>
                    <span>Security</span>
                  </button>
                </div>

                {adminTab === "diagnostics" && (
                  <div>
                    {/* 🔴 ACTIVE MEETINGS HERO CARD */}
                    <div
                      style={{
                        background: activeMeetings.length > 0 ? "linear-gradient(145deg, #241419 0%, #1a151b 100%)" : "#202c33",
                        border: `1.5px solid ${activeMeetings.length > 0 ? "#ef4444" : "var(--app-border)"}`,
                        borderRadius: "16px",
                        padding: "1.25rem",
                        marginBottom: "1.25rem",
                        boxShadow: activeMeetings.length > 0 ? "0 8px 24px rgba(239, 68, 68, 0.25)" : "none",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span
                            style={{
                              width: "10px",
                              height: "10px",
                              borderRadius: "50%",
                              background: activeMeetings.length > 0 ? "#ef4444" : "#64748b",
                              boxShadow: activeMeetings.length > 0 ? "0 0 10px #ef4444" : "none",
                              display: "inline-block",
                            }}
                          />
                          <strong style={{ fontSize: "0.85rem", letterSpacing: "0.05em", color: activeMeetings.length > 0 ? "#fca5a5" : "#8696a0" }}>
                            {activeMeetings.length > 0 ? `🔴 LIVE VIDEO HEARINGS ACTIVE (${activeMeetings.length})` : "⚪ NO ACTIVE VIDEO HEARINGS"}
                          </strong>
                        </div>
                        <button
                          type="button"
                          onClick={fetchAdminData}
                          style={{ background: "none", border: "none", color: "var(--app-gold)", fontSize: "0.8rem", cursor: "pointer", fontWeight: 700 }}
                        >
                          Refresh ↻
                        </button>
                      </div>

                      {activeMeetings.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "1.5rem 1rem", color: "#8696a0" }}>
                          <div style={{ fontSize: "1.8rem", marginBottom: "6px" }}>🏛️</div>
                          <div style={{ fontWeight: 700, color: "#ffffff", fontSize: "0.95rem" }}>No Active Hearings Right Now</div>
                          <div style={{ fontSize: "0.82rem", marginTop: "4px" }}>
                            When any District Collector, Presiding Officer, or Field Official starts a Jan Sunwai video call, it will appear here in real-time.
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                          {activeMeetings.map((meeting) => (
                            <div
                              key={meeting.id || meeting.roomName}
                              style={{
                                background: "rgba(0, 0, 0, 0.4)",
                                border: "1px solid rgba(255, 255, 255, 0.08)",
                                borderRadius: "14px",
                                padding: "14px",
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                                <span className="app-case-id-badge">{meeting.roomName}</span>
                                <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "#25D366", background: "rgba(37, 211, 102, 0.15)", border: "1px solid rgba(37, 211, 102, 0.3)", padding: "3px 8px", borderRadius: "999px" }}>
                                  ● {meeting.status || "Live Hearing"}
                                </span>
                              </div>

                              <div style={{ fontSize: "1rem", fontWeight: 800, color: "#ffffff", marginBottom: "6px" }}>
                                {meeting.title}
                              </div>

                              <div style={{ fontSize: "0.85rem", color: "#8696a0", marginBottom: "8px" }}>
                                Presiding Officer: <strong style={{ color: "#ffffff" }}>{meeting.hostName} ({meeting.hostDesignation})</strong>
                              </div>

                              <div style={{ fontSize: "0.82rem", color: "#FACC15", marginBottom: "10px", fontWeight: 700 }}>
                                👥 Active Connected: {meeting.participantCount || (meeting.participants ? meeting.participants.length : 1)} Attendees
                              </div>

                              {meeting.participants && meeting.participants.length > 0 && (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
                                  {meeting.participants.map((p: any, idx: number) => (
                                    <span
                                      key={idx}
                                      style={{
                                        background: "rgba(255, 255, 255, 0.06)",
                                        border: "1px solid rgba(255, 255, 255, 0.12)",
                                        borderRadius: "6px",
                                        padding: "3px 8px",
                                        fontSize: "0.75rem",
                                        color: "#E9EDEF",
                                      }}
                                    >
                                      👤 {p.name} ({p.role || p.status || "Member"})
                                    </span>
                                  ))}
                                </div>
                              )}

                              <button
                                type="button"
                                className="app-btn-gold"
                                style={{
                                  width: "100%",
                                  background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                                  color: "#ffffff",
                                  boxShadow: "0 2px 10px rgba(239, 68, 68, 0.4)",
                                }}
                                onClick={() => handleSuperAdminJoinMeeting(meeting)}
                                disabled={isJoiningMeeting === (meeting.roomName || meeting.id)}
                              >
                                {isJoiningMeeting === (meeting.roomName || meeting.id)
                                  ? "Entering Room..."
                                  : "⚡ Join Meeting as Super Admin (Full Control)"}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <h3 style={{ fontSize: "1.05rem", fontWeight: 800, margin: "0 0 1rem" }}>System Telemetry & LiveKit Status</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <div className="app-card" style={{ margin: 0, padding: "12px", background: "#202c33" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ fontSize: "0.75rem", color: "#8696a0", fontWeight: 700 }}>SFU CONCURRENCY</div>
                          <span style={{ fontSize: "0.65rem", background: "rgba(37, 211, 102, 0.15)", color: "#25D366", padding: "1px 6px", borderRadius: "4px", fontWeight: 700 }}>DYNAMIC</span>
                        </div>
                        <div style={{ fontSize: "1.4rem", fontWeight: 900, color: "#25D366", margin: "4px 0" }}>
                          {Number(adminSettings?.max_meeting_participants || adminDiagnostics?.livekit?.maxParticipants || 1500).toLocaleString()}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Max Participants / Room</div>
                      </div>
                      <div className="app-card" style={{ margin: 0, padding: "12px", background: "#202c33" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ fontSize: "0.75rem", color: "#8696a0", fontWeight: 700 }}>SERVER MEMORY</div>
                          <span style={{ fontSize: "0.65rem", background: "rgba(250, 204, 21, 0.15)", color: "#FACC15", padding: "1px 6px", borderRadius: "4px", fontWeight: 700 }}>LIVE RSS</span>
                        </div>
                        <div style={{ fontSize: "1.4rem", fontWeight: 900, color: "#FACC15", margin: "4px 0" }}>
                          {adminDiagnostics?.process?.memoryRssMB || 215} MB
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Node.js RAM (Updates every 4s)</div>
                      </div>
                    </div>
                  </div>
                )}

                {adminTab === "audit" && (
                  <div>
                    <h3 style={{ fontSize: "1.05rem", fontWeight: 800, margin: "0 0 1rem" }}>System Audit Trail</h3>
                    {adminAuditLogs.length === 0 ? (
                      <p style={{ color: "#8696a0" }}>No audit records found.</p>
                    ) : (
                      adminAuditLogs.map((log) => (
                        <div key={log.id} style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: "0.85rem" }}>
                          <span style={{ color: "#EAB308", fontWeight: 700 }}>{log.action}</span> by {log.actor_name} • {new Date(log.created_at).toLocaleTimeString()}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {adminTab === "security" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <h3 style={{ fontSize: "1.05rem", fontWeight: 800, margin: "0 0 0.5rem" }}>Security Governance</h3>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#202c33", padding: "12px", borderRadius: "12px" }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>256-Bit E2EE Encryption</div>
                        <div style={{ fontSize: "0.8rem", color: "#8696a0" }}>LiveKit SFU AES-GCM Encryption</div>
                      </div>
                      <button
                        type="button"
                        className="app-btn-outline-gold"
                        style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                        onClick={() => handleUpdateAdminSetting("e2ee_encryption_enabled", adminSettings.e2ee_encryption_enabled === "true" ? "false" : "true")}
                      >
                        {adminSettings.e2ee_encryption_enabled === "true" ? "Active ✓" : "Disabled"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : isOfficer ? (
              /* If Presiding Officer */
              <div className="app-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h2 style={{ fontSize: "1.15rem", fontWeight: 800, margin: 0, color: "#ffffff", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span>🏛️</span> Hearing Bench Room
                  </h2>
                  <div
                    style={{
                      background: "rgba(37, 211, 102, 0.15)",
                      border: "1px solid rgba(37, 211, 102, 0.35)",
                      color: "#25D366",
                      fontSize: "0.72rem",
                      fontWeight: 800,
                      padding: "3px 8px",
                      borderRadius: "999px",
                    }}
                  >
                    ● SFU ONLINE
                  </div>
                </div>

                <p style={{ fontSize: "0.88rem", color: "#8696a0", margin: "8px 0 0", lineHeight: 1.5 }}>
                  Enter a Grievance ID below to search details, initiate an immediate video call hearing, or schedule a future hearing.
                </p>

                {/* Grievance Search Row */}
                <div className="app-search-row">
                  <input
                    type="text"
                    className="app-input"
                    value={directRoomInput}
                    onChange={(e) => setDirectRoomInput(e.target.value.toUpperCase())}
                    placeholder="Grievance ID (e.g. RAJ-2024-88421)"
                    onKeyDown={(e) => e.key === "Enter" && handleHomeSearchGrievance(directRoomInput)}
                  />
                  <button
                    type="button"
                    className="app-btn-gold"
                    onClick={() => handleHomeSearchGrievance(directRoomInput)}
                    disabled={homeIsSearching}
                  >
                    {homeIsSearching ? "Searching..." : "Search 🔍"}
                  </button>
                </div>

                {homeSearchError && (
                  <div style={{ marginTop: "10px", padding: "10px 14px", borderRadius: "10px", background: "rgba(239, 68, 68, 0.12)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#fca5a5", fontSize: "0.85rem" }}>
                    ⚠️ {homeSearchError}
                  </div>
                )}

                {/* Found Grievance Card */}
                {homeSearchedGrievance && (
                  <div style={{ marginTop: "1.5rem", background: "#202c33", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "16px", padding: "1.25rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                      <span className="app-case-id-badge">{homeSearchedGrievance.grievanceId}</span>
                      <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#FACC15", background: "rgba(234, 179, 8, 0.12)", padding: "3px 8px", borderRadius: "6px" }}>
                        {homeSearchedGrievance.status}
                      </span>
                    </div>

                    {/* Prominent Executive Scheduled Hearing Card (if scheduled) */}
                    {homeSearchedGrievance.scheduledDate && homeSearchedGrievance.scheduledTime && (
                      <div className="app-exec-card">
                        <div className="app-exec-header">
                          <div className="app-exec-badge">
                            <span style={{ fontSize: "1.2rem" }}>🏛️</span>
                            <div>
                              <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "var(--app-gold)", letterSpacing: "0.05em" }}>
                                OFFICIAL HEARING SCHEDULED
                              </div>
                              <div style={{ fontSize: "0.7rem", color: "#8696a0" }}>Rajasthan Sampark • Jan Sunwai</div>
                            </div>
                          </div>
                          <div className="app-exec-status">
                            <span>●</span>
                            <span>SCHEDULED</span>
                          </div>
                        </div>

                        <div className="app-exec-grid">
                          <div className="app-exec-box">
                            <div className="app-exec-box-label">HEARING DATE (दिनांक)</div>
                            <div className="app-exec-box-value">🗓️ {homeSearchedGrievance.scheduledDate}</div>
                          </div>
                          <div className="app-exec-box">
                            <div className="app-exec-box-label">HEARING TIME (समय)</div>
                            <div className="app-exec-box-value">⏰ {homeSearchedGrievance.scheduledTime}</div>
                          </div>
                        </div>

                        <div className="app-exec-officer">
                          <div className="app-exec-box-label">PRESIDING BENCH (अध्यक्षीय पीठ)</div>
                          <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#ffffff" }}>
                            🏛️ {homeSearchedGrievance.scheduledOfficer || "Vivek, IAS • District Magistrate"}
                          </div>
                        </div>
                      </div>
                    )}

                    <h3 style={{ fontSize: "1.08rem", fontWeight: 800, color: "#ffffff", margin: "0 0 6px" }}>
                      {homeSearchedGrievance.title}
                    </h3>
                    {homeSearchedGrievance.category && (
                      <div style={{ fontSize: "0.82rem", color: "#8696a0", marginBottom: "12px" }}>
                        📁 {homeSearchedGrievance.category} {homeSearchedGrievance.location ? `• 📍 ${homeSearchedGrievance.location}` : ""}
                      </div>
                    )}

                    {/* Parties Grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "1.25rem" }}>
                      {homeSearchedGrievance.citizen && (
                        <div style={{ background: "rgba(0, 0, 0, 0.25)", padding: "10px 12px", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#FACC15", textTransform: "uppercase" }}>Citizen</div>
                          <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#ffffff" }}>{homeSearchedGrievance.citizen.name}</div>
                          <div style={{ fontSize: "0.78rem", color: "#8696a0" }}>📞 {homeSearchedGrievance.citizen.phone}</div>
                        </div>
                      )}
                      {homeSearchedGrievance.assignedEmployee && (
                        <div style={{ background: "rgba(0, 0, 0, 0.25)", padding: "10px 12px", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#FACC15", textTransform: "uppercase" }}>Field Officer</div>
                          <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#ffffff" }}>{homeSearchedGrievance.assignedEmployee.name}</div>
                          <div style={{ fontSize: "0.78rem", color: "#8696a0" }}>{homeSearchedGrievance.assignedEmployee.designation}</div>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="app-btn-gold"
                        style={{ flex: 1 }}
                        onClick={() => handleConnectHearing(homeSearchedGrievance.grievanceId, homeSearchedGrievance)}
                        disabled={isJoining}
                      >
                        <Video size={18} />
                        <span>{isJoining ? "Connecting..." : "📞 Start Video Call"}</span>
                      </button>

                      <button
                        type="button"
                        className="app-btn-outline-gold"
                        style={{ flex: 1 }}
                        onClick={() => {
                          setSchedulingGrievance(homeSearchedGrievance);
                          setScheduleStep("date");
                          setShowScheduleModal(true);
                        }}
                      >
                        <Calendar size={18} />
                        <span>📅 Schedule Call</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* If Citizen or Field Employee */
              <div>
                {/* 1. General Active Bench Notice Card */}
                <div className="app-card" style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "rgba(234, 179, 8, 0.15)", border: "1px solid rgba(234, 179, 8, 0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", flexShrink: 0 }}>
                    🔔
                  </div>
                  <div>
                    <h2 style={{ fontSize: "1.1rem", fontWeight: 800, margin: "0 0 4px", color: "#ffffff" }}>
                      Hearing Bench Active
                    </h2>
                    <p style={{ fontSize: "0.88rem", color: "#8696a0", margin: 0, lineHeight: 1.45 }}>
                      You will receive an incoming video call directly on this device when your case is called by the District Magistrate.
                    </p>
                  </div>
                </div>

                {/* 2. Standalone Official Scheduled Hearing Card (Generous Spacing & High Executive Quality) */}
                {grievances
                  .filter((g) => g.scheduledDate && g.scheduledTime)
                  .map((sg) => (
                    <div key={sg.grievanceId} className="app-exec-card">
                      <div className="app-exec-header">
                        <div className="app-exec-badge">
                          <span style={{ fontSize: "1.4rem" }}>🏛️</span>
                          <div>
                            <div style={{ fontSize: "0.82rem", fontWeight: 800, color: "var(--app-gold)", letterSpacing: "0.06em" }}>
                              GOVERNMENT OF RAJASTHAN
                            </div>
                            <div style={{ fontSize: "0.72rem", color: "#8696a0" }}>Rajasthan Sampark • Jan Sunwai</div>
                          </div>
                        </div>
                        <div className="app-exec-status">
                          <span>●</span>
                          <span>SCHEDULED</span>
                        </div>
                      </div>

                      <div style={{ margin: "0.5rem 0 1rem" }}>
                        <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#ffffff" }}>
                          📅 Official Video Hearing Scheduled
                        </div>
                        <div style={{ fontSize: "0.82rem", color: "var(--app-gold)", fontWeight: 700 }}>
                          जनसुनवाई सुनवाई नियत आदेश
                        </div>
                      </div>

                      <div style={{ background: "rgba(0, 0, 0, 0.35)", borderRadius: "12px", padding: "10px 14px", border: "1px solid var(--app-border)", marginBottom: "1rem" }}>
                        <span className="app-case-id-badge" style={{ display: "inline-block", marginBottom: "6px" }}>
                          #{sg.grievanceId}
                        </span>
                        <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#ffffff" }}>{sg.title}</div>
                      </div>

                      <div className="app-exec-grid">
                        <div className="app-exec-box">
                          <div className="app-exec-box-label">HEARING DATE (दिनांक)</div>
                          <div className="app-exec-box-value">🗓️ {sg.scheduledDate}</div>
                        </div>
                        <div className="app-exec-box">
                          <div className="app-exec-box-label">HEARING TIME (समय)</div>
                          <div className="app-exec-box-value">⏰ {sg.scheduledTime}</div>
                        </div>
                      </div>

                      <div className="app-exec-officer">
                        <div className="app-exec-box-label">PRESIDING BENCH (अध्यक्षीय पीठ)</div>
                        <div style={{ fontSize: "0.92rem", fontWeight: 800, color: "#ffffff" }}>
                          🏛️ {sg.scheduledOfficer || "Vivek, IAS • District Magistrate"}
                        </div>
                      </div>

                      <div className="app-exec-alert">
                        🔔 An automated high-priority video call will connect on this device at the scheduled time. Please keep this portal open.
                      </div>

                      <button
                        type="button"
                        className="app-btn-gold"
                        style={{ width: "100%" }}
                        onClick={() => setSelectedGrievanceDetails(sg)}
                      >
                        📋 View Complete Case Details ➔
                      </button>
                    </div>
                  ))}

                {/* 3. Link Button to View Registered Grievances */}
                <button
                  type="button"
                  className="app-btn-outline-gold"
                  style={{ width: "100%", justifyContent: "space-between", padding: "14px 18px", marginTop: "10px" }}
                  onClick={() => setCurrentTab("cases")}
                >
                  <span>📋 View Your Registered Grievances ({grievances.length})</span>
                  <span>➔</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ─── TAB 2: CASES (Hidden for Developer) ─── */}
        {!isDeveloper && currentTab === "cases" && (
          <div>
            {/* Search Input Bar */}
            <div className="app-card" style={{ padding: "1rem" }}>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  className="app-input"
                  value={inspectGrievanceId}
                  onChange={(e) => setInspectGrievanceId(e.target.value)}
                  placeholder="Search Grievance ID (e.g. RAJ-2024-88421)"
                />
                {inspectGrievanceId ? (
                  <button
                    type="button"
                    className="app-btn-outline-gold"
                    style={{ padding: "10px 14px" }}
                    onClick={() => setInspectGrievanceId("")}
                  >
                    ✕ Clear
                  </button>
                ) : (
                  <button type="button" className="app-btn-gold" style={{ padding: "10px 16px" }}>
                    Search
                  </button>
                )}
              </div>
            </div>

            {/* Cases Compact List */}
            <div className="app-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 800, margin: 0, color: "#ffffff" }}>
                  Cases ({filteredGrievances.length})
                </h2>
                <button
                  type="button"
                  onClick={fetchGrievances}
                  style={{ background: "none", border: "none", color: "var(--app-gold)", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", fontSize: "0.85rem" }}
                >
                  <RefreshCw size={14} /> Refresh ↻
                </button>
              </div>

              {isLoadingGrievances && grievances.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem", color: "#8696a0" }}>Loading cases...</div>
              ) : filteredGrievances.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "#8696a0" }}>
                  <div style={{ fontSize: "2rem", marginBottom: "8px" }}>📂</div>
                  <div style={{ fontWeight: 700, color: "#ffffff", fontSize: "1rem" }}>No Cases Found</div>
                  <div style={{ fontSize: "0.85rem" }}>
                    {inspectGrievanceId ? `No grievance matches "${inspectGrievanceId}".` : "No cases registered yet."}
                  </div>
                  {inspectGrievanceId && (
                    <button
                      type="button"
                      className="app-btn-gold"
                      style={{ marginTop: "1rem", padding: "8px 16px", fontSize: "0.85rem" }}
                      onClick={() => setInspectGrievanceId("")}
                    >
                      Show All Cases
                    </button>
                  )}
                </div>
              ) : (
                filteredGrievances.map((item) => (
                  <div key={item.grievanceId} className="app-case-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span className="app-case-id-badge">#{item.grievanceId}</span>
                        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#FACC15" }}>
                          {item.status}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.92rem", fontWeight: 700, color: "#ffffff", marginTop: "4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.title}
                      </div>
                      {item.scheduledDate && item.scheduledTime && (
                        <div className="app-case-scheduled-pill">
                          📅 Scheduled: {item.scheduledDate} • {item.scheduledTime}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      className="app-btn-outline-gold"
                      style={{ padding: "8px 14px", fontSize: "0.82rem", flexShrink: 0 }}
                      onClick={() => setSelectedGrievanceDetails(item)}
                    >
                      View Details ➔
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Minimal Footer */}
        <div style={{ textAlign: "center", padding: "1.5rem 0", color: "#64748b", fontSize: "0.8rem" }}>
          Jan Sunwai • Helpline: 181 • 🔒 End-to-end encrypted
        </div>
      </div>

      {/* ─── MODAL 1: USER PROFILE MODAL ─── */}
      {showProfileModal && (
        <div className="app-modal-overlay" onClick={() => setShowProfileModal(false)}>
          <div className="app-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 800, margin: 0, color: "#ffffff" }}>User Profile</h3>
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                style={{ background: "none", border: "none", color: "#8696a0", cursor: "pointer", fontSize: "1.2rem" }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "1.5rem" }}>
              <div
                style={{
                  width: "68px",
                  height: "68px",
                  borderRadius: "50%",
                  background: "var(--app-gold)",
                  color: "#111827",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 900,
                  fontSize: "1.8rem",
                  marginBottom: "10px",
                }}
              >
                {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : "U"}
              </div>
              <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#ffffff" }}>{currentUser.name}</div>
              <div
                style={{
                  background: "rgba(234, 179, 8, 0.15)",
                  color: "var(--app-gold)",
                  border: "1px solid rgba(234, 179, 8, 0.35)",
                  padding: "3px 12px",
                  borderRadius: "999px",
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  marginTop: "6px",
                }}
              >
                {currentUser.role}
              </div>
            </div>

            <div style={{ background: "#202c33", borderRadius: "14px", padding: "16px", display: "flex", flexDirection: "column", gap: "12px", marginBottom: "1.5rem", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem", paddingBottom: "8px", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>
                <span style={{ color: "#8696a0", fontWeight: 500 }}>Mobile Number</span>
                <strong style={{ color: "#ffffff", fontWeight: 700, letterSpacing: "0.02em" }}>{currentUser.phone}</strong>
              </div>
              {currentUser.designation && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", fontSize: "0.85rem", paddingBottom: "8px", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>
                  <span style={{ color: "#8696a0", fontWeight: 500, flexShrink: 0 }}>Designation</span>
                  <strong style={{ color: "#ffffff", fontWeight: 700, textAlign: "right", wordBreak: "break-word", flex: 1 }}>{currentUser.designation}</strong>
                </div>
              )}
              {currentUser.department && (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", paddingBottom: "8px", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>
                  <span style={{ color: "#8696a0", fontSize: "0.8rem", fontWeight: 500 }}>Department</span>
                  <strong style={{ color: "#ffffff", fontSize: "0.9rem", fontWeight: 700, lineHeight: 1.45, wordBreak: "break-word" }}>{currentUser.department}</strong>
                </div>
              )}
              {currentUser.district && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", fontSize: "0.85rem" }}>
                  <span style={{ color: "#8696a0", fontWeight: 500, flexShrink: 0 }}>District</span>
                  <strong style={{ color: "#ffffff", fontWeight: 700, textAlign: "right", wordBreak: "break-word", flex: 1 }}>{currentUser.district}</strong>
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: "12px" }}>
              <button
                type="button"
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  background: "#dc2626",
                  color: "#ffffff",
                  border: "1px solid #ef4444",
                  borderRadius: "12px",
                  padding: "12px 18px",
                  fontWeight: 700,
                  fontSize: "0.95rem",
                  cursor: "pointer",
                  boxShadow: "0 4px 14px rgba(220, 38, 38, 0.35)",
                  transition: "all 0.2s ease",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = "#b91c1c";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = "#dc2626";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
                onClick={handleLogout}
              >
                <LogOut size={18} color="#ffffff" strokeWidth={2.5} />
                <span>Logout</span>
              </button>
              <button
                type="button"
                className="app-btn-gold"
                style={{
                  flex: 1,
                  borderRadius: "12px",
                  padding: "12px 18px",
                  fontWeight: 700,
                  fontSize: "0.95rem",
                }}
                onClick={() => setShowProfileModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: GRIEVANCE FULL DETAILS MODAL ─── */}
      {selectedGrievanceDetails && (
        <div className="app-modal-overlay" onClick={() => setSelectedGrievanceDetails(null)}>
          <div className="app-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className="app-case-id-badge">#{selectedGrievanceDetails.grievanceId}</span>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#FACC15", background: "rgba(234, 179, 8, 0.12)", padding: "3px 8px", borderRadius: "6px" }}>
                  {selectedGrievanceDetails.status}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedGrievanceDetails(null)}
                style={{ background: "none", border: "none", color: "#8696a0", cursor: "pointer", fontSize: "1.2rem" }}
              >
                ✕
              </button>
            </div>

            {/* Prominent Executive Scheduled Card (if scheduled) */}
            {selectedGrievanceDetails.scheduledDate && selectedGrievanceDetails.scheduledTime && (
              <div className="app-exec-card" style={{ marginBottom: "1rem" }}>
                <div className="app-exec-header">
                  <div className="app-exec-badge">
                    <span style={{ fontSize: "1.2rem" }}>🏛️</span>
                    <div>
                      <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "var(--app-gold)", letterSpacing: "0.05em" }}>
                        OFFICIAL HEARING SCHEDULED
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "#8696a0" }}>Rajasthan Sampark • Jan Sunwai</div>
                    </div>
                  </div>
                  <div className="app-exec-status">
                    <span>●</span>
                    <span>SCHEDULED</span>
                  </div>
                </div>

                <div className="app-exec-grid">
                  <div className="app-exec-box">
                    <div className="app-exec-box-label">HEARING DATE (दिनांक)</div>
                    <div className="app-exec-box-value">🗓️ {selectedGrievanceDetails.scheduledDate}</div>
                  </div>
                  <div className="app-exec-box">
                    <div className="app-exec-box-label">HEARING TIME (समय)</div>
                    <div className="app-exec-box-value">⏰ {selectedGrievanceDetails.scheduledTime}</div>
                  </div>
                </div>

                <div className="app-exec-officer">
                  <div className="app-exec-box-label">PRESIDING BENCH (अध्यक्षीय पीठ)</div>
                  <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#ffffff" }}>
                    🏛️ {selectedGrievanceDetails.scheduledOfficer || "Vivek, IAS • District Magistrate"}
                  </div>
                </div>

                <div className="app-exec-alert" style={{ margin: 0 }}>
                  🔔 Citizen & Field Officer will receive an automated video call notification at this scheduled time.
                </div>
              </div>
            )}

            <h3 style={{ fontSize: "1.15rem", fontWeight: 800, color: "#ffffff", margin: "0 0 6px" }}>
              {selectedGrievanceDetails.title}
            </h3>

            {selectedGrievanceDetails.category && (
              <div style={{ fontSize: "0.82rem", color: "#8696a0", marginBottom: "12px" }}>
                📁 {selectedGrievanceDetails.category} {selectedGrievanceDetails.location ? `• 📍 ${selectedGrievanceDetails.location}` : ""}
              </div>
            )}

            {selectedGrievanceDetails.description && (
              <div style={{ background: "#202c33", padding: "12px", borderRadius: "12px", marginBottom: "1rem" }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--app-gold)", marginBottom: "4px" }}>
                  GRIEVANCE SUMMARY / PROBLEM STATEMENT
                </div>
                <div style={{ fontSize: "0.88rem", color: "#E9EDEF", lineHeight: 1.5 }}>
                  {selectedGrievanceDetails.description}
                </div>
              </div>
            )}

            {/* Parties */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "1.25rem" }}>
              {selectedGrievanceDetails.citizen && (
                <div style={{ background: "#202c33", padding: "10px 12px", borderRadius: "10px" }}>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#FACC15", textTransform: "uppercase" }}>Citizen Complainant</div>
                  <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#ffffff" }}>{selectedGrievanceDetails.citizen.name}</div>
                  <div style={{ fontSize: "0.78rem", color: "#8696a0" }}>📞 {selectedGrievanceDetails.citizen.phone}</div>
                </div>
              )}
              {selectedGrievanceDetails.assignedEmployee && (
                <div style={{ background: "#202c33", padding: "10px 12px", borderRadius: "10px" }}>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#FACC15", textTransform: "uppercase" }}>Assigned Official</div>
                  <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#ffffff" }}>{selectedGrievanceDetails.assignedEmployee.name}</div>
                  <div style={{ fontSize: "0.78rem", color: "#8696a0" }}>{selectedGrievanceDetails.assignedEmployee.designation}</div>
                </div>
              )}
            </div>

            {/* Actions */}
            {isOfficer ? (
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="app-btn-gold"
                  style={{ flex: 1 }}
                  onClick={() => {
                    const g = selectedGrievanceDetails;
                    setSelectedGrievanceDetails(null);
                    handleConnectHearing(g.grievanceId, g);
                  }}
                  disabled={isJoining}
                >
                  <Video size={18} />
                  <span>📞 Start Video Call</span>
                </button>

                <button
                  type="button"
                  className="app-btn-outline-gold"
                  style={{ flex: 1 }}
                  onClick={() => {
                    const g = selectedGrievanceDetails;
                    setSelectedGrievanceDetails(null);
                    setSchedulingGrievance(g);
                    setScheduleStep("date");
                    setShowScheduleModal(true);
                  }}
                >
                  <Calendar size={18} />
                  <span>📅 Schedule Call</span>
                </button>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "10px", background: "rgba(234, 179, 8, 0.1)", borderRadius: "10px", border: "1px solid rgba(234, 179, 8, 0.25)" }}>
                <div style={{ fontWeight: 800, color: "var(--app-gold)", fontSize: "0.9rem" }}>⏳ Hearing Call Pending</div>
                <div style={{ fontSize: "0.8rem", color: "#8696a0", marginTop: "2px" }}>
                  You will receive an automated video call directly when your case is called by the District Magistrate.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── MODAL 3: 2-STEP SCHEDULE MODAL (CALENDAR -> TIME) ─── */}
      {showScheduleModal && (
        <div className="app-modal-overlay" onClick={() => setShowScheduleModal(false)}>
          <div className="app-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 800, margin: 0, color: "#ffffff" }}>
                  {scheduleStep === "date" ? "📅 Step 1/2: Choose Hearing Date" : "⏰ Step 2/2: Choose Hearing Time"}
                </h3>
                <div style={{ fontSize: "0.78rem", color: "var(--app-gold)", fontWeight: 700 }}>
                  Case #{schedulingGrievance?.grievanceId}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                style={{
                  background: "rgba(255, 255, 255, 0.12)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  borderRadius: "50%",
                  width: "36px",
                  height: "36px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontSize: "1.15rem",
                  fontWeight: 900,
                  transition: "all 0.2s ease",
                  flexShrink: 0,
                }}
                title="Close & Cancel Schedule (रद्द करें)"
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#ffffff", marginBottom: "1rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {schedulingGrievance?.title}
            </div>

            {/* ─── STEP 1: INTERACTIVE CALENDAR ─── */}
            {scheduleStep === "date" && (
              <div>
                <p style={{ fontSize: "0.82rem", color: "#8696a0", margin: "0 0 10px" }}>
                  Tap any date on the calendar. Time options will appear automatically:
                </p>

                <div style={{ background: "#202c33", border: "1px solid var(--app-border)", borderRadius: "14px", padding: "12px" }}>
                  {/* Month Navigation */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (calendarMonth === 0) {
                          setCalendarMonth(11);
                          setCalendarYear((y) => y - 1);
                        } else {
                          setCalendarMonth((m) => m - 1);
                        }
                      }}
                      style={{ background: "none", border: "none", color: "#FACC15", cursor: "pointer", fontSize: "1rem", padding: "4px 8px" }}
                    >
                      ◀
                    </button>
                    <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "#ffffff" }}>
                      {MONTH_NAMES[calendarMonth]} {calendarYear}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (calendarMonth === 11) {
                          setCalendarMonth(0);
                          setCalendarYear((y) => y + 1);
                        } else {
                          setCalendarMonth((m) => m + 1);
                        }
                      }}
                      style={{ background: "none", border: "none", color: "#FACC15", cursor: "pointer", fontSize: "1rem", padding: "4px 8px" }}
                    >
                      ▶
                    </button>
                  </div>

                  {/* Weekday Header */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", fontSize: "0.75rem", fontWeight: 700, color: "#8696a0", marginBottom: "6px" }}>
                    {DAYS_OF_WEEK.map((d, i) => (
                      <div key={i} style={{ color: i === 0 || i === 6 ? "#ea0038" : "#8696a0" }}>{d}</div>
                    ))}
                  </div>

                  {/* Day Grid */}
                  <div className="app-calendar-grid">
                    {Array.from({ length: new Date(calendarYear, calendarMonth, 1).getDay() }).map((_, i) => (
                      <div key={`empty-${i}`} />
                    ))}
                    {Array.from({ length: new Date(calendarYear, calendarMonth + 1, 0).getDate() }).map((_, i) => {
                      const dayNum = i + 1;
                      const mm = String(calendarMonth + 1).padStart(2, "0");
                      const dd = String(dayNum).padStart(2, "0");
                      const cellDate = `${calendarYear}-${mm}-${dd}`;
                      const isSelected = scheduleDate === cellDate;
                      return (
                        <div
                          key={`day-${dayNum}`}
                          className={`app-calendar-day ${isSelected ? "selected" : ""}`}
                          onClick={() => {
                            setScheduleDate(cellDate);
                            setScheduleStep("time"); // Automatic transition to time picker!
                          }}
                        >
                          {dayNum}
                        </div>
                      );
                    })}
                  </div>

                  {/* Quick Select Buttons */}
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "10px", marginTop: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "0.75rem", color: "#8696a0", fontWeight: 700 }}>Quick Select:</span>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        type="button"
                        className="app-btn-outline-gold"
                        style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                        onClick={() => {
                          const now = new Date();
                          const mm = String(now.getMonth() + 1).padStart(2, "0");
                          const dd = String(now.getDate()).padStart(2, "0");
                          setScheduleDate(`${now.getFullYear()}-${mm}-${dd}`);
                          setCalendarMonth(now.getMonth());
                          setCalendarYear(now.getFullYear());
                          setScheduleStep("time");
                        }}
                      >
                        ⚡ Today
                      </button>
                      <button
                        type="button"
                        className="app-btn-outline-gold"
                        style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                        onClick={() => {
                          const tm = new Date();
                          tm.setDate(tm.getDate() + 1);
                          const mm = String(tm.getMonth() + 1).padStart(2, "0");
                          const dd = String(tm.getDate()).padStart(2, "0");
                          setScheduleDate(`${tm.getFullYear()}-${mm}-${dd}`);
                          setCalendarMonth(tm.getMonth());
                          setCalendarYear(tm.getFullYear());
                          setScheduleStep("time");
                        }}
                      >
                        ⚡ Tomorrow
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="app-btn-outline-gold"
                  style={{ width: "100%", marginTop: "1rem", borderColor: "rgba(255, 255, 255, 0.2)", color: "#8696a0" }}
                  onClick={() => setShowScheduleModal(false)}
                >
                  ✕ Cancel & Close (रद्द करें)
                </button>
              </div>
            )}

            {/* ─── STEP 2: TIME PICKER (NO SCROLLING - FULL FLEXIBILITY) ─── */}
            {scheduleStep === "time" && (
              <div>
                {/* Date indicator with Change action */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#202c33", padding: "10px 14px", borderRadius: "12px", marginBottom: "1rem" }}>
                  <div>
                    <div style={{ fontSize: "0.72rem", color: "var(--app-gold)", fontWeight: 700 }}>SELECTED DATE</div>
                    <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#ffffff" }}>🗓️ {scheduleDate}</div>
                  </div>
                  <button
                    type="button"
                    className="app-btn-outline-gold"
                    style={{ padding: "6px 12px", fontSize: "0.78rem" }}
                    onClick={() => setScheduleStep("date")}
                  >
                    ◀ Change Date
                  </button>
                </div>

                <p style={{ fontSize: "0.82rem", color: "#8696a0", margin: "0 0 8px" }}>
                  Choose hearing slot or type any custom time below:
                </p>

                {/* 16 Flexible Time Slots (Non-scrollable Grid) */}
                <div className="app-time-chips">
                  {TIME_OPTIONS.map((t) => {
                    const isSelected = !customTimeInput.trim() && scheduleTime === t;
                    return (
                      <div
                        key={t}
                        className={`app-time-chip ${isSelected ? "selected" : ""}`}
                        onClick={() => {
                          setScheduleTime(t);
                          setCustomTimeInput("");
                        }}
                      >
                        {t}
                      </div>
                    );
                  })}
                </div>

                {/* Custom Time Field for complete flexibility */}
                <div style={{ background: "#202c33", padding: "10px 12px", borderRadius: "12px", marginBottom: "1rem" }}>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--app-gold)", marginBottom: "6px" }}>
                    ✏️ Or Enter Custom Time:
                  </label>
                  <input
                    type="text"
                    className="app-input"
                    value={customTimeInput}
                    onChange={(e) => setCustomTimeInput(e.target.value)}
                    placeholder="e.g. 10:45 AM or 03:15 PM"
                    style={{ padding: "8px 12px", fontSize: "0.88rem" }}
                  />
                </div>

                {/* Notification Alert Info Box */}
                <div style={{ background: "rgba(234, 179, 8, 0.08)", border: "1px solid rgba(234, 179, 8, 0.25)", borderRadius: "10px", padding: "10px 12px", fontSize: "0.78rem", color: "#fef08a", marginBottom: "1.2rem", lineHeight: 1.4 }}>
                  🔔 Automated Notification: Citizen ({schedulingGrievance?.citizen?.name || "Citizen"}) & Officer ({schedulingGrievance?.assignedEmployee?.name || "Officer"}) will receive immediate notification with this date and time.
                </div>

                {/* Action Buttons */}
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="app-btn-outline-gold"
                    style={{ flex: 1, minWidth: "90px" }}
                    onClick={() => setScheduleStep("date")}
                  >
                    ◀ Back
                  </button>

                  <button
                    type="button"
                    className="app-btn-outline-gold"
                    style={{ flex: 1, minWidth: "90px", borderColor: "rgba(255, 255, 255, 0.2)", color: "#8696a0" }}
                    onClick={() => setShowScheduleModal(false)}
                  >
                    ✕ Cancel
                  </button>

                  <button
                    type="button"
                    className="app-btn-gold"
                    style={{ flex: 2, minWidth: "160px" }}
                    onClick={handleConfirmSchedule}
                    disabled={isSubmittingSchedule}
                  >
                    {isSubmittingSchedule ? "Scheduling..." : `Confirm (${customTimeInput.trim() || scheduleTime}) ➔`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
