/**
 * LiveKit Service — Jan Sunwai Video Call Platform
 *
 * Handles all interactions with the LiveKit SFU server:
 * - Access token generation (JWT) for participants joining video rooms
 * - Room lifecycle management (create, list participants, delete)
 * - Participant moderation (mute tracks)
 * - Egress recording (composite MP4 of hearings)
 *
 * Uses the official `livekit-server-sdk` v2.x API surface.
 * Docs: https://docs.livekit.io/server/server-apis/
 */

import { AccessToken, RoomServiceClient, EgressClient, EncodedFileOutput, TrackSource } from 'livekit-server-sdk';

// ─── Configuration ────────────────────────────────────────────

const LIVEKIT_URL = process.env.LIVEKIT_URL || 'ws://localhost:7880';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devkey';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'devsecret';

/**
 * The HTTP URL for LiveKit management APIs (RoomService, Egress).
 * WebSocket URLs (ws:// / wss://) must be converted to http:// / https://.
 */
function getLiveKitHttpUrl(): string {
  return LIVEKIT_URL.replace('ws://', 'http://').replace('wss://', 'https://');
}

// ─── Service Clients ──────────────────────────────────────────

const roomService = new RoomServiceClient(
  getLiveKitHttpUrl(),
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET
);

const egressClient = new EgressClient(
  getLiveKitHttpUrl(),
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET
);

// ─── Token Generation ─────────────────────────────────────────

export interface TokenOptions {
  /** Unique identity string for the participant (e.g. phone number "+919876543210") */
  identity: string;
  /** Human-readable display name (e.g. "Ramesh Kumar (Citizen)") */
  name: string;
  /** LiveKit room name to join (e.g. "JS-RAJ-2024-88421") */
  roomName: string;
  /** Whether this participant is the host/officer with admin privileges */
  isHost?: boolean;
  /** Token validity duration (default: "30m") */
  ttl?: string;
}

/**
 * Generate a signed LiveKit access token (JWT) for a participant.
 *
 * The token encodes:
 *  - The participant's identity and display name
 *  - Which room they can join
 *  - Their permissions (publish, subscribe, admin, record)
 *
 * Per LiveKit docs, tokens MUST be generated server-side.
 * The client uses this token to connect to the SFU directly.
 */
export async function generateToken(options: TokenOptions): Promise<string> {
  const { identity, name, roomName, isHost = false, ttl = '30m' } = options;

  const accessToken = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    name,
    ttl,
  });

  // Grant room-level permissions (all participants can publish camera, mic, and screen share)
  accessToken.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canPublishSources: [
      TrackSource.CAMERA,
      TrackSource.MICROPHONE,
      TrackSource.SCREEN_SHARE,
      TrackSource.SCREEN_SHARE_AUDIO,
    ],
    // Officers/hosts get administrative privileges
    roomAdmin: isHost,
    roomRecord: isHost,
  });

  return await accessToken.toJwt();
}

// ─── Room Management ──────────────────────────────────────────

export interface CreateRoomOptions {
  /** Unique room name (e.g. "JS-RAJ-2024-88421") */
  name: string;
  /** Max participants allowed (default: 1500 for massive 1000+ person hearing sessions) */
  maxParticipants?: number;
  /** Seconds to keep room alive after last participant leaves (default: 300) */
  emptyTimeout?: number;
}

/**
 * Create a new LiveKit room for a Jan Sunwai hearing session.
 *
 * Configured with capacity for 1500 participants (comfortably supporting 1000+).
 */
export async function createRoom(options: CreateRoomOptions) {
  const { name, maxParticipants = 1500, emptyTimeout = 300 } = options;

  const room = await roomService.createRoom({
    name,
    maxParticipants,
    emptyTimeout,
  });

  console.log(`[LiveKit] Room created: ${name} (capacity: ${maxParticipants})`);
  return room;
}

/**
 * List all participants currently connected to a room.
 * Useful for displaying participant count and online status.
 */
export async function listParticipants(roomName: string) {
  const participants = await roomService.listParticipants(roomName);
  return participants;
}

/**
 * Mute a specific participant's published audio/video track.
 * Used by the host officer to moderate the hearing.
 */
export async function muteParticipantTrack(
  roomName: string,
  identity: string,
  trackSid: string,
  muted: boolean
) {
  await roomService.mutePublishedTrack(roomName, identity, trackSid, muted);
  console.log(`[LiveKit] ${muted ? 'Muted' : 'Unmuted'} track ${trackSid} for ${identity} in ${roomName}`);
}

/**
 * Mute participant's microphone (Officer/Magistrate Moderation)
 */
export async function muteParticipantAudio(roomName: string, identity: string, muted: boolean = true) {
  try {
    const p = await roomService.getParticipant(roomName, identity);
    let count = 0;
    for (const track of p.tracks) {
      if (track.type === 0 || track.source === TrackSource.MICROPHONE) {
        await roomService.mutePublishedTrack(roomName, identity, track.sid, muted);
        count++;
      }
    }
    console.log(`[LiveKit] ${muted ? 'Muted' : 'Unmuted'} audio for ${identity} in ${roomName} (${count} tracks)`);
    return true;
  } catch (err) {
    console.warn(`[LiveKit] Failed to mute audio for ${identity}:`, err);
    return false;
  }
}

/**
 * Disable a participant's video (Officer/Magistrate Moderation)
 */
export async function muteParticipantVideo(roomName: string, identity: string, muted: boolean = true) {
  try {
    const p = await roomService.getParticipant(roomName, identity);
    let count = 0;
    for (const track of p.tracks) {
      if (track.type === 1 || track.source === TrackSource.CAMERA || track.source === TrackSource.SCREEN_SHARE) {
        await roomService.mutePublishedTrack(roomName, identity, track.sid, muted);
        count++;
      }
    }
    console.log(`[LiveKit] ${muted ? 'Disabled' : 'Enabled'} video for ${identity} in ${roomName} (${count} tracks)`);
    return true;
  } catch (err) {
    console.warn(`[LiveKit] Failed to mute video for ${identity}:`, err);
    return false;
  }
}

/**
 * Mute all remote participants' microphones in a room (excluding the officer host)
 */
export async function muteAllParticipantsAudio(roomName: string, excludeIdentity?: string): Promise<number> {
  try {
    const participants = await roomService.listParticipants(roomName);
    let count = 0;
    for (const p of participants) {
      if (excludeIdentity && (p.identity === excludeIdentity || p.identity.includes(excludeIdentity))) {
        continue;
      }
      for (const track of p.tracks) {
        if (track.type === 0 || track.source === TrackSource.MICROPHONE) {
          try {
            await roomService.mutePublishedTrack(roomName, p.identity, track.sid, true);
            count++;
          } catch (e) {
            console.warn(`[LiveKit] Failed to mute track for ${p.identity}:`, e);
          }
        }
      }
    }
    console.log(`[LiveKit] Muted all participants audio in ${roomName} (${count} tracks)`);
    return count;
  } catch (err) {
    console.warn(`[LiveKit] Failed to mute all participants in ${roomName}:`, err);
    return 0;
  }
}

/**
 * Disable all remote participants' cameras in a room (excluding the officer host)
 */
export async function disableAllParticipantsVideo(roomName: string, excludeIdentity?: string): Promise<number> {
  try {
    const participants = await roomService.listParticipants(roomName);
    let count = 0;
    for (const p of participants) {
      if (excludeIdentity && (p.identity === excludeIdentity || p.identity.includes(excludeIdentity))) {
        continue;
      }
      for (const track of p.tracks) {
        if (track.type === 1 || track.source === TrackSource.CAMERA || track.source === TrackSource.SCREEN_SHARE) {
          try {
            await roomService.mutePublishedTrack(roomName, p.identity, track.sid, true);
            count++;
          } catch (e) {
            console.warn(`[LiveKit] Failed to disable track for ${p.identity}:`, e);
          }
        }
      }
    }
    console.log(`[LiveKit] Disabled all participants video in ${roomName} (${count} tracks)`);
    return count;
  } catch (err) {
    console.warn(`[LiveKit] Failed to disable all video in ${roomName}:`, err);
    return 0;
  }
}

/**
 * Remove a participant from the room.
 * Used when host ends the call or removes a specific participant.
 */
export async function removeParticipant(roomName: string, identity: string) {
  await roomService.removeParticipant(roomName, identity);
  console.log(`[LiveKit] Removed participant ${identity} from ${roomName}`);
}

/**
 * Terminate a hearing room — disconnects all participants and destroys the room.
 * Called when the officer ends the Jan Sunwai hearing.
 */
export async function deleteRoom(roomName: string) {
  await roomService.deleteRoom(roomName);
  console.log(`[LiveKit] Room deleted: ${roomName}`);
}

/**
 * List all active rooms on the LiveKit server.
 * Used for admin monitoring dashboard.
 */
export async function listRooms() {
  return await roomService.listRooms();
}

// ─── Egress / Recording ───────────────────────────────────────

/**
 * Start a composite recording of a hearing room.
 *
 * Uses LiveKit Egress to launch a headless browser that renders
 * all participant video feeds in a grid layout and records to MP4.
 *
 * Requires the LiveKit Egress service to be running alongside the SFU.
 *
 * @param roomName - The room to record
 * @param grievanceId - Used for naming the output file
 * @returns The egress ID for tracking recording status
 */
export async function startRecording(roomName: string, grievanceId: string): Promise<string | null> {
  try {
    const output: EncodedFileOutput = new EncodedFileOutput({
      filepath: `recordings/jan-sunwai-${grievanceId}-${Date.now()}.mp4`,
      fileType: 0, // MP4
    });

    const egress = await egressClient.startRoomCompositeEgress(
      roomName,
      output,
      { layout: 'grid' }
    );

    console.log(`[LiveKit] Recording started for room ${roomName}, egress ID: ${egress.egressId}`);
    return egress.egressId;
  } catch (error) {
    console.error(`[LiveKit] Failed to start recording for room ${roomName}:`, error);
    // Recording failure should not block the hearing
    return null;
  }
}

/**
 * Stop an ongoing recording.
 *
 * @param egressId - The ID returned by startRecording
 */
export async function stopRecording(egressId: string) {
  try {
    await egressClient.stopEgress(egressId);
    console.log(`[LiveKit] Recording stopped: ${egressId}`);
  } catch (error) {
    console.error(`[LiveKit] Failed to stop recording ${egressId}:`, error);
  }
}

// ─── Exports ──────────────────────────────────────────────────

export const livekitService = {
  generateToken,
  createRoom,
  listParticipants,
  muteParticipantTrack,
  muteParticipantAudio,
  muteParticipantVideo,
  muteAllParticipantsAudio,
  disableAllParticipantsVideo,
  removeParticipant,
  deleteRoom,
  listRooms,
  startRecording,
  stopRecording,
  getLiveKitUrl: () => LIVEKIT_URL,
};

export default livekitService;
