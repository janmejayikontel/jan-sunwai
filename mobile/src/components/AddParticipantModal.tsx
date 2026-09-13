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

  // ─── TAB 1: Department, Designation & Name Search ───
  const [departments, setDepartments] = useState<string[]>([]);
  const [designations, setDesignations] = useState<string[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [selectedDesig, setSelectedDesig] = useState<string>('');
  const [nameQuery, setNameQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Officer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Dropdown modal pickers for Dept and Desig
  const [showDeptPicker, setShowDeptPicker] = useState(false);
  const [showDesigPicker, setShowDesigPicker] = useState(false);

  // ─── TAB 2: Direct Phone Number Dial with DB Auto-Lookup ───
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

  // Dialing state
  const [isDialing, setIsDialing] = useState(false);
  const [dialingPhone, setDialingPhone] = useState<string | null>(null);

  const cleanUrl = serverUrl.replace(/\/+$/, '');

  // 1. Fetch departments from SQLite
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
      console.warn('[AddPerson] Error fetching departments:', e);
    }
  }, [cleanUrl]);

  // 2. Fetch designations from SQLite (optionally filtered by department)
  const fetchDesignations = useCallback(
    async (dept?: string) => {
      try {
        const param = dept ? `?department=${encodeURIComponent(dept)}` : '';
        const res = await fetch(`${cleanUrl}/api/sampark/designations${param}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.designations)) {
            setDesignations(data.designations);
          }
        }
      } catch (e) {
        console.warn('[AddPerson] Error fetching designations:', e);
      }
    },
    [cleanUrl]
  );

  // Initial load on modal open
  useEffect(() => {
    if (visible) {
      fetchDepartments();
      fetchDesignations(selectedDept);
      handleSearch(nameQuery, selectedDept, selectedDesig);
    }
  }, [visible]);

  // Reload designations when selected department changes
  const handleDepartmentSelect = (dept: string) => {
    setSelectedDept(dept);
    setSelectedDesig(''); // Reset designation when dept changes
    setShowDeptPicker(false);
    fetchDesignations(dept);
    handleSearch(nameQuery, dept, '');
  };

  const handleDesignationSelect = (desig: string) => {
    setSelectedDesig(desig);
    setShowDesigPicker(false);
    handleSearch(nameQuery, selectedDept, desig);
  };

  // 3. Search Database
  const handleSearch = async (name: string, dept: string, desig: string) => {
    setIsSearching(true);
    setHasSearched(true);
    try {
      const params = new URLSearchParams();
      if (name.trim()) params.set('q', name.trim());
      if (dept.trim()) params.set('department', dept.trim());
      if (desig.trim()) params.set('designation', desig.trim());

      const res = await fetch(`${cleanUrl}/api/sampark/officers?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.officers || []);
      }
    } catch (err) {
      console.warn('[AddPerson] Search error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  // 4. Tab 2: Phone Lookup in SQLite
  const handlePhoneInputChange = async (text: string) => {
    setCustomPhone(text);
    const digitsOnly = text.replace(/[^0-9]/g, '');
    const last10 = digitsOnly.slice(-10);

    if (last10.length === 10) {
      lookupPhoneNumber(last10);
    } else {
      setLookupResult(null);
    }
  };

  const lookupPhoneNumber = async (last10: string) => {
    setIsLookingUp(true);
    try {
      const res = await fetch(`${cleanUrl}/api/sampark/lookup-phone/${encodeURIComponent(last10)}`);
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
          // Prepopulate fields from database!
          setCustomName(data.user.name);
          setCustomRole(data.user.designation || 'Official');
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
  };

  // 5. Dial & Add Participant into Live Hearing
  const handleDialParticipant = async (participant: {
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
          '📞 Calling Official',
          `Calling ${participant.name} (${participant.phone}). Their phone is ringing now and they will enter the video hearing once they accept.`
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

  // 6. Submit Direct Dial (Tab 2)
  const handleDirectDialSubmit = async () => {
    const raw = customPhone.replace(/[^0-9]/g, '');
    const last10 = raw.slice(-10);
    if (last10.length !== 10) {
      Alert.alert('Invalid Mobile Number', 'Please enter a valid 10-digit mobile number.');
      return;
    }

    const formattedPhone = `+91${last10}`;
    const formattedName =
      customName.trim() || (lookupResult?.name ? lookupResult.name : `Guest (+91 ${last10})`);
    const formattedRole =
      customRole.trim() ||
      (lookupResult?.designation ? lookupResult.designation : 'Guest Participant');
    const formattedDept =
      customDept.trim() ||
      (lookupResult?.department ? lookupResult.department : 'External Direct Call');

    setIsDialing(true);
    try {
      await handleDialParticipant({
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
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
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Tab Navigation */}
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
                🏛️ By Dept & Designation
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
                📱 By Mobile Number
              </Text>
            </TouchableOpacity>
          </View>

          {/* ══════════════════════════════════════════════════════════
              TAB 1: SELECT BY DEPARTMENT, DESIGNATION & NAME
             ══════════════════════════════════════════════════════════ */}
          {activeTab === 'directory' ? (
            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
              {/* Step 1: Choose Department */}
              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>1. Department (विभाग चुनें):</Text>
                <TouchableOpacity
                  style={styles.dropdownBtn}
                  onPress={() => setShowDeptPicker(true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.dropdownBtnText} numberOfLines={1}>
                    {selectedDept ? `🏛️ ${selectedDept}` : '🏛️ All Departments (सभी विभाग)'}
                  </Text>
                  <Text style={styles.dropdownArrow}>▼</Text>
                </TouchableOpacity>
              </View>

              {/* Step 2: Choose Designation */}
              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>2. Designation (पद चुनें):</Text>
                <TouchableOpacity
                  style={styles.dropdownBtn}
                  onPress={() => setShowDesigPicker(true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.dropdownBtnText} numberOfLines={1}>
                    {selectedDesig ? `🎖️ ${selectedDesig}` : '🎖️ All Designations (सभी पद)'}
                  </Text>
                  <Text style={styles.dropdownArrow}>▼</Text>
                </TouchableOpacity>
              </View>

              {/* Step 3: Enter Name */}
              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>3. Employee Name (कर्मचारी का नाम):</Text>
                <View style={styles.searchRow}>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="e.g. Sharma, Chandan, Priya..."
                    placeholderTextColor="#64748b"
                    value={nameQuery}
                    onChangeText={(t) => {
                      setNameQuery(t);
                    }}
                    onSubmitEditing={() => handleSearch(nameQuery, selectedDept, selectedDesig)}
                  />
                  <TouchableOpacity
                    style={styles.searchActionBtn}
                    onPress={() => handleSearch(nameQuery, selectedDept, selectedDesig)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.searchActionBtnText}>🔍 Search</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Active Filter Chips Bar */}
              {(selectedDept || selectedDesig || nameQuery) && (
                <View style={styles.activeFilterRow}>
                  <Text style={styles.filterSummaryText}>Filters:</Text>
                  {selectedDept ? (
                    <TouchableOpacity
                      style={styles.activeFilterChip}
                      onPress={() => handleDepartmentSelect('')}
                    >
                      <Text style={styles.activeFilterChipText}>{selectedDept} ✕</Text>
                    </TouchableOpacity>
                  ) : null}
                  {selectedDesig ? (
                    <TouchableOpacity
                      style={styles.activeFilterChip}
                      onPress={() => handleDesignationSelect('')}
                    >
                      <Text style={styles.activeFilterChipText}>{selectedDesig} ✕</Text>
                    </TouchableOpacity>
                  ) : null}
                  {nameQuery ? (
                    <TouchableOpacity
                      style={styles.activeFilterChip}
                      onPress={() => {
                        setNameQuery('');
                        handleSearch('', selectedDept, selectedDesig);
                      }}
                    >
                      <Text style={styles.activeFilterChipText}>{nameQuery} ✕</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              )}

              {/* Search Results */}
              <View style={styles.resultsContainer}>
                <Text style={styles.sectionHeading}>
                  Matching Database Employees ({searchResults.length})
                </Text>

                {isSearching ? (
                  <View style={styles.loadingBox}>
                    <ActivityIndicator size="small" color="#38bdf8" />
                    <Text style={styles.loadingBoxText}>Searching Rajasthan Government directory...</Text>
                  </View>
                ) : searchResults.length === 0 ? (
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyTitle}>No matching employee found</Text>
                    <Text style={styles.emptyText}>
                      Check spelling or change department/designation filters.
                    </Text>
                    <TouchableOpacity
                      style={styles.switchTabLink}
                      onPress={() => setActiveTab('phone')}
                    >
                      <Text style={styles.switchTabLinkText}>
                        📱 Dial directly by mobile number instead →
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  searchResults.map((officer) => {
                    const isRinging = dialingPhone === officer.phone;
                    return (
                      <View key={officer.phone} style={styles.officerCard}>
                        <View style={styles.officerCardInfo}>
                          <View style={styles.officerTitleRow}>
                            <Text style={styles.officerNameText}>{officer.name}</Text>
                            {officer.employeeCode ? (
                              <View style={styles.codeBadge}>
                                <Text style={styles.codeBadgeText}>{officer.employeeCode}</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={styles.officerDesigText}>{officer.designation}</Text>
                          <Text style={styles.officerDeptText}>🏛️ {officer.department}</Text>
                          {/* Fetched Phone Number prominently shown */}
                          <View style={styles.fetchedPhoneRow}>
                            <Text style={styles.fetchedPhoneLabel}>Phone (from DB):</Text>
                            <Text style={styles.fetchedPhoneVal}>{officer.phone}</Text>
                          </View>
                          {officer.postingDistrict ? (
                            <Text style={styles.officerLocText}>📍 {officer.postingDistrict}</Text>
                          ) : null}
                        </View>

                        <TouchableOpacity
                          style={[styles.dialInBtn, isRinging && styles.btnDisabled]}
                          onPress={() => handleDialParticipant(officer)}
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
            /* ══════════════════════════════════════════════════════════
               TAB 2: DIAL DIRECTLY BY MOBILE NUMBER (WITH DB LOOKUP)
               ══════════════════════════════════════════════════════════ */
            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
              <View style={styles.infoBanner}>
                <Text style={styles.infoBannerText}>
                  💡 Enter any 10-digit mobile number. The system will automatically fetch their name
                  and designation from the database. If not in the database, they will be called as a
                  Guest Participant.
                </Text>
              </View>

              {/* Mobile Number Input */}
              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>Mobile Number (10-अंकीय मोबाइल नंबर):</Text>
                <View style={styles.phoneInputRow}>
                  <View style={styles.countryCodeBox}>
                    <Text style={styles.countryCodeText}>🇮🇳 +91</Text>
                  </View>
                  <TextInput
                    style={styles.phoneInput}
                    placeholder="Enter 10-digit number (e.g. 7749852013)"
                    placeholderTextColor="#64748b"
                    keyboardType="phone-pad"
                    maxLength={10}
                    value={customPhone}
                    onChangeText={handlePhoneInputChange}
                  />
                  {isLookingUp && (
                    <ActivityIndicator style={styles.lookupSpinner} color="#10b981" size="small" />
                  )}
                </View>
              </View>

              {/* Database Lookup Result Banner */}
              {lookupResult?.found ? (
                <View style={styles.dbFoundBanner}>
                  <Text style={styles.dbFoundTitle}>✅ Verified in Rajasthan Database</Text>
                  <Text style={styles.dbFoundName}>{lookupResult.name}</Text>
                  <Text style={styles.dbFoundDesig}>
                    {lookupResult.designation} • {lookupResult.department}
                  </Text>
                  <Text style={styles.dbFoundRole}>
                    Registered as: {lookupResult.role?.toUpperCase() || 'OFFICIAL'}
                  </Text>
                </View>
              ) : lookupResult?.found === false && customPhone.length === 10 ? (
                <View style={styles.dbNotFoundBanner}>
                  <Text style={styles.dbNotFoundTitle}>
                    ℹ️ Number Not in Database — Will Call as Guest
                  </Text>
                  <Text style={styles.dbNotFoundSub}>
                    This number is not registered. You can enter their name and call them directly as
                    an invited guest participant.
                  </Text>
                </View>
              ) : null}

              {/* Editable Name Field */}
              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>Participant Name (नाम):</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. Chandan / Citizen"
                  placeholderTextColor="#64748b"
                  value={customName}
                  onChangeText={setCustomName}
                />
              </View>

              {/* Editable Designation / Role */}
              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>Designation / Role (पद / भूमिका):</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. Junior Engineer / Citizen"
                  placeholderTextColor="#64748b"
                  value={customRole}
                  onChangeText={setCustomRole}
                />
              </View>

              {/* Dial Button */}
              <TouchableOpacity
                style={[
                  styles.directDialBtn,
                  (customPhone.replace(/\D/g, '').length !== 10 || isDialing) && styles.btnDisabled,
                ]}
                onPress={handleDirectDialSubmit}
                disabled={customPhone.replace(/\D/g, '').length !== 10 || isDialing}
                activeOpacity={0.8}
              >
                {isDialing ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.directDialBtnText}>
                    {lookupResult?.found
                      ? `📞 Call ${customName || 'Official'} into Meeting`
                      : `📞 Call by Number as Guest`}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* ══════════════════════════════════════════════════════════
              DEPARTMENT PICKER MODAL
             ══════════════════════════════════════════════════════════ */}
          <Modal
            visible={showDeptPicker}
            transparent
            animationType="fade"
            onRequestClose={() => setShowDeptPicker(false)}
          >
            <View style={styles.pickerOverlay}>
              <View style={styles.pickerBox}>
                <View style={styles.pickerHeader}>
                  <Text style={styles.pickerTitle}>Select Department (विभाग चुनें)</Text>
                  <TouchableOpacity onPress={() => setShowDeptPicker(false)}>
                    <Text style={styles.pickerClose}>✕</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.pickerList}>
                  <TouchableOpacity
                    style={[styles.pickerItem, !selectedDept && styles.pickerItemActive]}
                    onPress={() => handleDepartmentSelect('')}
                  >
                    <Text
                      style={[
                        styles.pickerItemText,
                        !selectedDept && styles.pickerItemTextActive,
                      ]}
                    >
                      🏛️ All Departments (सभी विभाग)
                    </Text>
                  </TouchableOpacity>
                  {departments.map((dept) => (
                    <TouchableOpacity
                      key={dept}
                      style={[
                        styles.pickerItem,
                        selectedDept === dept && styles.pickerItemActive,
                      ]}
                      onPress={() => handleDepartmentSelect(dept)}
                    >
                      <Text
                        style={[
                          styles.pickerItemText,
                          selectedDept === dept && styles.pickerItemTextActive,
                        ]}
                      >
                        {dept}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </Modal>

          {/* ══════════════════════════════════════════════════════════
              DESIGNATION PICKER MODAL
             ══════════════════════════════════════════════════════════ */}
          <Modal
            visible={showDesigPicker}
            transparent
            animationType="fade"
            onRequestClose={() => setShowDesigPicker(false)}
          >
            <View style={styles.pickerOverlay}>
              <View style={styles.pickerBox}>
                <View style={styles.pickerHeader}>
                  <Text style={styles.pickerTitle}>Select Designation (पद चुनें)</Text>
                  <TouchableOpacity onPress={() => setShowDesigPicker(false)}>
                    <Text style={styles.pickerClose}>✕</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.pickerList}>
                  <TouchableOpacity
                    style={[styles.pickerItem, !selectedDesig && styles.pickerItemActive]}
                    onPress={() => handleDesignationSelect('')}
                  >
                    <Text
                      style={[
                        styles.pickerItemText,
                        !selectedDesig && styles.pickerItemTextActive,
                      ]}
                    >
                      🎖️ All Designations (सभी पद)
                    </Text>
                  </TouchableOpacity>
                  {designations.map((desig) => (
                    <TouchableOpacity
                      key={desig}
                      style={[
                        styles.pickerItem,
                        selectedDesig === desig && styles.pickerItemActive,
                      ]}
                      onPress={() => handleDesignationSelect(desig)}
                    >
                      <Text
                        style={[
                          styles.pickerItemText,
                          selectedDesig === desig && styles.pickerItemTextActive,
                        ]}
                      >
                        {desig}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </Modal>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.82)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    minHeight: '65%',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
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
    color: '#38bdf8',
    marginTop: 2,
    fontWeight: '600',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#020617',
    padding: 6,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 12,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabBtnActiveDir: {
    backgroundColor: '#1e3a5f',
  },
  tabBtnActivePhone: {
    backgroundColor: '#064e3b',
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
  },
  tabBtnTextActive: {
    color: '#f8fafc',
    fontWeight: '800',
  },
  modalContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  formGroup: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#cbd5e1',
    marginBottom: 6,
  },
  dropdownBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  dropdownBtnText: {
    color: '#f1f5f9',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  dropdownArrow: {
    color: '#94a3b8',
    fontSize: 11,
    marginLeft: 8,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 13,
  },
  searchActionBtn: {
    backgroundColor: '#0284c7',
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchActionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  activeFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  filterSummaryText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  activeFilterChip: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#0284c7',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  activeFilterChipText: {
    fontSize: 11,
    color: '#38bdf8',
    fontWeight: '600',
  },
  resultsContainer: {
    marginTop: 4,
    paddingBottom: 30,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  loadingBox: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingBoxText: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 8,
  },
  emptyBox: {
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginVertical: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#cbd5e1',
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
  },
  switchTabLink: {
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderRadius: 8,
  },
  switchTabLinkText: {
    fontSize: 12,
    color: '#38bdf8',
    fontWeight: '700',
  },
  officerCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  officerCardInfo: {
    flex: 1,
    marginRight: 10,
  },
  officerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  officerNameText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#f8fafc',
  },
  codeBadge: {
    backgroundColor: '#334155',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  codeBadgeText: {
    fontSize: 9,
    color: '#cbd5e1',
    fontWeight: '700',
  },
  officerDesigText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#38bdf8',
    marginTop: 2,
  },
  officerDeptText: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  fetchedPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  fetchedPhoneLabel: {
    fontSize: 11,
    color: '#64748b',
  },
  fetchedPhoneVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#34d399',
  },
  officerLocText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  dialInBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialInBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  infoBanner: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  infoBannerText: {
    fontSize: 12,
    color: '#bae6fd',
    lineHeight: 18,
  },
  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countryCodeBox: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  countryCodeText: {
    color: '#cbd5e1',
    fontWeight: '700',
    fontSize: 13,
  },
  phoneInput: {
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
  },
  lookupSpinner: {
    position: 'absolute',
    right: 12,
  },
  dbFoundBanner: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: '#10b981',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  dbFoundTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#34d399',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dbFoundName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
    marginTop: 4,
  },
  dbFoundDesig: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6ee7b7',
    marginTop: 2,
  },
  dbFoundRole: {
    fontSize: 10,
    color: '#a7f3d0',
    marginTop: 4,
    fontWeight: '700',
  },
  dbNotFoundBanner: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  dbNotFoundTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#38bdf8',
  },
  dbNotFoundSub: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 4,
    lineHeight: 16,
  },
  formInput: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 13,
  },
  directDialBtn: {
    backgroundColor: '#059669',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 30,
  },
  directDialBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerBox: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    width: '100%',
    maxHeight: '70%',
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  pickerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#f8fafc',
  },
  pickerClose: {
    fontSize: 16,
    color: '#94a3b8',
    fontWeight: '700',
    padding: 4,
  },
  pickerList: {
    padding: 8,
  },
  pickerItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 4,
  },
  pickerItemActive: {
    backgroundColor: '#1e293b',
    borderLeftWidth: 3,
    borderLeftColor: '#38bdf8',
  },
  pickerItemText: {
    color: '#cbd5e1',
    fontSize: 13,
  },
  pickerItemTextActive: {
    color: '#38bdf8',
    fontWeight: '700',
  },
});
