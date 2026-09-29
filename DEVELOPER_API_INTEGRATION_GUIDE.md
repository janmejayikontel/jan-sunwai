# 🏛️ Rajasthan Jan Sunwai — External Developer API & Mobile Integration Guide

Welcome to the **Jan Sunwai Video Hearing Integration Suite**.

This guide provides everything another development team needs to embed Jan Sunwai multi-party video hearings directly into their mobile apps (React Native, Android Kotlin, Flutter, or iOS) and web portals.

---

## 1. Quick Architecture Overview

```
[ Your Mobile App ] (Rajasthan Sampark / Citizen App / Dept Portal)
         │
         │  1. Call REST API with `X-API-Key: js_live_...`
         ▼
[ Jan Sunwai Backend ] (Node.js + SQLite + VoIP Signaling)
         │
         │  2. Creates room, rings Citizen + Officer, returns LiveKit WebRTC Token
         ▼
[ LiveKit Cloud SFU ] (wss://jan-sunwai-demo-y7hrzb7k.livekit.cloud)
         │
         │  3. Connects 1080p WebRTC Video Streams with E2EE
         ▼
[ Interactive Video Hearing Room ] (Presiding Officer 🏛️ + Citizen 👤 + Field Officer 👷)
```

---

## 2. Authentication

Every request to the Jan Sunwai Developer API (`/api/v1/...`) requires an authorized **API Key**.

### Generating an API Key:
1. Log in to the Jan Sunwai Web Portal as **Super Admin** (`+919999999999`).
2. Go to the **Admin Dashboard** ➔ Click the **🔑 API Keys & Integrations** tab.
3. Enter your application or department name (e.g., `Rajasthan Sampark Mobile App`) and click **+ Generate API Key**.
4. Copy your key: `js_live_xxxxxxxxxxxxxxxxxxxxxxxx`.

### Request Header:
```http
X-API-Key: js_live_raj_sampark_88421b9c7e0f
Content-Type: application/json
```
*(Alternatively: `Authorization: Bearer js_live_...`)*

---

## 3. Core REST API Endpoints (`/api/v1/hearings`)

### Base URL:
- **Public Cloudflare Tunnel:** `https://physiology-temporarily-salad-hist.trycloudflare.com`
- **Local Network / Dev:** `http://localhost:3001`

---

### Endpoint 1: Verify API Key Connection
Check if your API key is active and retrieve the LiveKit SFU server configuration.

* **Method:** `GET`
* **Path:** `/api/v1/hearings/verify-key`
* **Header:** `X-API-Key: <your_key>`

#### Example Response:
```json
{
  "success": true,
  "message": "API Key is valid and authorized for Jan Sunwai Video Hearing Services.",
  "client": {
    "name": "Rajasthan Sampark Mobile App",
    "status": "active"
  },
  "livekitServerUrl": "wss://jan-sunwai-demo-y7hrzb7k.livekit.cloud"
}
```

---

### Endpoint 2: Start / Initiate a Hearing Call
Initiate a hearing room for a specific grievance. This automatically rings the citizen and field officer on their mobile devices.

* **Method:** `POST`
* **Path:** `/api/v1/hearings/create`
* **Header:** `X-API-Key: <your_key>`
* **Body:**
```json
{
  "grievanceId": "RAJ-2024-88421",
  "title": "Water Pipeline Contamination Hearing",
  "officer": {
    "name": "Sh. Alok Sharma, IAS",
    "phone": "+919414012345",
    "designation": "District Collector & DM"
  },
  "citizen": {
    "name": "Janmejay Sethi",
    "phone": "+917735807328"
  },
  "employee": {
    "name": "Chandan Kumar",
    "phone": "+917749852013",
    "designation": "Assistant Engineer (PHED)"
  },
  "autoRecord": true
}
```

#### Example Response:
```json
{
  "success": true,
  "callId": "83745081-dbca-4e6b-ad51-53e8d6b17976",
  "grievanceId": "RAJ-2024-88421",
  "roomName": "JS-RAJ-2024-88421",
  "livekitUrl": "wss://jan-sunwai-demo-y7hrzb7k.livekit.cloud",
  "tokens": {
    "officer": "eyJhbGciOiJIUzI1NiJ9...",
    "citizen": "eyJhbGciOiJIUzI1NiJ9...",
    "employee": "eyJhbGciOiJIUzI1NiJ9..."
  },
  "joinUrls": {
    "webPortal": "https://physiology-temporarily-salad-hist.trycloudflare.com/?room=JS-RAJ-2024-88421",
    "officer": "https://physiology-temporarily-salad-hist.trycloudflare.com/?room=JS-RAJ-2024-88421&role=officer",
    "citizen": "https://physiology-temporarily-salad-hist.trycloudflare.com/?room=JS-RAJ-2024-88421&role=citizen"
  },
  "ringing": {
    "citizen": { "name": "Janmejay Sethi", "phone": "+917735807328", "status": "ringing" },
    "employee": { "name": "Chandan Kumar", "phone": "+917749852013", "status": "ringing" }
  },
  "message": "Hearing call initiated. Citizen and field officer are being rung."
}
```

---

### Endpoint 3: Check Incoming Call on Citizen / Officer Phone
Check if there is an active hearing call ringing for a particular phone number.

* **Method:** `GET`
* **Path:** `/api/v1/hearings/incoming?phone=+917735807328`
* **Header:** `X-API-Key: <your_key>`

#### Example Response (Call Ringing):
```json
{
  "success": true,
  "isRinging": true,
  "incomingCall": {
    "callId": "83745081-dbca-4e6b-ad51-53e8d6b17976",
    "grievanceId": "RAJ-2024-88421",
    "title": "Water Pipeline Contamination Hearing",
    "callerName": "Sh. Alok Sharma, IAS",
    "callerDesignation": "District Collector & DM",
    "roomName": "JS-RAJ-2024-88421"
  }
}
```

---

### Endpoint 4: Respond to Incoming Call (Accept / Decline)
When the citizen or official clicks **Accept** or **Decline** on their phone screen.

* **Method:** `POST`
* **Path:** `/api/v1/hearings/respond`
* **Header:** `X-API-Key: <your_key>`
* **Body:**
```json
{
  "callId": "83745081-dbca-4e6b-ad51-53e8d6b17976",
  "phone": "+917735807328",
  "action": "accept"
}
```

#### Example Response:
```json
{
  "success": true,
  "action": "accepted",
  "callId": "83745081-dbca-4e6b-ad51-53e8d6b17976",
  "roomName": "JS-RAJ-2024-88421",
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "livekitUrl": "wss://jan-sunwai-demo-y7hrzb7k.livekit.cloud"
}
```

---

### Endpoint 5: Instant Join Token (Direct Entry)
If a user clicks "Join Scheduled Hearing" from their grievance list or calendar.

* **Method:** `POST`
* **Path:** `/api/v1/hearings/join`
* **Header:** `X-API-Key: <your_key>`
* **Body:**
```json
{
  "roomName": "JS-RAJ-2024-88421",
  "name": "Janmejay Sethi",
  "phone": "+917735807328",
  "role": "citizen"
}
```

---

### Endpoint 6: End Hearing Call
* **Method:** `POST`
* **Path:** `/api/v1/hearings/end`
* **Header:** `X-API-Key: <your_key>`
* **Body:**
```json
{
  "roomName": "JS-RAJ-2024-88421"
}
```

---

## 4. Mobile App Video Integration (React Native / Android)

To render the live video hearing in your mobile app, install the official LiveKit SDK:

### Step 1: Install Dependencies
```bash
npm install @livekit/react-native @livekit/react-native-webrtc livekit-client
```

### Step 2: Embed the Video Room Component
Create a screen or modal in your mobile app using this component:

```tsx
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Room, RoomEvent, VideoTrack } from 'livekit-client';
import { VideoView } from '@livekit/react-native';

interface HearingVideoScreenProps {
  livekitUrl: string; // from /api/v1/hearings/create or /join
  token: string;      // from /api/v1/hearings/create or /join
  onLeave: () => void;
}

export default function HearingVideoScreen({ livekitUrl, token, onLeave }: HearingVideoScreenProps) {
  const [room, setRoom] = useState<Room | null>(null);
  const [tracks, setTracks] = useState<any[]>([]);

  useEffect(() => {
    const livekitRoom = new Room({
      adaptiveStream: true,
      dynacast: true,
    });

    livekitRoom.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind === 'video') {
        setTracks((prev) => [...prev, { track, participant }]);
      }
    });

    livekitRoom.on(RoomEvent.TrackUnsubscribed, (track) => {
      setTracks((prev) => prev.filter((t) => t.track !== track));
    });

    livekitRoom.connect(livekitUrl, token).then(async () => {
      // Enable camera & microphone
      await livekitRoom.localParticipant.enableCameraAndMicrophone();
      setRoom(livekitRoom);
    });

    return () => {
      livekitRoom.disconnect();
    };
  }, [livekitUrl, token]);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>🏛️ Jan Sunwai Official Hearing</Text>

      {/* Video Grid */}
      <View style={styles.videoGrid}>
        {tracks.map((t, idx) => (
          <View key={idx} style={styles.videoTile}>
            <VideoView videoTrack={t.track} style={styles.video} />
            <Text style={styles.nameTag}>{t.participant.name}</Text>
          </View>
        ))}
      </View>

      {/* Bottom Controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.hangupBtn} onPress={() => { room?.disconnect(); onLeave(); }}>
          <Text style={styles.btnText}>Leave Hearing (बाहर निकलें)</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111b21', padding: 16 },
  header: { color: '#FACC15', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 12 },
  videoGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  videoTile: { width: '48%', height: 200, backgroundColor: '#1f2c34', borderRadius: 12, overflow: 'hidden' },
  video: { width: '100%', height: '100%' },
  nameTag: { position: 'absolute', bottom: 6, left: 6, color: '#fff', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6, borderRadius: 4, fontSize: 12 },
  controls: { paddingVertical: 16, alignItems: 'center' },
  hangupBtn: { backgroundColor: '#dc2626', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10 },
  btnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 15 },
});
```

---

## 5. Testing with cURL / Postman

```bash
# 1. Verify connection
curl -H "X-API-Key: js_live_raj_sampark_88421b9c7e0f" \
  https://physiology-temporarily-salad-hist.trycloudflare.com/api/v1/hearings/verify-key

# 2. Initiate Hearing
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: js_live_raj_sampark_88421b9c7e0f" \
  -d '{"grievanceId": "RAJ-2024-88421"}' \
  https://physiology-temporarily-salad-hist.trycloudflare.com/api/v1/hearings/create
```
