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
  const [showConfig, setShowConfig] = useState(false);

  const cleanServerUrl = (url: string) => url.trim().replace(/\/+$/, '');

  // Step 1: Request OTP
  const handleSendOtp = async () => {
    const cleanPhone = phone.trim().replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      Alert.alert('Invalid Phone', 'Please enter a valid 10-digit mobile number.');
      return;
    }

    setIsLoading(true);
    setDevOtpHint(null);

    try {
      const url = `${cleanServerUrl(serverBase)}/api/auth/otp/send`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send OTP. Check server connection.');
      }

      if (data.devOtp) {
        setDevOtpHint(data.devOtp);
      }

      setStep('otp');
    } catch (err: any) {
      console.error('OTP send error:', err);
      Alert.alert(
        'Connection Error',
        `Unable to reach Jan Sunwai server at:\n${serverBase}\n\n${err?.message || 'Network request failed'}`
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
        headers: { 'Content-Type': 'application/json' },
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
          designation: data.user.designation || 'Citizen',
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
          {/* Header Brand */}
          <View style={styles.header}>
            <View style={styles.emblemContainer}>
              <Text style={styles.emblemIcon}>🏛️</Text>
            </View>
            <Text style={styles.hindiTitle}>जन सुनवाई पोर्टल</Text>
            <Text style={styles.englishTitle}>Jan Sunwai Rajasthan</Text>
            <Text style={styles.subtitle}>Department of Administrative Reforms</Text>
          </View>

          {/* Login Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {step === 'phone' ? 'Citizen & Officer Login' : 'Enter OTP Verification'}
            </Text>
            <Text style={styles.cardDesc}>
              {step === 'phone'
                ? 'Enter your 10-digit mobile number to access hearing portal'
                : `We have sent a verification code to +91 ${phone}`}
            </Text>

            {step === 'phone' ? (
              // Step 1: Phone input
              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Mobile Number</Text>
                <View style={styles.phoneInputRow}>
                  <View style={styles.countryCodeBox}>
                    <Text style={styles.countryCodeText}>🇮🇳 +91</Text>
                  </View>
                  <TextInput
                    style={styles.phoneInput}
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="98765 43210"
                    placeholderTextColor="#64748b"
                    keyboardType="phone-pad"
                    maxLength={10}
                    autoFocus
                  />
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
                  onPress={handleSendOtp}
                  disabled={isLoading}
                  activeOpacity={0.8}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Get OTP ➔</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              // Step 2: OTP input
              <View style={styles.formGroup}>
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
                  style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
                  onPress={handleVerifyOtp}
                  disabled={isLoading}
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

          {/* Server Config Toggle */}
          <TouchableOpacity
            style={styles.configToggle}
            onPress={() => setShowConfig(!showConfig)}
          >
            <Text style={styles.configToggleText}>
              ⚙️ {showConfig ? 'Hide Server URL' : 'Server Endpoint Settings'}
            </Text>
          </TouchableOpacity>

          {showConfig && (
            <View style={styles.configBox}>
              <Text style={styles.configLabel}>Server Base URL</Text>
              <TextInput
                style={styles.configInput}
                value={serverBase}
                onChangeText={setServerBase}
                placeholder="https://your-server.com"
                placeholderTextColor="#64748b"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.configHelp}>
                Cloud Tunnel: https://display-filename-rapids-alberta.trycloudflare.com
              </Text>
            </View>
          )}

          {/* Footer Helpline */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Rajasthan Sampark Toll-Free Helpline: <Text style={styles.helplineText}>181</Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  header: {
    alignItems: 'center',
    marginBottom: 28,
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
});
