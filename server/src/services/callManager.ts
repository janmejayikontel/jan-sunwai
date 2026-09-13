/**
 * Call Manager Service — Jan Sunwai Video Call Platform
 *
 * Manages the lifecycle of Jan Sunwai hearing call sessions:
 * - Creating call sessions when an officer initiates a multi-party call
 * - Tracking ring state for each participant (ringing, accepted, declined, timeout)
 * - Coordinating WebSocket-based VoIP ring signals to connected clients
 * - Session state transitions (ringing → active → completed)
 * - Mid-call participant addition
 *
 * In production, call state is stored in Redis for cross-instance consistency.
 * In development, uses in-memory Maps for simplicity.
 */

import { v4 as uuidv4 } from 'uuid';
import { WebSocket } from 'ws';
import livekitService from './livekit';
import db from '../db/database';

// ─── Types ────────────────────────────────────────────────────

export type CallStatus = 'ringing' | 'active' | 'completed' | 'missed' | 'cancelled';
export type ParticipantRingStatus = 'ringing' | 'accepted' | 'declined' | 'timeout' | 'missed' | 'left';
export type ParticipantRole = 'host' | 'employee' | 'citizen' | 'guest_officer';

export interface CallParticipant {
  id: string;
  userId?: string;
  phone: string;
  name: string;
  role: ParticipantRole;
  designation?: string;
  department?: string;
  ringStatus: ParticipantRingStatus;
  ringStartedAt: Date;
  answeredAt?: Date;
  leftAt?: Date;
}

export interface CallSession {
  id: string;
  grievanceId: string;
  title: string;
  hostUserId: string;
  hostPhone?: string;
  hostName: string;
  hostDesignation: string;
  livekitRoomName: string;
  status: CallStatus;
  participants: CallParticipant[];
  autoRecord: boolean;
  egressId?: string;
  recordingUrl?: string;
  createdAt: Date;
  startedAt?: Date;
  endedAt?: Date;
  durationSeconds?: number;
}

export interface InitiateCallInput {
  grievanceId: string;
  title: string;
  hostUserId: string;
  hostPhone?: string;
  hostName: string;
  hostDesignation: string;
  citizenPhone: string;
  citizenName: string;
  employeePhone: string;
  employeeName: string;
  employeeDesignation?: string;
  employeeDepartment?: string;
  autoRecord?: boolean;
}

// ─── WebSocket Event Types ────────────────────────────────────

export interface CallEvent {
  type:
    | 'incoming_call'
    | 'call_accepted'
    | 'call_declined'
    | 'call_started'
    | 'call_ended'
    | 'participant_joined'
    | 'participant_left'
    | 'participant_removed'
    | 'participant_added';
  callId: string;
  data: Record<string, unknown>;
}

// ─── In-Memory State (Development) ───────────────────────────

/** Active call sessions keyed by call ID */
const activeCalls = new Map<string, CallSession>();

/** WebSocket connections keyed by user phone number for VoIP signaling */
const connectedClients = new Map<string, Set<WebSocket>>();

/** Ring timeout handles for auto-declining unanswered calls */
const ringTimeouts = new Map<string, NodeJS.Timeout>();

// Ring timeout duration: 60 seconds (like WhatsApp)
const RING_TIMEOUT_MS = 60_000;

// ─── WebSocket Client Management ─────────────────────────────

export function matchPhone(p1?: string, p2?: string): boolean {
  if (!p1 || !p2) return false;
  const d1 = p1.replace(/[^0-9]/g, '').slice(-10);
  const d2 = p2.replace(/[^0-9]/g, '').slice(-10);
  return d1.length >= 10 && d1 === d2;
}

/**
 * Register a WebSocket connection for a user (identified by phone).
 * A user may have multiple active connections (web + mobile).
 */
export function registerClient(phone: string, ws: WebSocket) {
  const digits = phone.replace(/[^0-9]/g, '');
  const last10 = digits.slice(-10);
  const withPrefix = `+91${last10}`;

  [phone, last10, withPrefix, digits].forEach((key) => {
    if (!key) return;
    if (!connectedClients.has(key)) {
      connectedClients.set(key, new Set());
    }
    connectedClients.get(key)!.add(ws);
  });
  console.log(`[CallManager] Client registered: ${phone} (mapped to ${last10}, ${withPrefix})`);
}

/**
 * Unregister a WebSocket connection when it closes.
 */
export function unregisterClient(phone: string, ws: WebSocket) {
  const digits = phone.replace(/[^0-9]/g, '');
  const last10 = digits.slice(-10);
  const withPrefix = `+91${last10}`;

  [phone, last10, withPrefix, digits].forEach((key) => {
    if (!key) return;
    const clients = connectedClients.get(key);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) {
        connectedClients.delete(key);
      }
    }
  });
  console.log(`[CallManager] Client unregistered: ${phone}`);
}

/**
 * Send a VoIP call event to all connected WebSocket sessions for a phone number.
 * In production, this is replaced by FCM/APNs high-priority push for mobile.
 */
function sendToClient(phone: string, event: CallEvent) {
  const digits = phone.replace(/[^0-9]/g, '');
  const last10 = digits.slice(-10);
  const withPrefix = `+91${last10}`;

  const targetSockets = new Set<WebSocket>();
  [phone, last10, withPrefix, digits].forEach((key) => {
    if (!key) return;
    const clients = connectedClients.get(key);
    if (clients) {
      clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          targetSockets.add(ws);
        }
      });
    }
  });

  if (targetSockets.size > 0) {
    const payload = JSON.stringify(event);
    targetSockets.forEach((ws) => ws.send(payload));
    console.log(`[CallManager] Sent ${event.type} to ${phone} (${targetSockets.size} connections)`);
    return true;
  }
  console.log(`[CallManager] No connected client for ${phone} (tested ${last10}, ${withPrefix}), would send push notification`);
  return false;
}

// ─── Call Lifecycle ───────────────────────────────────────────

/**
 * Initiate a new Jan Sunwai multi-party call.
 *
 * 1. Creates a LiveKit room for the hearing
 * 2. Registers the call session with all participants
 * 3. Sends VoIP ring signals to citizen and employee
 * 4. Starts a ring timeout (60 seconds)
 * 5. Returns the call session and host's LiveKit token
 */
export async function initiateCall(input: InitiateCallInput): Promise<{
  callSession: CallSession;
  hostToken: string;
}> {
  // Check if an active call session already exists for this grievance
  for (const existing of activeCalls.values()) {
    if (existing.grievanceId.toUpperCase() === input.grievanceId.toUpperCase()) {
      if (existing.status === 'ringing' || existing.status === 'active') {
        console.log(`[CallManager] Call already active for ${input.grievanceId}: ${existing.id}. Re-ringing.`);
        
        // Reset all invited non-host participants to 'ringing' so they can answer
        existing.participants.forEach((p) => {
          if (p.role !== 'host') {
            p.ringStatus = 'ringing';
            p.ringStartedAt = new Date();
            p.leftAt = undefined;
          }
        });

        // Clear previous timeout and restart fresh 60s ring timeout
        const oldTimeout = ringTimeouts.get(existing.id);
        if (oldTimeout) clearTimeout(oldTimeout);
        const newTimeout = setTimeout(() => {
          handleRingTimeout(existing.id);
        }, RING_TIMEOUT_MS);
        ringTimeouts.set(existing.id, newTimeout);

        const incomingCallData = {
          callId: existing.id,
          grievanceId: existing.grievanceId,
          title: existing.title,
          callerName: existing.hostName,
          callerDesignation: existing.hostDesignation,
          roomName: existing.livekitRoomName,
          participantCount: existing.participants.length,
        };
        sendToClient(input.citizenPhone, {
          type: 'incoming_call',
          callId: existing.id,
          data: { ...incomingCallData, yourRole: 'citizen' },
        });
        sendToClient(input.employeePhone, {
          type: 'incoming_call',
          callId: existing.id,
          data: { ...incomingCallData, yourRole: 'employee' },
        });

        const hostToken = await livekitService.generateToken({
          identity: input.hostUserId,
          name: `${input.hostName} (${input.hostDesignation})`,
          roomName: existing.livekitRoomName,
          isHost: true,
        });

        return { callSession: existing, hostToken };
      } else {
        // If previous call session was completed, missed, or cancelled, purge it so a clean session is created
        activeCalls.delete(existing.id);
      }
    }
  }

  const callId = uuidv4();
  const roomName = `JS-${input.grievanceId}`;

  // 1. Create LiveKit room
  await livekitService.createRoom({
    name: roomName,
    maxParticipants: 10,
    emptyTimeout: 300,
  });

  const hostPhone = input.hostPhone || (input.hostUserId?.startsWith('+') ? input.hostUserId : '');

  // 2. Build participant list
  const hostParticipant: CallParticipant = {
    id: uuidv4(),
    phone: hostPhone,
    name: input.hostName,
    role: 'host',
    designation: input.hostDesignation,
    ringStatus: 'accepted', // Host is automatically "in"
    ringStartedAt: new Date(),
    answeredAt: new Date(),
  };

  const citizenParticipant: CallParticipant = {
    id: uuidv4(),
    phone: input.citizenPhone,
    name: input.citizenName,
    role: 'citizen',
    ringStatus: 'ringing',
    ringStartedAt: new Date(),
  };

  const employeeParticipant: CallParticipant = {
    id: uuidv4(),
    phone: input.employeePhone,
    name: input.employeeName,
    role: 'employee',
    designation: input.employeeDesignation,
    department: input.employeeDepartment,
    ringStatus: 'ringing',
    ringStartedAt: new Date(),
  };

  // 3. Create call session
  const callSession: CallSession = {
    id: callId,
    grievanceId: input.grievanceId,
    title: input.title,
    hostUserId: input.hostUserId,
    hostPhone,
    hostName: input.hostName,
    hostDesignation: input.hostDesignation,
    livekitRoomName: roomName,
    status: 'ringing',
    participants: [hostParticipant, citizenParticipant, employeeParticipant],
    autoRecord: input.autoRecord ?? true,
    createdAt: new Date(),
  };

  activeCalls.set(callId, callSession);

  // 4. Generate host's LiveKit token
  const hostToken = await livekitService.generateToken({
    identity: input.hostUserId,
    name: `${input.hostName} (${input.hostDesignation})`,
    roomName,
    isHost: true,
  });

  // 5. Send incoming call ring to citizen and employee (NEVER to host itself!)
  const incomingCallData = {
    callId,
    grievanceId: input.grievanceId,
    title: input.title,
    callerName: input.hostName,
    callerDesignation: input.hostDesignation,
    roomName,
    participantCount: 3,
  };

  if (hostPhone && matchPhone(input.citizenPhone, hostPhone)) {
    console.log(`[CallManager] Host ${hostPhone} is also citizen ${input.citizenPhone} — skipping self-ring!`);
  } else {
    sendToClient(input.citizenPhone, {
      type: 'incoming_call',
      callId,
      data: { ...incomingCallData, yourRole: 'citizen' },
    });
  }

  if (hostPhone && matchPhone(input.employeePhone, hostPhone)) {
    console.log(`[CallManager] Host ${hostPhone} is also employee ${input.employeePhone} — skipping self-ring!`);
  } else {
    sendToClient(input.employeePhone, {
      type: 'incoming_call',
      callId,
      data: { ...incomingCallData, yourRole: 'employee' },
    });
  }

  // 6. Set ring timeout (auto-decline after 60 seconds)
  const timeoutId = setTimeout(() => {
    handleRingTimeout(callId);
  }, RING_TIMEOUT_MS);
  ringTimeouts.set(callId, timeoutId);

  console.log(`[CallManager] Call initiated: ${callId} for grievance ${input.grievanceId}`);
  return { callSession, hostToken };
}

/**
 * Handle a participant's response to an incoming call (accept or decline).
 *
 * On accept:
 *  - Generate a LiveKit token for the participant
 *  - If all participants have accepted, transition call to 'active'
 *  - Optionally start recording
 *
 * On decline:
 *  - Mark participant as declined
 *  - Notify host
 */
export async function respondToCall(
  callId: string,
  phone: string,
  action: 'accept' | 'decline'
): Promise<{ token?: string; livekitUrl?: string; roomName?: string } | null> {
  let call = activeCalls.get(callId);
  if (!call) {
    const raw = (callId || '').trim();
    const clean = raw.replace(/^(hearing_|JS-)/i, '').trim().toUpperCase();
    for (const c of activeCalls.values()) {
      if (
        c.id === raw ||
        c.grievanceId.toUpperCase() === clean ||
        c.grievanceId.toUpperCase() === raw.toUpperCase() ||
        c.livekitRoomName === raw ||
        c.livekitRoomName === `JS-${clean}`
      ) {
        call = c;
        break;
      }
    }
  }
  if (!call && activeCalls.size === 1) {
    call = Array.from(activeCalls.values())[0];
  }
  if (!call) {
    console.log(`[CallManager] Call not found: ${callId}`);
    return null;
  }

  const participant = call.participants.find((p) => matchPhone(p.phone, phone));
  if (!participant) {
    console.log(`[CallManager] Participant ${phone} not in call ${callId}`);
    return null;
  }

  if (action === 'accept') {
    participant.ringStatus = 'accepted';
    participant.answeredAt = new Date();

    // Generate LiveKit token for this participant
    const token = await livekitService.generateToken({
      identity: phone,
      name: `${participant.name}${participant.designation ? ` (${participant.designation})` : ''}`,
      roomName: call.livekitRoomName,
      isHost: false,
    });

    // Broadcast acceptance to all connected participants
    sendToClient(phone, {
      type: 'call_accepted',
      callId,
      data: { participantName: participant.name, role: participant.role },
    });

    // Check if call should transition to active
    const allRinging = call.participants.filter((p) => p.ringStatus === 'ringing');
    if (allRinging.length === 0 && call.status === 'ringing') {
      call.status = 'active';
      call.startedAt = new Date();

      // Clear ring timeout
      const timeout = ringTimeouts.get(callId);
      if (timeout) {
        clearTimeout(timeout);
        ringTimeouts.delete(callId);
      }

      // Start recording if auto-record is enabled
      if (call.autoRecord) {
        call.egressId = (await livekitService.startRecording(call.livekitRoomName, call.grievanceId)) ?? undefined;
      }

      console.log(`[CallManager] Call is now active: ${callId}`);
    }

    console.log(`[CallManager] ${participant.name} accepted call ${callId}`);
    return {
      token,
      livekitUrl: livekitService.getLiveKitUrl(),
      roomName: call.livekitRoomName,
    };
  } else {
    // Decline
    participant.ringStatus = 'declined';

    sendToClient(phone, {
      type: 'call_declined',
      callId,
      data: { participantName: participant.name, role: participant.role },
    });

    console.log(`[CallManager] ${participant.name} declined call ${callId}`);
    return null;
  }
}

/**
 * Add an additional officer mid-call (e.g., dial Tehsildar while hearing is live).
 * Rings the new officer's phone and adds them to the session.
 */
export async function addParticipantToCall(
  callIdOrGrievance: string,
  phone: string,
  name: string,
  designation?: string,
  department?: string
): Promise<CallParticipant | null> {
  let call = activeCalls.get(callIdOrGrievance);
  if (!call) {
    const raw = (callIdOrGrievance || '').trim();
    const clean = raw.replace(/^(hearing_|JS-)/i, '').trim().toUpperCase();
    for (const c of activeCalls.values()) {
      if (
        c.id === raw ||
        c.grievanceId.toUpperCase() === clean ||
        c.grievanceId.toUpperCase() === raw.toUpperCase() ||
        c.livekitRoomName === raw ||
        c.livekitRoomName === `JS-${clean}`
      ) {
        call = c;
        break;
      }
    }
  }
  // Fallback: If only 1 active call exists in the system, connect to it
  if (!call && activeCalls.size === 1) {
    call = Array.from(activeCalls.values())[0];
  }
  if (!call) {
    console.warn(`[CallManager] Cannot add participant — call "${callIdOrGrievance}" not found. Active calls count: ${activeCalls.size}`);
    return null;
  }

  // Check if participant already exists in the call
  let targetParticipant = call.participants.find((p) => matchPhone(p.phone, phone));
  if (targetParticipant) {
    targetParticipant.name = name;
    targetParticipant.ringStatus = 'ringing';
    targetParticipant.ringStartedAt = new Date();
    targetParticipant.leftAt = undefined;
    targetParticipant.answeredAt = undefined;
    if (designation) targetParticipant.designation = designation;
    if (department) targetParticipant.department = department;
  } else {
    targetParticipant = {
      id: uuidv4(),
      phone,
      name,
      role: 'guest_officer',
      designation,
      department,
      ringStatus: 'ringing',
      ringStartedAt: new Date(),
    };
    call.participants.push(targetParticipant);
  }

  // 60-second auto ring timeout for this participant
  const addedParticipantRef = targetParticipant;
  setTimeout(() => {
    if (addedParticipantRef && addedParticipantRef.ringStatus === 'ringing') {
      addedParticipantRef.ringStatus = 'timeout';
      console.log(`[CallManager] Ring timeout for added participant ${name} (${phone})`);
    }
  }, 60000);

  // Ring the participant via WebSocket
  sendToClient(phone, {
    type: 'incoming_call',
    callId: call.id,
    data: {
      callId: call.id,
      grievanceId: call.grievanceId,
      title: call.title,
      callerName: call.hostName,
      callerDesignation: call.hostDesignation,
      roomName: call.livekitRoomName,
      participantCount: call.participants.length,
      yourRole: addedParticipantRef.role,
      midCallJoin: true,
    },
  });

  console.log(`[CallManager] Added & ringing ${name} (${phone}) in call ${call.id}`);
  return addedParticipantRef;
}

/**
 * End a call session — terminate the LiveKit room, stop recording,
 * and notify all participants.
 */
export async function endCall(callId: string): Promise<CallSession | null> {
  const call = activeCalls.get(callId);
  if (!call) return null;

  // Stop recording if active
  if (call.egressId) {
    await livekitService.stopRecording(call.egressId);
  }

  // Delete the LiveKit room
  try {
    await livekitService.deleteRoom(call.livekitRoomName);
  } catch (err) {
    console.error(`[CallManager] Error deleting room:`, err);
  }

  // Update session state
  call.status = 'completed';
  call.endedAt = new Date();
  if (call.startedAt) {
    call.durationSeconds = Math.round((call.endedAt.getTime() - call.startedAt.getTime()) / 1000);
  }

  // Persist hearing call record to SQLite
  try {
    db.prepare(`
      INSERT OR REPLACE INTO call_records (id, grievance_id, host_name, status, duration_seconds, recording_url, started_at, ended_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      call.id,
      call.grievanceId,
      call.hostName,
      call.status,
      call.durationSeconds || 0,
      call.recordingUrl || null,
      call.startedAt ? call.startedAt.toISOString() : null,
      call.endedAt ? call.endedAt.toISOString() : null
    );
    console.log(`[SQLite] Persisted call record ${call.id} for grievance ${call.grievanceId}`);
  } catch (dbErr) {
    console.error('[SQLite] Failed to persist call record:', dbErr);
  }

  // Mark all active participants as left
  call.participants.forEach((p) => {
    if (p.ringStatus === 'accepted' && !p.leftAt) {
      p.leftAt = new Date();
    }
    if (p.ringStatus === 'ringing') {
      p.ringStatus = 'missed';
    }
  });

  // Notify all participants
  call.participants.forEach((p) => {
    if (p.phone) {
      sendToClient(p.phone, {
        type: 'call_ended',
        callId,
        data: {
          grievanceId: call.grievanceId,
          duration: call.durationSeconds,
        },
      });
    }
  });

  // Clear ring timeout
  const timeout = ringTimeouts.get(callId);
  if (timeout) {
    clearTimeout(timeout);
    ringTimeouts.delete(callId);
  }

  console.log(`[CallManager] Call ended: ${callId} (duration: ${call.durationSeconds}s)`);
  return call;
}

/**
 * Handle ring timeout — if participants haven't answered in 60 seconds,
 * mark them as timed out.
 */
function handleRingTimeout(callId: string) {
  const call = activeCalls.get(callId);
  if (!call) return;

  call.participants.forEach((p) => {
    if (p.ringStatus === 'ringing') {
      p.ringStatus = 'timeout';
      console.log(`[CallManager] Ring timeout for ${p.name} (${p.phone}) in call ${callId}`);
    }
  });

  // If no one answered, mark call as missed
  const anyAccepted = call.participants.some((p) => p.role !== 'host' && p.ringStatus === 'accepted');
  if (!anyAccepted) {
    call.status = 'missed';
    console.log(`[CallManager] Call marked as missed: ${callId}`);
  }

  ringTimeouts.delete(callId);
}

/**
 * Remove a specific participant from a call (Collector ejects a specific person).
 * Disconnects them from LiveKit and notifies them via WebSocket.
 */
export async function removeParticipantFromCall(
  callId: string,
  participantPhone: string
): Promise<boolean> {
  const call = activeCalls.get(callId);
  if (!call) return false;

  const participant = call.participants.find(
    (p) => p.phone === participantPhone || p.id === participantPhone || p.name === participantPhone
  );
  if (participant) {
    participant.leftAt = new Date();
    participant.ringStatus = 'declined';
  }

  const identityToRemove = participant?.phone || participantPhone;

  // Disconnect this specific participant from LiveKit SFU
  try {
    await livekitService.removeParticipant(call.livekitRoomName, identityToRemove);
    console.log(`[CallManager] Removed ${identityToRemove} from room ${call.livekitRoomName}`);
  } catch (err) {
    console.warn(`[CallManager] LiveKit removeParticipant notice:`, err);
  }

  // Send dedicated notification to the ejected participant via WebSocket
  sendToClient(identityToRemove, {
    type: 'participant_removed',
    callId,
    data: {
      message: 'You have been disconnected from the hearing by the Presiding Officer.',
      callId,
      participantName: participant?.name || identityToRemove,
    },
  });

  // Notify remaining participants in the hearing
  call.participants.forEach((p) => {
    if (p.phone && p.phone !== identityToRemove && !p.leftAt) {
      sendToClient(p.phone, {
        type: 'participant_left',
        callId,
        data: {
          participantName: participant?.name || identityToRemove,
          phone: identityToRemove,
          wasRemovedByHost: true,
        },
      });
    }
  });

  return true;
}

/**
 * Handle a participant leaving the hearing on their own (Citizen or Employee clicks Leave).
 * ONLY that participant leaves; the rest of the meeting stays active!
 */
export async function participantLeaveCall(
  callId: string,
  participantPhone: string
): Promise<boolean> {
  const call = activeCalls.get(callId);
  if (!call) return false;

  const participant = call.participants.find((p) => matchPhone(p.phone, participantPhone));
  if (participant) {
    participant.leftAt = new Date();
    participant.ringStatus = 'left';
  }

  // Notify all remaining active participants
  call.participants.forEach((p) => {
    if (p.phone && !matchPhone(p.phone, participantPhone) && !p.leftAt) {
      sendToClient(p.phone, {
        type: 'participant_left',
        callId,
        data: {
          participantName: participant?.name || participantPhone,
          phone: participantPhone,
          wasRemovedByHost: false,
        },
      });
    }
  });

  console.log(`[CallManager] Participant ${participant?.name || participantPhone} left call ${callId}. Meeting continues.`);
  return true;
}

// ─── Query Functions ──────────────────────────────────────────

/** Get a call session by ID */
export function getCall(callId: string): CallSession | undefined {
  return activeCalls.get(callId);
}

/** List all active (non-completed) calls */
export function getActiveCalls(): CallSession[] {
  return Array.from(activeCalls.values()).filter(
    (c) => c.status === 'ringing' || c.status === 'active'
  );
}

/** Get all calls (for admin view) */
export function getAllCalls(): CallSession[] {
  return Array.from(activeCalls.values());
}

/**
 * Check if there is an incoming or active call ringing/waiting for this phone number.
 */
export function getIncomingCallForPhone(phone: string): {
  callId: string;
  grievanceId: string;
  title: string;
  callerName: string;
  callerDesignation: string;
  roomName: string;
  participantCount: number;
  yourRole: string;
} | null {
  for (const call of activeCalls.values()) {
    if (call.status === 'completed' || call.status === 'cancelled') continue;

    // RULE: If this phone is the HOST/CALLER who initiated this call, NEVER ring them!
    if (call.hostPhone && matchPhone(call.hostPhone, phone)) continue;
    if (call.hostUserId && matchPhone(call.hostUserId, phone)) continue;

    const participant = call.participants.find((p) => matchPhone(p.phone, phone));
    if (!participant || participant.role === 'host') continue;
    if (participant.leftAt !== undefined) continue;
    if (participant.ringStatus !== 'ringing') continue;

    return {
      callId: call.id,
      grievanceId: call.grievanceId,
      title: call.title,
      callerName: call.hostName,
      callerDesignation: call.hostDesignation,
      roomName: call.livekitRoomName,
      participantCount: call.participants.length,
      yourRole: participant.role,
    };
  }
  return null;
}

/**
 * Access Control Check: Can this user enter the meeting room?
 * Rule: User & Employee can enter only if meeting is ongoing AND officer called him.
 */
export function checkCanEnterRoom(
  caseOrRoomId: string,
  phone: string,
  role: string
): {
  allowed: boolean;
  reason?: string;
  message?: string;
  callId?: string;
  roomName?: string;
} {
  // District Collector / Officer is presiding host and can always start and enter
  if (role === 'officer' || role === 'collector') {
    return { allowed: true };
  }

  const cleanCaseId = caseOrRoomId.replace(/^hearing_/, '').trim().toUpperCase();

  // Look for any active call matching this grievance ID
  for (const call of activeCalls.values()) {
    const callGrievanceClean = call.grievanceId.trim().toUpperCase();
    if (callGrievanceClean === cleanCaseId || call.livekitRoomName === caseOrRoomId) {
      if (call.status === 'completed' || call.status === 'cancelled') {
        return {
          allowed: false,
          reason: 'hearing_ended',
          message: 'The hearing session for this grievance has ended.',
        };
      }

      // Check if this participant was invited / called by the Officer
      const participant = call.participants.find((p) => matchPhone(p.phone, phone));
      if (!participant) {
        return {
          allowed: false,
          reason: 'not_invited',
          message: 'You have not been called or invited into this hearing by the Presiding Officer.',
        };
      }

      return {
        allowed: true,
        callId: call.id,
        roomName: call.livekitRoomName,
      };
    }
  }

  // If no active call is found for this grievance:
  return {
    allowed: false,
    reason: 'hearing_not_started',
    message: 'The District Collector / Officer has not started this hearing yet or has not called you. You will receive an incoming call prompt on your screen when invited.',
  };
}

// ─── Exports ──────────────────────────────────────────────────

export const callManager = {
  registerClient,
  unregisterClient,
  initiateCall,
  respondToCall,
  addParticipantToCall,
  removeParticipantFromCall,
  participantLeaveCall,
  endCall,
  getCall,
  getActiveCalls,
  getAllCalls,
  getIncomingCallForPhone,
  checkCanEnterRoom,
};

export default callManager;

