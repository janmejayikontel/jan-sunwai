import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

interface Officer {
  name: string;
  phone: string;
  designation: string;
  department: string;
  postingDistrict?: string;
  employeeCode?: string;
}

interface AddParticipantModalProps {
  visible: boolean;
  grievanceId: string;
  callId?: string;
  serverUrl: string;
  onClose: () => void;
}

export const AddParticipantModal: React.FC<AddParticipantModalProps> = ({
  visible,
  grievanceId,
  callId,
  serverUrl,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'directory' | 'phone'>('directory');

  // Tab 1: Directory Search
  const [departments, setDepartments] = useState<string[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Tab 2: Direct Phone Dial with Auto-Lookup
  const [customPhone, setCustomPhone] = useState('');
  const [customName, setCustomName] = useState('');
  const [customRole, setCustomRole] = useState('');
  const [customDept, setCustomDept] = useState('');
  const [lookupResult, setLookupResult] = useState<{
    found: boolean;
    name?: string;
    designation?: string;
    department?: string;
    role?: string;
  } | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isDialing, setIsDialing] = useState(false);
  const [dialingPhone, setDialingPhone] = useState<string | null>(null);

  const cleanUrl = serverUrl.replace(/\/+$/, '');

  // Fetch departments list from server
  const fetchDepartments = useCallback(async () => {
    try {
      const res = await fetch(`${cleanUrl}/api/sampark/departments`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.departments)) {
          setDepartments(data.departments);
        }
      }
    } catch (e) {
      console.warn('Error fetching departments:', e);
    }
  }, [cleanUrl]);

  // Search officer directory by name/phone & department (same as website!)
  const searchDirectory = useCallback(async (query: string, dept: string) => {
    setIsSearching(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (dept.trim()) params.set('department', dept.trim());

      const res = await fetch(`${cleanUrl}/api/sampark/officers?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setOfficers(data.officers || []);
      }
    } catch (err) {
      console.warn('Directory search error:', err);
    } finally {
      setIsSearching(false);
    }
  }, [cleanUrl]);

  useEffect(() => {
    if (visible) {
      fetchDepartments();
      searchDirectory(searchQuery, selectedDept);
    }
  }, [visible, fetchDepartments, searchDirectory, searchQuery, selectedDept]);

  // Automatic Database Lookup when 10 digits are typed in Tab 2!
  const handlePhoneInputChange = async (text: string) => {
    setCustomPhone(text);
    const digitsOnly = text.replace(/[^0-9]/g, '');
    const last10 = digitsOnly.slice(-10);

    if (last10.length === 10) {
      setIsLookingUp(true);
      try {
        const lookupRes = await fetch(`${cleanUrl}/api/sampark/lookup-phone/${encodeURIComponent(last10)}`);
        if (lookupRes.ok) {
          const data = await lookupRes.json();
          if (data.found && data.user) {
            setLookupResult({
              found: true,
              name: data.user.name,
              designation: data.user.designation,
              department: data.user.department,
              role: data.user.role,
            });
            // Automatically fill name and designation from database!
            setCustomName(data.user.name);
            setCustomRole(data.user.designation);
            setCustomDept(data.user.department || '');
            return;
          }
        }
        setLookupResult({ found: false });
      } catch (err) {
        setLookupResult({ found: false });
      } finally {
        setIsLookingUp(false);
      }
    } else {
      setLookupResult(null);
    }
  };

  // Ring & Add participant to the live hearing
  const handleAddParticipant = async (participant: {
    phone: string;
    name: string;
    designation: string;
    department: string;
  }) => {
    const targetId = callId || grievanceId;
    setDialingPhone(participant.phone);

    try {
      const res = await fetch(`${cleanUrl}/api/calls/${encodeURIComponent(targetId)}/add-officer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: participant.phone,
          name: participant.name,
          designation: participant.designation,
          department: participant.department,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        Alert.alert(
          '📞 Dialing Official',
          `Calling ${participant.name} (${participant.phone}). They are ringing now and will enter the video room once they answer.`
        );
        onClose();
      } else {
        Alert.alert('Unable to Ring', data.error || 'Failed to add participant to hearing.');
      }
    } catch (err: any) {
      Alert.alert('Network Error', err?.message || 'Could not connect to server.');
    } finally {
      setDialingPhone(null);
    }
  };

  // Submit from Tab 2
  const handleDirectDial = async () => {
    const raw = customPhone.replace(/[^0-9]/g, '');
    const last10 = raw.slice(-10);
    if (last10.length !== 10) {
      Alert.alert('Invalid Mobile Number', 'Please enter a valid 10-digit mobile number.');
      return;
    }

    const formattedPhone = `+91${last10}`;
    const formattedName = customName.trim() || `Participant (${last10.slice(-4)})`;
    const formattedRole = customRole.trim() || 'Official / Complainant';
    const formattedDept = customDept.trim() || 'External Direct Call';

    setIsDialing(true);
    try {
      await handleAddParticipant({
        phone: formattedPhone,
        name: formattedName,
        designation: formattedRole,
        department: formattedDept,
      });
      setCustomPhone('');
      setCustomName('');
      setCustomRole('');
      setLookupResult(null);
    } finally {
      setIsDialing(false);
    }
  };

  return (
    <Modal visible={visible} transparent={true} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <View style={styles.modalSheet}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.headerInfo}>
              <Text style={styles.sheetTitle}>➕ Add Person to Hearing</Text>
              <Text style={styles.sheetSubtitle}>Jan Sunwai • Case #{grievanceId}</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Tab Navigation (Identical to Website!) */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'directory' && styles.tabBtnActiveDir]}
              onPress={() => setActiveTab('directory')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.tabBtnText,
                  activeTab === 'directory' && styles.tabBtnTextActive,
                ]}
              >
                🏛️ Employee List (कर्मचारी)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'phone' && styles.tabBtnActivePhone]}
              onPress={() => setActiveTab('phone')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.tabBtnText,
                  activeTab === 'phone' && styles.tabBtnTextActive,
                ]}
              >
                📱 By Phone No. (अन्य व्यक्ति)
              </Text>
            </TouchableOpacity>
          </View>

          {/* TAB 1: EMPLOYEE DIRECTORY SEARCH & DEPARTMENT FILTER */}
          {activeTab === 'directory' ? (
            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
              {/* Department Filter Chips */}
              <View style={styles.deptSection}>
                <Text style={styles.fieldLabel}>Filter by Department (विभाग चुनें):</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.deptScroll}>
                  <TouchableOpacity
                    style={[styles.deptChip, selectedDept === '' && styles.deptChipActive]}
                    onPress={() => {
                      setSelectedDept('');
                      searchDirectory(searchQuery, '');
                    }}
                  >
                    <Text style={[styles.deptChipText, selectedDept === '' && styles.deptChipTextActive]}>
                      🏛️ All Departments
                    </Text>
                  </TouchableOpacity>

                  {departments.map((dept) => (
                    <TouchableOpacity
                      key={dept}
                      style={[styles.deptChip, selectedDept === dept && styles.deptChipActive]}
                      onPress={() => {
                        const next = selectedDept === dept ? '' : dept;
                        setSelectedDept(next);
                        searchDirectory(searchQuery, next);
                      }}
                    >
                      <Text
                        style={[
                          styles.deptChipText,
                          selectedDept === dept && styles.deptChipTextActive,
                        ]}
                      >
                        {dept}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Search Bar */}
              <View style={styles.searchSection}>
                <Text style={styles.fieldLabel}>Search by Name, Cadre or Phone (नाम या नंबर खोजें):</Text>
                <View style={styles.searchRow}>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search SDM, SP, JEn, Tehsildar, or phone..."
                    placeholderTextColor="#64748b"
                    value={searchQuery}
                    onChangeText={(text) => {
                      setSearchQuery(text);
                      searchDirectory(text, selectedDept);
                    }}
                  />
                  {isSearching && (
                    <ActivityIndicator style={styles.searchSpinner} color="#38bdf8" size="small" />
                  )}
                </View>
              </View>

              {/* Search Results */}
              <View style={styles.resultsContainer}>
                {officers.length === 0 && !isSearching ? (
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyText}>No officers found for this filter.</Text>
                    <TouchableOpacity
                      style={styles.switchTabLink}
                      onPress={() => setActiveTab('phone')}
                    >
                      <Text style={styles.switchTabLinkText}>
                        📱 Person not in list? Dial directly by phone number →
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  officers.map((officer) => {
                    const isRinging = dialingPhone === officer.phone;
                    return (
                      <View key={officer.phone} style={styles.officerCard}>
                        <View style={styles.officerCardInfo}>
                          <View style={styles.officerTitleRow}>
                            <Text style={styles.officerNameText}>{officer.name}</Text>
                            {officer.department ? (
                              <View style={styles.deptBadge}>
                                <Text style={styles.deptBadgeText} numberOfLines={1}>
                                  {officer.department}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={styles.officerDesigText}>
                            {officer.designation} {officer.employeeCode ? `(${officer.employeeCode})` : ''}
                          </Text>
                          <Text style={styles.officerPhoneText}>
                            📱 {officer.phone} {officer.postingDistrict ? `• 📍 ${officer.postingDistrict}` : ''}
                          </Text>
                        </View>

                        <TouchableOpacity
                          style={[styles.dialInBtn, isRinging && styles.btnDisabled]}
                          onPress={() => handleAddParticipant(officer)}
                          disabled={isRinging}
                          activeOpacity={0.8}
                        >
                          {isRinging ? (
                            <ActivityIndicator color="#ffffff" size="small" />
                          ) : (
                            <Text style={styles.dialInBtnText}>+ Dial In 📞</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    );
                  })
                )}
              </View>
            </ScrollView>
          ) : (
            /* TAB 2: BY PHONE NUMBER WITH AUTOMATIC DATABASE LOOKUP */
            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
              <View style={styles.infoBanner}>
                <Text style={styles.infoBannerText}>
                  💡 <Text style={{ fontWeight: '700' }}>Direct Phone Dialing:</Text> Enter any 10-digit mobile number. If the number is registered in the official database, their Name &amp; Designation will be detected automatically!
                </Text>
              </View>

              {/* Phone Input */}
              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>Mobile Number (10-अंकीय मोबाइल नंबर) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter 10-digit mobile number (e.g. 9964235548)"
                  placeholderTextColor="#64748b"
                  keyboardType="phone-pad"
                  maxLength={14}
                  value={customPhone}
                  onChangeText={handlePhoneInputChange}
                />
              </View>

              {/* Auto-Lookup Indicator & Result Banner */}
              {isLookingUp ? (
                <View style={styles.lookupStatusBox}>
                  <ActivityIndicator color="#38bdf8" size="small" />
                  <Text style={styles.lookupStatusText}>Checking directory database...</Text>
                </View>
              ) : lookupResult?.found ? (
                <View style={styles.foundBadgeBox}>
                  <Text style={styles.foundBadgeHeader}>✓ Verified Record Found in Database:</Text>
                  <Text style={styles.foundNameText}>
                    👤 {lookupResult.name}
                  </Text>
                  <Text style={styles.foundDesigText}>
                    🏛️ {lookupResult.designation}
                  </Text>
                  {lookupResult.department ? (
                    <Text style={styles.foundDeptText}>
                      🏢 {lookupResult.department}
                    </Text>
                  ) : null}
                </View>
              ) : customPhone.replace(/[^0-9]/g, '').length === 10 ? (
                <View style={styles.notFoundBadgeBox}>
                  <Text style={styles.notFoundText}>
                    ℹ️ External number (not in directory). You can enter a custom name below.
                  </Text>
                </View>
              ) : null}

              {/* Name Input */}
              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>Person Name (नाम)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Full Name (e.g. Ramesh Sharma)"
                  placeholderTextColor="#64748b"
                  value={customName}
                  onChangeText={setCustomName}
                />
              </View>

              {/* Designation / Role Input */}
              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>Designation / Role (पद / भूमिका)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Sub-Divisional Magistrate / Complainant"
                  placeholderTextColor="#64748b"
                  value={customRole}
                  onChangeText={setCustomRole}
                />
              </View>

              {/* Call Button */}
              <TouchableOpacity
                style={[styles.ringAndAddBtn, isDialing && styles.btnDisabled]}
                onPress={handleDirectDial}
                disabled={isDialing}
                activeOpacity={0.8}
              >
                {isDialing ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.ringAndAddBtnText}>📞 Ring &amp; Add to Live Hearing</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.88)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: '#334155',
    maxHeight: '92%',
    paddingBottom: 24,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerInfo: {
    flex: 1,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#f8fafc',
  },
  sheetSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#cbd5e1',
    fontSize: 15,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 10,
    padding: 4,
    gap: 6,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  tabBtnActiveDir: {
    backgroundColor: '#2563eb',
  },
  tabBtnActivePhone: {
    backgroundColor: '#059669',
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
  },
  tabBtnTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  modalContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  deptSection: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
    marginBottom: 6,
  },
  deptScroll: {
    flexDirection: 'row',
  },
  deptChip: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  deptChipActive: {
    backgroundColor: 'rgba(37, 99, 235, 0.3)',
    borderColor: '#38bdf8',
  },
  deptChipText: {
    fontSize: 12,
    color: '#cbd5e1',
    fontWeight: '600',
  },
  deptChipTextActive: {
    color: '#38bdf8',
    fontWeight: '700',
  },
  searchSection: {
    marginBottom: 12,
  },
  searchRow: {
    position: 'relative',
  },
  searchInput: {
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    color: '#f8fafc',
    fontSize: 13,
    paddingRight: 40,
  },
  searchSpinner: {
    position: 'absolute',
    right: 12,
    top: 12,
  },
  resultsContainer: {
    paddingBottom: 20,
  },
  emptyBox: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#64748b',
    fontSize: 13,
    marginBottom: 10,
  },
  switchTabLink: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  switchTabLinkText: {
    color: '#34d399',
    fontSize: 12,
    fontWeight: '600',
  },
  officerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#020617',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  officerCardInfo: {
    flex: 1,
    marginRight: 10,
  },
  officerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  officerNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f8fafc',
  },
  deptBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  deptBadgeText: {
    fontSize: 10,
    color: '#fbbf24',
    fontWeight: '600',
  },
  officerDesigText: {
    fontSize: 11,
    color: '#38bdf8',
    marginTop: 2,
    fontWeight: '600',
  },
  officerPhoneText: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  dialInBtn: {
    backgroundColor: '#059669',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 78,
  },
  dialInBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  infoBanner: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.25)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  infoBannerText: {
    fontSize: 11,
    color: '#93c5fd',
    lineHeight: 16,
  },
  formGroup: {
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#f8fafc',
    fontSize: 13,
  },
  lookupStatusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  lookupStatusText: {
    fontSize: 11,
    color: '#38bdf8',
  },
  foundBadgeBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: '#10b981',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  foundBadgeHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#34d399',
    marginBottom: 4,
  },
  foundNameText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
  },
  foundDesigText: {
    fontSize: 12,
    color: '#6ee7b7',
    marginTop: 2,
    fontWeight: '600',
  },
  foundDeptText: {
    fontSize: 11,
    color: '#a7f3d0',
    marginTop: 2,
  },
  notFoundBadgeBox: {
    backgroundColor: 'rgba(148, 163, 184, 0.1)',
    borderRadius: 8,
    padding: 8,
    marginBottom: 12,
  },
  notFoundText: {
    fontSize: 11,
    color: '#94a3b8',
  },
  ringAndAddBtn: {
    backgroundColor: '#059669',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    marginBottom: 24,
  },
  ringAndAddBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
