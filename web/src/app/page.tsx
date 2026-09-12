"use client";

/**
 * Jan Sunwai — Unified Video Call Platform
 *
 * Provides dedicated authenticated views for:
 * 1. Citizen Complainant (Waiting Room & Active Grievance Hearing)
 * 2. Field Employee / Officer (Duty Room & Assigned Cases)
 * 3. District Collector / Higher Officer (Hearing Dashboard, Call Control, Sampark Lookup)
 *
 * Includes:
 * - Mobile Number + OTP Login (with 1-click test personas for quick multi-device demos)
 * - Persistent session in localStorage
 * - Real-time WebSocket signaling on user's specific phone number
 * - WhatsApp-style incoming call ringing modal
 * - High-definition WebRTC video conference via LiveKit Cloud
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
  Sparkles,
  ArrowRight,
  Info,
} from "lucide-react";
import LiveKitVideoRoom from "@/components/LiveKitVideoRoom";
import IncomingCallModal, { stopAllRingtones } from "@/components/IncomingCallModal";

// ─── Types ────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  phone: string;
  name: string;
  role: "officer" | "employee" | "citizen";
  designation?: string;
  department?: string;
  district?: string;
  employeeCode?: string;
}

interface CitizenInfo {
  name: string;
  phone: string;
  village: string;
  district: string;
  tehsil: string;
}

interface EmployeeInfo {
  name: string;
  phone: string;
  designation: string;
  department: string;
  employeeCode: string;
  postingLocation: string;
}

interface GrievanceDetails {
  grievanceId: string;
  title: string;
  description: string;
  category: string;
  location: string;
  district: string;
  status: string;
  filedDate: string;
  lastUpdated: string;
  citizen: CitizenInfo;
  assignedEmployee: EmployeeInfo;
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

interface GrievanceListItem {
  grievanceId: string;
  title: string;
  location: string;
  district: string;
  status: string;
  category: string;
}

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

// ─── Demo Accounts for 1-Click Testing ────────────────────────

const QUICK_DEMO_USERS = [
  {
    name: "Janmejay Sethi",
    role: "citizen" as const,
    phone: "+917735807328",
    badge: "Citizen Complainant",
    desc: "Complainant for Grievance RAJ-2024-88421 (Water Supply Leak)",
    icon: "👤",
    color: "#2563eb",
  },
  {
    name: "Chandan",
    role: "employee" as const,
    phone: "+917749852013",
    badge: "Field Officer (PHED)",
    desc: "Junior Engineer assigned to Sanganer Jaipur",
    icon: "👷",
    color: "#d97706",
  },
  {
    name: "Sh. Alok Sharma, IAS",
    role: "officer" as const,
    phone: "+919414000001",
    badge: "District Collector & DM",
    desc: "District Administration, Jaipur (Hearing Presiding Officer)",
    icon: "🏛️",
    color: "#059669",
  },
  {
    name: "Mandal Sahoo",
    role: "citizen" as const,
    phone: "+918249884033",
    badge: "Citizen Complainant",
    desc: "Grievance RAJ-2024-71205 (Pension Delay)",
    icon: "👤",
    color: "#3b82f6",
  },
  {
    name: "Mrityunjay",
    role: "employee" as const,
    phone: "+919337453713",
    badge: "Patwari (Revenue Dept)",
    desc: "Revenue Department, Gudamalani Barmer",
    icon: "👷",
    color: "#b45309",
  },
];

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function JanSunwaiPortalPage() {
  // ─── Auth State ──────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  // Login form state (starts blank - user enters number manually)
  const [loginPhone, setLoginPhone] = useState("");
  const [loginOtp, setLoginOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [detectedRole, setDetectedRole] = useState<string | null>(null);
  const [detectedName, setDetectedName] = useState<string | null>(null);
  const [authError, setAuthError] = useState("");

  // ─── Grievance & Dashboard State ──────────────────────────────
  const [grievanceId, setGrievanceId] = useState("");
  const [grievance, setGrievance] = useState<GrievanceDetails | null>(null);
  const [grievanceList, setGrievanceList] = useState<GrievanceListItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [autoRecord, setAutoRecord] = useState(true);
  const [isCallInitiating, setIsCallInitiating] = useState(false);

  // User-specific grievances (Citizen / Field Officer)
  const [userGrievances, setUserGrievances] = useState<GrievanceDetails[]>([]);
  const [isLoadingUserGrievances, setIsLoadingUserGrievances] = useState(false);

  // New Grievance Modal State (SQLite)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmittingGrievance, setIsSubmittingGrievance] = useState(false);
  const [newGrievanceForm, setNewGrievanceForm] = useState({
    title: "",
    description: "",
    category: "Public Health Engineering (PHED) — Water Supply",
    location: "Ward 15, Sanganer",
    district: "Jaipur",
    citizenName: "",
    citizenPhone: "+91",
    employeeName: "",
    employeePhone: "+91",
    employeeDesignation: "Junior Engineer (JEn)",
    employeeDepartment: "PHED",
  });

  // Call history from SQLite
  const [callHistory, setCallHistory] = useState<any[]>([]);

  // Call state
  const [livekitConnection, setLivekitConnection] =
    useState<LiveKitConnection | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(
    null
  );

  // Mid-call Add Officer state
  const [showAddOfficer, setShowAddOfficer] = useState(false);
  const [officerSearchQuery, setOfficerSearchQuery] = useState("");
  const [officerResults, setOfficerResults] = useState<any[]>([]);
  const [isSearchingOfficers, setIsSearchingOfficers] = useState(false);
  const [availableDepartments, setAvailableDepartments] = useState<string[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");
  // External non-employee addition state
  const [addPersonTab, setAddPersonTab] = useState<"directory" | "custom">("directory");
  const [customPersonPhone, setCustomPersonPhone] = useState("");
  const [customPersonName, setCustomPersonName] = useState("");
  const [customPersonRole, setCustomPersonRole] = useState("Citizen / Complainant");
  const [isDialingCustom, setIsDialingCustom] = useState(false);

  // Hearing participants management state (allows Officer to eject specific individual)
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [hearingParticipants, setHearingParticipants] = useState<any[]>([]);
  const [isRemovingParticipant, setIsRemovingParticipant] = useState<string | null>(null);
  const [micBlockedWarning, setMicBlockedWarning] = useState<string | null>(null);

  // WebSocket
  const wsRef = useRef<WebSocket | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  // Toast
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);

  const showToast = useCallback(
    (message: string, type: "success" | "error" | "info" = "info") => {
      setToast({ message, type });
      setTimeout(() => setToast(null), 4000);
    },
    []
  );

  // Listen for custom toast and mic-blocked notifications from components
  useEffect(() => {
    const handleToastEvent = (e: any) => {
      if (e.detail?.message) {
        showToast(e.detail.message, e.detail.type || "info");
      }
    };
    const handleMicBlocked = (e: any) => {
      setMicBlockedWarning(e.detail?.message || "Microphone access is blocked by Windows privacy settings.");
    };
    window.addEventListener("jan-sunwai-toast", handleToastEvent);
    window.addEventListener("jan-sunwai-mic-blocked", handleMicBlocked);
    return () => {
      window.removeEventListener("jan-sunwai-toast", handleToastEvent);
      window.removeEventListener("jan-sunwai-mic-blocked", handleMicBlocked);
    };
  }, [showToast]);

  // Fetch departments from SQLite database
  const fetchDepartments = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/sampark/departments`);
      const data = await res.json();
      if (data.success && Array.isArray(data.departments)) {
        setAvailableDepartments(data.departments);
      }
    } catch (err) {
      console.error("Fetch departments error:", err);
    }
  }, []);

  // ─── Check Auth on Mount ─────────────────────────────────────
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        // If the browser URL has a stale trailing '?', clear it cleanly
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
    fetchDepartments();
  }, [fetchDepartments]);

  // ─── WebSocket Connection for Authenticated User ────────────
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
      console.log(`[WS] Connecting to ${url}`);
      const ws = new WebSocket(url);

      ws.onopen = () => {
        console.log(
          `[WS] Connected as ${currentUser.name} (${currentUser.phone})`
        );
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("[WS] Received:", data.type, data);

          switch (data.type) {
            case "incoming_call":
              setIncomingCall(data.data as IncomingCallData);
              break;
            case "call_accepted":
              showToast(
                `${data.data.participantName} joined the hearing`,
                "success"
              );
              window.dispatchEvent(new CustomEvent("jan-sunwai-refresh-participants"));
              break;
            case "participant_left":
              showToast(
                `${data.data.participantName || "A participant"} left the hearing`,
                "info"
              );
              window.dispatchEvent(new CustomEvent("jan-sunwai-refresh-participants"));
              break;
            case "participant_removed":
              stopAllRingtones();
              setIncomingCall(null);
              setLivekitConnection(null);
              showToast(
                "The Collector has ended your session in this hearing (जिला कलेक्टर द्वारा आपकी कॉल समाप्त की गई)",
                "info"
              );
              break;
            case "call_declined":
              stopAllRingtones();
              showToast(
                `${data.data.participantName} declined the call`,
                "error"
              );
              break;
            case "call_ended":
              stopAllRingtones();
              setIncomingCall(null);
              setLivekitConnection(null);
              showToast("Hearing ended", "info");
              break;
            case "connected":
              console.log("[WS] Server acknowledged connection");
              break;
          }
        } catch (err) {
          console.error("[WS] Error parsing message:", err);
        }
      };

      ws.onclose = () => {
        console.log("[WS] Disconnected");
        setWsConnected(false);
        if (active) {
          setTimeout(connectWs, 3000);
        }
      };

      ws.onerror = (err) => {
        console.error("[WS] Error:", err);
      };

      wsRef.current = ws;
    };

    connectWs();

    // Fast polling fallback: checks every 2.5s for any active call ringing for this phone
    // Ensures incoming call is received on laptop browser even if WebSocket disconnected or had network error
    const pollInterval = setInterval(async () => {
      if (!active || !currentUser) return;
      if (livekitConnection || incomingCall) return;
      try {
        const checkRes = await fetch(
          `${API_BASE}/api/calls/check-incoming/${encodeURIComponent(currentUser.phone)}`
        );
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.hasIncomingCall && checkData.incomingCall) {
            setIncomingCall((prev) => {
              if (prev && prev.callId === checkData.incomingCall.callId) return prev;
              return checkData.incomingCall;
            });
          }
        }
      } catch (err) {
        // quiet
      }
    }, 2500);

    return () => {
      active = false;
      clearInterval(pollInterval);
      wsRef.current?.close();
    };
  }, [currentUser, showToast, livekitConnection, incomingCall]);

  // ─── Fetch Grievances for Citizen / Field Employee ──────────
  useEffect(() => {
    if (
      currentUser &&
      (currentUser.role === "citizen" || currentUser.role === "employee")
    ) {
      setIsLoadingUserGrievances(true);
      fetch(
        `${API_BASE}/api/sampark/by-phone/${encodeURIComponent(currentUser.phone)}`
      )
        .then((res) => res.json())
        .then((data) => {
          if (data.grievances) {
            setUserGrievances(data.grievances);
          }
        })
        .catch((err) => console.error("Error fetching user grievances:", err))
        .finally(() => setIsLoadingUserGrievances(false));
    }
  }, [currentUser]);

  // ─── Load Officer Data (Grievances & Call History) ───────────
  const fetchCallHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/calls/history`);
      const data = await res.json();
      if (data.records) setCallHistory(data.records);
    } catch {
      // ignore
    }
  }, []);

  const loadAllGrievances = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/sampark/grievances`);
      const data = await res.json();
      if (data.grievances) {
        setGrievanceList(data.grievances);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (currentUser?.role === "officer") {
      loadAllGrievances();
      fetchCallHistory();
    }
  }, [currentUser, loadAllGrievances, fetchCallHistory]);

  // ─── Login Handlers ─────────────────────────────────────────

  const handleSendOtp = async () => {
    // 1. Sanitize phone digits
    const rawDigits = (loginPhone || "").replace(/[^0-9]/g, "");
    const bare10 = rawDigits.length >= 10 ? rawDigits.slice(-10) : rawDigits;
    
    if (bare10.length < 10) {
      setAuthError("कृपया अपना 10 अंकों का मोबाइल नंबर दर्ज करें (Please enter your 10-digit mobile number)");
      showToast("Please enter a 10-digit mobile number", "error");
      return;
    }

    const formattedPhone = `+91${bare10}`;
    setLoginPhone(formattedPhone);
    setAuthError("");
    setIsSubmittingAuth(true);

    try {
      const res = await fetch(`${API_BASE}/api/auth/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: formattedPhone }),
        signal: AbortSignal.timeout(4000),
      });
      const data = await res.json();
      if (data.success) {
        setDetectedRole(data.detectedRole || null);
        setDetectedName(data.userName || null);
        showToast(`OTP 987654 sent to ${formattedPhone}`, "success");
      } else {
        showToast(data.error || "Using demo OTP: 987654", "info");
      }
    } catch (err) {
      console.error("Auth send error:", err);
      showToast("OTP 987654 sent! (Demo mode active)", "success");
    } finally {
      // Transition to OTP entry step
      setOtpSent(true);
      setLoginOtp("");
      setIsSubmittingAuth(false);
    }
  };

  const handleVerifyOtp = async () => {
    let phone = loginPhone.trim();
    if (!phone) {
      showToast("Please enter your mobile number", "error");
      return;
    }
    if (!phone.startsWith("+91")) {
      phone = `+91${phone.replace(/^0+/, "")}`;
      setLoginPhone(phone);
    }

    const otp = loginOtp.trim();
    if (!otp) {
      showToast("Please enter the 6-digit OTP (987654)", "error");
      return;
    }

    setIsSubmittingAuth(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          otp,
        }),
        signal: AbortSignal.timeout(4000),
      });
      const data = await res.json();
      if (data.success && data.user) {
        localStorage.setItem("jansunwai_auth_user", JSON.stringify(data.user));
        setCurrentUser(data.user);
        showToast(`Welcome, ${data.user.name}! (${data.user.role.toUpperCase()})`, "success");
      } else {
        showToast(data.error || "Invalid OTP (Use demo OTP: 987654)", "error");
      }
    } catch (err) {
      console.warn("Auth verify offline fallback:", err);
      // Fallback demo user so testing is never blocked
      const matchedDemo = QUICK_DEMO_USERS.find((u) => u.phone === phone);
      const fallbackUser: AuthUser = matchedDemo
        ? {
            id: `demo-${matchedDemo.role}`,
            phone: matchedDemo.phone,
            name: matchedDemo.name,
            role: matchedDemo.role,
            designation: matchedDemo.badge,
          }
        : {
            id: `user-${Date.now()}`,
            phone,
            name: detectedName || "Rajasthan Citizen",
            role: (detectedRole as any) || "citizen",
          };
      localStorage.setItem("jansunwai_auth_user", JSON.stringify(fallbackUser));
      setCurrentUser(fallbackUser);
      showToast(`Logged in as ${fallbackUser.name}`, "success");
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleQuickLogin = async (user: (typeof QUICK_DEMO_USERS)[0]) => {
    setIsSubmittingAuth(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: user.phone,
          otp: "987654",
        }),
        signal: AbortSignal.timeout(4000),
      });
      const data = await res.json();
      if (data.success && data.user) {
        localStorage.setItem("jansunwai_auth_user", JSON.stringify(data.user));
        setCurrentUser(data.user);
        showToast(`Logged in as ${data.user.name} (${data.user.role.toUpperCase()})`, "success");
      } else {
        // Use local user info if backend returns error
        const fallbackUser: AuthUser = {
          id: `demo-${user.role}`,
          phone: user.phone,
          name: user.name,
          role: user.role,
          designation: user.badge,
        };
        localStorage.setItem("jansunwai_auth_user", JSON.stringify(fallbackUser));
        setCurrentUser(fallbackUser);
        showToast(`Logged in as ${user.name} (${user.role.toUpperCase()})`, "success");
      }
    } catch (err) {
      const fallbackUser: AuthUser = {
        id: `demo-${user.role}`,
        phone: user.phone,
        name: user.name,
        role: user.role,
        designation: user.badge,
      };
      localStorage.setItem("jansunwai_auth_user", JSON.stringify(fallbackUser));
      setCurrentUser(fallbackUser);
      showToast(`Logged in as ${user.name} (${user.role.toUpperCase()})`, "success");
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
    showToast("Logged out successfully", "info");
  };

  // ─── Officer Portal Search & Call Functions ─────────────────

  const handleSearchGrievance = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const idToSearch = grievanceId.trim();
    if (!idToSearch) {
      setSearchError("Please enter a Grievance ID");
      return;
    }

    setIsSearching(true);
    setSearchError("");
    setGrievance(null);

    try {
      const res = await fetch(`${API_BASE}/api/sampark/grievance/${encodeURIComponent(idToSearch)}`);
      const data = await res.json();

      if (!res.ok || !data.grievance) {
        setSearchError(data.message || `No grievance found with ID "${idToSearch}"`);
        return;
      }

      setGrievance(data.grievance);
    } catch (err) {
      setSearchError("Failed to connect to Sampark server");
      console.error("Search error:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleInitiateCall = async () => {
    if (!grievance || !currentUser) return;

    setIsCallInitiating(true);

    try {
      const res = await fetch(`${API_BASE}/api/calls/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grievanceId: grievance.grievanceId,
          title: `Jan Sunwai — ${grievance.title}`,
          hostUserId: currentUser.id,
          hostName: currentUser.name,
          hostDesignation: currentUser.designation || "District Collector",
          citizenPhone: grievance.citizen.phone,
          citizenName: grievance.citizen.name,
          employeePhone: grievance.assignedEmployee.phone,
          employeeName: grievance.assignedEmployee.name,
          employeeDesignation: grievance.assignedEmployee.designation,
          employeeDepartment: grievance.assignedEmployee.department,
          autoRecord,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || "Failed to initiate call", "error");
        return;
      }

      setLivekitConnection({
        token: data.livekit.token,
        url: data.livekit.url,
        roomName: data.livekit.roomName,
        callId: data.call.id,
      });

      showToast("📞 Ringing citizen and employee...", "success");
    } catch (err) {
      showToast("Failed to connect to server", "error");
      console.error("Call initiation error:", err);
    } finally {
      setIsCallInitiating(false);
    }
  };

  // ─── Incoming Call Actions ──────────────────────────────────

  const handleAcceptIncomingCall = async () => {
    stopAllRingtones();
    if (!incomingCall || !currentUser) return;

    try {
      const res = await fetch(
        `${API_BASE}/api/calls/${incomingCall.callId}/respond`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: currentUser.phone,
            action: "accept",
          }),
        }
      );

      const data = await res.json();

      if (data.success && data.livekit) {
        setLivekitConnection({
          token: data.livekit.token,
          url: data.livekit.url,
          roomName: data.livekit.roomName,
          callId: incomingCall.callId,
        });
      }

      setIncomingCall(null);
    } catch (err) {
      showToast("Failed to accept call", "error");
      console.error("Accept call error:", err);
    }
  };

  const handleDeclineIncomingCall = async () => {
    stopAllRingtones();
    if (!incomingCall || !currentUser) return;

    try {
      await fetch(`${API_BASE}/api/calls/${incomingCall.callId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: currentUser.phone,
          action: "decline",
        }),
      });
    } catch (err) {
      console.error("Decline call error:", err);
    }

    setIncomingCall(null);
  };

  const handleEndCall = async () => {
    stopAllRingtones();
    if (!livekitConnection) return;

    try {
      await fetch(`${API_BASE}/api/calls/${livekitConnection.callId}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("End call error:", err);
    }

    setLivekitConnection(null);
    showToast("Hearing ended for all participants", "info");
  };

  const handleLeaveCall = async () => {
    stopAllRingtones();
    if (!livekitConnection || !currentUser) {
      setLivekitConnection(null);
      return;
    }

    try {
      await fetch(`${API_BASE}/api/calls/${livekitConnection.callId}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: currentUser.phone }),
      });
    } catch (err) {
      console.error("Leave call error:", err);
    }

    setLivekitConnection(null);
    showToast("You have left the hearing (आपने सुनवाई छोड़ दी है)", "info");
  };

  const handleDisconnected = async () => {
    stopAllRingtones();
    if (livekitConnection && currentUser && currentUser.role !== "officer") {
      try {
        await fetch(`${API_BASE}/api/calls/${livekitConnection.callId}/leave`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: currentUser.phone }),
        });
      } catch (err) {
        console.error("Auto leave error:", err);
      }
    }
    setLivekitConnection(null);
  };

  const fetchHearingParticipants = useCallback(async () => {
    if (!livekitConnection) return;
    try {
      const res = await fetch(`${API_BASE}/api/calls/${livekitConnection.callId}/participants`);
      const data = await res.json();
      if (Array.isArray(data.participants)) {
        setHearingParticipants(data.participants);
      }
    } catch (err) {
      console.error("Fetch participants error:", err);
    }
  }, [livekitConnection]);

  const handleRemoveParticipant = async (participantPhone: string, participantName: string) => {
    if (!livekitConnection) return;
    setIsRemovingParticipant(participantPhone);
    try {
      const res = await fetch(`${API_BASE}/api/calls/${livekitConnection.callId}/remove-participant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantPhone }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Disconnected ${participantName} from the hearing`, "success");
        fetchHearingParticipants();
      } else {
        showToast(data.error || "Failed to disconnect participant", "error");
      }
    } catch (err) {
      showToast("Network error disconnecting participant", "error");
    } finally {
      setIsRemovingParticipant(null);
    }
  };

  useEffect(() => {
    if (livekitConnection) {
      fetchHearingParticipants();
      const interval = setInterval(fetchHearingParticipants, 3000);
      const handleRefresh = () => fetchHearingParticipants();
      window.addEventListener("jan-sunwai-refresh-participants", handleRefresh);
      return () => {
        clearInterval(interval);
        window.removeEventListener("jan-sunwai-refresh-participants", handleRefresh);
      };
    } else {
      setHearingParticipants([]);
      setShowParticipantsModal(false);
    }
  }, [livekitConnection, fetchHearingParticipants]);

  // ─── Create Grievance (SQLite) ──────────────────────────────

  const handleCreateGrievance = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingGrievance(true);

    try {
      const res = await fetch(`${API_BASE}/api/sampark/grievance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newGrievanceForm),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        showToast(`Grievance ${data.grievance.grievanceId} saved in SQLite!`, "success");
        setIsModalOpen(false);
        setGrievance(data.grievance);
        setGrievanceId(data.grievance.grievanceId);
        loadAllGrievances();
      } else {
        showToast(data.error || "Failed to save grievance", "error");
      }
    } catch (err) {
      showToast("Network error saving grievance", "error");
    } finally {
      setIsSubmittingGrievance(false);
    }
  };

  // ─── Mid-Call Add Officer ───────────────────────────────────

  const handleSearchOfficers = async (queryOverride?: string, deptOverride?: string) => {
    const query = queryOverride !== undefined ? queryOverride : officerSearchQuery;
    const dept = deptOverride !== undefined ? deptOverride : selectedDepartment;
    setIsSearchingOfficers(true);
    try {
      const params = new URLSearchParams();
      if (query && query.trim()) params.set("q", query.trim());
      if (dept && dept.trim()) params.set("department", dept.trim());
      const res = await fetch(`${API_BASE}/api/sampark/officers?${params.toString()}`);
      const data = await res.json();
      setOfficerResults(data.officers || []);
    } catch (err) {
      console.error("Officer search error:", err);
    } finally {
      setIsSearchingOfficers(false);
    }
  };

  const handleAddOfficerToCall = async (officer: any) => {
    if (!livekitConnection) return;

    try {
      const res = await fetch(
        `${API_BASE}/api/calls/${livekitConnection.callId}/add-officer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: officer.phone,
            name: officer.name,
            designation: officer.designation || "Guest Participant",
            department: officer.department || "Direct Dial",
          }),
        }
      );

      const data = await res.json();

      if (data.success) {
        showToast(`📞 Dialing ${officer.name} (${officer.phone})...`, "success");
        setShowAddOfficer(false);
      } else {
        showToast(data.error || "Failed to add participant", "error");
      }
    } catch (err) {
      showToast("Failed to connect to server", "error");
    }
  };

  const handleDialCustomPerson = async () => {
    const rawDigits = customPersonPhone.replace(/[^0-9]/g, "");
    const last10 = rawDigits.slice(-10);
    if (last10.length !== 10) {
      showToast("कृपया 10-अंकीय मान्य मोबाइल नंबर दर्ज करें (Please enter a valid 10-digit mobile number)", "error");
      return;
    }

    const formattedPhone = `+91${last10}`;
    const formattedName = customPersonName.trim() || `Citizen (${last10.slice(-4)})`;
    const formattedRole = customPersonRole.trim() || "Citizen / Complainant";

    setIsDialingCustom(true);
    try {
      await handleAddOfficerToCall({
        phone: formattedPhone,
        name: formattedName,
        designation: formattedRole,
        department: "Citizen / External (गैर-कर्मचारी)",
      });
      setCustomPersonPhone("");
      setCustomPersonName("");
    } finally {
      setIsDialingCustom(false);
    }
  };

  // ─── User-Friendly Notification Toast ──────────────────────
  const renderToast = () => {
    if (!toast) return null;
    return (
      <div className="toast-wrapper">
        <div className={`toast toast--${toast.type}`} role="status" aria-live="polite">
          <div className="toast__content">
            <div className="toast__icon">
              {toast.type === "success" && <CheckCircle size={20} style={{ color: "#34d399", flexShrink: 0 }} />}
              {toast.type === "error" && <AlertCircle size={20} style={{ color: "#f87171", flexShrink: 0 }} />}
              {toast.type === "info" && <Info size={20} style={{ color: "#60a5fa", flexShrink: 0 }} />}
            </div>
            <span className="toast__message">{toast.message}</span>
          </div>
          <button
            type="button"
            className="toast__close"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════
  // RENDER: Active LiveKit Video Call Room
  // ═══════════════════════════════════════════════════════════

  if (livekitConnection) {
    return (
      <main className="main-layout" style={{ padding: "0.5rem" }}>
        {renderToast()}
        {incomingCall && (
          <IncomingCallModal
            callerName={incomingCall.callerName}
            callerDesignation={incomingCall.callerDesignation}
            subject={incomingCall.title}
            participantCount={incomingCall.participantCount}
            onAccept={handleAcceptIncomingCall}
            onDecline={handleDeclineIncomingCall}
          />
        )}
        <div className="video-room-container">
          <div className="video-room-header">
            <div className="video-room-header__title">
              🏛️ Jan Sunwai Hearing — {grievance?.grievanceId || livekitConnection.callId.slice(0, 8)}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {autoRecord && (
                <div className="video-room-header__rec">
                  <span className="video-room-header__rec-dot"></span>
                  REC
                </div>
              )}
              {/* Mid-call Add Officer / Employee button */}
              {(currentUser?.role === "officer" || currentUser?.role === "employee") && (
                <button
                  type="button"
                  className="btn btn--secondary"
                  style={{
                    padding: "6px 12px",
                    fontSize: "0.8rem",
                    gap: "6px",
                    background: showAddOfficer ? "rgba(59, 130, 246, 0.25)" : undefined,
                    borderColor: showAddOfficer ? "#60a5fa" : undefined,
                  }}
                  onClick={() => {
                    setShowParticipantsModal(false);
                    const next = !showAddOfficer;
                    setShowAddOfficer(next);
                    if (next) {
                      fetchDepartments();
                      handleSearchOfficers(officerSearchQuery, selectedDepartment);
                    }
                  }}
                  title="Add employee, official or any person by phone number (व्यक्ति / अधिकारी जोड़ें)"
                >
                  <UserPlus size={14} />
                  Add Person / Official
                </button>
              )}

              {currentUser?.role === "officer" ? (
                <>

                  <button
                    type="button"
                    className="btn btn--secondary"
                    style={{
                      padding: "6px 12px",
                      fontSize: "0.8rem",
                      gap: "6px",
                      background: showParticipantsModal ? "rgba(59, 130, 246, 0.25)" : undefined,
                      borderColor: showParticipantsModal ? "#60a5fa" : undefined,
                    }}
                    onClick={() => {
                      setShowAddOfficer(false);
                      setShowParticipantsModal(!showParticipantsModal);
                      if (!showParticipantsModal) fetchHearingParticipants();
                    }}
                  >
                    <Users size={14} />
                    Attendees ({hearingParticipants.length || 1})
                  </button>

                  <button
                    type="button"
                    style={{
                      padding: "6px 14px",
                      fontSize: "0.8rem",
                      gap: "6px",
                      background: "linear-gradient(135deg, #ef4444, #dc2626)",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "8px",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      boxShadow: "0 2px 8px rgba(239, 68, 68, 0.35)",
                    }}
                    onClick={handleEndCall}
                  >
                    <PhoneOff size={14} />
                    End Hearing
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  style={{
                    padding: "6px 14px",
                    fontSize: "0.82rem",
                    gap: "6px",
                    background: "linear-gradient(135deg, #dc2626, #b91c1c)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    boxShadow: "0 2px 8px rgba(220, 38, 38, 0.35)",
                  }}
                  onClick={handleLeaveCall}
                >
                  <LogOut size={14} />
                  Leave Hearing
                </button>
              )}
            </div>
          </div>

          {/* Backdrop to dismiss open overlay drawers when clicking outside */}
          {(showParticipantsModal || showAddOfficer) && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 55,
                background: "rgba(0, 0, 0, 0.35)",
              }}
              onClick={() => {
                setShowParticipantsModal(false);
                setShowAddOfficer(false);
              }}
            />
          )}

          {/* Microphone Blocked Warning Banner */}
          {micBlockedWarning && (
            <div
              style={{
                background: "linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(185, 28, 28, 0.3))",
                border: "1px solid rgba(248, 113, 113, 0.4)",
                borderRadius: "10px",
                padding: "10px 14px",
                margin: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                color: "#fee2e2",
                fontSize: "0.84rem",
                zIndex: 40,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <AlertCircle size={18} style={{ color: "#f87171", flexShrink: 0 }} />
                <span>
                  <strong>Microphone Access Blocked:</strong> {micBlockedWarning}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMicBlockedWarning(null)}
                style={{ background: "none", border: "none", color: "#fca5a5", cursor: "pointer" }}
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* Manage Participants Floating Drawer for Officer */}
          {showParticipantsModal && currentUser?.role === "officer" && (
            <div
              style={{
                position: "absolute",
                top: "54px",
                right: "16px",
                width: "min(460px, calc(100vw - 32px))",
                maxHeight: "calc(100vh - 130px)",
                zIndex: 60,
                background: "rgba(15, 23, 42, 0.98)",
                backdropFilter: "blur(24px)",
                border: "1px solid rgba(59, 130, 246, 0.4)",
                borderRadius: "14px",
                padding: "16px",
                color: "#fff",
                boxShadow: "0 24px 50px rgba(0,0,0,0.85)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <span style={{ fontWeight: 700, fontSize: "0.94rem", color: "#f8fafc", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Users size={16} style={{ color: "#38bdf8" }} />
                  Hearing Attendees ({hearingParticipants.length})
                </span>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowParticipantsModal(false);
                      setShowAddOfficer(true);
                      setAddPersonTab("custom");
                    }}
                    style={{
                      background: "rgba(16, 185, 129, 0.15)",
                      border: "1px solid rgba(16, 185, 129, 0.35)",
                      color: "#34d399",
                      borderRadius: "6px",
                      padding: "4px 8px",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                    title="Add external citizen or person by phone number"
                  >
                    <UserPlus size={12} />
                    + Add Person
                  </button>
                  <button
                    type="button"
                    onClick={fetchHearingParticipants}
                    style={{
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      color: "#94a3b8",
                      borderRadius: "6px",
                      padding: "4px 8px",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                    }}
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowParticipantsModal(false)}
                    style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "320px", overflowY: "auto" }}>
                {hearingParticipants.length > 0 ? (
                  hearingParticipants.map((p) => {
                    const isSelf = (p.phone && p.phone === currentUser.phone) || p.isHost;
                    const removeTargetId = p.phone || p.id;
                    return (
                      <div
                        key={p.id || p.phone}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "10px 12px",
                          background: isSelf ? "rgba(16, 185, 129, 0.08)" : "rgba(255, 255, 255, 0.04)",
                          border: isSelf ? "1px solid rgba(16, 185, 129, 0.25)" : "1px solid rgba(255, 255, 255, 0.08)",
                          borderRadius: "10px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span style={{ fontSize: "1.2rem" }}>
                            {p.role === "officer" || p.isHost ? "🏛️" : p.role === "employee" ? "👷" : "👤"}
                          </span>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <strong style={{ fontSize: "0.88rem", color: "#ffffff" }}>{p.name}</strong>
                              <span
                                style={{
                                  fontSize: "0.7rem",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  background: (p.role === "officer" || p.isHost) ? "rgba(16,185,129,0.2)" : p.role === "employee" ? "rgba(245,158,11,0.2)" : "rgba(59,130,246,0.2)",
                                  color: (p.role === "officer" || p.isHost) ? "#34d399" : p.role === "employee" ? "#fbbf24" : "#60a5fa",
                                  textTransform: "uppercase",
                                  fontWeight: 700,
                                }}
                              >
                                {p.isHost ? "HOST" : p.role}
                              </span>
                              {p.isOnline && (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "0.68rem", color: "#34d399" }}>
                                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
                                  Live
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: "0.76rem", color: "#94a3b8", marginTop: "2px" }}>
                              {p.designation || (p.role === "citizen" ? "Citizen Complainant" : "Field Officer")} {p.phone ? `— ${p.phone}` : ""}
                            </div>
                          </div>
                        </div>

                        <div>
                          {isSelf ? (
                            <span
                              style={{
                                fontSize: "0.75rem",
                                padding: "4px 8px",
                                borderRadius: "6px",
                                background: "rgba(16, 185, 129, 0.15)",
                                color: "#34d399",
                                fontWeight: 600,
                              }}
                            >
                              👑 Hearing Host
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={isRemovingParticipant === removeTargetId}
                              onClick={() => handleRemoveParticipant(removeTargetId, p.name)}
                              style={{
                                padding: "6px 12px",
                                fontSize: "0.78rem",
                                gap: "4px",
                                background: "rgba(239, 68, 68, 0.2)",
                                color: "#f87171",
                                border: "1px solid rgba(239, 68, 68, 0.4)",
                                borderRadius: "6px",
                                fontWeight: 600,
                                cursor: isRemovingParticipant === removeTargetId ? "wait" : "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                              }}
                            >
                              <PhoneOff size={13} />
                              {isRemovingParticipant === removeTargetId ? "Disconnecting..." : "Disconnect (कॉल काटें)"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ padding: "12px", textAlign: "center", color: "#94a3b8", fontSize: "0.82rem" }}>
                    No other participants in the hearing currently.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Add Officer Floating Drawer */}
          {showAddOfficer && (
            <div
              style={{
                position: "absolute",
                top: "54px",
                right: "16px",
                width: "min(500px, calc(100vw - 32px))",
                maxHeight: "calc(100vh - 130px)",
                zIndex: 60,
                background: "rgba(15, 23, 42, 0.98)",
                backdropFilter: "blur(24px)",
                border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: "14px",
                padding: "16px",
                color: "#fff",
                boxShadow: "0 24px 50px rgba(0,0,0,0.85)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <span style={{ fontWeight: 700, fontSize: "0.96rem", color: "#f8fafc", display: "flex", alignItems: "center", gap: "8px" }}>
                  <UserPlus size={17} style={{ color: "#38bdf8" }} />
                  Add Person to Hearing (सुनवाई में जोड़ें)
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddOfficer(false)}
                  style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: "4px" }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Two Distinct Tabs */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "6px",
                  background: "rgba(255, 255, 255, 0.06)",
                  padding: "4px",
                  borderRadius: "10px",
                  marginBottom: "14px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setAddPersonTab("directory")}
                  style={{
                    padding: "8px 10px",
                    borderRadius: "8px",
                    border: "none",
                    background: addPersonTab === "directory" ? "#2563eb" : "transparent",
                    color: addPersonTab === "directory" ? "#ffffff" : "#94a3b8",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <Building2 size={14} />
                  <span>Employee List (कर्मचारी)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAddPersonTab("custom")}
                  style={{
                    padding: "8px 10px",
                    borderRadius: "8px",
                    border: "none",
                    background: addPersonTab === "custom" ? "#059669" : "transparent",
                    color: addPersonTab === "custom" ? "#ffffff" : "#94a3b8",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <PhoneCall size={14} />
                  <span>By Phone No. (अन्य व्यक्ति)</span>
                </button>
              </div>

              {/* TAB 1: EMPLOYEE DIRECTORY */}
              {addPersonTab === "directory" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {/* Department Dropdown Filter */}
                  <div>
                    <label style={{ display: "block", fontSize: "0.76rem", color: "#94a3b8", fontWeight: 600, marginBottom: "4px" }}>
                      Filter by Department (विभाग चुनें):
                    </label>
                    <select
                      value={selectedDepartment}
                      onChange={(e) => {
                        const dept = e.target.value;
                        setSelectedDepartment(dept);
                        handleSearchOfficers(officerSearchQuery, dept);
                      }}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        border: "1px solid rgba(255,255,255,0.22)",
                        background: "rgba(30, 41, 59, 0.95)",
                        color: "#f8fafc",
                        fontSize: "0.85rem",
                        outline: "none",
                        cursor: "pointer",
                      }}
                    >
                      <option value="">🏛️ All Departments (सभी विभाग)</option>
                      {availableDepartments.map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Search by Name or Phone Number */}
                  <div>
                    <label style={{ display: "block", fontSize: "0.76rem", color: "#94a3b8", fontWeight: 600, marginBottom: "4px" }}>
                      Search by Name or Mobile Number (नाम या 10-अंकीय नंबर):
                    </label>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        type="text"
                        placeholder="Search name (e.g. Sharma) or number..."
                        value={officerSearchQuery}
                        onChange={(e) => {
                          const query = e.target.value;
                          setOfficerSearchQuery(query);
                          handleSearchOfficers(query, selectedDepartment);
                        }}
                        onKeyDown={(e) => e.key === "Enter" && handleSearchOfficers()}
                        style={{
                          flex: 1,
                          padding: "8px 12px",
                          borderRadius: "8px",
                          border: "1px solid rgba(255,255,255,0.25)",
                          background: "rgba(255,255,255,0.08)",
                          color: "#fff",
                          fontSize: "0.88rem",
                          outline: "none",
                        }}
                        autoFocus
                      />
                      <button
                        type="button"
                        className="btn btn--primary"
                        style={{ padding: "8px 14px", fontSize: "0.82rem", fontWeight: 700 }}
                        onClick={() => handleSearchOfficers()}
                        disabled={isSearchingOfficers}
                      >
                        {isSearchingOfficers ? "Searching..." : "Search"}
                      </button>
                    </div>
                  </div>

                  {/* Direct Dial Fast Action if User entered a 10-digit phone */}
                  {officerSearchQuery.replace(/[^0-9]/g, "").length >= 10 && (
                    <div style={{ padding: "10px 12px", background: "rgba(16, 185, 129, 0.15)", border: "1px solid rgba(16, 185, 129, 0.35)", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ fontSize: "0.76rem", color: "#94a3b8", display: "block" }}>Direct Phone Dial:</span>
                        <span style={{ fontSize: "0.88rem", color: "#34d399", fontWeight: 700 }}>
                          +91 {officerSearchQuery.replace(/[^0-9]/g, "").slice(-10)}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn--success"
                        style={{ padding: "6px 14px", fontSize: "0.8rem", gap: "5px" }}
                        onClick={() => {
                          const num = officerSearchQuery.replace(/[^0-9]/g, "").slice(-10);
                          handleAddOfficerToCall({
                            phone: `+91${num}`,
                            name: `Participant (${num})`,
                            designation: "Guest Official",
                            department: selectedDepartment || "Direct Dial",
                          });
                        }}
                      >
                        <PhoneCall size={13} />
                        Dial Now
                      </button>
                    </div>
                  )}

                  {/* Search Results List from Database */}
                  <div style={{ maxHeight: "220px", overflowY: "auto", borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: "4px" }}>
                    {officerResults.length > 0 ? (
                      officerResults.map((officer) => (
                        <div
                          key={officer.phone}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "10px 8px",
                            borderBottom: "1px solid rgba(255,255,255,0.06)",
                            gap: "10px",
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                              <strong style={{ color: "#ffffff", fontSize: "0.86rem" }}>{officer.name}</strong>
                              <span
                                style={{
                                  fontSize: "0.68rem",
                                  padding: "1px 6px",
                                  borderRadius: "4px",
                                  background: "rgba(245, 158, 11, 0.2)",
                                  color: "#fbbf24",
                                  fontWeight: 600,
                                }}
                              >
                                {officer.department}
                              </span>
                            </div>
                            <div style={{ color: "#cbd5e1", fontSize: "0.78rem", marginTop: "2px" }}>
                              {officer.designation}
                            </div>
                            <div style={{ color: "#60a5fa", fontSize: "0.76rem", marginTop: "2px", fontWeight: 600 }}>
                              📱 {officer.phone}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn btn--success"
                            style={{ padding: "6px 12px", fontSize: "0.78rem", gap: "4px", flexShrink: 0 }}
                            onClick={() => handleAddOfficerToCall(officer)}
                          >
                            <PhoneCall size={12} />
                            Dial In
                          </button>
                        </div>
                      ))
                    ) : (
                      <div style={{ padding: "16px", textAlign: "center", color: "#94a3b8", fontSize: "0.82rem" }}>
                        {isSearchingOfficers
                          ? "Searching database records..."
                          : "No employee record found with this name/filter."}
                      </div>
                    )}
                  </div>

                  {/* Switch to custom person tab banner */}
                  <div
                    onClick={() => setAddPersonTab("custom")}
                    style={{
                      marginTop: "4px",
                      padding: "10px 12px",
                      background: "rgba(16, 185, 129, 0.1)",
                      border: "1px dashed rgba(16, 185, 129, 0.35)",
                      borderRadius: "8px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontSize: "0.78rem", color: "#6ee7b7" }}>
                      📱 Person not in employee data? Click here to dial by number →
                    </span>
                    <span style={{ fontSize: "0.76rem", color: "#34d399", fontWeight: 700 }}>
                      Dial by Number
                    </span>
                  </div>
                </div>
              )}

              {/* TAB 2: DIAL ANY PERSON / CITIZEN BY PHONE NUMBER (NOT IN EMPLOYEE DATA) */}
              {addPersonTab === "custom" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {/* Informational banner */}
                  <div
                    style={{
                      padding: "8px 12px",
                      background: "rgba(59, 130, 246, 0.12)",
                      border: "1px solid rgba(59, 130, 246, 0.25)",
                      borderRadius: "8px",
                      fontSize: "0.78rem",
                      color: "#93c5fd",
                      lineHeight: "1.4",
                    }}
                  >
                    💡 <strong>External Person / Citizen Dialing:</strong> Use this option to add any person (citizen complainant, witness, sarpanch, or contractor) whose data is <em>not available</em> in the employee database.
                  </div>

                  {/* Phone Number Field */}
                  <div>
                    <label style={{ display: "flex", justifyContent: "space-between", fontSize: "0.76rem", color: "#94a3b8", fontWeight: 600, marginBottom: "4px" }}>
                      <span>Mobile Number (10-अंकीय मोबाइल नंबर)*</span>
                      {customPersonPhone.replace(/[^0-9]/g, "").slice(-10).length === 10 ? (
                        <span style={{ color: "#34d399", fontWeight: 700 }}>✓ Valid 10-digit number</span>
                      ) : (
                        <span style={{ color: "#f59e0b" }}>
                          {customPersonPhone.replace(/[^0-9]/g, "").slice(-10).length}/10 digits
                        </span>
                      )}
                    </label>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          padding: "8px 10px",
                          background: "rgba(255,255,255,0.06)",
                          border: "1px solid rgba(255,255,255,0.2)",
                          borderRadius: "8px",
                          color: "#e2e8f0",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                          flexShrink: 0,
                          userSelect: "none",
                        }}
                      >
                        🇮🇳 +91
                      </div>
                      <input
                        type="tel"
                        maxLength={10}
                        placeholder="e.g. 9876543210"
                        value={customPersonPhone}
                        onChange={(e) => setCustomPersonPhone(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
                        onKeyDown={(e) => e.key === "Enter" && handleDialCustomPerson()}
                        style={{
                          flex: 1,
                          padding: "8px 12px",
                          borderRadius: "8px",
                          border: "1px solid rgba(255,255,255,0.25)",
                          background: "rgba(255,255,255,0.08)",
                          color: "#fff",
                          fontSize: "0.95rem",
                          letterSpacing: "1px",
                          fontWeight: 600,
                          outline: "none",
                        }}
                        autoFocus
                      />
                    </div>
                  </div>

                  {/* Name Input */}
                  <div>
                    <label style={{ display: "block", fontSize: "0.76rem", color: "#94a3b8", fontWeight: 600, marginBottom: "4px" }}>
                      Person Name / Identity (व्यक्ति का नाम / पहचान):
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Ramesh Kumar / परिवादी का नाम"
                      value={customPersonName}
                      onChange={(e) => setCustomPersonName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleDialCustomPerson()}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        border: "1px solid rgba(255,255,255,0.25)",
                        background: "rgba(255,255,255,0.08)",
                        color: "#fff",
                        fontSize: "0.86rem",
                        outline: "none",
                      }}
                    />

                    {/* Quick identity chips */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                      {[
                        { label: "परिवादी / Complainant", role: "Citizen / Complainant" },
                        { label: "गवाह / Witness", role: "Witness" },
                        { label: "सरपंच / Sarpanch", role: "Sarpanch" },
                        { label: "वार्ड पंच / Ward Member", role: "Ward Panch" },
                        { label: "फील्ड वर्कर / Staff", role: "Field Staff" },
                      ].map((chip) => (
                        <button
                          key={chip.label}
                          type="button"
                          onClick={() => {
                            if (!customPersonName) setCustomPersonName(chip.label.split(" / ")[0]);
                            setCustomPersonRole(chip.role);
                          }}
                          style={{
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.15)",
                            color: "#cbd5e1",
                            borderRadius: "14px",
                            padding: "3px 8px",
                            fontSize: "0.72rem",
                            cursor: "pointer",
                          }}
                        >
                          + {chip.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Role / Designation Selector */}
                  <div>
                    <label style={{ display: "block", fontSize: "0.76rem", color: "#94a3b8", fontWeight: 600, marginBottom: "4px" }}>
                      Role in Hearing (सुनवाई में भूमिका):
                    </label>
                    <select
                      value={customPersonRole}
                      onChange={(e) => setCustomPersonRole(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        border: "1px solid rgba(255,255,255,0.22)",
                        background: "rgba(30, 41, 59, 0.95)",
                        color: "#f8fafc",
                        fontSize: "0.85rem",
                        outline: "none",
                        cursor: "pointer",
                      }}
                    >
                      <option value="Citizen / Complainant">👤 Citizen / Complainant (नागरिक / परिवादी)</option>
                      <option value="Witness">👁️ Witness (गवाह / प्रत्यक्षदर्शी)</option>
                      <option value="Sarpanch">🌾 Sarpanch / Village Head (सरपंच / ग्राम प्रधान)</option>
                      <option value="Ward Panch">🏛️ Ward Panch / Local Representative (वार्ड पंच)</option>
                      <option value="Field Worker / Contractor">👷 Field Worker / Contractor (फील्ड कर्मचारी / ठेकेदार)</option>
                      <option value="External Official / Expert">👔 External Official / Expert (बाहरी अधिकारी / विशेषज्ञ)</option>
                      <option value="Guest Participant">🤝 Other Guest (अन्य अतिथि)</option>
                    </select>
                  </div>

                  {/* Dial & Connect Button */}
                  <div style={{ marginTop: "6px" }}>
                    <button
                      type="button"
                      className="btn btn--success"
                      disabled={customPersonPhone.replace(/[^0-9]/g, "").slice(-10).length !== 10 || isDialingCustom}
                      onClick={handleDialCustomPerson}
                      style={{
                        width: "100%",
                        padding: "10px 16px",
                        fontSize: "0.92rem",
                        fontWeight: 700,
                        justifyContent: "center",
                        gap: "8px",
                        opacity: customPersonPhone.replace(/[^0-9]/g, "").slice(-10).length !== 10 ? 0.6 : 1,
                        cursor: customPersonPhone.replace(/[^0-9]/g, "").slice(-10).length !== 10 ? "not-allowed" : "pointer",
                      }}
                    >
                      <PhoneCall size={16} />
                      {isDialingCustom
                        ? "Calling & Adding to Hearing..."
                        : customPersonPhone.replace(/[^0-9]/g, "").slice(-10).length === 10
                        ? `Dial & Add +91 ${customPersonPhone.replace(/[^0-9]/g, "").slice(-10)}`
                        : "Enter 10-Digit Number to Dial"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <LiveKitVideoRoom
            token={livekitConnection.token}
            serverUrl={livekitConnection.url}
            roomName={livekitConnection.roomName}
            onDisconnected={handleDisconnected}
            onEndCall={handleEndCall}
          />
        </div>
      </main>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER: LOGIN SCREEN (When No User is Logged In)
  // ═══════════════════════════════════════════════════════════

  if (!currentUser) {
    return (
      <div style={{ minHeight: "100vh", background: "radial-gradient(ellipse at top, #0f2847 0%, #0a192f 60%, #020617 100%)", color: "#f8fafc", padding: "clamp(0.75rem, 3vw, 1.5rem)" }}>
        {renderToast()}
        {incomingCall && (
          <IncomingCallModal
            callerName={incomingCall.callerName}
            callerDesignation={incomingCall.callerDesignation}
            subject={incomingCall.title}
            participantCount={incomingCall.participantCount}
            onAccept={handleAcceptIncomingCall}
            onDecline={handleDeclineIncomingCall}
          />
        )}

        <div style={{ maxWidth: "860px", margin: "0 auto", paddingTop: "clamp(1rem, 3vw, 2rem)" }}>
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: "clamp(1.5rem, 4vw, 2.5rem)" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "10px", background: "rgba(255,255,255,0.08)", padding: "6px 16px", borderRadius: "999px", border: "1px solid rgba(255,255,255,0.15)", marginBottom: "1rem" }}>
              <span style={{ fontSize: "1.2rem" }}>🏛️</span>
              <span style={{ fontSize: "0.85rem", fontWeight: 700, letterSpacing: "0.08em", color: "#fbbf24", textTransform: "uppercase" }}>
                राजस्थान सरकार | Government of Rajasthan
              </span>
            </div>
            <h1 style={{ fontSize: "clamp(1.4rem, 4.5vw, 2.2rem)", fontWeight: 800, letterSpacing: "-0.02em", color: "#ffffff", margin: "0 0 0.5rem", lineHeight: 1.25 }}>
              जन सुनवाई वीडियो कॉन्फ्रेंस प्रणाली
            </h1>
            <p style={{ fontSize: "clamp(0.85rem, 2.5vw, 1.05rem)", color: "#94a3b8", margin: 0, lineHeight: 1.4 }}>
              Jan Sunwai Unified Video Hearing Portal — Citizen Complainant, Field Officer & District Collector Login
            </p>
          </div>

          {/* Login Card Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "2rem" }}>
            {/* Phone Number / OTP Login Card */}
            <div
              style={{
                background: "rgba(15, 23, 42, 0.85)",
                backdropFilter: "blur(16px)",
                borderRadius: "20px",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                padding: "2rem",
                boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "1.2rem" }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "rgba(59, 130, 246, 0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "#38bdf8" }}>
                  <Phone size={20} />
                </div>
                <div>
                  <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, color: "#ffffff" }}>
                    मोबाइल नंबर द्वारा लॉगिन करें
                  </h2>
                  <p style={{ fontSize: "0.85rem", color: "#94a3b8", margin: 0 }}>
                    Enter registered mobile number for Citizen, Field Officer, or District Collector
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "1.4rem" }}>
                {/* 1. Mobile Number */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <label style={{ fontSize: "0.88rem", fontWeight: 600, color: "#cbd5e1" }}>
                      Mobile Number (मोबाइल नंबर)
                    </label>
                    <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                      Citizen / Field Officer / District Collector
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <div style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "10px", padding: "12px 14px", color: "#94a3b8", fontWeight: 700, display: "flex", alignItems: "center" }}>
                      🇮🇳 +91
                    </div>
                    <input
                      type="tel"
                      placeholder="Enter 10-digit mobile number"
                      value={loginPhone.replace(/^\+91/, "")}
                      disabled={otpSent}
                      autoComplete="off"
                      maxLength={10}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, "").slice(0, 10);
                        setLoginPhone(val ? `+91${val}` : "");
                        if (authError) setAuthError("");
                      }}
                      onKeyDown={(e) => e.key === "Enter" && (!otpSent ? handleSendOtp() : handleVerifyOtp())}
                      style={{
                        flex: 1,
                        background: otpSent ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.2)",
                        borderRadius: "10px",
                        padding: "12px 16px",
                        color: "#ffffff",
                        fontSize: "1.1rem",
                        letterSpacing: "0.05em",
                        outline: "none",
                      }}
                      autoFocus
                    />
                    {otpSent && (
                      <button
                        type="button"
                        onClick={() => {
                          setOtpSent(false);
                          setLoginOtp("");
                        }}
                        style={{
                          background: "none",
                          border: "1px solid rgba(255,255,255,0.2)",
                          borderRadius: "10px",
                          padding: "0 14px",
                          color: "#93c5fd",
                          fontSize: "0.8rem",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Change
                      </button>
                    )}
                  </div>
                  {otpSent ? (
                    <div style={{ marginTop: "8px", fontSize: "0.82rem", color: "#34d399", display: "flex", alignItems: "center", gap: "6px" }}>
                      <CheckCircle size={15} />
                      <span>
                        OTP sent to {loginPhone}! {detectedName ? `• Recognized: ${detectedName} (${detectedRole})` : ""}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Quick fill:</span>
                        <button
                          type="button"
                          onClick={() => { setLoginPhone("+917735807328"); setAuthError(""); setOtpSent(false); }}
                          style={{ background: "rgba(59, 130, 246, 0.15)", border: "1px solid rgba(59, 130, 246, 0.3)", borderRadius: "6px", padding: "3px 8px", fontSize: "0.75rem", color: "#60a5fa", cursor: "pointer" }}
                        >
                          👤 7735807328 (Janmejay - Citizen)
                        </button>
                        <button
                          type="button"
                          onClick={() => { setLoginPhone("+917749852013"); setAuthError(""); setOtpSent(false); }}
                          style={{ background: "rgba(245, 158, 11, 0.15)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: "6px", padding: "3px 8px", fontSize: "0.75rem", color: "#fbbf24", cursor: "pointer" }}
                        >
                          👷 7749852013 (Chandan - JEn)
                        </button>
                        <button
                          type="button"
                          onClick={() => { setLoginPhone("+919414000001"); setAuthError(""); setOtpSent(false); }}
                          style={{ background: "rgba(16, 185, 129, 0.15)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "6px", padding: "3px 8px", fontSize: "0.75rem", color: "#34d399", cursor: "pointer" }}
                        >
                          🏛️ 9414000001 (Collector)
                        </button>
                      </div>

                      {authError && (
                        <div style={{ marginTop: "8px", padding: "8px 12px", borderRadius: "8px", background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#fca5a5", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "6px" }}>
                          <AlertCircle size={15} />
                          <span>{authError}</span>
                        </div>
                      )}

                      <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "6px" }}>
                        System checks Rajasthan Sampark directory for Citizen, JEn, Patwari, or Collector.
                      </div>
                    </>
                  )}
                </div>

                {/* Send OTP Button (Shown FIRST when user has not clicked Send OTP yet) */}
                {!otpSent && (
                  <button
                    type="button"
                    id="btn-get-otp"
                    onClick={(e) => {
                      e.preventDefault();
                      handleSendOtp();
                    }}
                    disabled={isSubmittingAuth}
                    className="btn btn--primary"
                    style={{
                      padding: "14px",
                      borderRadius: "12px",
                      fontSize: "1.05rem",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      cursor: "pointer",
                      background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                      border: "none",
                      color: "#ffffff",
                    }}
                  >
                    {isSubmittingAuth ? "Sending OTP..." : "Get OTP (ओटीपी प्राप्त करें)"}
                    <ArrowRight size={18} />
                  </button>
                )}

                {/* 2. OTP Input Section (ONLY SHOWN AFTER CLICKING GET OTP) */}
                {otpSent && (
                  <>
                    <div style={{ animation: "fadeIn 0.3s ease" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <label style={{ fontSize: "0.88rem", fontWeight: 600, color: "#cbd5e1" }}>
                          Enter 6-Digit OTP (ओटीपी दर्ज करें)
                        </label>
                        <button
                          type="button"
                          onClick={() => setLoginOtp("987654")}
                          style={{
                            fontSize: "0.75rem",
                            color: "#34d399",
                            fontWeight: 700,
                            background: "rgba(16, 185, 129, 0.15)",
                            border: "1px solid rgba(16, 185, 129, 0.4)",
                            padding: "3px 10px",
                            borderRadius: "6px",
                            cursor: "pointer",
                          }}
                        >
                          ⚡ Click to Auto-fill: 987654
                        </button>
                      </div>
                      <input
                        type="text"
                        maxLength={6}
                        value={loginOtp}
                        onChange={(e) => setLoginOtp(e.target.value.replace(/[^0-9]/g, ""))}
                        onKeyDown={(e) => e.key === "Enter" && handleVerifyOtp()}
                        placeholder="Enter 987654"
                        style={{
                          width: "100%",
                          background: "rgba(255,255,255,0.06)",
                          border: "1px solid rgba(59, 130, 246, 0.5)",
                          borderRadius: "10px",
                          padding: "14px 16px",
                          color: "#ffffff",
                          fontSize: "1.5rem",
                          letterSpacing: "0.3em",
                          textAlign: "center",
                          fontWeight: 700,
                          outline: "none",
                        }}
                        autoFocus
                      />
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px" }}>
                        <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
                          Enter demo OTP: <strong style={{ color: "#34d399" }}>987654</strong>
                        </span>
                        <button
                          type="button"
                          onClick={handleSendOtp}
                          disabled={isSubmittingAuth}
                          style={{ background: "none", border: "none", color: "#60a5fa", fontSize: "0.78rem", textDecoration: "underline", cursor: "pointer" }}
                        >
                          Resend OTP
                        </button>
                      </div>
                    </div>

                    {/* Verify & Login Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        handleVerifyOtp();
                      }}
                      disabled={isSubmittingAuth}
                      className="btn btn--primary"
                      style={{
                        padding: "14px",
                        borderRadius: "12px",
                        fontSize: "1.05rem",
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        cursor: "pointer",
                        background: "linear-gradient(135deg, #059669 0%, #047857 100%)",
                        border: "none",
                        color: "#ffffff",
                      }}
                    >
                      {isSubmittingAuth ? "Verifying..." : "Verify & Enter Hearing Portal (लॉगिन करें)"}
                      <ArrowRight size={18} />
                    </button>
                  </>
                )}
              </div>

              {/* 1-Click Quick Demo Accounts */}
              <div style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem" }}>
                  <Sparkles size={16} color="#fbbf24" />
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, letterSpacing: "0.05em", color: "#e2e8f0", textTransform: "uppercase" }}>
                    Quick 1-Click Login (Multi-Device Demo Testing)
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px" }}>
                  {QUICK_DEMO_USERS.map((u) => (
                    <button
                      key={u.phone}
                      type="button"
                      onClick={() => handleQuickLogin(u)}
                      disabled={isSubmittingAuth}
                      style={{
                        background: "rgba(255, 255, 255, 0.04)",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        borderRadius: "12px",
                        padding: "12px",
                        textAlign: "left",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                        display: "flex",
                        gap: "10px",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ fontSize: "1.6rem" }}>{u.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: "#ffffff", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{u.name}</span>
                        </div>
                        <div style={{ fontSize: "0.75rem", color: u.color, fontWeight: 600 }}>
                          {u.badge}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                          {u.phone}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER: AUTHENTICATED PORTAL VIEW
  // ═══════════════════════════════════════════════════════════

  return (
    <>
      {/* WhatsApp-Style Incoming Call Ringing Modal */}
      {incomingCall && (
        <IncomingCallModal
          callerName={incomingCall.callerName}
          callerDesignation={incomingCall.callerDesignation}
          subject={incomingCall.title}
          participantCount={incomingCall.participantCount}
          onAccept={handleAcceptIncomingCall}
          onDecline={handleDeclineIncomingCall}
        />
      )}

      {/* Toast Notification */}
      {renderToast()}

      <main className="main-layout">
        {/* Top Navbar with User Identity & Logout */}
        <header
          style={{
            background: "linear-gradient(135deg, #0f2847 0%, #0a192f 100%)",
            borderRadius: "16px",
            padding: "14px 20px",
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
          }}
        >
          {/* Brand & Emblem */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "1.8rem" }}>🏛️</span>
            <div>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", color: "#fbbf24", textTransform: "uppercase" }}>
                राजस्थान सरकार • Rajasthan Sampark
              </div>
              <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#ffffff", letterSpacing: "-0.01em" }}>
                जन सुनवाई वीडियो कॉन्फ्रेंस प्रणाली
              </div>
            </div>
          </div>

          {/* User Profile Badge & Logout */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <div
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "12px",
                padding: "8px 14px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <span style={{ fontSize: "1.3rem" }}>
                {currentUser.role === "officer" ? "🏛️" : currentUser.role === "employee" ? "👷" : "👤"}
              </span>
              <div>
                <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#ffffff" }}>
                  {currentUser.name}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#94a3b8", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span
                    style={{
                      background: currentUser.role === "officer" ? "rgba(16, 185, 129, 0.2)" : currentUser.role === "employee" ? "rgba(217, 119, 6, 0.2)" : "rgba(37, 99, 235, 0.2)",
                      color: currentUser.role === "officer" ? "#34d399" : currentUser.role === "employee" ? "#fbbf24" : "#60a5fa",
                      padding: "1px 6px",
                      borderRadius: "4px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                    }}
                  >
                    {currentUser.role}
                  </span>
                  <span>{currentUser.phone}</span>
                </div>
              </div>
              {/* WebSocket Status Indicator */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  padding: "4px 8px",
                  borderRadius: "20px",
                  background: wsConnected ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                  color: wsConnected ? "#34d399" : "#f87171",
                  border: wsConnected ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)",
                }}
              >
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: wsConnected ? "#10b981" : "#ef4444",
                  }}
                />
                {wsConnected ? "Online" : "Connecting"}
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              style={{
                background: "rgba(239, 68, 68, 0.12)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: "10px",
                padding: "8px 14px",
                color: "#fca5a5",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 0.2s ease",
              }}
            >
              <LogOut size={16} />
              Logout / Switch User
            </button>
          </div>
        </header>

        {/* ═══════════════════════════════════════════════════════
            VIEW 1: CITIZEN WAITING ROOM
            ═══════════════════════════════════════════════════════ */}
        {currentUser.role === "citizen" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {/* Live Listening Radar Banner */}
            <div
              style={{
                background: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
                borderRadius: "16px",
                padding: "2rem",
                border: "1px solid rgba(59, 130, 246, 0.3)",
                boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
                display: "flex",
                alignItems: "center",
                gap: "1.5rem",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  width: "70px",
                  height: "70px",
                  borderRadius: "50%",
                  background: "rgba(59, 130, 246, 0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "2px solid #38bdf8",
                  animation: "pulse 2s infinite",
                }}
              >
                <Radio size={36} color="#38bdf8" />
              </div>
              <div style={{ flex: 1, minWidth: "260px" }}>
                <div style={{ display: "inline-block", background: "rgba(16, 185, 129, 0.2)", color: "#34d399", padding: "3px 10px", borderRadius: "999px", fontSize: "0.8rem", fontWeight: 700, marginBottom: "6px" }}>
                  🟢 LIVE HEARING WAITING ROOM ACTIVE
                </div>
                <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#ffffff", margin: "0 0 6px" }}>
                  Waiting for Jan Sunwai Video Call
                </h2>
                <p style={{ fontSize: "0.95rem", color: "#cbd5e1", margin: 0, lineHeight: 1.5 }}>
                  Please keep this screen open on your device. When District Collector <strong>Sh. Alok Sharma, IAS</strong> or your assigned Field Officer calls you, this screen will immediately ring with a video call alert.
                </p>
              </div>
            </div>

            {/* Citizen's Grievance Records */}
            <div className="card">
              <div className="card__header">
                <div className="card__title">
                  <FileText size={20} color="#3b82f6" />
                  Your Registered Grievance (आपकी दर्ज शिकायत)
                </div>
                <span className="badge badge--success">Verified Sampark Record</span>
              </div>

              {isLoadingUserGrievances ? (
                <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
                  Loading grievance records for {currentUser.phone}...
                </div>
              ) : userGrievances.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {userGrievances.map((g) => (
                    <div
                      key={g.grievanceId}
                      style={{
                        background: "var(--navy-50)",
                        borderRadius: "12px",
                        padding: "1.2rem",
                        border: "1px solid var(--navy-100)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px", marginBottom: "8px" }}>
                        <div>
                          <span style={{ fontWeight: 800, color: "var(--navy-600)", fontSize: "1.05rem" }}>
                            {g.grievanceId}
                          </span>
                          <h3 style={{ margin: "4px 0", fontSize: "1.1rem", fontWeight: 700 }}>
                            {g.title}
                          </h3>
                        </div>
                        <span className="badge badge--primary">{g.status}</span>
                      </div>
                      <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", margin: "0 0 12px", lineHeight: 1.5 }}>
                        {g.description}
                      </p>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px", fontSize: "0.85rem", borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: "10px" }}>
                        <div>
                          <span style={{ color: "var(--text-tertiary)" }}>Location:</span> <strong>{g.location}</strong>
                        </div>
                        <div>
                          <span style={{ color: "var(--text-tertiary)" }}>Category:</span> <strong>{g.category}</strong>
                        </div>
                        <div>
                          <span style={{ color: "var(--text-tertiary)" }}>Assigned Officer:</span> <strong>{g.assignedEmployee.name} ({g.assignedEmployee.designation})</strong>
                        </div>
                        <div>
                          <span style={{ color: "var(--text-tertiary)" }}>Filed Date:</span> <strong>{g.filedDate}</strong>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
                  No active grievances currently found for phone {currentUser.phone}.
                </div>
              )}
            </div>

            {/* Video Hearing Instructions */}
            <div className="card">
              <div className="card__header">
                <div className="card__title">
                  <Shield size={20} color="#059669" />
                  Jan Sunwai Video Hearing Guidelines
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
                <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                  <span style={{ fontSize: "1.3rem" }}>🔊</span>
                  <div>
                    <strong>Keep Volume On</strong>
                    <p style={{ margin: "2px 0 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      Make sure your phone speaker or laptop sound is unmuted to hear the incoming ringtone.
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                  <span style={{ fontSize: "1.3rem" }}>📷</span>
                  <div>
                    <strong>Camera & Mic Ready</strong>
                    <p style={{ margin: "2px 0 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      When you click "Accept Call", grant browser permissions for your camera and microphone.
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                  <span style={{ fontSize: "1.3rem" }}>🏛️</span>
                  <div>
                    <strong>Direct Collector Hearing</strong>
                    <p style={{ margin: "2px 0 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      The District Collector and your local field officer will discuss your issue live.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            VIEW 2: FIELD OFFICER WAITING ROOM
            ═══════════════════════════════════════════════════════ */}
        {currentUser.role === "employee" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {/* Duty Active Radar Banner */}
            <div
              style={{
                background: "linear-gradient(135deg, #78350f 0%, #0f172a 100%)",
                borderRadius: "16px",
                padding: "2rem",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
                display: "flex",
                alignItems: "center",
                gap: "1.5rem",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  width: "70px",
                  height: "70px",
                  borderRadius: "50%",
                  background: "rgba(245, 158, 11, 0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "2px solid #fbbf24",
                  animation: "pulse 2s infinite",
                }}
              >
                <Briefcase size={36} color="#fbbf24" />
              </div>
              <div style={{ flex: 1, minWidth: "260px" }}>
                <div style={{ display: "inline-block", background: "rgba(245, 158, 11, 0.25)", color: "#fef3c7", padding: "3px 10px", borderRadius: "999px", fontSize: "0.8rem", fontWeight: 700, marginBottom: "6px" }}>
                  👷 FIELD OFFICER DUTY ACTIVE
                </div>
                <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#ffffff", margin: "0 0 6px" }}>
                  Ready for Jan Sunwai Video Hearing Summons
                </h2>
                <p style={{ fontSize: "0.95rem", color: "#cbd5e1", margin: 0, lineHeight: 1.5 }}>
                  {currentUser.name} • {currentUser.designation || "Field Officer"} ({currentUser.department || "Government of Rajasthan"}). Please keep this browser window open. When the District Magistrate commences the grievance hearing, you will receive an incoming video call.
                </p>
              </div>
            </div>

            {/* Assigned Grievances */}
            <div className="card">
              <div className="card__header">
                <div className="card__title">
                  <FileText size={20} color="#d97706" />
                  Your Assigned Grievance Cases (आपके अधिकार क्षेत्र की शिकायतें)
                </div>
                <span className="badge badge--warning">Action Pending</span>
              </div>

              {isLoadingUserGrievances ? (
                <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
                  Loading assigned cases for {currentUser.phone}...
                </div>
              ) : userGrievances.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {userGrievances.map((g) => (
                    <div
                      key={g.grievanceId}
                      style={{
                        background: "var(--navy-50)",
                        borderRadius: "12px",
                        padding: "1.2rem",
                        border: "1px solid var(--navy-100)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px", marginBottom: "8px" }}>
                        <div>
                          <span style={{ fontWeight: 800, color: "var(--navy-600)", fontSize: "1.05rem" }}>
                            {g.grievanceId}
                          </span>
                          <h3 style={{ margin: "4px 0", fontSize: "1.1rem", fontWeight: 700 }}>
                            {g.title}
                          </h3>
                        </div>
                        <span className="badge badge--warning">{g.status}</span>
                      </div>
                      <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", margin: "0 0 12px", lineHeight: 1.5 }}>
                        {g.description}
                      </p>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px", fontSize: "0.85rem", borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: "10px" }}>
                        <div>
                          <span style={{ color: "var(--text-tertiary)" }}>Citizen Complainant:</span> <strong>{g.citizen.name} ({g.citizen.phone})</strong>
                        </div>
                        <div>
                          <span style={{ color: "var(--text-tertiary)" }}>Location:</span> <strong>{g.location}</strong>
                        </div>
                        <div>
                          <span style={{ color: "var(--text-tertiary)" }}>Category:</span> <strong>{g.category}</strong>
                        </div>
                        <div>
                          <span style={{ color: "var(--text-tertiary)" }}>Filed Date:</span> <strong>{g.filedDate}</strong>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
                  No grievances assigned to phone {currentUser.phone}.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            VIEW 3: DISTRICT COLLECTOR / OFFICER DASHBOARD
            ═══════════════════════════════════════════════════════ */}
        {currentUser.role === "officer" && (
          <>
            {/* Page Header */}
            <div className="page-header">
              <h1 className="page-header__title">
                📋 Initiate Jan Sunwai Video Hearing
              </h1>
              <p className="page-header__desc">
                Presiding Officer: <strong>{currentUser.name}</strong> •{" "}
                {currentUser.designation || "District Collector & DM"}
              </p>
            </div>

            {/* Grievance Search Bar & Quick Cases */}
            <div className="card" style={{ marginBottom: "1.5rem" }}>
              <div className="card__header">
                <div className="card__title">
                  <Search size={20} color="var(--navy-600)" />
                  Search Grievance from Rajasthan Sampark Portal
                </div>
                <button
                  type="button"
                  className="btn btn--secondary"
                  style={{ padding: "6px 12px", fontSize: "0.8rem", gap: "6px" }}
                  onClick={() => setIsModalOpen(true)}
                >
                  <PlusCircle size={15} />
                  + File New Grievance (SQLite)
                </button>
              </div>

              <form onSubmit={handleSearchGrievance} className="search-box">
                <div className="search-box__input-wrapper">
                  <Search className="search-box__icon" size={18} />
                  <input
                    type="text"
                    className="search-box__input"
                    placeholder="Enter Grievance ID (e.g. RAJ-2024-88421, RAJ-2024-71205)"
                    value={grievanceId}
                    onChange={(e) => setGrievanceId(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn--primary search-box__button"
                  disabled={isSearching}
                >
                  {isSearching ? "Searching..." : "Fetch Grievance"}
                </button>
              </form>

              {searchError && (
                <div className="error-banner" style={{ marginTop: "1rem" }}>
                  <AlertCircle size={16} />
                  <span>{searchError}</span>
                </div>
              )}

              {/* Sample Grievances Quick Selection */}
              <div style={{ marginTop: "1.2rem", borderTop: "1px solid var(--border-subtle)", paddingTop: "0.8rem" }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", marginRight: "8px" }}>
                  Available in SQLite Database:
                </span>
                <div style={{ display: "inline-flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
                  {grievanceList.map((g) => (
                    <button
                      key={g.grievanceId}
                      type="button"
                      className="badge badge--info"
                      style={{ cursor: "pointer", border: "none", padding: "4px 10px" }}
                      onClick={() => {
                        setGrievanceId(g.grievanceId);
                        fetch(`${API_BASE}/api/sampark/grievance/${g.grievanceId}`)
                          .then((r) => r.json())
                          .then((d) => d.grievance && setGrievance(d.grievance));
                      }}
                    >
                      {g.grievanceId} — {g.title.slice(0, 32)}...
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Grievance Details & Call Initiation Panel */}
            {grievance && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.5rem", marginBottom: "1.5rem" }}>
                {/* Case Info Card */}
                <div className="card">
                  <div className="card__header">
                    <div className="card__title">
                      <FileText size={20} color="var(--navy-600)" />
                      Case Details — {grievance.grievanceId}
                    </div>
                    <span className="badge badge--warning">{grievance.status}</span>
                  </div>

                  <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: "0 0 8px" }}>
                    {grievance.title}
                  </h3>
                  <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", margin: "0 0 12px", lineHeight: 1.5 }}>
                    {grievance.description}
                  </p>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "0.85rem" }}>
                    <div>
                      <span style={{ color: "var(--text-tertiary)" }}>District:</span>{" "}
                      <strong>{grievance.district}</strong>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-tertiary)" }}>Category:</span>{" "}
                      <strong>{grievance.category}</strong>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-tertiary)" }}>Location:</span>{" "}
                      <strong>{grievance.location}</strong>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-tertiary)" }}>Filed Date:</span>{" "}
                      <strong>{grievance.filedDate}</strong>
                    </div>
                  </div>
                </div>

                {/* Call Targets & Start Video Call */}
                <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div>
                    <div className="card__header">
                      <div className="card__title">
                        <PhoneCall size={20} color="var(--emerald-600)" />
                        Simultaneous Call Recipients
                      </div>
                    </div>

                    {/* Citizen Card */}
                    <div style={{ background: "rgba(59, 130, 246, 0.08)", padding: "10px 14px", borderRadius: "10px", marginBottom: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#2563eb", textTransform: "uppercase" }}>
                          Caller 1 • Citizen Complainant
                        </div>
                        <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                          {grievance.citizen.name}
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                          {grievance.citizen.phone} • {grievance.citizen.village || grievance.citizen.district}
                        </div>
                      </div>
                      <span className="badge badge--info">Citizen</span>
                    </div>

                    {/* Employee Card */}
                    <div style={{ background: "rgba(245, 158, 11, 0.08)", padding: "10px 14px", borderRadius: "10px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#d97706", textTransform: "uppercase" }}>
                          Caller 2 • Assigned Field Officer
                        </div>
                        <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                          {grievance.assignedEmployee.name}
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                          {grievance.assignedEmployee.phone} • {grievance.assignedEmployee.designation} ({grievance.assignedEmployee.department})
                        </div>
                      </div>
                      <span className="badge badge--warning">Employee</span>
                    </div>

                    {/* Auto-record checkbox */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                      <input
                        type="checkbox"
                        id="autoRecord"
                        checked={autoRecord}
                        onChange={(e) => setAutoRecord(e.target.checked)}
                        style={{ width: "16px", height: "16px" }}
                      />
                      <label htmlFor="autoRecord" style={{ fontSize: "0.85rem", color: "var(--text-secondary)", cursor: "pointer" }}>
                        Auto-record hearing session for government compliance audit
                      </label>
                    </div>
                  </div>

                  {/* Start Video Hearing Button */}
                  <button
                    type="button"
                    className="btn btn--primary"
                    style={{
                      width: "100%",
                      padding: "16px",
                      fontSize: "1.1rem",
                      fontWeight: 800,
                      gap: "10px",
                      background: "linear-gradient(135deg, #059669 0%, #047857 100%)",
                      borderColor: "#059669",
                    }}
                    onClick={handleInitiateCall}
                    disabled={isCallInitiating}
                  >
                    <Video size={22} />
                    {isCallInitiating ? "Initiating LiveKit Video Conference..." : "Start Jan Sunwai Video Call"}
                  </button>
                </div>
              </div>
            )}

            {/* Hearing Call History (SQLite) */}
            <div className="card">
              <div className="card__header">
                <div className="card__title">
                  <Database size={20} color="var(--navy-600)" />
                  Recent Jan Sunwai Hearings & Call Records (SQLite)
                </div>
                <button
                  type="button"
                  className="btn btn--secondary"
                  style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                  onClick={fetchCallHistory}
                >
                  Refresh
                </button>
              </div>

              {callHistory.length > 0 ? (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid var(--border-subtle)", textAlign: "left" }}>
                        <th style={{ padding: "8px" }}>Hearing / Call ID</th>
                        <th style={{ padding: "8px" }}>Grievance ID</th>
                        <th style={{ padding: "8px" }}>Presiding Officer</th>
                        <th style={{ padding: "8px" }}>Status</th>
                        <th style={{ padding: "8px" }}>Duration</th>
                        <th style={{ padding: "8px" }}>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {callHistory.map((rec) => (
                        <tr key={rec.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          <td style={{ padding: "8px", fontFamily: "monospace" }}>{rec.id.slice(0, 8)}...</td>
                          <td style={{ padding: "8px", fontWeight: 600 }}>{rec.grievance_id || "N/A"}</td>
                          <td style={{ padding: "8px" }}>{rec.host_name}</td>
                          <td style={{ padding: "8px" }}>
                            <span className={`badge ${rec.status === "completed" ? "badge--success" : "badge--warning"}`}>
                              {rec.status}
                            </span>
                          </td>
                          <td style={{ padding: "8px" }}>{rec.duration_seconds ? `${rec.duration_seconds}s` : "—"}</td>
                          <td style={{ padding: "8px", color: "var(--text-tertiary)" }}>{rec.created_at}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                  No completed video hearings logged yet. Calls initiated from this portal will appear here automatically.
                </div>
              )}
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════
            MODAL: File New Grievance into SQLite
            ═══════════════════════════════════════════════════════ */}
        {isModalOpen && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: "1rem",
            }}
          >
            <div
              style={{
                background: "var(--bg-surface)",
                borderRadius: "16px",
                width: "100%",
                maxWidth: "640px",
                maxHeight: "90vh",
                overflowY: "auto",
                boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
                border: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  padding: "16px 20px",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <PlusCircle size={20} color="var(--color-primary)" />
                  <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
                    File New Grievance into SQLite Database
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleCreateGrievance} style={{ padding: "20px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px" }}>
                      Grievance Title *
                    </label>
                    <input
                      type="text"
                      style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--border)" }}
                      placeholder="e.g. Drinking water supply broken in Ward 15"
                      value={newGrievanceForm.title}
                      onChange={(e) => setNewGrievanceForm({ ...newGrievanceForm, title: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px" }}>
                      Description *
                    </label>
                    <textarea
                      style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--border)", minHeight: "70px" }}
                      placeholder="Detailed issue description..."
                      value={newGrievanceForm.description}
                      onChange={(e) => setNewGrievanceForm({ ...newGrievanceForm, description: e.target.value })}
                      required
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px" }}>
                        District
                      </label>
                      <input
                        type="text"
                        style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border)" }}
                        value={newGrievanceForm.district}
                        onChange={(e) => setNewGrievanceForm({ ...newGrievanceForm, district: e.target.value })}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "4px" }}>
                        Location / Ward
                      </label>
                      <input
                        type="text"
                        style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border)" }}
                        value={newGrievanceForm.location}
                        onChange={(e) => setNewGrievanceForm({ ...newGrievanceForm, location: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Citizen Info */}
                  <div style={{ background: "rgba(59, 130, 246, 0.05)", padding: "12px", borderRadius: "10px", border: "1px solid rgba(59, 130, 246, 0.2)" }}>
                    <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#2563eb", marginBottom: "8px" }}>
                      👤 Citizen Information (Caller 1)
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "4px" }}>
                          Citizen Name *
                        </label>
                        <input
                          type="text"
                          style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border)" }}
                          placeholder="e.g. Ramesh Kumar"
                          value={newGrievanceForm.citizenName}
                          onChange={(e) => setNewGrievanceForm({ ...newGrievanceForm, citizenName: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "4px" }}>
                          Citizen Phone Number *
                        </label>
                        <input
                          type="text"
                          style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border)" }}
                          placeholder="+919829123456"
                          value={newGrievanceForm.citizenPhone}
                          onChange={(e) => setNewGrievanceForm({ ...newGrievanceForm, citizenPhone: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Assigned Employee Info */}
                  <div style={{ background: "rgba(245, 158, 11, 0.05)", padding: "12px", borderRadius: "10px", border: "1px solid rgba(245, 158, 11, 0.2)" }}>
                    <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#d97706", marginBottom: "8px" }}>
                      👷 Assigned Field Employee (Caller 2)
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "4px" }}>
                          Employee Name *
                        </label>
                        <input
                          type="text"
                          style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border)" }}
                          placeholder="e.g. Rajesh Sharma"
                          value={newGrievanceForm.employeeName}
                          onChange={(e) => setNewGrievanceForm({ ...newGrievanceForm, employeeName: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "4px" }}>
                          Employee Phone Number *
                        </label>
                        <input
                          type="text"
                          style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border)" }}
                          placeholder="+919414234567"
                          value={newGrievanceForm.employeePhone}
                          onChange={(e) => setNewGrievanceForm({ ...newGrievanceForm, employeePhone: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "0.5rem" }}>
                    <button
                      type="button"
                      className="btn"
                      style={{ padding: "8px 16px" }}
                      onClick={() => setIsModalOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn--primary"
                      style={{ padding: "8px 20px" }}
                      disabled={isSubmittingGrievance}
                    >
                      {isSubmittingGrievance ? "Saving to SQLite..." : "Save Grievance to SQLite"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
