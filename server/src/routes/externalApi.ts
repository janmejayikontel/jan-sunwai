/**
 * External Developer API (v1) — Jan Sunwai Video Call Platform
 *
 * Dedicated REST endpoints for external government portals and 3rd-party mobile applications
 * (Rajasthan Sampark, DOIT&C Mobile Apps, Citizen Portal, etc.).
 *
 * Authentication:
 *   Pass API key in header: `X-API-Key: js_live_...` or `Authorization: Bearer js_live_...`
 */

import { Router, Request, Response, NextFunction } from 'express';
import { validateApiKey, ApiKeyRecord } from '../db/database';
import callManager from '../services/callManager';
import livekitService from '../services/livekit';
import samparkService from '../services/sampark';
import db from '../db/database';

const router = Router();

// ─── API Key Authentication Middleware ───────────────────────────
export interface AuthenticatedApiRequest extends Request {
  apiKeyClient?: ApiKeyRecord;
}

export function requireApiKey(req: AuthenticatedApiRequest, res: Response, next: NextFunction) {
  const headerKey = (req.headers['x-api-key'] as string) || '';
  const authHeader = req.headers.authorization || '';
  const bearerKey = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.substring(7).trim() : '';
  const queryKey = (req.query.api_key as string) || '';

  const apiKeyString = headerKey || bearerKey || queryKey;

  if (!apiKeyString) {
    res.status(401).json({
      success: false,
      error: 'Missing API Key',
      message: 'Please provide an API Key via header `X-API-Key: js_live_...` or `Authorization: Bearer js_live_...`',
    });
    return;
  }

  const client = validateApiKey(apiKeyString);
  if (!client) {
    res.status(403).json({
      success: false,
      error: 'Invalid or Revoked API Key',
      message: 'The provided API Key is either invalid, inactive, or has been revoked by the Super Admin.',
    });
    return;
  }

  req.apiKeyClient = client;
  next();
}

// Apply API Key authentication to all v1 endpoints
router.use(requireApiKey as any);

/**
 * GET /api/v1/hearings/verify-key
 * Test endpoint for developers to verify their API key connection.
 */
router.get('/verify-key', (req: AuthenticatedApiRequest, res: Response) => {
  res.json({
    success: true,
    message: 'API Key is valid and authorized for Jan Sunwai Video Hearing Services.',
    client: {
      name: req.apiKeyClient?.name,
      status: req.apiKeyClient?.status,
      createdAt: req.apiKeyClient?.created_at,
    },
    livekitServerUrl: livekitService.getLiveKitUrl(),
  });
});

/**
 * POST /api/v1/hearings/create
 * Start an official multi-party hearing room.
 * Simultaneously rings the citizen and field officer on their mobile devices.
 */
router.post('/create', async (req: AuthenticatedApiRequest, res: Response) => {
  try {
    const {
      grievanceId,
      title,
      officer = {},
      citizen = {},
      employee = {},
      autoRecord = true,
    } = req.body;

    if (!grievanceId) {
      res.status(400).json({ success: false, error: 'grievanceId is required (e.g. RAJ-2024-88421)' });
      return;
    }

    // Auto-fill from local grievance directory if not supplied
    let resolvedTitle = title;
    let citizenPhone = citizen.phone;
    let citizenName = citizen.name;
    let employeePhone = employee.phone;
    let employeeName = employee.name;
    let employeeDesignation = employee.designation;
    let employeeDepartment = employee.department;

    if (!citizenPhone || !employeePhone || !resolvedTitle) {
      try {
        const g = await samparkService.fetchGrievance(grievanceId);
        if (g) {
          resolvedTitle = resolvedTitle || `Jan Sunwai — ${g.title}`;
          citizenPhone = citizenPhone || g.citizen.phone;
          citizenName = citizenName || g.citizen.name;
          employeePhone = employeePhone || g.assignedEmployee.phone;
          employeeName = employeeName || g.assignedEmployee.name;
          employeeDesignation = employeeDesignation || g.assignedEmployee.designation;
          employeeDepartment = employeeDepartment || g.assignedEmployee.department;
        }
      } catch (_) {}
    }

    resolvedTitle = resolvedTitle || `Jan Sunwai Hearing #${grievanceId}`;
    const hostName = officer.name || 'District Collector & DM';
    const hostPhone = officer.phone || '+919414012345';
    const hostDesignation = officer.designation || 'District Magistrate';
    citizenPhone = citizenPhone || '+919876543210';
    citizenName = citizenName || 'Citizen Complainant';
    employeePhone = employeePhone || '+917749852013';
    employeeName = employeeName || 'Field Officer';
    employeeDesignation = employeeDesignation || 'Assistant Engineer';
    employeeDepartment = employeeDepartment || 'District Administration';

    // Initiate multi-party call session (rings participants via WebSocket)
    const { callSession, hostToken } = await callManager.initiateCall({
      grievanceId,
      title: resolvedTitle,
      hostUserId: hostPhone,
      hostName,
      hostPhone,
      hostDesignation,
      citizenPhone,
      citizenName,
      employeePhone,
      employeeName,
      employeeDesignation,
      employeeDepartment,
      autoRecord: autoRecord !== false,
    });

    const roomName = callSession.livekitRoomName;
    const livekitUrl = livekitService.getLiveKitUrl();

    // Pre-generate tokens for citizen and employee
    const [citizenToken, employeeToken] = await Promise.all([
      livekitService.generateToken({
        roomName,
        name: citizenName,
        identity: citizenPhone,
        isHost: false,
      }),
      livekitService.generateToken({
        roomName,
        name: employeeName,
        identity: employeePhone,
        isHost: false,
      }),
    ]);

    const origin = req.headers.origin || (req.headers.host ? `${req.protocol}://${req.headers.host}` : '');

    res.json({
      success: true,
      callId: callSession.id,
      grievanceId,
      roomName,
      livekitUrl,
      tokens: {
        officer: hostToken,
        citizen: citizenToken,
        employee: employeeToken,
      },
      joinUrls: {
        webPortal: `${origin}/?room=${encodeURIComponent(roomName)}`,
        officer: `${origin}/?room=${encodeURIComponent(roomName)}&role=officer`,
        citizen: `${origin}/?room=${encodeURIComponent(roomName)}&role=citizen`,
      },
      ringing: {
        citizen: { name: citizenName, phone: citizenPhone, status: 'ringing' },
        employee: { name: employeeName, phone: employeePhone, status: 'ringing' },
      },
      message: 'Hearing call initiated. Citizen and field officer are being rung.',
    });
  } catch (error: any) {
    console.error('[ExternalAPI] Error creating hearing:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to create hearing' });
  }
});

/**
 * POST /api/v1/hearings/join
 * Generate an instant LiveKit token to enter a hearing room.
 * Can be called by citizen or officer apps whenever the user clicks "Join Hearing".
 */
router.post('/join', async (req: AuthenticatedApiRequest, res: Response) => {
  try {
    const { roomName, grievanceId, name, phone, role = 'citizen' } = req.body;
    const targetRoom = roomName || grievanceId;

    if (!targetRoom) {
      res.status(400).json({ success: false, error: 'roomName or grievanceId is required' });
      return;
    }
    if (!name || !phone) {
      res.status(400).json({ success: false, error: 'name and phone are required to join' });
      return;
    }

    const isHost = role === 'officer' || role === 'admin' || role === 'collector';

    const token = await livekitService.generateToken({
      roomName: targetRoom,
      name,
      identity: phone,
      isHost,
    });

    res.json({
      success: true,
      roomName: targetRoom,
      token,
      livekitUrl: livekitService.getLiveKitUrl(),
      participant: {
        name,
        phone,
        role,
      },
    });
  } catch (error: any) {
    console.error('[ExternalAPI] Error joining hearing:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to generate join token' });
  }
});

/**
 * GET /api/v1/hearings/incoming
 * Check if there is an active incoming call ringing for a phone number.
 * Used by mobile apps to display an incoming call screen or launch high-priority notifications.
 */
router.get('/incoming', (req: AuthenticatedApiRequest, res: Response) => {
  const phone = (req.query.phone as string) || '';
  if (!phone) {
    res.status(400).json({ success: false, error: 'phone query parameter is required (e.g. ?phone=+919876543210)' });
    return;
  }

  const incomingCall = callManager.getIncomingCallForPhone(phone);
  res.json({
    success: true,
    isRinging: !!incomingCall,
    incomingCall: incomingCall || null,
  });
});

/**
 * POST /api/v1/hearings/respond
 * Accept or decline an incoming hearing call.
 */
router.post('/respond', async (req: AuthenticatedApiRequest, res: Response) => {
  try {
    const { callId, phone, action, userName } = req.body;

    if (!callId || !phone || !action) {
      res.status(400).json({ success: false, error: 'callId, phone, and action (accept/decline) are required' });
      return;
    }

    const isAccept = action.toLowerCase() === 'accept';
    const result = await callManager.respondToCall(callId, phone, isAccept ? 'accept' : 'decline');

    if (!result) {
      res.status(404).json({ success: false, error: 'Call session not found or already ended' });
      return;
    }

    if (!isAccept) {
      res.json({
        success: true,
        action: 'declined',
        message: 'Hearing call invitation declined.',
      });
      return;
    }

    res.json({
      success: true,
      action: 'accepted',
      callId,
      roomName: result.roomName,
      token: result.token,
      livekitUrl: result.livekitUrl || livekitService.getLiveKitUrl(),
    });
  } catch (error: any) {
    console.error('[ExternalAPI] Error responding to hearing:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to process response' });
  }
});

/**
 * POST /api/v1/hearings/end
 * End an ongoing hearing call session.
 */
router.post('/end', async (req: AuthenticatedApiRequest, res: Response) => {
  try {
    const { callId, roomName } = req.body;
    let targetCallId = callId;

    if (!targetCallId && roomName) {
      const activeCalls = callManager.getActiveCalls();
      const match = activeCalls.find((c: any) => c.livekitRoomName === roomName || c.grievanceId === roomName);
      if (match) targetCallId = match.id;
    }

    if (!targetCallId) {
      res.status(400).json({ success: false, error: 'callId or roomName is required' });
      return;
    }

    const ended = await callManager.endCall(targetCallId);
    if (!ended) {
      res.status(404).json({ success: false, error: 'Call not found or already ended' });
      return;
    }

    res.json({
      success: true,
      message: `Hearing call ${targetCallId} ended successfully.`,
      durationSeconds: ended.durationSeconds,
    });
  } catch (error: any) {
    console.error('[ExternalAPI] Error ending hearing:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to end hearing' });
  }
});

/**
 * GET /api/v1/hearings/active
 * List all ongoing hearing rooms.
 */
router.get('/active', (_req: AuthenticatedApiRequest, res: Response) => {
  const activeCalls = callManager.getActiveCalls();
  res.json({
    success: true,
    total: activeCalls.length,
    hearings: activeCalls.map((c: any) => ({
      callId: c.id,
      grievanceId: c.grievanceId,
      title: c.title,
      roomName: c.livekitRoomName,
      hostName: c.hostName,
      hostPhone: c.hostPhone,
      participantCount: c.participants?.length || 0,
      startedAt: c.startedAt,
    })),
  });
});

/**
 * GET /api/v1/hearings/records
 * Fetch completed hearing records and recording URLs.
 */
router.get('/records', (req: AuthenticatedApiRequest, res: Response) => {
  try {
    const { grievanceId, limit = 50 } = req.query;
    let query = 'SELECT * FROM call_records';
    const params: any[] = [];

    if (grievanceId) {
      query += ' WHERE grievance_id = ?';
      params.push(grievanceId);
    }
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(Number(limit) || 50);

    const records = db.prepare(query).all(...params);
    res.json({
      success: true,
      total: records.length,
      records,
    });
  } catch (error: any) {
    console.error('[ExternalAPI] Error fetching records:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch hearing records' });
  }
});

export default router;
