"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  Search,
  Phone,
  PhoneCall,
  UserPlus,
  Building2,
  CheckCircle,
  AlertCircle,
  BadgeCheck,
  Loader2,
  Users,
  MapPin,
  Sparkles,
} from "lucide-react";

interface Officer {
  name: string;
  phone: string;
  designation: string;
  department: string;
  postingDistrict?: string;
  employeeCode?: string;
}

const DEFAULT_DEPARTMENTS = [
  "District Administration & Collectorate",
  "Energy / JVVNL (विद्युत निगम)",
  "Food & Civil Supplies (खाद्य एवं रसद विभाग)",
  "General Administration Department",
  "Medical & Health Department (चिकित्सा विभाग)",
  "PHED (जल प्रदाय विभाग)",
  "PHED — Public Health Engineering",
  "PWD (सार्वजनिक निर्माण विभाग)",
  "Panchayati Raj & Rural Development (पंचायती राज)",
  "Rajasthan Police (राजस्थान पुलिस)",
  "Revenue & Sub-Divisional Administration",
  "Revenue Department (राजस्व विभाग)",
  "Rural Development & Panchayati Raj",
  "Social Justice & Empowerment (सामाजिक न्याय)",
];

interface AddPersonModalProps {
  isOpen: boolean;
  onClose: () => void;
  callId?: string;
  roomName?: string;
  apiBase?: string;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

export default function AddPersonModal({
  isOpen,
  onClose,
  callId,
  roomName,
  apiBase = "",
  onSuccess,
  onError,
}: AddPersonModalProps) {
  const [activeTab, setActiveTab] = useState<"directory" | "phone">("directory");

  // Tab 1: Directory search state
  const [departments, setDepartments] = useState<string[]>(DEFAULT_DEPARTMENTS);
  const [designations, setDesignations] = useState<string[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>("");
  const [selectedDesig, setSelectedDesig] = useState<string>("");
  const [nameQuery, setNameQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Officer[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Tab 2: Direct phone dial state
  const [customPhone, setCustomPhone] = useState("");
  const [customName, setCustomName] = useState("");
  const [customRole, setCustomRole] = useState("");
  const [customDept, setCustomDept] = useState("");
  const [lookupResult, setLookupResult] = useState<{
    found: boolean;
    name?: string;
    designation?: string;
    department?: string;
    role?: string;
  } | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);

  // Dialing state & Feedback
  const [dialingPhone, setDialingPhone] = useState<string | null>(null);
  const [dialStatusMsg, setDialStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const searchTimeoutRef = useRef<any>(null);
  const cleanApi = (apiBase || "").replace(/\/+$/, "");

  // 1. Fetch departments
  const fetchDepartments = useCallback(async () => {
    try {
      const res = await fetch(`${cleanApi}/api/sampark/departments`, {
        headers: { "Bypass-Tunnel-Reminder": "true" },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.departments) && data.departments.length > 0) {
          setDepartments(data.departments);
          return;
        }
      }
    } catch (e) {
      console.warn("[AddPerson] Error fetching departments:", e);
    }
    setDepartments(DEFAULT_DEPARTMENTS);
  }, [cleanApi]);

  // 2. Fetch designations (optionally filtered by department)
  const fetchDesignations = useCallback(
    async (dept?: string) => {
      try {
        const param = dept ? `?department=${encodeURIComponent(dept)}` : "";
        const res = await fetch(`${cleanApi}/api/sampark/designations${param}`, {
          headers: { "Bypass-Tunnel-Reminder": "true" },
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.designations)) {
            setDesignations(data.designations);
          }
        }
      } catch (e) {
        console.warn("[AddPerson] Error fetching designations:", e);
      }
    },
    [cleanApi]
  );

  // 3. Search officers in database
  const handleSearch = useCallback(
    async (name: string, dept: string, desig: string) => {
      setIsSearching(true);
      try {
        const params = new URLSearchParams();
        if (name.trim()) params.set("q", name.trim());
        if (dept.trim()) params.set("department", dept.trim());
        if (desig.trim()) params.set("designation", desig.trim());

        const res = await fetch(`${cleanApi}/api/sampark/officers?${params.toString()}`, {
          headers: { "Bypass-Tunnel-Reminder": "true" },
        });
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.officers || []);
        }
      } catch (err) {
        console.warn("[AddPerson] Search error:", err);
      } finally {
        setIsSearching(false);
      }
    },
    [cleanApi]
  );

  // Initial load when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchDepartments();
      fetchDesignations(selectedDept);
      handleSearch(nameQuery, selectedDept, selectedDesig);
      setDialStatusMsg(null);
    }
  }, [isOpen, fetchDepartments, fetchDesignations, handleSearch, selectedDept, selectedDesig, nameQuery]);

  // Debounced Name Search input
  const handleNameChange = (text: string) => {
    setNameQuery(text);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      handleSearch(text, selectedDept, selectedDesig);
    }, 250);
  };

  // Department change
  const handleDeptChange = (dept: string) => {
    setSelectedDept(dept);
    setSelectedDesig("");
    fetchDesignations(dept);
    handleSearch(nameQuery, dept, "");
  };

  // Designation change
  const handleDesigChange = (desig: string) => {
    setSelectedDesig(desig);
    handleSearch(nameQuery, selectedDept, desig);
  };

  // Tab 2: Mobile Number input with auto-lookup
  const handlePhoneChange = async (text: string) => {
    setCustomPhone(text);
    const digitsOnly = text.replace(/\D/g, "");
    const last10 = digitsOnly.slice(-10);

    if (last10.length === 10) {
      setIsLookingUp(true);
      try {
        const res = await fetch(`${cleanApi}/api/sampark/lookup-phone/${encodeURIComponent(last10)}`, {
          headers: { "Bypass-Tunnel-Reminder": "true" },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.found && data.user) {
            setLookupResult({
              found: true,
              name: data.user.name,
              designation: data.user.designation,
              department: data.user.department,
              role: data.user.role,
            });
            setCustomName(data.user.name || "");
            setCustomRole(data.user.designation || "Official");
            setCustomDept(data.user.department || "");
            return;
          }
        }
        setLookupResult({ found: false });
        if (!customName.trim()) setCustomName("Guest Participant");
        if (!customRole.trim()) setCustomRole("Citizen / Guest");
      } catch {
        setLookupResult({ found: false });
      } finally {
        setIsLookingUp(false);
      }
    } else {
      setLookupResult(null);
    }
  };

  // Dial & ring participant into active hearing
  const handleDialParticipant = async (participant: {
    phone: string;
    name: string;
    designation: string;
    department: string;
  }) => {
    const targetId = callId || roomName;
    if (!targetId) {
      setDialStatusMsg({ type: "error", text: "No active hearing session ID found." });
      return;
    }

    setDialingPhone(participant.phone);
    setDialStatusMsg(null);

    try {
      const res = await fetch(`${cleanApi}/api/calls/${encodeURIComponent(targetId)}/add-officer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Bypass-Tunnel-Reminder": "true" },
        body: JSON.stringify({
          phone: participant.phone,
          name: participant.name,
          designation: participant.designation,
          department: participant.department,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        const msg = `📞 Dialing & ringing ${participant.name} (${participant.phone})...`;
        setDialStatusMsg({ type: "success", text: msg });
        onSuccess?.(msg);
      } else {
        const errMsg = data.error || "Failed to ring participant.";
        setDialStatusMsg({ type: "error", text: errMsg });
        onError?.(errMsg);
      }
    } catch (err: any) {
      const errMsg = err?.message || "Network error. Could not connect to server.";
      setDialStatusMsg({ type: "error", text: errMsg });
      onError?.(errMsg);
    } finally {
      setDialingPhone(null);
    }
  };

  // Submit direct dial form (Tab 2)
  const handleDirectDialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = customPhone.replace(/\D/g, "");
    const last10 = digits.slice(-10);

    if (last10.length !== 10) {
      setDialStatusMsg({ type: "error", text: "Please enter a valid 10-digit mobile number." });
      return;
    }

    const formattedPhone = `+91${last10}`;
    const formattedName = customName.trim() || `Guest (+91 ${last10})`;
    const formattedRole = customRole.trim() || "Guest Participant";
    const formattedDept = customDept.trim() || "External Direct Call";

    await handleDialParticipant({
      phone: formattedPhone,
      name: formattedName,
      designation: formattedRole,
      department: formattedDept,
    });
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        background: "rgba(3, 7, 18, 0.82)",
        backdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        boxSizing: "border-box",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(680px, 96vw)",
          maxHeight: "88vh",
          background: "#0c1524",
          border: "1px solid rgba(56, 189, 248, 0.35)",
          borderRadius: "16px",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 60px rgba(0, 0, 0, 0.9), 0 0 40px rgba(56, 189, 248, 0.15)",
          color: "#f8fafc",
          overflow: "hidden",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "14px 20px",
            background: "linear-gradient(90deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.95))",
            borderBottom: "1px solid rgba(255, 255, 255, 0.12)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "rgba(16, 185, 129, 0.2)",
                border: "1px solid rgba(16, 185, 129, 0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#34d399",
              }}
            >
              <UserPlus size={20} />
            </div>
            <div>
              <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#ffffff", letterSpacing: "0.2px" }}>
                Add Person to Hearing (व्यक्ति/अधिकारी जोड़ें)
              </div>
              <div style={{ fontSize: "0.76rem", color: "#38bdf8", fontWeight: 600, marginTop: "2px" }}>
                Jan Sunwai Official Room • {roomName || callId || "Active Hearing"}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              color: "#94a3b8",
              cursor: "pointer",
              borderRadius: "8px",
              padding: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s ease",
            }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Status Message Banner (if any) */}
        {dialStatusMsg && (
          <div
            style={{
              padding: "10px 16px",
              background:
                dialStatusMsg.type === "success"
                  ? "rgba(16, 185, 129, 0.2)"
                  : "rgba(239, 68, 68, 0.2)",
              borderBottom: `1px solid ${
                dialStatusMsg.type === "success" ? "#10b981" : "#ef4444"
              }`,
              color: dialStatusMsg.type === "success" ? "#34d399" : "#fca5a5",
              fontSize: "0.82rem",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {dialStatusMsg.type === "success" ? (
              <CheckCircle size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
            <span>{dialStatusMsg.text}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
            background: "rgba(10, 18, 32, 0.95)",
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("directory")}
            style={{
              flex: 1,
              padding: "11px 16px",
              background: activeTab === "directory" ? "rgba(56, 189, 248, 0.15)" : "transparent",
              border: "none",
              borderBottom: activeTab === "directory" ? "2px solid #38bdf8" : "2px solid transparent",
              color: activeTab === "directory" ? "#38bdf8" : "#94a3b8",
              fontSize: "0.84rem",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "7px",
              transition: "all 0.15s ease",
            }}
          >
            <Building2 size={16} />
            <span>Search Govt. Directory (विभागीय खोज)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("phone")}
            style={{
              flex: 1,
              padding: "11px 16px",
              background: activeTab === "phone" ? "rgba(16, 185, 129, 0.15)" : "transparent",
              border: "none",
              borderBottom: activeTab === "phone" ? "2px solid #10b981" : "2px solid transparent",
              color: activeTab === "phone" ? "#34d399" : "#94a3b8",
              fontSize: "0.84rem",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "7px",
              transition: "all 0.15s ease",
            }}
          >
            <Phone size={16} />
            <span>Direct Mobile Number (सीधे मोबाइल से जोड़ें)</span>
          </button>
        </div>

        {/* Tab Content Area */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {activeTab === "directory" ? (
            /* ══════════════════════════════════════════════════════════
               TAB 1: SEARCH OFFICIAL DIRECTORY
               ══════════════════════════════════════════════════════════ */
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {/* Filter Controls Row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {/* Department Dropdown */}
                <div>
                  <label style={{ display: "block", fontSize: "0.76rem", fontWeight: 700, color: "#cbd5e1", marginBottom: "5px" }}>
                    1. Department (विभाग चुनें):
                  </label>
                  <select
                    value={selectedDept}
                    onChange={(e) => handleDeptChange(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      background: "rgba(15, 23, 42, 0.9)",
                      border: "1px solid rgba(255, 255, 255, 0.18)",
                      borderRadius: "8px",
                      color: "#f8fafc",
                      fontSize: "0.8rem",
                      cursor: "pointer",
                      outline: "none",
                    }}
                  >
                    <option value="">🏛️ All Departments (सभी विभाग)</option>
                    {departments.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Designation Dropdown */}
                <div>
                  <label style={{ display: "block", fontSize: "0.76rem", fontWeight: 700, color: "#cbd5e1", marginBottom: "5px" }}>
                    2. Designation (पद चुनें):
                  </label>
                  <select
                    value={selectedDesig}
                    onChange={(e) => handleDesigChange(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      background: "rgba(15, 23, 42, 0.9)",
                      border: "1px solid rgba(255, 255, 255, 0.18)",
                      borderRadius: "8px",
                      color: "#f8fafc",
                      fontSize: "0.8rem",
                      cursor: "pointer",
                      outline: "none",
                    }}
                  >
                    <option value="">🎖️ All Designations (सभी पद)</option>
                    {designations.map((desig) => (
                      <option key={desig} value={desig}>
                        {desig}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Name Search Row */}
              <div>
                <label style={{ display: "block", fontSize: "0.76rem", fontWeight: 700, color: "#cbd5e1", marginBottom: "5px" }}>
                  3. Search Employee Name (कर्मचारी का नाम):
                </label>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <Search size={16} style={{ position: "absolute", left: "12px", color: "#64748b" }} />
                  <input
                    type="text"
                    value={nameQuery}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="e.g. Chandan, Priya, Sharma, Collector..."
                    style={{
                      width: "100%",
                      padding: "9px 12px 9px 36px",
                      background: "rgba(15, 23, 42, 0.9)",
                      border: "1px solid rgba(56, 189, 248, 0.4)",
                      borderRadius: "8px",
                      color: "#f8fafc",
                      fontSize: "0.84rem",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                  {isSearching && (
                    <Loader2
                      size={16}
                      style={{ position: "absolute", right: "12px", color: "#38bdf8", animation: "spin 1s linear infinite" }}
                    />
                  )}
                </div>
              </div>

              {/* Search Results Roster */}
              <div style={{ marginTop: "4px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "8px",
                    paddingBottom: "4px",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                  }}
                >
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#94a3b8" }}>
                    Matching Directory Officers ({searchResults.length})
                  </span>
                  {(selectedDept || selectedDesig || nameQuery) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDept("");
                        setSelectedDesig("");
                        setNameQuery("");
                        handleSearch("", "", "");
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#38bdf8",
                        fontSize: "0.72rem",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      Clear Filters ✕
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "280px", overflowY: "auto" }}>
                  {isSearching ? (
                    <div style={{ padding: "24px", textAlign: "center", color: "#94a3b8", fontSize: "0.82rem" }}>
                      Searching Rajasthan Government Directory...
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div
                      style={{
                        padding: "24px",
                        textAlign: "center",
                        color: "#94a3b8",
                        fontSize: "0.82rem",
                        background: "rgba(0,0,0,0.25)",
                        borderRadius: "10px",
                        border: "1px dashed rgba(255,255,255,0.1)",
                      }}
                    >
                      <div style={{ fontWeight: 600, color: "#cbd5e1" }}>No matching officer found in directory</div>
                      <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "4px" }}>
                        Try changing the department filter, or dial them directly by mobile number.
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab("phone")}
                        style={{
                          marginTop: "10px",
                          background: "rgba(16, 185, 129, 0.2)",
                          border: "1px solid rgba(16, 185, 129, 0.4)",
                          color: "#34d399",
                          borderRadius: "6px",
                          padding: "5px 12px",
                          fontSize: "0.76rem",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        📱 Switch to Direct Mobile Dial →
                      </button>
                    </div>
                  ) : (
                    searchResults.map((officer) => {
                      const isRinging = dialingPhone === officer.phone;
                      return (
                        <div
                          key={officer.phone}
                          style={{
                            background: "rgba(20, 31, 48, 0.75)",
                            border: "1px solid rgba(255, 255, 255, 0.08)",
                            borderRadius: "10px",
                            padding: "10px 14px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "12px",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "#f8fafc" }}>
                                {officer.name}
                              </span>
                              {officer.employeeCode && (
                                <span
                                  style={{
                                    fontSize: "0.64rem",
                                    padding: "1px 6px",
                                    borderRadius: "4px",
                                    background: "rgba(56, 189, 248, 0.2)",
                                    color: "#38bdf8",
                                    fontWeight: 700,
                                  }}
                                >
                                  {officer.employeeCode}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: "0.76rem", color: "#cbd5e1", marginTop: "2px" }}>
                              {officer.designation}
                            </div>
                            <div style={{ fontSize: "0.72rem", color: "#94a3b8", display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                              <span>🏛️ {officer.department}</span>
                              {officer.postingDistrict && (
                                <>
                                  <span>•</span>
                                  <span>📍 {officer.postingDistrict}</span>
                                </>
                              )}
                            </div>
                            <div style={{ fontSize: "0.72rem", color: "#38bdf8", fontFamily: "monospace", marginTop: "3px" }}>
                              📞 {officer.phone}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDialParticipant(officer)}
                            disabled={isRinging}
                            style={{
                              padding: "7px 14px",
                              borderRadius: "8px",
                              border: "1px solid #10b981",
                              background: isRinging
                                ? "rgba(100, 116, 139, 0.3)"
                                : "linear-gradient(135deg, #10b981, #059669)",
                              color: "#ffffff",
                              fontSize: "0.78rem",
                              fontWeight: 700,
                              cursor: isRinging ? "wait" : "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              flexShrink: 0,
                              boxShadow: isRinging ? "none" : "0 2px 10px rgba(16, 185, 129, 0.4)",
                            }}
                          >
                            {isRinging ? (
                              <>
                                <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                                <span>Ringing...</span>
                              </>
                            ) : (
                              <>
                                <PhoneCall size={13} />
                                <span>+ Dial In</span>
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* ══════════════════════════════════════════════════════════
               TAB 2: DIAL BY DIRECT MOBILE NUMBER
               ══════════════════════════════════════════════════════════ */
            <form onSubmit={handleDirectDialSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div
                style={{
                  padding: "10px 14px",
                  background: "rgba(56, 189, 248, 0.1)",
                  border: "1px solid rgba(56, 189, 248, 0.3)",
                  borderRadius: "10px",
                  fontSize: "0.78rem",
                  color: "#e0f2fe",
                  lineHeight: "1.4",
                }}
              >
                💡 Enter any 10-digit mobile number. The system will auto-check the Rajasthan Government directory. If registered, their official identity is verified; otherwise they join as an invited Guest Participant.
              </div>

              {/* Mobile Number Input with Flag */}
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "#cbd5e1", marginBottom: "6px" }}>
                  Mobile Number (10-अंकीय मोबाइल नंबर):
                </label>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <div
                    style={{
                      padding: "9px 12px",
                      background: "rgba(15, 23, 42, 0.9)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      borderRadius: "8px",
                      fontSize: "0.84rem",
                      fontWeight: 700,
                      color: "#94a3b8",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <span>🇮🇳</span>
                    <span>+91</span>
                  </div>
                  <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center" }}>
                    <input
                      type="tel"
                      value={customPhone}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      placeholder="e.g. 9414000003 or 7749852013"
                      maxLength={10}
                      style={{
                        width: "100%",
                        padding: "9px 12px",
                        background: "rgba(15, 23, 42, 0.9)",
                        border: "1px solid rgba(56, 189, 248, 0.4)",
                        borderRadius: "8px",
                        color: "#ffffff",
                        fontSize: "0.9rem",
                        fontFamily: "monospace",
                        letterSpacing: "1px",
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                    {isLookingUp && (
                      <Loader2
                        size={16}
                        style={{ position: "absolute", right: "12px", color: "#10b981", animation: "spin 1s linear infinite" }}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Verified Officer / Guest Status Banner */}
              {lookupResult?.found ? (
                <div
                  style={{
                    padding: "10px 14px",
                    background: "rgba(16, 185, 129, 0.16)",
                    border: "1px solid rgba(16, 185, 129, 0.45)",
                    borderRadius: "10px",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                  }}
                >
                  <BadgeCheck size={20} style={{ color: "#34d399", flexShrink: 0, marginTop: "2px" }} />
                  <div>
                    <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#34d399" }}>
                      ✅ Verified in Rajasthan Govt Directory
                    </div>
                    <div style={{ fontSize: "0.84rem", fontWeight: 700, color: "#ffffff", marginTop: "2px" }}>
                      {lookupResult.name}
                    </div>
                    <div style={{ fontSize: "0.74rem", color: "#cbd5e1" }}>
                      {lookupResult.designation} • {lookupResult.department}
                    </div>
                  </div>
                </div>
              ) : lookupResult?.found === false && customPhone.replace(/\D/g, "").length === 10 ? (
                <div
                  style={{
                    padding: "10px 14px",
                    background: "rgba(245, 158, 11, 0.14)",
                    border: "1px solid rgba(245, 158, 11, 0.4)",
                    borderRadius: "10px",
                    fontSize: "0.78rem",
                    color: "#fde047",
                    lineHeight: "1.35",
                  }}
                >
                  ℹ️ Not registered in employee directory — will ring and connect as an invited Guest Participant.
                </div>
              ) : null}

              {/* Editable Name Field */}
              <div>
                <label style={{ display: "block", fontSize: "0.76rem", fontWeight: 700, color: "#cbd5e1", marginBottom: "5px" }}>
                  Participant Name (नाम):
                </label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. Smt. Priya Mathur / Citizen"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "rgba(15, 23, 42, 0.9)",
                    border: "1px solid rgba(255, 255, 255, 0.18)",
                    borderRadius: "8px",
                    color: "#f8fafc",
                    fontSize: "0.82rem",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Editable Designation / Role Field */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.76rem", fontWeight: 700, color: "#cbd5e1", marginBottom: "5px" }}>
                    Designation / Role (पद/भूमिका):
                  </label>
                  <input
                    type="text"
                    value={customRole}
                    onChange={(e) => setCustomRole(e.target.value)}
                    placeholder="e.g. Tehsildar / Citizen"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "rgba(15, 23, 42, 0.9)",
                      border: "1px solid rgba(255, 255, 255, 0.18)",
                      borderRadius: "8px",
                      color: "#f8fafc",
                      fontSize: "0.82rem",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.76rem", fontWeight: 700, color: "#cbd5e1", marginBottom: "5px" }}>
                    Department (विभाग):
                  </label>
                  <input
                    type="text"
                    value={customDept}
                    onChange={(e) => setCustomDept(e.target.value)}
                    placeholder="e.g. Revenue / General"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "rgba(15, 23, 42, 0.9)",
                      border: "1px solid rgba(255, 255, 255, 0.18)",
                      borderRadius: "8px",
                      color: "#f8fafc",
                      fontSize: "0.82rem",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              {/* Submit Dial Button */}
              <button
                type="submit"
                disabled={customPhone.replace(/\D/g, "").length !== 10 || !!dialingPhone}
                style={{
                  marginTop: "6px",
                  padding: "11px",
                  borderRadius: "10px",
                  border: "1px solid #10b981",
                  background:
                    customPhone.replace(/\D/g, "").length !== 10 || !!dialingPhone
                      ? "rgba(100, 116, 139, 0.3)"
                      : "linear-gradient(135deg, #10b981, #059669)",
                  color: "#ffffff",
                  fontSize: "0.88rem",
                  fontWeight: 800,
                  cursor:
                    customPhone.replace(/\D/g, "").length !== 10 || !!dialingPhone
                      ? "not-allowed"
                      : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  boxShadow:
                    customPhone.replace(/\D/g, "").length !== 10 || !!dialingPhone
                      ? "none"
                      : "0 4px 16px rgba(16, 185, 129, 0.4)",
                  transition: "all 0.15s ease",
                }}
              >
                {dialingPhone ? (
                  <>
                    <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                    <span>Dialing & Ringing Participant...</span>
                  </>
                ) : (
                  <>
                    <PhoneCall size={16} />
                    <span>
                      {lookupResult?.found
                        ? `📞 Ring & Call ${customName || "Official"} into Hearing`
                        : `📞 Ring & Call into Hearing as Guest`}
                    </span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
