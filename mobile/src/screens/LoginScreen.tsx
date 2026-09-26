import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
} from 'react-native';
import { DEFAULT_SERVER_URL } from '../config';

export interface UserProfile {
  id: string;
  phone: string;
  name: string;
  role: string;
  designation?: string;
  department?: string;
  district?: string;
  token?: string;
}

interface LoginScreenProps {
  onLoginSuccess: (user: UserProfile, serverUrl: string) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [serverBase, setServerBase] = useState(DEFAULT_SERVER_URL);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [isLoading, setIsLoading] = useState(false);
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [detectedUser, setDetectedUser] = useState<{
    name: string;
    role: string;
    designation: string;
    department?: string;
    district?: string;
  } | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showAdminPinModal, setShowAdminPinModal] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState('');
  const [adminPinError, setAdminPinError] = useState('');
  const [adminVerified, setAdminVerified] = useState(false);

  const cleanServerUrl = (url: string) => url.trim().replace(/\/+$/, '');

  React.useEffect(() => {
    // Dynamically fetch live server endpoint from GitHub raw config with cache buster
    fetch(`https://raw.githubusercontent.com/janmejayikontel/jan-sunwai/main/server-url.txt?nocache=${Date.now()}`)
      .then((res) => res.text())
      .then(async (txt) => {
        const clean = txt.trim();
        if (clean.startsWith('http')) {
          console.log('[LoginScreen] Fetched remote live server URL:', clean);
          try {
            const healthRes = await fetch(`${clean}/api/health`, { method: 'GET' });
            if (healthRes.ok) {
              setServerBase(clean);
            }
          } catch {
            console.log('[LoginScreen] Remote URL not responding, retaining fallback');
          }
        }
      })
      .catch((e) => console.log('[LoginScreen] Using default server URL:', e.message));
  }, []);

  const handleVerifyAdminPin = () => {
    if (adminPinInput.trim() === '8899') {
      setAdminVerified(true);
      setShowAdminPinModal(false);
      setPhone('9999999999');
      setAdminPinInput('');
      setAdminPinError('');
      Alert.alert('PIN Verified', 'Administrator security credentials verified (PIN: 8899).');
    } else {
      setAdminPinError('Invalid Security PIN. Enter 8899 to proceed.');
    }
  };

  // Step 1: Request OTP
  const handleSendOtp = async () => {
    const cleanPhone = phone.trim().replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      Alert.alert('Invalid Phone', 'Please enter a valid 10-digit mobile number.');
      return;
    }

    if (cleanPhone === '9999999999' && !adminVerified) {
      setAdminPinInput('');
      setAdminPinError('');
      setShowAdminPinModal(true);
      return;
    }

    setIsLoading(true);
    setDevOtpHint(null);
    setDetectedUser(null);

    try {
      const url = `${cleanServerUrl(serverBase)}/api/auth/otp/send`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true',
        },
        body: JSON.stringify({ phone: cleanPhone }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send OTP. Check server connection.');
      }

      if (data.devOtp) {
        setDevOtpHint(data.devOtp);
      }

      // Automatically store detected designation & identity from database
      if (data.userExists && data.userName) {
        setDetectedUser({
          name: data.userName,
          role: data.detectedRole || 'citizen',
          designation: data.designation || 'Registered User',
          department: data.department,
          district: data.district,
        });
      }

      setStep('otp');
    } catch (err: any) {
      console.error('OTP send error:', err);
      Alert.alert(
        'Connection Error',
        `Unable to reach Sampark Lite server at:\n${serverBase}\n\n${err?.message || 'Network request failed'}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async () => {
    const cleanOtp = otp.trim();
    if (cleanOtp.length < 4) {
      Alert.alert('Required', 'Please enter the verification OTP.');
      return;
    }

    setIsLoading(true);

    try {
      const cleanPhone = phone.trim().replace(/\D/g, '');
      const url = `${cleanServerUrl(serverBase)}/api/auth/otp/verify`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true',
        },
        body: JSON.stringify({
          phone: cleanPhone,
          otp: cleanOtp,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Invalid OTP. Please try again.');
      }

      if (!data.user) {
        throw new Error('User profile not received.');
      }

      onLoginSuccess(
        {
          id: data.user.id,
          phone: data.user.phone,
          name: data.user.name || `Citizen (${cleanPhone.slice(-4)})`,
          role: data.user.role || 'citizen',
          designation: data.user.designation || (data.user.role === 'citizen' ? 'Citizen' : 'Officer'),
          department: data.user.department,
          district: data.user.district || 'Rajasthan',
          token: data.token,
        },
        cleanServerUrl(serverBase)
      );
    } catch (err: any) {
      console.error('OTP verify error:', err);
      Alert.alert('Verification Failed', err?.message || 'Invalid OTP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#020617" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Top Bar with Discreet Gear Icon */}
          <View style={styles.topBarRow}>
            <View style={{ width: 40 }} />
            <View style={styles.header}>
              <View style={styles.emblemContainer}>
                <Text style={styles.emblemIcon}>🏛️</Text>
              </View>
              <Text style={styles.hindiTitle}>संपर्क लाइट</Text>
              <Text style={styles.englishTitle}>Sampark Lite</Text>
              <Text style={styles.subtitle}>जन सुनवाई • Government of Rajasthan</Text>
            </View>
            <TouchableOpacity
              style={styles.gearBtn}
              onPress={() => setShowConfig(!showConfig)}
              activeOpacity={0.7}
            >
              <Text style={styles.gearIcon}>⚙️</Text>
            </TouchableOpacity>
          </View>

          {/* Login Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {step === 'phone' ? 'Citizen & Officer Login' : 'Enter OTP Verification'}
            </Text>
            <Text style={styles.cardDesc}>
              {step === 'phone'
                ? 'Enter your 10-digit mobile number to access the hearing portal'
                : `We have sent a verification code to +91 ${phone}`}
            </Text>

            {step === 'phone' ? (
              // Step 1: Phone input
              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Mobile Number (मोबाइल नंबर)</Text>
                <View style={styles.phoneInputRow}>
                  <View style={styles.countryCodeBox}>
                    <Text style={styles.countryCodeText}>🇮🇳 +91</Text>
                  </View>
                  <TextInput
                    style={styles.phoneInput}
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="Enter 10-digit number"
                    placeholderTextColor="#64748b"
                    keyboardType="phone-pad"
                    maxLength={10}
                    autoFocus
                  />
                </View>

                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    (isLoading || phone.replace(/\D/g, '').length < 10) && styles.buttonDisabled,
                  ]}
                  onPress={handleSendOtp}
                  disabled={isLoading || phone.replace(/\D/g, '').length < 10}
                  activeOpacity={0.8}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Get OTP (ओटीपी प्राप्त करें) ➔</Text>
                  )}
                </TouchableOpacity>

                {/* Clean Quick Login Chips */}
                <View style={styles.quickSection}>
                  <Text style={styles.quickSectionTitle}>QUICK SELECT DEMO ROLE</Text>
                  <View style={styles.quickGrid}>
                    <TouchableOpacity
                      style={[styles.quickChip, phone === '9829012345' && styles.quickChipActive]}
                      onPress={() => setPhone('9829012345')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.quickChipRole}>🏛️ Officer / Collector</Text>
                      <Text style={styles.quickChipNum}>9829012345</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.quickChip, phone === '7735807328' && styles.quickChipActive]}
                      onPress={() => setPhone('7735807328')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.quickChipRole}>👤 Citizen</Text>
                      <Text style={styles.quickChipNum}>7735807328</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.quickChip, phone === '9999999999' && styles.quickChipActive]}
                      onPress={() => setPhone('9999999999')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.quickChipRole}>🛡️ Super Admin</Text>
                      <Text style={styles.quickChipNum}>9999999999</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.quickChip, phone === '8888888888' && styles.quickChipActive]}
                      onPress={() => setPhone('8888888888')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.quickChipRole}>🎧 181 Call Centre</Text>
                      <Text style={styles.quickChipNum}>8888888888</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : (
              // Step 2: OTP input
              <View style={styles.formGroup}>
                {detectedUser ? (
                  <View
                    style={[
                      styles.detectedCard,
                      detectedUser.role === 'officer'
                        ? styles.detectedOfficer
                        : detectedUser.role === 'admin'
                        ? styles.detectedAdmin
                        : (detectedUser.role === 'call_center' || detectedUser.role === 'employee')
                        ? styles.detectedEmployee
                        : styles.detectedCitizen,
                    ]}
                  >
                    <View style={styles.detectedHeaderRow}>
                      <Text style={styles.detectedIcon}>
                        {detectedUser.role === 'officer'
                          ? '🏛️'
                          : detectedUser.role === 'admin'
                          ? '🛡️'
                          : (detectedUser.role === 'call_center' || detectedUser.role === 'employee')
                          ? '🎧'
                          : '👤'}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.detectedName}>{detectedUser.name}</Text>
                        <Text style={styles.detectedDesig}>{detectedUser.designation}</Text>
                        {detectedUser.department && (
                          <Text style={styles.detectedDept}>🏢 {detectedUser.department}</Text>
                        )}
                      </View>
                    </View>
                    <View style={styles.detectedRoleTag}>
                      <Text style={styles.detectedRoleTagText}>
                        {detectedUser.role === 'officer'
                          ? '🏛️ OFFICIAL / DISTRICT MAGISTRATE'
                          : detectedUser.role === 'admin'
                          ? '🛡️ SUPER ADMIN / SYSTEM OVERSIGHT'
                          : (detectedUser.role === 'call_center' || detectedUser.role === 'employee')
                          ? '🎧 181 CALL CENTRE REPRESENTATIVE'
                          : '👤 REGISTERED CITIZEN'}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.newCitizenCard}>
                    <Text style={styles.newCitizenText}>
                      👤 New Citizen Registration (Auto-linking upon OTP verify)
                    </Text>
                  </View>
                )}

                <View style={styles.otpHeaderRow}>
                  <Text style={styles.inputLabel}>Enter 6-Digit OTP</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setStep('phone');
                      setOtp('');
                    }}
                  >
                    <Text style={styles.changePhoneText}>Change Number</Text>
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={styles.otpInput}
                  value={otp}
                  onChangeText={setOtp}
                  placeholder="• • • • • •"
                  placeholderTextColor="#64748b"
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                />

                {devOtpHint && (
                  <View style={styles.hintBox}>
                    <Text style={styles.hintText}>
                      🔑 Demo OTP: <Text style={styles.hintBold}>{devOtpHint}</Text>
                    </Text>
                    <TouchableOpacity
                      onPress={() => setOtp(devOtpHint)}
                      style={styles.hintFillBtn}
                    >
                      <Text style={styles.hintFillText}>Auto-Fill</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.primaryButton, (isLoading || otp.length < 4) && styles.buttonDisabled]}
                  onPress={handleVerifyOtp}
                  disabled={isLoading || otp.length < 4}
                  activeOpacity={0.8}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Verify & Proceed ➔</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.resendBtn}
                  onPress={handleSendOtp}
                  disabled={isLoading}
                >
                  <Text style={styles.resendText}>Didn't receive code? Resend OTP</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {showConfig && (
            <View style={styles.configBox}>
              <Text style={styles.configLabel}>Server Endpoint URL</Text>
              <TextInput
                style={styles.configInput}
                value={serverBase}
                onChangeText={setServerBase}
                placeholder="https://your-server.com"
                placeholderTextColor="#64748b"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          )}

          {/* Footer Helpline */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Rajasthan Sampark Toll-Free Helpline: <Text style={styles.helplineText}>181</Text>
            </Text>
            <Text style={styles.securityText}>🔒 256-Bit E2EE Encrypted Video Stream</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Admin PIN Gate Modal */}
      <Modal
        visible={showAdminPinModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAdminPinModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalHeaderIcon}>🛡️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Administrator PIN Gate</Text>
                <Text style={styles.modalSub}>Restricted Administrative Access</Text>
              </View>
            </View>

            <Text style={styles.modalPrompt}>
              Enter the 4-digit security PIN to access the Super Admin control profile:
            </Text>

            <TextInput
              style={styles.modalPinInput}
              value={adminPinInput}
              onChangeText={(text) => {
                setAdminPinInput(text);
                setAdminPinError('');
              }}
              placeholder="• • • •"
              placeholderTextColor="#64748b"
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
              autoFocus
            />

            {adminPinError ? (
              <Text style={styles.modalErrorText}>{adminPinError}</Text>
            ) : (
              <Text style={styles.modalHelpText}>Security PIN is 8899</Text>
            )}

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setShowAdminPinModal(false);
                  setAdminPinInput('');
                  setAdminPinError('');
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleVerifyAdminPin}
              >
                <Text style={styles.modalConfirmText}>Verify PIN ➔</Text>
              </TouchableOpacity>
            </View>
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
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    justifyContent: 'center',
    minHeight: '100%',
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 20,
    width: '100%',
  },
  gearBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearIcon: {
    fontSize: 18,
  },
  header: {
    flex: 1,
    alignItems: 'center',
  },
  emblemContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#0f172a',
    borderWidth: 1.5,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emblemIcon: {
    fontSize: 32,
  },
  hindiTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#f8fafc',
    letterSpacing: 0.5,
  },
  englishTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#38bdf8',
    marginTop: 2,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1e293b',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 6,
  },
  cardDesc: {
    fontSize: 13,
    color: '#94a3b8',
    marginBottom: 20,
    lineHeight: 18,
  },
  formGroup: {
    width: '100%',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#cbd5e1',
    marginBottom: 8,
  },
  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  countryCodeBox: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    marginRight: 8,
  },
  countryCodeText: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '600',
  },
  phoneInput: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 1,
  },
  otpHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  changePhoneText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '600',
  },
  otpInput: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#0284c7',
    borderRadius: 12,
    paddingVertical: 14,
    textAlign: 'center',
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 8,
    marginBottom: 16,
  },
  hintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(2, 132, 199, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(2, 132, 199, 0.3)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
  },
  hintText: {
    color: '#7dd3fc',
    fontSize: 12,
  },
  hintBold: {
    fontWeight: '800',
    color: '#38bdf8',
  },
  hintFillBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  hintFillText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  primaryButton: {
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  resendBtn: {
    alignItems: 'center',
    marginTop: 14,
  },
  resendText: {
    color: '#64748b',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  configToggle: {
    alignItems: 'center',
    marginTop: 24,
    paddingVertical: 8,
  },
  configToggleText: {
    color: '#64748b',
    fontSize: 12,
  },
  configBox: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginTop: 8,
  },
  configLabel: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 6,
  },
  configInput: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#ffffff',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#334155',
  },
  serverSettingsToggle: {
    alignItems: 'center',
    marginTop: 18,
    paddingVertical: 6,
  },
  serverSettingsToggleText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '600',
  },
  quickUrlRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  quickUrlBtn: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: 'center',
  },
  quickUrlBtnText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '600',
  },
  configHelp: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 6,
  },
  footer: {
    alignItems: 'center',
    marginTop: 32,
  },
  footerText: {
    color: '#64748b',
    fontSize: 12,
  },
  helplineText: {
    color: '#f59e0b',
    fontWeight: '700',
  },
  securityText: {
    fontSize: 11,
    color: '#10b981',
    marginTop: 6,
    fontWeight: '600',
    textAlign: 'center',
  },
  detectedCard: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1.5,
  },
  detectedOfficer: {
    borderColor: '#8b5cf6',
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
  },
  detectedAdmin: {
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  detectedEmployee: {
    borderColor: '#f59e0b',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
  },
  detectedCitizen: {
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  detectedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  detectedIcon: {
    fontSize: 28,
  },
  detectedName: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
  },
  detectedDesig: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  detectedDept: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  detectedRoleTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#0f172a',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  detectedRoleTagText: {
    color: '#e2e8f0',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  newCitizenCard: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  newCitizenText: {
    color: '#94a3b8',
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#0f172a',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#ef4444',
    padding: 22,
    shadowColor: '#ef4444',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  modalHeaderIcon: {
    fontSize: 32,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
  },
  modalSub: {
    fontSize: 11,
    fontWeight: '700',
    color: '#f87171',
    textTransform: 'uppercase',
  },
  modalPrompt: {
    fontSize: 13,
    color: '#cbd5e1',
    lineHeight: 18,
    marginBottom: 16,
  },
  modalPinInput: {
    backgroundColor: '#020617',
    borderWidth: 1.5,
    borderColor: '#38bdf8',
    borderRadius: 12,
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: 10,
    paddingVertical: 12,
    marginBottom: 8,
  },
  modalErrorText: {
    fontSize: 12,
    color: '#f87171',
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalHelpText: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94a3b8',
  },
  modalConfirmBtn: {
    flex: 1.5,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#ef4444',
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
  },
  quickSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  quickSectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 1,
    marginBottom: 10,
    textAlign: 'center',
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickChip: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  quickChipActive: {
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
  },
  quickChipRole: {
    fontSize: 11,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 2,
    textAlign: 'center',
  },
  quickChipNum: {
    fontSize: 11,
    color: '#38bdf8',
    fontWeight: '600',
  },
});

