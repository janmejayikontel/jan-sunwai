import './polyfill';
import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Alert } from 'react-native';
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

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [serverUrl, setServerUrl] = useState<string>(DEFAULT_SERVER_URL);
  const [activeHearing, setActiveHearing] = useState<ActiveHearingState | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const cleanServerUrl = (url: string) => url.trim().replace(/\/+$/, '');

  // ─── WebSocket Signaling & Incoming Call Receiver ───────────
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

    // Fast polling fallback: checks every 2.5s for any active call ringing for this phone
    // Ensures incoming call is received even if WebSocket had a reconnect delay or sleep
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
          } else {
            setIncomingCall((prev) => (prev ? null : null));
          }
        }
      } catch (err) {
        // network polling silent
      }
    }, 2500);

    return () => {
      isSubscribed = false;
      clearInterval(pollInterval);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [currentUser, serverUrl, activeHearing]);

  // ─── Incoming Call Actions ──────────────────────────────────
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
            onLogout={() => {
              setActiveHearing(null);
              setCurrentUser(null);
              setIncomingCall(null);
            }}
          />

          <IncomingCallModal
            incomingCall={incomingCall}
            onAccept={handleAcceptIncomingCall}
            onDecline={handleDeclineIncomingCall}
          />
        </>
      ) : (
        <LoginScreen
          onLoginSuccess={(user, srv) => {
            setCurrentUser(user);
            setServerUrl(srv);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
});
