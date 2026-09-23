import './polyfill';
import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, Alert, ActivityIndicator, NativeModules, AppState, Platform, PermissionsAndroid, TouchableOpacity, DeviceEventEmitter, Vibration } from 'react-native';
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
  const [isConnectingHearing, setIsConnectingHearing] = useState<boolean>(false);
  const [connectingCaseInfo, setConnectingCaseInfo] = useState<string>('');
  const [isRestoringSession, setIsRestoringSession] = useState<boolean>(true);
  const [hasOverlayPermission, setHasOverlayPermission] = useState<boolean>(true);

  // Keep refs in sync with state so WebSocket/polling closures always see fresh values
  const setActiveHearingAndRef = (val: ActiveHearingState | null) => {
    activeHearingRef.current = val;
    setActiveHearing(val);
  };
  const setIsConnectingHearingAndRef = (val: boolean) => {
    isConnectingHearingRef.current = val;
    setIsConnectingHearing(val);
  };

  const wsRef = useRef<WebSocket | null>(null);
  const pendingCallRef = useRef<any>(null);
  const dismissedCallIdsRef = useRef<Set<string>>(new Set());
  // Refs that shadow state — used in WebSocket/polling closures to avoid stale captures
  const activeHearingRef = useRef<ActiveHearingState | null>(null);
  const isConnectingHearingRef = useRef<boolean>(false);
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

  // ─── 0b. Silence Ringtone & Kill Native Popup when Entering or Leaving a Hearing ─
  useEffect(() => {
    JanSunwaiVoIP?.stopRinging?.();
    if (activeHearing) {
      // Safety net: explicitly dismiss IncomingCallActivity and CallOverlay
      // even if dismissCall was already called in handleAcceptIncomingCall
      JanSunwaiVoIP?.dismissCall?.(activeHearing.callId || activeHearing.grievanceId || null);
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
          const liveRes = await fetch(`https://raw.githubusercontent.com/janmejayikontel/jan-sunwai/main/server-url.txt?nocache=${Date.now()}`);
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
            // Always prioritize the latest active server URL from server-url.txt
            if (activeSrv && activeSrv.startsWith('http')) {
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

          // Android 14+ requires explicit permission for USE_FULL_SCREEN_INTENT (for call popup when app is closed)
          if (Platform.Version >= 34) {
            try {
              const hasFullScreen = await JanSunwaiVoIP?.checkFullScreenIntentPermission?.();
              if (hasFullScreen === false) {
                setTimeout(() => {
                  Alert.alert(
                    'इनकमिंग कॉल पॉपअप (Incoming Call Popup)',
                    'ऐप बंद होने पर भी इनकमिंग वीडियो सुनवाई का पॉपअप दिखाने के लिए कृपया "Allow full screen intent" अनुमति चालू करें।\n\nTo show full-screen call popups when app is closed, please allow "Display full screen apps" permission.',
                    [
                      { text: 'बाद में (Later)', style: 'cancel' },
                      {
                        text: 'अनुमति दें (Allow)',
                        onPress: () => JanSunwaiVoIP?.requestFullScreenIntentPermission?.(),
                      },
                    ]
                  );
                }, 2000);
              }
            } catch (e) {
              // ignore if not Android 14+
            }
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

    // Immediately blacklist this call's IDs so WebSocket/polling never re-show the popup
    [target.callId, target.grievanceId, target.roomName].forEach((id) => {
      if (id) {
        dismissedCallIdsRef.current.add(id);
        const clean = id.replace(/^(hearing_|JS-)/i, '').trim().toUpperCase();
        if (clean) {
          dismissedCallIdsRef.current.add(clean);
          dismissedCallIdsRef.current.add(`JS-${clean}`);
          dismissedCallIdsRef.current.add(`hearing_${clean}`);
        }
      }
    });

    // IMMEDIATELY HIDE THE INCOMING CALL MODAL and mark as connecting
    setIncomingCall(null);
    setIsConnectingHearingAndRef(true);
    setConnectingCaseInfo(target.grievanceId || target.roomName || 'Hearing');

    Vibration.cancel();
    // dismissCall kills both IncomingCallActivity and CallOverlay immediately
    // This is the most reliable way to ensure native UI is gone before meeting room opens
    JanSunwaiVoIP?.dismissCall?.(target.callId || target.grievanceId || null);
    JanSunwaiVoIP?.stopRinging?.();
    JanSunwaiVoIP?.setInCall?.(true);

    let user = userOverride || currentUser;
    if (!user) {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_SESSION_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.user) {
            user = parsed.user;
            setCurrentUser(parsed.user);
          }
        }
      } catch (e) {
        // ignore
      }
    }
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
      setIncomingCall(null);
      setIsConnectingHearingAndRef(false);
      setActiveHearingAndRef({
        serverUrl: target.livekitUrl || cleanServerUrl(serverUrl || target.serverUrl || DEFAULT_SERVER_URL),
        token: target.livekitToken,
        roomName: target.livekitRoomName,
        grievanceId: target.grievanceId,
        userName: user?.name || `User (${user?.phone ? user.phone.slice(-4) : 'Citizen'})`,
        role: user?.role || 'citizen',
        callId: target.callId,
      });
      return;
    }

    if (!user) {
      console.log('[App] User session not ready yet, queuing pending call...');
      pendingCallRef.current = target;
      setIsConnectingHearingAndRef(false);
      return;
    }

    try {
      const base = cleanServerUrl(serverUrl || target.serverUrl || DEFAULT_SERVER_URL);
      const rawId = (target.callId || '').toString().trim();
      const effectiveCallId = (rawId && rawId !== 'undefined' && rawId !== 'null')
        ? rawId
        : (target.grievanceId || target.id || target.roomName || 'respond');

      console.log(`[App] Accepting call ${effectiveCallId} for ${user.phone} via ${base}...`);
      const endpoint = effectiveCallId === 'respond'
        ? `${base}/api/calls/respond`
        : `${base}/api/calls/${encodeURIComponent(effectiveCallId)}/respond`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true',
        },
        body: JSON.stringify({
          phone: user.phone,
          action: 'accept',
          callId: rawId && rawId !== 'undefined' ? rawId : undefined,
          grievanceId: target.grievanceId,
          roomName: target.roomName || target.livekitRoomName,
        }),
      });

      const rawText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        console.warn('[App] Non-JSON response received:', rawText.slice(0, 150));
        throw new Error('Hearing call session ended or unavailable.');
      }

      console.log('[App] Accept response:', data);

      if (data.success && data.livekit) {
        setIncomingCall(null);
        setIsConnectingHearingAndRef(false);
        setActiveHearingAndRef({
          serverUrl: data.livekit.url || base,
          token: data.livekit.token,
          roomName: data.livekit.roomName,
          grievanceId: target.grievanceId,
          userName: user.name || `User (${user.phone.slice(-4)})`,
          role: user.role || 'citizen',
          callId: target.callId || effectiveCallId,
        });
      } else {
        setIncomingCall(null);
        setIsConnectingHearingAndRef(false);
        Alert.alert('Unable to Join', data.error || 'Failed to accept call session.');
      }
    } catch (err: any) {
      setIncomingCall(null);
      setIsConnectingHearingAndRef(false);
      console.error('Accept call error:', err);
      Alert.alert('Connection Error', err?.message || 'Failed to join call.');
    } finally {
      setIncomingCall(null);
      setIsConnectingHearingAndRef(false);
    }
  };

  const isDismissedCall = (callId?: string, grievanceId?: string, roomName?: string): boolean => {
    if (!callId && !grievanceId && !roomName) return false;
    const ids = [callId, grievanceId, roomName].filter(Boolean) as string[];
    for (const id of ids) {
      if (dismissedCallIdsRef.current.has(id)) return true;
      const clean = id.replace(/^(hearing_|JS-)/i, '').trim().toUpperCase();
      if (clean && (
        dismissedCallIdsRef.current.has(clean) ||
        dismissedCallIdsRef.current.has(`JS-${clean}`) ||
        dismissedCallIdsRef.current.has(`hearing_${clean}`)
      )) {
        return true;
      }
    }
    return false;
  };

  const handleDeclineIncomingCall = async () => {
    if (!incomingCall) return;
    const targetCallId = incomingCall.callId;
    const grievanceId = incomingCall.grievanceId;
    const roomName = incomingCall.roomName;

    // Immediately blacklist all identifiers so no ringing sound or prompt persists
    [targetCallId, grievanceId, roomName].forEach((id) => {
      if (id) {
        dismissedCallIdsRef.current.add(id);
        const clean = id.replace(/^(hearing_|JS-)/i, '').trim().toUpperCase();
        if (clean) {
          dismissedCallIdsRef.current.add(clean);
          dismissedCallIdsRef.current.add(`JS-${clean}`);
          dismissedCallIdsRef.current.add(`hearing_${clean}`);
        }
        JanSunwaiVoIP?.dismissCall?.(id);
      }
    });
    Vibration.cancel();
    JanSunwaiVoIP?.stopRinging?.();

    if (currentUser && (targetCallId || grievanceId || roomName)) {
      try {
        const base = cleanServerUrl(serverUrl);
        const endpointId = targetCallId || grievanceId || roomName;
        await fetch(`${base}/api/calls/${encodeURIComponent(endpointId)}/respond`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Bypass-Tunnel-Reminder': 'true' },
          body: JSON.stringify({
            phone: currentUser.phone,
            action: 'decline',
            callId: targetCallId,
            grievanceId,
            roomName,
          }),
        });
      } catch (err) {
        console.warn('Decline call error:', err);
      }
    }
    setIncomingCall(null);
  };

  const handleLeaveHearing = async () => {
    // 1. Immediately silence any ringing sound or vibration
    Vibration.cancel();
    JanSunwaiVoIP?.stopRinging?.();
    JanSunwaiVoIP?.setInCall?.(false);
    setIncomingCall(null);

    if (activeHearing) {
      const callId = activeHearing.callId;
      const grievanceId = activeHearing.grievanceId;
      const roomName = activeHearing.roomName;
      const base = cleanServerUrl(serverUrl);

      // 2. Blacklist all identifiers in both React Native ref and Native Android VoIP service
      [callId, roomName, grievanceId].forEach((id) => {
        if (id) {
          dismissedCallIdsRef.current.add(id);
          const clean = id.replace(/^(hearing_|JS-)/i, '').trim().toUpperCase();
          if (clean) {
            dismissedCallIdsRef.current.add(clean);
            dismissedCallIdsRef.current.add(`JS-${clean}`);
            dismissedCallIdsRef.current.add(`hearing_${clean}`);
          }
          JanSunwaiVoIP?.dismissCall?.(id);
        }
      });

      const targetLeaveId = callId || grievanceId || roomName;
      if (targetLeaveId && currentUser?.phone) {
        console.log('[App] Participant left hearing. Leaving call session:', targetLeaveId);
        try {
          await fetch(`${base}/api/calls/${encodeURIComponent(targetLeaveId)}/leave`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Bypass-Tunnel-Reminder': 'true' },
            body: JSON.stringify({
              phone: currentUser.phone,
              grievanceId,
              roomName,
            }),
          });
        } catch (e) {
          console.warn('[App] Error sending leave notice to server:', e);
        }
      }
    }
    JanSunwaiVoIP?.stopRinging?.();
    setIncomingCall(null);
    setActiveHearingAndRef(null);
  };

  // ─── 1b. Check if Native VoIP Service has a pending incoming call (woken from closed/bg) ─
  useEffect(() => {
    const checkPendingNativeCall = async () => {
      try {
        const pendingJson = await JanSunwaiVoIP?.getPendingCall?.();
        if (pendingJson) {
          console.log('[App] Received pending VoIP call from native background service:', pendingJson);
          const data = typeof pendingJson === 'string' ? JSON.parse(pendingJson) : pendingJson;
          if (data?.callId || data?.grievanceId || data?.roomName) {
            if (!data.autoAccept) {
              if (isDismissedCall(data.callId, data.grievanceId, data.roomName)) {
                console.log('[App] Ignoring call previously left/dismissed:', data.callId || data.grievanceId);
                JanSunwaiVoIP?.stopRinging?.();
                return;
              }
            }
            if (data.autoAccept) {
              setIncomingCall(null);
              setIsConnectingHearingAndRef(true);
              setConnectingCaseInfo(data.grievanceId || data.roomName || 'Hearing');
              handleAcceptIncomingCall(data, currentUser);
            } else {
              if (!activeHearingRef.current && !isConnectingHearingRef.current) {
                setIncomingCall(data as IncomingCallData);
              }
            }
          }
        }
      } catch (e) {
        console.warn('[App] Error checking pending native call:', e);
      }
    };

    checkPendingNativeCall();

    // Listen for real-time incoming call events dispatched by native JanSunwaiVoIPModule
    const nativeCallSub = DeviceEventEmitter.addListener('onIncomingCall', (callJson: string) => {
      try {
        console.log('[App] Received onIncomingCall event from native VoIP module:', callJson);
        const data = typeof callJson === 'string' ? JSON.parse(callJson) : callJson;
        if (data?.callId || data?.grievanceId || data?.roomName) {
          if (isDismissedCall(data.callId, data.grievanceId, data.roomName)) {
            console.log('[App] Ignoring incoming event for dismissed callId:', data.callId || data.grievanceId);
            JanSunwaiVoIP?.stopRinging?.();
            return;
          }
          if (data.autoAccept) {
            setIncomingCall(null);
            setIsConnectingHearingAndRef(true);
            setConnectingCaseInfo(data.grievanceId || data.roomName || 'Hearing');
            handleAcceptIncomingCall(data, currentUser);
          } else {
            if (!activeHearingRef.current && !isConnectingHearingRef.current) {
              setIncomingCall(data as IncomingCallData);
            }
          }
        }
      } catch (e) {
        console.warn('[App] Error handling native onIncomingCall event:', e);
      }
    });

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        checkPendingNativeCall();
      }
    });

    return () => {
      nativeCallSub.remove();
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
              const incoming = msg.data;
              if (isDismissedCall(incoming.callId, incoming.grievanceId, incoming.roomName)) {
                console.log('[Mobile/WS] Ignoring incoming call for dismissed callId:', incoming.callId || incoming.grievanceId);
                JanSunwaiVoIP?.stopRinging?.();
                return;
              }
              // Use refs — not state — to avoid stale closure capturing initial false/null values
              if (!activeHearingRef.current && !isConnectingHearingRef.current) {
                setIncomingCall(msg.data as IncomingCallData);
              }
            } else if (msg.type === 'call_ended' || msg.type === 'call_declined') {
              JanSunwaiVoIP?.stopRinging?.();
              setIncomingCall(null);
            } else if (msg.type === 'moderation' && msg.data) {
              DeviceEventEmitter.emit('onModeration', msg.data);
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

    // High-reliability polling fallback:
    // When WebSocket is open, incoming call is delivered in 0ms via WebSocket push!
    // A light fallback runs every 30s if WS is connected, or every 8s if WS is temporarily down.
    let lastPollTime = 0;
    const pollInterval = setInterval(async () => {
      // Use refs so this closure always sees the current value even after state changes
      if (!isSubscribed || activeHearingRef.current || isConnectingHearingRef.current) return;

      const isWsOpen = wsRef.current && wsRef.current.readyState === 1; // 1 = OPEN
      const now = Date.now();
      const threshold = isWsOpen ? 30000 : 8000;
      if (now - lastPollTime < threshold) return;
      lastPollTime = now;

      try {
        const checkUrl = `${base}/api/calls/check-incoming/${encodeURIComponent(currentUser.phone)}`;
        const res = await fetch(checkUrl, {
          headers: { 'Bypass-Tunnel-Reminder': 'true' },
        });
        if (res.ok) {
          const data = await res.json();
          // Use refs to check current state to avoid stale closure
          if (data.hasIncomingCall && data.incomingCall && !isConnectingHearingRef.current && !activeHearingRef.current) {
            const inc = data.incomingCall;
            if (isDismissedCall(inc.callId, inc.grievanceId, inc.roomName)) {
              return;
            }
            setIncomingCall((prev) => {
              if (prev && prev.callId === inc.callId) return prev;
              return inc;
            });
          } else if (!data.hasIncomingCall) {
            // If caller hung up or call was cancelled, automatically clear ringing modal
            setIncomingCall((prev) => {
              if (prev) {
                JanSunwaiVoIP?.stopRinging?.();
                return null;
              }
              return null;
            });
          }
        }
      } catch (err) {
        // network polling silent
      }
    }, 2000);

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
    setActiveHearingAndRef(null);
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
          apiBaseUrl={cleanServerUrl(serverUrl)}
          token={activeHearing.token}
          roomName={activeHearing.roomName}
          grievanceId={activeHearing.grievanceId}
          userName={activeHearing.userName}
          role={activeHearing.role}
          callId={activeHearing.callId}
          onLeave={handleLeaveHearing}
        />
      ) : isConnectingHearing ? (
        <View style={styles.connectingOverlay}>
          <View style={styles.connectingCard}>
            <View style={styles.connectingPulseCircle}>
              <ActivityIndicator size="large" color="#38bdf8" />
            </View>
            <Text style={styles.connectingTitleHindi}>सुनवाई कक्ष में प्रवेश हो रहा है...</Text>
            <Text style={styles.connectingTitleEnglish}>Connecting to Video Hearing Room</Text>
            {connectingCaseInfo ? (
              <View style={styles.connectingBadge}>
                <Text style={styles.connectingBadgeText}>Case #{connectingCaseInfo}</Text>
              </View>
            ) : null}
            <Text style={styles.connectingHint}>
              Establishing encrypted live video & audio streams...
            </Text>
          </View>
        </View>
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
            onJoinHearing={(params) => setActiveHearingAndRef(params)}
            onLogout={handleLogout}
          />

          <IncomingCallModal
            incomingCall={!isConnectingHearing && !activeHearing ? incomingCall : null}
            isInCall={!!activeHearing}
            isConnecting={isConnectingHearing}
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
  connectingOverlay: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  connectingCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#0f172a',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e293b',
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  connectingPulseCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderWidth: 1.5,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  connectingTitleHindi: {
    fontSize: 20,
    fontWeight: '800',
    color: '#f8fafc',
    textAlign: 'center',
    marginBottom: 6,
  },
  connectingTitleEnglish: {
    fontSize: 15,
    fontWeight: '600',
    color: '#38bdf8',
    textAlign: 'center',
    marginBottom: 16,
  },
  connectingBadge: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
  },
  connectingBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#e2e8f0',
    letterSpacing: 0.5,
  },
  connectingHint: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
  },
});
