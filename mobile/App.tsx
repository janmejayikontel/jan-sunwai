import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { registerGlobals } from '@livekit/react-native';
import { JoinHearingScreen } from './src/screens/JoinHearingScreen';
import { VideoHearingScreen } from './src/screens/VideoHearingScreen';

// Polyfill WebRTC and LiveKit native modules
registerGlobals();

interface ActiveHearingState {
  serverUrl: string;
  token: string;
  roomName: string;
  grievanceId: string;
  userName: string;
  role: string;
}

export default function App() {
  const [activeHearing, setActiveHearing] = useState<ActiveHearingState | null>(null);

  return (
    <View style={styles.container}>
      {activeHearing ? (
        <VideoHearingScreen
          serverUrl={activeHearing.serverUrl}
          token={activeHearing.token}
          roomName={activeHearing.roomName}
          grievanceId={activeHearing.grievanceId}
          userName={activeHearing.userName}
          onLeave={() => setActiveHearing(null)}
        />
      ) : (
        <JoinHearingScreen onJoin={(params) => setActiveHearing(params)} />
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
