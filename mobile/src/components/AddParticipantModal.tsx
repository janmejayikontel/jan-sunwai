import React, { useState, useEffect } from 'react';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Custom Direct Dial state
  const [customPhone, setCustomPhone] = useState('');
  const [customName, setCustomName] = useState('');
  const [customRole, setCustomRole] = useState('');
  const [isDialing, setIsDialing] = useState(false);
  const [dialingPhone, setDialingPhone] = useState<string | null>(null);

  const cleanUrl = serverUrl.replace(/\/+$/, '');

  // Search officers directory
  const searchDirectory = async (q: string) => {
    setIsSearching(true);
    try {
      const res = await fetch(`${cleanUrl}/api/sampark/officers?q=${encodeURIComponent(q.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setOfficers(data.officers || []);
      }
    } catch (err) {
      console.warn('Directory search error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    if (visible) {
      // Load initial directory
      searchDirectory(searchQuery);
    }
  }, [visible]);

  // Handle adding an officer/participant to the ongoing call
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
          '📞 Ringing Participant',
          `Calling ${participant.name} (${participant.phone}). They will be added to this hearing automatically once they answer.`
        );
        onClose();
      } else {
        Alert.alert('Unable to Add', data.error || 'Failed to ring participant.');
      }
    } catch (err: any) {
      Alert.alert('Connection Error', err?.message || 'Could not reach server to add participant.');
    } finally {
      setDialingPhone(null);
    }
  };

  // Handle Direct Dial
  const handleDirectDial = async () => {
    const raw = customPhone.replace(/[^0-9]/g, '');
    const last10 = raw.slice(-10);
    if (last10.length !== 10) {
      Alert.alert('Invalid Phone', 'Please enter a valid 10-digit mobile number.');
      return;
    }

    const formattedPhone = `+91${last10}`;
    const formattedName = customName.trim() || `Participant (${last10.slice(-4)})`;
    const formattedRole = customRole.trim() || 'Official / Complainant';

    setIsDialing(true);
    try {
      await handleAddParticipant({
        phone: formattedPhone,
        name: formattedName,
        designation: formattedRole,
        department: 'Direct Call / External',
      });
      setCustomPhone('');
      setCustomName('');
      setCustomRole('');
    } finally {
      setIsDialing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <View style={styles.modalSheet}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.headerInfo}>
              <Text style={styles.sheetTitle}>➕ Add Person / Official</Text>
              <Text style={styles.sheetSubtitle}>
                Jan Sunwai Hearing • {grievanceId}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            {/* Direct Dial Section */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>📞 Direct Dial Mobile Number</Text>
              <Text style={styles.sectionDesc}>
                Enter any 10-digit mobile number to immediately ring and connect them to this hearing.
              </Text>

              <TextInput
                style={styles.input}
                placeholder="Mobile Number (e.g. 9876543210)"
                placeholderTextColor="#64748b"
                keyboardType="phone-pad"
                value={customPhone}
                onChangeText={setCustomPhone}
                maxLength={14}
              />

              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Person Name (Optional)"
                  placeholderTextColor="#64748b"
                  value={customName}
                  onChangeText={setCustomName}
                />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Role / Designation"
                  placeholderTextColor="#64748b"
                  value={customRole}
                  onChangeText={setCustomRole}
                />
              </View>

              <TouchableOpacity
                style={[styles.dialBtn, isDialing && styles.btnDisabled]}
                onPress={handleDirectDial}
                disabled={isDialing}
                activeOpacity={0.8}
              >
                {isDialing ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.dialBtnText}>📞 Ring & Add to Hearing</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Officer Directory Search Section */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>🏛️ Directory Search (Officers & Staff)</Text>
              <Text style={styles.sectionDesc}>
                Search by officer name, designation (SDM, SP, JEn, Tehsildar), or department.
              </Text>

              <View style={styles.searchRow}>
                <TextInput
                  style={[styles.input, styles.searchInput]}
                  placeholder="🔍 Search name, cadre, or department..."
                  placeholderTextColor="#64748b"
                  value={searchQuery}
                  onChangeText={(text) => {
                    setSearchQuery(text);
                    searchDirectory(text);
                  }}
                />
                {isSearching && (
                  <ActivityIndicator
                    style={styles.searchSpinner}
                    color="#38bdf8"
                    size="small"
                  />
                )}
              </View>

              {officers.length === 0 && !isSearching ? (
                <Text style={styles.noResultsText}>
                  No officers or staff found matching &quot;{searchQuery}&quot;. Use direct dial above.
                </Text>
              ) : (
                officers.slice(0, 15).map((off) => {
                  const isThisDialing = dialingPhone === off.phone;
                  return (
                    <View key={off.phone} style={styles.officerCard}>
                      <View style={styles.officerCardInfo}>
                        <Text style={styles.officerNameText}>{off.name}</Text>
                        <Text style={styles.officerDesigText}>
                          {off.designation} {off.employeeCode ? `(${off.employeeCode})` : ''}
                        </Text>
                        <Text style={styles.officerDeptText}>
                          🏢 {off.department}
                        </Text>
                        <Text style={styles.officerPhoneText}>
                          📱 {off.phone} {off.postingDistrict ? `• 📍 ${off.postingDistrict}` : ''}
                        </Text>
                      </View>

                      <TouchableOpacity
                        style={[
                          styles.addOfficerBtn,
                          isThisDialing && styles.btnDisabled,
                        ]}
                        onPress={() => handleAddParticipant(off)}
                        disabled={isThisDialing}
                        activeOpacity={0.8}
                      >
                        {isThisDialing ? (
                          <ActivityIndicator color="#ffffff" size="small" />
                        ) : (
                          <Text style={styles.addOfficerBtnText}>+ Ring 📞</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.85)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: '#334155',
    maxHeight: '90%',
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
    fontSize: 18,
    fontWeight: '800',
    color: '#f8fafc',
  },
  sheetSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#cbd5e1',
    fontSize: 16,
    fontWeight: '700',
  },
  modalContent: {
    padding: 16,
  },
  sectionCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#38bdf8',
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 12,
    lineHeight: 16,
  },
  input: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#f8fafc',
    fontSize: 14,
    marginBottom: 10,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dialBtn: {
    backgroundColor: '#059669',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  dialBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  searchRow: {
    position: 'relative',
    marginBottom: 8,
  },
  searchInput: {
    marginBottom: 0,
    paddingRight: 40,
  },
  searchSpinner: {
    position: 'absolute',
    right: 12,
    top: 14,
  },
  noResultsText: {
    color: '#64748b',
    fontSize: 13,
    fontStyle: 'italic',
    paddingVertical: 12,
    textAlign: 'center',
  },
  officerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  officerCardInfo: {
    flex: 1,
    marginRight: 12,
  },
  officerNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc',
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
  officerPhoneText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  addOfficerBtn: {
    backgroundColor: '#0284c7',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 74,
  },
  addOfficerBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
