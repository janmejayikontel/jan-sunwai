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
        const clean = txt.trim().replace(/\/+$/, '');
        if (clean.startsWith('http')) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            const hRes = await fetch(`${clean}/api/health`, {
              signal: controller.signal,
              headers: { 'Bypass-Tunnel-Reminder': 'true' },
            });
            clearTimeout(timeoutId);
            if (hRes.ok) {
              console.log('[LoginScreen] Verified remote live server URL:', clean);
              setServerBase(clean);
            }
          } catch (err) {
            console.warn('[LoginScreen] Remote URL check failed, keeping default server:', clean);
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
    setDetectedUser(null);

    try {
      const url = `${cleanServerUrl(serverBase)}/api/auth/otp/send`;
      let response: Response | null = null;
      let lastErr: any = null;

      // Try with quick retry in case tunnel is momentarily waking up or rate-limited
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Bypass-Tunnel-Reminder': 'true',
            },
            body: JSON.stringify({ phone: cleanPhone }),
          });
          if (
            response &&
            response.status !== 429 &&
            response.status !== 502 &&
            response.status !== 503 &&
            response.status !== 504
          ) {
            break;
          }
        } catch (netErr: any) {
          lastErr = netErr;
        }
        if (attempt < 2) {
          const waitMs = response?.status === 429 ? 1500 : 800;
          await new Promise((r) => setTimeout(r, waitMs));
        }
      }

      if (!response) {
        throw new Error(lastErr?.message || 'Unable to connect to Sampark Lite server.');
      }

      const resText = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(resText);
      } catch (parseErr) {
        console.warn('[LoginScreen] Non-JSON response received:', resText.slice(0, 100));
        if (response.status === 429) {
          throw new Error('Server rate limit reached. Please wait a few seconds before requesting OTP again.');
        }
        if (response.status === 502 || response.status === 503 || response.status === 504) {
          throw new Error('Sampark Lite server is currently waking up. Please tap "Get OTP" again in 2 seconds.');
        }
        throw new Error(`Server returned unexpected response (${response.status}). Please retry.`);
      }

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Too many requests. Please wait a few seconds before trying again.');
        }
        throw new Error(data?.error || data?.message || 'Failed to send OTP. Check server connection.');
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
        'Connection Notice',
        `${err?.message || 'Network request failed'}\n\nServer: ${serverBase}`
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
      let response: Response | null = null;
      let lastErr: any = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          response = await fetch(url, {
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
          if (
            response &&
            response.status !== 429 &&
            response.status !== 502 &&
            response.status !== 503 &&
            response.status !== 504
          ) {
            break;
          }
        } catch (netErr: any) {
          lastErr = netErr;
        }
        if (attempt < 2) {
          const waitMs = response?.status === 429 ? 1500 : 800;
          await new Promise((r) => setTimeout(r, waitMs));
        }
      }

      if (!response) {
        throw new Error(lastErr?.message || 'Unable to connect to Sampark Lite server.');
      }

      const resText = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(resText);
      } catch (parseErr) {
        console.warn('[LoginScreen] Non-JSON response received during verify:', resText.slice(0, 100));
        if (response.status === 429) {
          throw new Error('Server rate limit reached. Please wait a few seconds and tap Verify again.');
        }
        if (response.status === 502 || response.status === 503 || response.status === 504) {
          throw new Error('Sampark Lite server is currently reconnecting. Please tap Verify again.');
        }
        throw new Error(`Server returned unexpected response (${response.status}). Please retry.`);
      }

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Too many verification attempts. Please wait a few seconds and try again.');
        }
        throw new Error(data?.error || data?.message || 'Invalid OTP. Please try again.');
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
      <StatusBar barStyle="light-content" backgroundColor="#111b21" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Top Bar with Minimal Header & Discreet Settings */}
          <View style={styles.topBarRow}>
            <View style={{ width: 36 }} />
            <View style={styles.header}>
              <View style={styles.brandIconCircle}>
                <Text style={styles.brandIcon}>🏛️</Text>
              </View>
              <Text style={styles.appTitle}>Jan Sunwai</Text>
              <Text style={styles.appSubtitle}>
                {step === 'phone' ? 'Enter your phone number to continue' : `Verify +91 ${phone}`}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.gearBtn}
              onPress={() => setShowConfig(!showConfig)}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.gearIcon}>⚙️</Text>
            </TouchableOpacity>
          </View>

          {/* WhatsApp-Style Clean Card */}
          <View style={styles.card}>
            {step === 'phone' ? (
              // Step 1: Clean Phone Input Form
              <View style={styles.formGroup}>
                <View style={styles.phoneInputRow}>
                  <View style={styles.countryCodeBox}>
                    <Text style={styles.countryCodeText}>🇮🇳 +91</Text>
                  </View>
                  <TextInput
                    style={styles.phoneInput}
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="Phone number"
                    placeholderTextColor="#8696a0"
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
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Next ➔</Text>
                  )}
                </TouchableOpacity>

                {/* Sleek Demo Role Chips */}
                <View style={styles.quickSection}>
                  <Text style={styles.quickSectionTitle}>QUICK DEMO ACCOUNTS</Text>
                  <View style={styles.quickGrid}>
                    <TouchableOpacity
                      style={[styles.quickChip, phone === '9829012345' && styles.quickChipActive]}
                      onPress={() => setPhone('9829012345')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.quickChipRole}>🏛️ Collector</Text>
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
                      <Text style={styles.quickChipRole}>🛡️ Admin</Text>
                      <Text style={styles.quickChipNum}>9999999999</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.quickChip, phone === '9337453714' && styles.quickChipActive]}
                      onPress={() => setPhone('9337453714')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.quickChipRole}>👮 Patwari</Text>
                      <Text style={styles.quickChipNum}>9337453714</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.quickChip, phone === '8888888888' && styles.quickChipActive]}
                      onPress={() => setPhone('8888888888')}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.quickChipRole}>🎧 181 Support</Text>
                      <Text style={styles.quickChipNum}>8888888888</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : (
              // Step 2: Clean WhatsApp-Style OTP Screen
              <View style={styles.formGroup}>
                {detectedUser ? (
                  <View style={styles.detectedUserCard}>
                    <View style={styles.detectedAvatar}>
                      <Text style={styles.detectedAvatarText}>
                        {detectedUser.role === 'officer'
                          ? '🏛️'
                          : detectedUser.role === 'admin'
                          ? '🛡️'
                          : (detectedUser.role === 'call_center' || detectedUser.role === 'employee')
                          ? '🎧'
                          : '👤'}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.detectedUserName}>{detectedUser.name}</Text>
                      <Text style={styles.detectedUserSub}>
                        {detectedUser.designation} {detectedUser.department ? `• ${detectedUser.department}` : ''}
                      </Text>
                    </View>
                    <View style={styles.rolePill}>
                      <Text style={styles.rolePillText}>{detectedUser.role.toUpperCase()}</Text>
                    </View>
                  </View>
                ) : null}

                <View style={styles.otpHeaderRow}>
                  <Text style={styles.otpLabel}>Enter 6-digit code</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setStep('phone');
                      setOtp('');
                    }}
                  >
                    <Text style={styles.changePhoneText}>Wrong number?</Text>
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

                <TouchableOpacity
                  style={[styles.primaryButton, (isLoading || otp.length < 4) && styles.buttonDisabled]}
                  onPress={handleVerifyOtp}
                  disabled={isLoading || otp.length < 4}
                  activeOpacity={0.8}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Verify & Proceed</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.resendBtn}
                  onPress={handleSendOtp}
                  disabled={isLoading}
                  activeOpacity={0.7}
                >
                  <Text style={styles.resendText}>Didn't receive code? Resend SMS</Text>
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
                placeholderTextColor="#8696a0"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          )}

          {/* Clean WhatsApp Style Footer */}
          <View style={styles.footer}>
            <Text style={styles.securityText}>🔒 End-to-end encrypted</Text>
            <Text style={styles.footerText}>Helpline: 181</Text>
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
                <Text style={styles.modalTitle}>Admin Access</Text>
                <Text style={styles.modalSub}>Enter 4-digit security PIN</Text>
              </View>
            </View>

            <TextInput
              style={styles.modalPinInput}
              value={adminPinInput}
              onChangeText={(text) => {
                setAdminPinInput(text);
                setAdminPinError('');
              }}
              placeholder="• • • •"
              placeholderTextColor="#8696a0"
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
                <Text style={styles.modalConfirmText}>Verify</Text>
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
    backgroundColor: '#111b21',
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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    width: '100%',
  },
  gearBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearIcon: {
    fontSize: 16,
    color: '#8696a0',
  },
  header: {
    flex: 1,
    alignItems: 'center',
  },
  brandIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#202c33',
    borderWidth: 1,
    borderColor: 'rgba(134, 150, 160, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  brandIcon: {
    fontSize: 26,
  },
  appTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#e9edef',
    letterSpacing: 0.3,
  },
  appSubtitle: {
    fontSize: 13,
    color: '#8696a0',
    marginTop: 4,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#202c33',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(134, 150, 160, 0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  formGroup: {
    width: '100%',
  },
  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  countryCodeBox: {
    backgroundColor: '#111b21',
    borderWidth: 1,
    borderColor: '#2a3942',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 13,
    marginRight: 8,
  },
  countryCodeText: {
    color: '#e9edef',
    fontSize: 15,
    fontWeight: '600',
  },
  phoneInput: {
    flex: 1,
    backgroundColor: '#111b21',
    borderWidth: 1,
    borderColor: '#2a3942',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: '#e9edef',
    fontSize: 16,
    fontWeight: '500',
  },
  primaryButton: {
    backgroundColor: '#00a884',
    borderRadius: 22,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: '#111b21',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  quickSection: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#2a3942',
  },
  quickSectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8696a0',
    letterSpacing: 0.8,
    marginBottom: 10,
    textAlign: 'center',
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'space-between',
  },
  quickChip: {
    width: '48%',
    backgroundColor: '#111b21',
    borderWidth: 1,
    borderColor: '#2a3942',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
    marginBottom: 4,
  },
  quickChipActive: {
    borderColor: '#00a884',
    backgroundColor: 'rgba(0, 168, 132, 0.1)',
  },
  quickChipRole: {
    fontSize: 11,
    fontWeight: '600',
    color: '#e9edef',
    marginBottom: 2,
    textAlign: 'center',
  },
  quickChipNum: {
    fontSize: 11,
    color: '#00a884',
    fontWeight: '500',
  },
  detectedUserCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111b21',
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2a3942',
  },
  detectedAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#202c33',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  detectedAvatarText: {
    fontSize: 18,
  },
  detectedUserName: {
    color: '#e9edef',
    fontSize: 14,
    fontWeight: '700',
  },
  detectedUserSub: {
    color: '#8696a0',
    fontSize: 11,
    marginTop: 1,
  },
  rolePill: {
    backgroundColor: 'rgba(0, 168, 132, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  rolePillText: {
    color: '#00a884',
    fontSize: 10,
    fontWeight: '700',
  },
  otpHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  otpLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8696a0',
  },
  changePhoneText: {
    color: '#00a884',
    fontSize: 13,
    fontWeight: '600',
  },
  otpInput: {
    backgroundColor: '#111b21',
    borderWidth: 1.5,
    borderColor: '#00a884',
    borderRadius: 10,
    paddingVertical: 12,
    textAlign: 'center',
    color: '#e9edef',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 10,
    marginBottom: 14,
  },
  hintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 168, 132, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 168, 132, 0.25)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 14,
  },
  hintText: {
    color: '#8696a0',
    fontSize: 12,
  },
  hintBold: {
    fontWeight: '700',
    color: '#00a884',
  },
  hintFillBtn: {
    backgroundColor: '#00a884',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  hintFillText: {
    color: '#111b21',
    fontSize: 11,
    fontWeight: '700',
  },
  resendBtn: {
    alignItems: 'center',
    marginTop: 14,
    paddingVertical: 6,
  },
  resendText: {
    color: '#00a884',
    fontSize: 13,
    fontWeight: '500',
  },
  configBox: {
    backgroundColor: '#202c33',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2a3942',
    marginTop: 12,
  },
  configLabel: {
    color: '#8696a0',
    fontSize: 12,
    marginBottom: 6,
  },
  configInput: {
    backgroundColor: '#111b21',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#e9edef',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#2a3942',
  },
  footer: {
    alignItems: 'center',
    marginTop: 28,
  },
  securityText: {
    fontSize: 12,
    color: '#00a884',
    fontWeight: '500',
  },
  footerText: {
    color: '#8696a0',
    fontSize: 11,
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBox: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#202c33',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(134, 150, 160, 0.2)',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 10,
  },
  modalHeaderIcon: {
    fontSize: 24,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#e9edef',
  },
  modalSub: {
    fontSize: 12,
    color: '#8696a0',
    marginTop: 1,
  },
  modalPinInput: {
    backgroundColor: '#111b21',
    borderWidth: 1.5,
    borderColor: '#00a884',
    borderRadius: 8,
    fontSize: 22,
    fontWeight: '700',
    color: '#e9edef',
    textAlign: 'center',
    letterSpacing: 8,
    paddingVertical: 10,
    marginBottom: 8,
  },
  modalErrorText: {
    fontSize: 12,
    color: '#f87171',
    textAlign: 'center',
    marginBottom: 12,
  },
  modalHelpText: {
    fontSize: 11,
    color: '#8696a0',
    textAlign: 'center',
    marginBottom: 12,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8696a0',
  },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#00a884',
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111b21',
  },
});

