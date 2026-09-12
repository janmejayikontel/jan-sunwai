import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LoginScreen, UserProfile } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { VideoHearingScreen } from './src/screens/VideoHearingScreen';
import { DEFAULT_SERVER_URL } from './src/config';

interface ActiveHearingState {
  serverUrl: string;
  token: string;
  roomName: string;
  grievanceId: string;
  userName: string;
  role: string;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [serverUrl, setServerUrl] = useState<string>(DEFAULT_SERVER_URL);
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
      ) : currentUser ? (
        <HomeScreen
          user={currentUser}
          serverUrl={serverUrl}
          onJoinHearing={(params) => setActiveHearing(params)}
          onLogout={() => {
            setActiveHearing(null);
            setCurrentUser(null);
          }}
        />
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
