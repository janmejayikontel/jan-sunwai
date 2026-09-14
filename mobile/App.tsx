import './polyfill';
import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, Alert, ActivityIndicator, NativeModules, AppState, Platform, PermissionsAndroid, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LoginScreen, UserProfile } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { VideoHearingScreen } from './src/screens/VideoHearingScreen';
import { IncomingCallModal, IncomingCallData } from './src/components/IncomingCallModal';
import { DEFAULT_SERVER_URL } from './src/config';

const { JanSunwaiVoIP } = NativeModules;

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
  const [hasOverlayPermission, setHasOverlayPermission] = useState<boolean>(true);

  const wsRef = useRef<WebSocket | null>(null);
  const pendingCallRef = useRef<any>(null);
  const dismissedCallIdsRef = useRef<Set<string>>(new Set());
  const cleanServerUrl = (url: string) => url.trim().replace(/\/+$/, '');

  // ─── 0. Request Notification Permissions on Android 13+ ──────
  useEffect(() => {
    const requestAndroidPermissions = async () => {
      if (Platform.OS === 'android') {
        try {
          if (Platform.Version >= 33) {
            const granted = await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
              {
                title: 'Sampark Lite Call Notifications',
                message: 'Allow notifications so your phone rings on incoming official video hearings even when the app is closed.',
                buttonPositive: 'Allow',
              }
            );
            console.log('[App] POST_NOTIFICATIONS status:', granted);
          }
        } catch (err) {
          console.warn('[App] Error requesting notification permissions:', err);
        }
      }
    };
    requestAndroidPermissions();
  }, []);

  // ─── 0b. Silence Ringtone Immediately when Entering a Hearing ─
  useEffect(() => {
    if (activeHearing) {
      JanSunwaiVoIP?.stopRinging?.();
      JanSunwaiVoIP?.setInCall?.(true);
    } else {
      JanSunwaiVoIP?.setInCall?.(false);
    }
  }, [activeHearing]);

  // ─── 1. Persistent Session Restoration on App Launch ─────────
  useEffect(() => {
    const restoreSavedSession = async () => {
      try {
        let activeSrv = DEFAULT_SERVER_URL;
        try {
          const liveRes = await fetch('https://raw.githubusercontent.com/janmejayikontel/jan-sunwai/main/server-url.txt');
          const liveTxt = (await liveRes.text()).trim();
          if (liveTxt.startsWith('http')) {
            console.log('[App] Fetched live server URL from GitHub:', liveTxt);
            activeSrv = liveTxt;
          }
        } catch (e) {
          // ignore
        }

        const saved = await AsyncStorage.getItem(STORAGE_SESSION_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.user?.phone) {
            console.log('[App/Session] Restored saved login for:', parsed.user.name, parsed.user.phone);
            setCurrentUser(parsed.user);
            let targetSrv = parsed.serverUrl || activeSrv;
            // Automatically upgrade away from stale/blocked tunnels
            if (targetSrv.includes('trycloudflare.com') || targetSrv.includes('lhr.life')) {
              targetSrv = activeSrv;
            }
            setServerUrl(targetSrv);
            AsyncStorage.setItem(
              STORAGE_SESSION_KEY,
              JSON.stringify({ user: parsed.user, serverUrl: targetSrv })
            ).catch(() => {});

            // Ensure native background VoIP service is active for this phone
            JanSunwaiVoIP?.startService?.(parsed.user.phone, cleanServerUrl(targetSrv));

            // If a pending call arrived while session was restoring, accept it now!
            if (pendingCallRef.current) {
              const pCall = pendingCallRef.current;
              pendingCallRef.current = null;
              handleAcceptIncomingCall(pCall, parsed.user);
            }
          }
        } else {
          setServerUrl(activeSrv);
        }
      } catch (e) {
        console.warn('[App/Session] Failed to restore session from AsyncStorage:', e);
      } finally {
        setIsRestoringSession(false);
      }
    };

    restoreSavedSession();
  }, []);

  // ─── 1c. Check and Request "Display over other apps" & Battery Optimization ───
  useEffect(() => {
    const checkPermissions = async () => {
      try {
        if (Platform.OS === 'android') {
          const hasOverlay = await JanSunwaiVoIP?.checkOverlayPermission?.();
          setHasOverlayPermission(hasOverlay !== false);

          if (hasOverlay === false) {
            Alert.alert(
              'फुल-स्क्रीन कॉल अनुमति (Full-Screen Call Permission)',
              'ऐप बंद होने पर भी सामान्य फोन कॉल की तरह फुल-स्क्रीन पॉप-अप देखने के लिए कृपया "Display over other apps" अनुमति चालू करें।\n\nTo show full-screen incoming video calls even when the app is closed, please enable "Display over other apps".',
              [
                { text: 'बाद में (Later)', style: 'cancel' },
                {
                  text: 'चालू करें (Enable Now)',
                  onPress: () => JanSunwaiVoIP?.requestOverlayPermission?.(),
                },
              ]
            );
          }

          const isIgnoringBattery = await JanSunwaiVoIP?.checkBatteryOptimization?.();
          if (isIgnoringBattery === false) {
            setTimeout(() => {
              Alert.alert(
                'पृष्ठभूमि कॉल अनुमति (Background Call Setting)',
                'ऐप बंद रहने या फोन लॉक होने पर भी वीडियो सुनवाई कॉल समय पर प्राप्त करने के लिए कृपया बैटरी अनुकूलन बंद करें (Unrestricted Battery)।\n\nTo ensure video hearing calls ring reliably even when the app is killed or screen is locked, please allow unrestricted background activity.',
                [
                  { text: 'बाद में (Later)', style: 'cancel' },
                  {
                    text: 'अनुमति दें (Allow)',
                    onPress: () => JanSunwaiVoIP?.requestIgnoreBatteryOptimization?.(),
                  },
                ]
              );
            }, 1200);
          }
        }
      } catch (e) {
        // ignore
      }
    };

    if (currentUser) {
      setTimeout(checkPermissions, 1000);
    }

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && currentUser) {
        checkPermissions();
      }
    });

    return () => sub.remove();
  }, [currentUser]);

  // ─── Incoming Call Actions ──────────────────────────────────
  const handleAcceptIncomingCall = async (
    overrideCall?: any,
    userOverride?: UserProfile | null
  ) => {
    const target = overrideCall || incomingCall;
    if (!target) return;

    JanSunwaiVoIP?.stopRinging?.();
    JanSunwaiVoIP?.setInCall?.(true);

    let user = userOverride || currentUser;
    if (!user && (target.userPhone || target.phone)) {
      user = {
        phone: target.userPhone || target.phone,
        name: target.userName || 'Citizen',
        role: target.yourRole || 'citizen',
      } as UserProfile;
    }

    // If pre-fetched LiveKit token exists from IncomingCallActivity, enter room in 0ms!
    if (target.livekitToken && target.livekitRoomName) {
      console.log('[App] Entering meeting room immediately with pre-fetched LiveKit token');
      setActiveHearing({
        serverUrl: target.livekitUrl || cleanServerUrl(target.serverUrl || serverUrl),
        token: target.livekitToken,
        roomName: target.livekitRoomName,
        grievanceId: target.grievanceId,
        userName: user?.name || `User (${user?.phone ? user.phone.slice(-4) : 'Citizen'})`,
        role: user?.role || 'citizen',
        callId: target.callId,
      });
      setIncomingCall(null);
      return;
    }

    if (!user) {
      console.log('[App] User session not ready yet, queuing pending call...');
      pendingCallRef.current = target;
      return;
    }

    try {
      const base = cleanServerUrl(target.serverUrl || serverUrl);
      console.log(`[App] Accepting call ${target.callId} for ${user.phone} via ${base}...`);
      const res = await fetch(`${base}/api/calls/${encodeURIComponent(target.callId)}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true',
        },
        body: JSON.stringify({
          phone: user.phone,
          action: 'accept',
        }),
      });

      const data = await res.json();
      console.log('[App] Accept response:', data);

      if (data.success && data.livekit) {
        setActiveHearing({
          serverUrl: data.livekit.url || base,
          token: data.livekit.token,
          roomName: data.livekit.roomName,
          grievanceId: target.grievanceId,
          userName: user.name || `User (${user.phone.slice(-4)})`,
          role: user.role || 'citizen',
          callId: target.callId,
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
    if (!incomingCall) return;
    const targetCallId = incomingCall.callId;
    const grievanceId = incomingCall.grievanceId;
    if (targetCallId) {
      JanSunwaiVoIP?.dismissCall?.(targetCallId);
      dismissedCallIdsRef.current.add(targetCallId);
    }
    if (grievanceId) {
      JanSunwaiVoIP?.dismissCall?.(grievanceId);
      dismissedCallIdsRef.current.add(grievanceId);
    }
    JanSunwaiVoIP?.stopRinging?.();

    if (currentUser && targetCallId) {
      try {
        const base = cleanServerUrl(serverUrl);
        await fetch(`${base}/api/calls/${targetCallId}/respond`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: currentUser.phone,
            action: 'decline',
          }),
        });
      } catch (err) {
        console.warn('Decline call error:', err);
      }
    }
    setIncomingCall(null);
  };

  const handleLeaveHearing = async () => {
    if (activeHearing) {
      const callId = activeHearing.callId;
      const grievanceId = activeHearing.grievanceId;
      const roomName = activeHearing.roomName;
      const base = cleanServerUrl(serverUrl);

      // Stop any ringing sounds immediately and release inCall state
      JanSunwaiVoIP?.stopRinging?.();
      JanSunwaiVoIP?.setInCall?.(false);

      // Blacklist callId, grievanceId, and roomName natively in Kotlin AND in JS
      if (callId) {
        JanSunwaiVoIP?.dismissCall?.(callId);
        dismissedCallIdsRef.current.add(callId);
      }
      if (grievanceId) {
        JanSunwaiVoIP?.dismissCall?.(grievanceId);
        dismissedCallIdsRef.current.add(grievanceId);
      }
      if (roomName) {
        JanSunwaiVoIP?.dismissCall?.(roomName);
        dismissedCallIdsRef.current.add(roomName);
      }

      const targetLeaveId = callId || grievanceId || roomName;
      if (targetLeaveId && currentUser?.phone) {
        console.log('[App] Participant left hearing. Blacklisting call from re-ringing:', targetLeaveId);
        fetch(`${base}/api/calls/${encodeURIComponent(targetLeaveId)}/leave`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: currentUser.phone,
            grievanceId,
            roomName,
          }),
        }).catch((e) => console.warn('[App] Error sending leave notice to server:', e));
      }
    }
    setIncomingCall(null);
    setActiveHearing(null);
  };

  // ─── 1b. Check if Native VoIP Service has a pending incoming call (woken from closed/bg) ─
  useEffect(() => {
    const checkPendingNativeCall = async () => {
      try {
        const pendingJson = await JanSunwaiVoIP?.getPendingCall?.();
        if (pendingJson) {
          console.log('[App] Received pending VoIP call from native background service:', pendingJson);
          const data = typeof pendingJson === 'string' ? JSON.parse(pendingJson) : pendingJson;
          if (data?.callId || data?.grievanceId) {
            const checkId = data.callId || '';
            const checkGrievance = data.grievanceId || '';
            if (
              (checkId && dismissedCallIdsRef.current.has(checkId)) ||
              (checkGrievance && dismissedCallIdsRef.current.has(checkGrievance))
            ) {
              console.log('[App] Ignoring call previously left/dismissed:', checkId, checkGrievance);
              return;
            }
            if (data.autoAccept) {
              handleAcceptIncomingCall(data, currentUser);
            } else {
              setIncomingCall(data as IncomingCallData);
            }
          }
        }
      } catch (e) {
        console.warn('[App] Error checking pending native call:', e);
      }
    };

    checkPendingNativeCall();

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        checkPendingNativeCall();
      }
    });

    return () => {
      appStateSub.remove();
    };
  }, [currentUser, serverUrl]);

  // ─── 2. Auto-timeout incoming call locally after 60s ─────────
  useEffect(() => {
    if (!incomingCall) return;
    const timeout = setTimeout(() => {
      console.log('[App] Incoming call local ring timeout reached (60s)');
      JanSunwaiVoIP?.stopRinging?.();
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
              const incomingId = msg.data.callId;
              const grievance = msg.data.grievanceId;
              if (
                (incomingId && dismissedCallIdsRef.current.has(incomingId)) ||
                (grievance && dismissedCallIdsRef.current.has(grievance))
              ) {
                console.log('[Mobile/WS] Ignoring incoming call for dismissed/left call:', incomingId, grievance);
                return;
              }
              setIncomingCall(msg.data as IncomingCallData);
            } else if (msg.type === 'call_ended' || msg.type === 'call_declined') {
              JanSunwaiVoIP?.stopRinging?.();
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
        const res = await fetch(checkUrl, {
          headers: { 'Bypass-Tunnel-Reminder': 'true' },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.hasIncomingCall && data.incomingCall) {
            const incomingId = data.incomingCall.callId;
            const grievance = data.incomingCall.grievanceId;
            if (
              (incomingId && dismissedCallIdsRef.current.has(incomingId)) ||
              (grievance && dismissedCallIdsRef.current.has(grievance))
            ) {
              return;
            }
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

    // Start native background VoIP service so phone rings even if app closed
    JanSunwaiVoIP?.startService?.(user.phone, cleanServerUrl(srv));
  };

  const handleLogout = async () => {
    JanSunwaiVoIP?.stopRinging?.();
    JanSunwaiVoIP?.setInCall?.(false);
    JanSunwaiVoIP?.stopService?.();
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

  // Splash screen while restoring session from storage (unless active call was answered)
  if (isRestoringSession && !activeHearing) {
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
          onLeave={handleLeaveHearing}
        />
      ) : currentUser ? (
        <>
          {!hasOverlayPermission && (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => JanSunwaiVoIP?.requestOverlayPermission?.()}
              style={styles.permissionBanner}
            >
              <Text style={styles.permissionBannerIcon}>⚠️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.permissionBannerTitle}>
                  फुल-स्क्रीन कॉल पॉप-अप चालू करें (Enable Full-Screen Calls)
                </Text>
                <Text style={styles.permissionBannerSub}>
                  ऐप बंद रहने पर भी स्क्रीन पर कॉल पॉप-अप देखने के लिए 'Display over other apps' अनुमति चालू करें।
                </Text>
              </View>
              <View style={styles.permissionBannerBtn}>
                <Text style={styles.permissionBannerBtnText}>अनुमति दें</Text>
              </View>
            </TouchableOpacity>
          )}

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
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#78350f',
    borderColor: '#f59e0b',
    borderWidth: 1.5,
    marginHorizontal: 16,
    marginTop: 44,
    marginBottom: 8,
    borderRadius: 12,
    padding: 12,
    zIndex: 999,
  },
  permissionBannerIcon: {
    fontSize: 22,
    marginRight: 10,
  },
  permissionBannerTitle: {
    color: '#fef3c7',
    fontSize: 13,
    fontWeight: '700',
  },
  permissionBannerSub: {
    color: '#fde68a',
    fontSize: 11,
    marginTop: 2,
  },
  permissionBannerBtn: {
    backgroundColor: '#f59e0b',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginLeft: 8,
  },
  permissionBannerBtnText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '800',
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
