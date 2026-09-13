import './polyfill';
import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, Alert, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LoginScreen, UserProfile } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { VideoHearingScreen } from './src/screens/VideoHearingScreen';
import { IncomingCallModal, IncomingCallData } from './src/components/IncomingCallModal';
import { DEFAULT_SERVER_URL } from './src/config';

interface ActiveHearingState {
  serverUrl: string;
  token: string;
  roomName: string;
  grievanceId: string;
  userName: string;
  role: string;
  callId?: string;
}

const STORAGE_SESSION_KEY = '@jan_sunwai_session';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [serverUrl, setServerUrl] = useState<string>(DEFAULT_SERVER_URL);
  const [activeHearing, setActiveHearing] = useState<ActiveHearingState | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState<boolean>(true);

  const wsRef = useRef<WebSocket | null>(null);
  const cleanServerUrl = (url: string) => url.trim().replace(/\/+$/, '');

  // ─── 1. Persistent Session Restoration on App Launch ─────────
  useEffect(() => {
    const restoreSavedSession = async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_SESSION_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.user?.phone) {
            console.log('[App/Session] Restored saved login for:', parsed.user.name, parsed.user.phone);
            setCurrentUser(parsed.user);
            if (parsed.serverUrl) {
              setServerUrl(parsed.serverUrl);
            }
          }
        }
      } catch (e) {
        console.warn('[App/Session] Failed to restore session from AsyncStorage:', e);
      } finally {
        setIsRestoringSession(false);
      }
    };

    restoreSavedSession();
  }, []);

  // ─── 2. Auto-timeout incoming call locally after 60s ─────────
  useEffect(() => {
    if (!incomingCall) return;
    const timeout = setTimeout(() => {
      console.log('[App] Incoming call local ring timeout reached (60s)');
      setIncomingCall(null);
    }, 60000);

    return () => clearTimeout(timeout);
  }, [incomingCall?.callId]);

  // ─── 3. WebSocket Signaling & Incoming Call Receiver ───────────
  useEffect(() => {
    if (!currentUser) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIncomingCall(null);
      return;
    }

    let isSubscribed = true;
    const base = cleanServerUrl(serverUrl);
    const wsProto = base.startsWith('https') ? 'wss://' : 'ws://';
    const cleanHost = base.replace(/^https?:\/\//, '');
    const wsUrl = `${wsProto}${cleanHost}/ws?phone=${encodeURIComponent(currentUser.phone)}`;

    const connectWebSocket = () => {
      if (!isSubscribed) return;
      console.log(`[Mobile/WS] Connecting to ${wsUrl}`);
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log(`[Mobile/WS] Connected as ${currentUser.name} (${currentUser.phone})`);
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            console.log('[Mobile/WS] Received:', msg.type);

            if (msg.type === 'incoming_call' && msg.data) {
              setIncomingCall(msg.data as IncomingCallData);
            } else if (msg.type === 'call_ended' || msg.type === 'call_declined') {
              setIncomingCall(null);
            }
          } catch (e) {
            console.warn('[Mobile/WS] Error parsing message:', e);
          }
        };

        ws.onclose = () => {
          console.log('[Mobile/WS] Disconnected. Reconnecting in 3s...');
          if (isSubscribed) {
            setTimeout(connectWebSocket, 3000);
          }
        };

        ws.onerror = (err) => {
          console.log('[Mobile/WS] Connection error:', err);
          ws.close();
        };
      } catch (err) {
        console.warn('[Mobile/WS] Init error:', err);
        if (isSubscribed) {
          setTimeout(connectWebSocket, 3000);
        }
      }
    };

    connectWebSocket();

    // Secondary polling fallback: checks every 3s to discover any missed incoming call
    // Note: NEVER auto-disconnect an active incoming call here; dismissal is handled
    // by WebSocket (call_ended / call_declined), user button presses, or 60s timeout.
    const pollInterval = setInterval(async () => {
      if (!isSubscribed || activeHearing) return;
      try {
        const checkUrl = `${base}/api/calls/check-incoming/${encodeURIComponent(currentUser.phone)}`;
        const res = await fetch(checkUrl);
        if (res.ok) {
          const data = await res.json();
          if (data.hasIncomingCall && data.incomingCall) {
            setIncomingCall((prev) => {
              if (prev && prev.callId === data.incomingCall.callId) return prev;
              return data.incomingCall;
            });
          }
        }
      } catch (err) {
        // network polling silent
      }
    }, 3000);

    return () => {
      isSubscribed = false;
      clearInterval(pollInterval);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [currentUser, serverUrl, activeHearing]);

  // ─── 4. Incoming Call Actions ──────────────────────────────────
  const handleAcceptIncomingCall = async () => {
    if (!incomingCall || !currentUser) return;

    try {
      const base = cleanServerUrl(serverUrl);
      const res = await fetch(`${base}/api/calls/${incomingCall.callId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: currentUser.phone,
          action: 'accept',
        }),
      });

      const data = await res.json();

      if (data.success && data.livekit) {
        setActiveHearing({
          serverUrl: data.livekit.url || base,
          token: data.livekit.token,
          roomName: data.livekit.roomName,
          grievanceId: incomingCall.grievanceId,
          userName: currentUser.name || `User (${currentUser.phone.slice(-4)})`,
          role: currentUser.role || 'citizen',
          callId: incomingCall.callId,
        });
      } else {
        Alert.alert('Unable to Join', data.error || 'Failed to accept call session.');
      }
    } catch (err: any) {
      console.error('Accept call error:', err);
      Alert.alert('Connection Error', err?.message || 'Failed to join call.');
    } finally {
      setIncomingCall(null);
    }
  };

  const handleDeclineIncomingCall = async () => {
    if (!incomingCall || !currentUser) return;

    try {
      const base = cleanServerUrl(serverUrl);
      await fetch(`${base}/api/calls/${incomingCall.callId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: currentUser.phone,
          action: 'decline',
        }),
      });
    } catch (err) {
      console.warn('Decline call error:', err);
    } finally {
      setIncomingCall(null);
    }
  };

  // ─── 5. Login & Logout Session Handlers ────────────────────────
  const handleLoginSuccess = async (user: UserProfile, srv: string) => {
    setCurrentUser(user);
    setServerUrl(srv);
    try {
      await AsyncStorage.setItem(
        STORAGE_SESSION_KEY,
        JSON.stringify({ user, serverUrl: srv })
      );
      console.log('[App/Session] User session saved to AsyncStorage');
    } catch (err) {
      console.warn('[App/Session] Error storing session:', err);
    }
  };

  const handleLogout = async () => {
    setActiveHearing(null);
    setCurrentUser(null);
    setIncomingCall(null);
    try {
      await AsyncStorage.removeItem(STORAGE_SESSION_KEY);
      console.log('[App/Session] User session removed from AsyncStorage');
    } catch (err) {
      console.warn('[App/Session] Error removing session:', err);
    }
  };

  // Splash screen while restoring session from storage
  if (isRestoringSession) {
    return (
      <View style={styles.splashContainer}>
        <View style={styles.splashEmblem}>
          <Text style={styles.splashEmblemText}>🏛️</Text>
        </View>
        <Text style={styles.splashTitleHindi}>संपर्क लाइट</Text>
        <Text style={styles.splashTitleEnglish}>Sampark Lite — Rajasthan</Text>
        <ActivityIndicator color="#38bdf8" size="large" style={{ marginTop: 24 }} />
        <Text style={styles.splashSub}>Restoring secure session...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {activeHearing ? (
        <VideoHearingScreen
          serverUrl={activeHearing.serverUrl}
          token={activeHearing.token}
          roomName={activeHearing.roomName}
          grievanceId={activeHearing.grievanceId}
          userName={activeHearing.userName}
          role={activeHearing.role}
          callId={activeHearing.callId}
          onLeave={() => setActiveHearing(null)}
        />
      ) : currentUser ? (
        <>
          <HomeScreen
            user={currentUser}
            serverUrl={serverUrl}
            onJoinHearing={(params) => setActiveHearing(params)}
            onLogout={handleLogout}
          />

          <IncomingCallModal
            incomingCall={incomingCall}
            onAccept={handleAcceptIncomingCall}
            onDecline={handleDeclineIncomingCall}
          />
        </>
      ) : (
        <LoginScreen onLoginSuccess={handleLoginSuccess} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  splashContainer: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  splashEmblem: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#0f172a',
    borderWidth: 1.5,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  splashEmblemText: {
    fontSize: 40,
  },
  splashTitleHindi: {
    fontSize: 28,
    fontWeight: '800',
    color: '#f8fafc',
    letterSpacing: 0.5,
  },
  splashTitleEnglish: {
    fontSize: 16,
    fontWeight: '700',
    color: '#38bdf8',
    marginTop: 4,
  },
  splashSub: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 12,
  },
});
