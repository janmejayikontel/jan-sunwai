/**
 * Call Routes — Jan Sunwai Video Call Platform
 *
 * Core call orchestration API:
 * - Officer initiates a multi-party hearing call (rings citizen + employee)
 * - Participant accepts/declines the incoming call
 * - Officer adds an extra officer mid-call
 * - Retrieve LiveKit token for joining the video room
 * - Host ends the call
 *
 * Routes:
 *   POST /api/calls/initiate        — Start a new Jan Sunwai hearing call
 *   POST /api/calls/:id/respond     — Accept or decline incoming call
 *   POST /api/calls/:id/add-officer — Add an officer mid-call
 *   GET  /api/calls/:id/token       — Get LiveKit token for a call
 *   POST /api/calls/:id/end         — End the hearing call
 *   GET  /api/calls                  — List active calls
 *   GET  /api/calls/:id             — Get call details
 */

import { Router, Request, Response } from 'express';
import callManager from '../services/callManager';
import livekitService from '../services/livekit';
import samparkService from '../services/sampark';
import db, { insertAuditLog } from '../db/database';

const router = Router();

/**
 * GET /api/calls/history
 *
 * Fetch past hearing call records from SQLite database.
 */
router.get('/history', (_req: Request, res: Response) => {
  try {
    const records = db.prepare(`
      SELECT * FROM call_records ORDER BY created_at DESC LIMIT 50
    `).all();
    res.json({ records, total: records.length });
  } catch (error) {
    console.error('[Calls] Error fetching history:', error);
    res.status(500).json({ error: 'Failed to fetch call history' });
  }
});

/**
 * GET /api/calls/check-incoming/:phone
 *
 * Check if there is an active incoming call ringing or waiting for this phone number.
 * Used by mobile app to catch incoming calls even if WebSocket reconnects or sleeps.
 */
router.get('/check-incoming/:phone', (req: Request, res: Response) => {
  const { phone } = req.params;
  const incomingCall = callManager.getIncomingCallForPhone(phone);
  res.json({
    success: true,
    hasIncomingCall: !!incomingCall,
    incomingCall,
  });
});

/**
 * GET /api/calls/can-enter/:grievanceId
 *
 * Access control check: Can this citizen/employee enter the hearing room?
 * Enforces rule: Citizen & Employee can only enter if hearing is ongoing AND officer called them.
 */
router.get('/can-enter/:grievanceId', (req: Request, res: Response) => {
  const { grievanceId } = req.params;
  const phone = (req.query.phone as string) || '';
  const role = (req.query.role as string) || 'citizen';

  const check = callManager.checkCanEnterRoom(grievanceId, phone, role);
  res.json(check);
});

/**
 * POST /api/calls/initiate
 *
 * Officer initiates a new Jan Sunwai multi-party video call.
 * This creates a LiveKit room and simultaneously rings the
 * citizen and employee phones.
 *
 * Body: {
 *   grievanceId: "RAJ-2024-88421",
 *   title: "Jan Sunwai — Water Pipeline Leak",
 *   hostName: "Sh. Alok Sharma, IAS",
 *   hostDesignation: "District Collector & DM",
 *   citizenPhone: "+919876543210",
 *   citizenName: "Ramesh Kumar Sharma",
 *   employeePhone: "+919123456789",
 *   employeeName: "Rajesh Verma",
 *   employeeDesignation: "Junior Engineer (JEn)",
 *   employeeDepartment: "PHED",
 *   autoRecord: true
 * }
 */
router.post('/initiate', async (req: Request, res: Response) => {
  let {
    grievanceId,
    title,
    hostUserId,
    hostName,
    hostPhone,
    hostDesignation,
    citizenPhone,
    citizenName,
    employeePhone,
    employeeName,
    employeeDesignation,
    employeeDepartment,
    autoRecord,
  } = req.body;

  if (!grievanceId) {
    res.status(400).json({ error: 'grievanceId is required' });
    return;
  }

  // Auto-fetch grievance details from SQLite directory if contacts not provided
  if (!citizenPhone || !employeePhone || !title) {
    try {
      const g = await samparkService.fetchGrievance(grievanceId);
      if (g) {
        title = title || `Jan Sunwai — ${g.title}`;
        citizenPhone = citizenPhone || g.citizen.phone;
        citizenName = citizenName || g.citizen.name;
        employeePhone = employeePhone || g.assignedEmployee.phone;
        employeeName = employeeName || g.assignedEmployee.name;
        employeeDesignation = employeeDesignation || g.assignedEmployee.designation;
        employeeDepartment = employeeDepartment || g.assignedEmployee.department;
      }
    } catch (e) {
      console.warn('[Calls/Initiate] Auto-fetch grievance failed:', e);
    }
  }

  title = title || `Jan Sunwai — Hearing #${grievanceId}`;
  hostName = hostName || 'District Collector';
  hostDesignation = hostDesignation || 'District Collector & DM';
  citizenPhone = citizenPhone || '+919876543210';
  citizenName = citizenName || 'Citizen';
  employeePhone = employeePhone || '+917749852013';
  employeeName = employeeName || 'Field Officer';
  employeeDesignation = employeeDesignation || 'Official';
  employeeDepartment = employeeDepartment || 'District Administration';

  try {
    const { callSession, hostToken } = await callManager.initiateCall({
      grievanceId,
      title,
      hostUserId: hostUserId || 'officer-001',
      hostName,
      hostPhone: hostPhone || '',
      hostDesignation: hostDesignation || 'Officer',
      citizenPhone,
      citizenName,
      employeePhone,
      employeeName,
      employeeDesignation,
      employeeDepartment,
      autoRecord: autoRecord ?? true,
    });

    res.json({
      success: true,
      message: 'Call initiated — ringing citizen and employee',
      call: {
        id: callSession.id,
        grievanceId: callSession.grievanceId,
        roomName: callSession.livekitRoomName,
        status: callSession.status,
        participants: callSession.participants.map((p) => ({
          name: p.name,
          role: p.role,
          ringStatus: p.ringStatus,
        })),
      },
      // Host joins immediately — provide LiveKit connection details
      livekit: {
        token: hostToken,
        url: livekitService.getLiveKitUrl(),
        roomName: callSession.livekitRoomName,
      },
    });
  } catch (error) {
    console.error('[Calls] Error initiating call:', error);
    res.status(500).json({ error: 'Failed to initiate call' });
  }
});

/**
 * POST /api/calls/:id/respond and POST /api/calls/respond
 *
 * Participant responds to an incoming call (accept or decline).
 * On accept, returns the LiveKit token to join the video room.
 *
 * Body: { phone: "+919876543210", action: "accept" | "decline", grievanceId?: string, roomName?: string, callId?: string }
 */
const handleCallResponse = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { phone, action, grievanceId, roomName, callId } = req.body;

  if (!phone || !action || !['accept', 'decline'].includes(action)) {
    res.status(400).json({
      error: 'Invalid request',
      required: { phone: 'string', action: '"accept" | "decline"' },
    });
    return;
  }

  const effectiveId = (id && id !== 'respond' && id !== 'undefined' && id !== 'null')
    ? id
    : (callId || grievanceId || '');

  try {
    const result = await callManager.respondToCall(effectiveId, phone, action, grievanceId, roomName);

    if (action === 'accept' && result) {
      res.json({
        success: true,
        message: 'Call accepted — connecting to video room',
        livekit: {
          token: result.token,
          url: result.livekitUrl,
          roomName: result.roomName,
        },
      });
    } else if (action === 'decline') {
      res.json({
        success: true,
        message: 'Call declined',
      });
    } else {
      res.status(404).json({ error: 'Call or participant not found' });
    }
  } catch (error) {
    console.error('[Calls] Error responding to call:', error);
    res.status(500).json({ error: 'Failed to process call response' });
  }
};

router.post('/respond', handleCallResponse);
router.post('/:id/respond', handleCallResponse);

/**
 * POST /api/calls/:id/add-officer
 *
 * Add an additional officer to an active call (mid-call dialing).
 * Rings the officer's phone and adds them to the session.
 *
 * Body: { phone: "+919414000003", name: "Smt. Priya Mathur", designation: "Tehsildar" }
 */
router.post('/:id/add-officer', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { phone, name, designation, department } = req.body;

  if (!phone || !name) {
    res.status(400).json({
      error: 'Phone and name are required',
    });
    return;
  }

  try {
    const participant = await callManager.addParticipantToCall(id, phone, name, designation, department);

    if (!participant) {
      res.status(404).json({ error: 'Call not found' });
      return;
    }

    res.json({
      success: true,
      message: `Ringing ${name} (${phone})...`,
      participant: {
        id: participant.id,
        name: participant.name,
        role: participant.role,
        ringStatus: participant.ringStatus,
      },
    });
  } catch (error) {
    console.error('[Calls] Error adding officer:', error);
    res.status(500).json({ error: 'Failed to add officer to call' });
  }
});

/**
 * POST /api/calls/:id/add-participant (alias for add-officer)
 */
router.post('/:id/add-participant', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { phone, name, designation, department } = req.body;

  if (!phone || !name) {
    res.status(400).json({ error: 'Phone and name are required' });
    return;
  }

  try {
    const participant = await callManager.addParticipantToCall(id, phone, name, designation, department);
    if (!participant) {
      res.status(404).json({ error: 'Call not found' });
      return;
    }
    res.json({
      success: true,
      message: `Ringing ${name} (${phone})...`,
      participant: {
        id: participant.id,
        name: participant.name,
        role: participant.role,
        ringStatus: participant.ringStatus,
      },
    });
  } catch (error) {
    console.error('[Calls] Error adding participant:', error);
    res.status(500).json({ error: 'Failed to add participant to call' });
  }
});

/**
 * GET /api/calls/:id/token
 *
 * Generate a fresh LiveKit token for a participant to join a call.
 * Used when reconnecting or when the original token expires.
 *
 * Query: phone — Participant phone number
 *        name  — Participant display name
 */
router.get('/:id/token', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { phone, name } = req.query;

  if (!phone || !name) {
    res.status(400).json({ error: 'Phone and name are required as query parameters' });
    return;
  }

  const call = callManager.getCall(id);
  if (!call) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }

  try {
    const participant = call.participants.find((p) => p.phone === phone);
    const isHost = participant?.role === 'host';

    const token = await livekitService.generateToken({
      identity: phone as string,
      name: name as string,
      roomName: call.livekitRoomName,
      isHost,
    });

    res.json({
      token,
      url: livekitService.getLiveKitUrl(),
      roomName: call.livekitRoomName,
    });
  } catch (error) {
    console.error('[Calls] Error generating token:', error);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

/**
 * GET /api/calls/:id/participants
 *
 * List active participants for a call so Collector can view and moderate them.
 */
router.get('/:id/participants', async (req: Request, res: Response) => {
  const { id } = req.params;
  const call = callManager.getCall(id);

  if (!call) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }

  // Also query LiveKit to get real-time room participants
  let livekitParticipants: any[] = [];
  try {
    livekitParticipants = await livekitService.listParticipants(call.livekitRoomName);
  } catch (err) {
    console.warn('[Calls] Could not list LiveKit room participants:', err);
  }

  const activeParticipants = call.participants
    .filter((p) => !p.leftAt)
    .map((p) => {
      const isOnline = livekitParticipants.some(
        (lp) => lp.identity === p.phone || (p.name && lp.name?.includes(p.name)) || p.role === 'host'
      );
      return {
        id: p.id,
        phone: p.phone,
        name: p.name,
        role: p.role,
        designation: p.designation,
        department: p.department,
        ringStatus: p.ringStatus,
        isHost: p.role === 'host',
        isOnline,
      };
    });

  // Also include any participant in LiveKit room not yet in call.participants
  for (const lp of livekitParticipants) {
    const existing = activeParticipants.find(
      (p) => (p.phone && p.phone === lp.identity) || (p.name && p.name === lp.name)
    );
    if (!existing) {
      activeParticipants.push({
        id: lp.sid,
        phone: lp.identity,
        name: lp.name || lp.identity,
        role: 'citizen',
        designation: 'Live Participant',
        department: '',
        ringStatus: 'accepted',
        isHost: false,
        isOnline: true,
      });
    }
  }

  res.json({ success: true, participants: activeParticipants });
});

/**
 * POST /api/calls/:id/mute-audio
 *
 * Officer/Magistrate mutes a participant's microphone or all participants in the hearing.
 * Body: { participantPhone?: "+91..." | "all", muted?: boolean, muteAll?: boolean }
 */
router.post('/:id/mute-audio', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { participantPhone, muted = true, actorName, actorRole, actorPhone, muteAll } = req.body;

  try {
    const call = callManager.getCall(id);
    const roomName = call ? call.livekitRoomName : `JS-${id}`;

    // 1. Mute All Remote Participants in hearing room
    if (!participantPhone || participantPhone === 'all' || muteAll) {
      const count = await livekitService.muteAllParticipantsAudio(roomName, actorPhone || call?.hostPhone);
      insertAuditLog({
        eventType: 'ALL_PARTICIPANTS_AUDIO_MUTED',
        actorName: actorName || 'Presiding Officer',
        actorRole: actorRole || 'officer',
        targetId: roomName,
        targetName: 'All Participants',
        details: `Muted all remote microphones in room ${roomName} (${count} streams muted)`,
      });
      res.json({
        success: true,
        message: `All remote microphones muted (${count} streams)`,
        mutedAll: true,
        count,
      });
      return;
    }

    // 2. Mute / Unmute Specific Participant
    const success = await livekitService.muteParticipantAudio(roomName, participantPhone, Boolean(muted));

    insertAuditLog({
      eventType: muted ? 'PARTICIPANT_AUDIO_MUTED' : 'PARTICIPANT_AUDIO_UNMUTED',
      actorName: actorName || 'Presiding Officer',
      actorRole: actorRole || 'officer',
      targetId: participantPhone,
      targetName: participantPhone,
      details: `${muted ? 'Muted' : 'Unmuted'} microphone for ${participantPhone} in call ${id} (room ${roomName})`,
    });

    res.json({
      success: true,
      message: `${muted ? 'Muted' : 'Unmuted'} audio for ${participantPhone}`,
    });
  } catch (error: any) {
    console.error('[Calls] Error muting participant audio:', error);
    res.status(500).json({ error: error.message || 'Failed to mute audio' });
  }
});

/**
 * POST /api/calls/:id/disable-video
 *
 * Officer/Magistrate disables a participant's video or all participants' cameras in the hearing.
 * Body: { participantPhone?: "+91..." | "all", disabled?: boolean, disableAll?: boolean }
 */
router.post('/:id/disable-video', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { participantPhone, disabled = true, actorName, actorRole, actorPhone, disableAll } = req.body;

  try {
    const call = callManager.getCall(id);
    const roomName = call ? call.livekitRoomName : `JS-${id}`;

    // 1. Disable All Remote Cameras in hearing room
    if (!participantPhone || participantPhone === 'all' || disableAll) {
      const count = await livekitService.disableAllParticipantsVideo(roomName, actorPhone || call?.hostPhone);
      insertAuditLog({
        eventType: 'ALL_PARTICIPANTS_VIDEO_DISABLED',
        actorName: actorName || 'Presiding Officer',
        actorRole: actorRole || 'officer',
        targetId: roomName,
        targetName: 'All Participants',
        details: `Disabled all remote cameras in room ${roomName} (${count} streams disabled)`,
      });
      res.json({
        success: true,
        message: `All remote cameras disabled (${count} streams)`,
        disabledAll: true,
        count,
      });
      return;
    }

    // 2. Disable / Enable Specific Participant's Camera
    const success = await livekitService.muteParticipantVideo(roomName, participantPhone, Boolean(disabled));

    insertAuditLog({
      eventType: disabled ? 'PARTICIPANT_VIDEO_DISABLED' : 'PARTICIPANT_VIDEO_ENABLED',
      actorName: actorName || 'Presiding Officer',
      actorRole: actorRole || 'officer',
      targetId: participantPhone,
      targetName: participantPhone,
      details: `${disabled ? 'Disabled' : 'Enabled'} video for ${participantPhone} in call ${id} (room ${roomName})`,
    });

    res.json({
      success: true,
      message: `${disabled ? 'Disabled' : 'Enabled'} video for ${participantPhone}`,
    });
  } catch (error: any) {
    console.error('[Calls] Error disabling participant video:', error);
    res.status(500).json({ error: error.message || 'Failed to disable video' });
  }
});

/**
 * POST /api/calls/:id/remove-participant
 *
 * Collector/Officer disconnects a specific participant from the hearing.
 * Body: { participantPhone: "+91..." }
 */
router.post('/:id/remove-participant', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { participantPhone, actorName, actorRole } = req.body;

  if (!participantPhone) {
    res.status(400).json({ error: 'participantPhone is required' });
    return;
  }

  try {
    const success = await callManager.removeParticipantFromCall(id, participantPhone);
    if (!success) {
      res.status(404).json({ error: 'Call or participant not found' });
      return;
    }

    insertAuditLog({
      eventType: 'PARTICIPANT_EJECTED',
      actorName: actorName || 'Officer',
      actorRole: actorRole || 'officer',
      targetId: participantPhone,
      targetName: participantPhone,
      details: `Ejected participant ${participantPhone} from hearing ${id}`,
    });

    res.json({ success: true, message: `Disconnected participant ${participantPhone}` });
  } catch (error) {
    console.error('[Calls] Error removing participant:', error);
    res.status(500).json({ error: 'Failed to remove participant' });
  }
});

/**
 * POST /api/calls/:id/leave
 *
 * Citizen or Employee leaves the hearing on their own.
 * Body: { phone: "+91..." }
 */
router.post('/:id/leave', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { phone, grievanceId, roomName } = req.body;

  if (!phone) {
    res.status(400).json({ error: 'phone is required' });
    return;
  }

  try {
    await callManager.participantLeaveCall(id, phone, grievanceId, roomName);
    res.json({ success: true, message: 'Left the hearing' });
  } catch (error) {
    console.error('[Calls] Error leaving call:', error);
    res.status(500).json({ error: 'Failed to process leave' });
  }
});

/**
 * POST /api/calls/:id/end
 *
 * End a Jan Sunwai hearing call.
 * Terminates the LiveKit room, stops recording, and notifies all participants.
 */
router.post('/:id/end', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const call = await callManager.endCall(id);

    if (!call) {
      res.status(404).json({ error: 'Call not found' });
      return;
    }

    res.json({
      success: true,
      message: 'Hearing ended',
      call: {
        id: call.id,
        grievanceId: call.grievanceId,
        status: call.status,
        duration: call.durationSeconds,
        participants: call.participants.map((p) => ({
          name: p.name,
          role: p.role,
          ringStatus: p.ringStatus,
          answeredAt: p.answeredAt,
          leftAt: p.leftAt,
        })),
      },
    });
  } catch (error) {
    console.error('[Calls] Error ending call:', error);
    res.status(500).json({ error: 'Failed to end call' });
  }
});

/**
 * GET /api/calls
 *
 * List all active calls (admin/monitoring view).
 */
router.get('/', (_req: Request, res: Response) => {
  const calls = callManager.getActiveCalls();
  res.json({
    calls: calls.map((c) => ({
      id: c.id,
      grievanceId: c.grievanceId,
      title: c.title,
      hostName: c.hostName,
      status: c.status,
      participantCount: c.participants.length,
      createdAt: c.createdAt,
    })),
    total: calls.length,
  });
});

/**
 * GET /api/calls/:id
 *
 * Get detailed information about a specific call session.
 */
router.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const call = callManager.getCall(id);

  if (!call) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }

  res.json({ call });
});

export default router;
