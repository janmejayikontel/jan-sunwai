/**
 * Call Centre Representative Routes — Jan Sunwai Platform
 *
 * Dedicated endpoints for Call Centre Representatives:
 * - Consult citizen records & history
 * - Verify citizen identity (Jan Aadhaar / Aadhaar KYC)
 * - Schedule and dispatch calls from the queue
 * - Initiate calls with citizens
 */

import { Router, Request, Response } from 'express';
import db, { insertAuditLog, lookupUserByPhone } from '../db/database';
import callManager from '../services/callManager';

const router = Router();

/**
 * GET /api/call-center/queue
 *
 * List all hearings in the queue (scheduled, ready for dispatch, waiting).
 */
router.get('/queue', (_req: Request, res: Response) => {
  try {
    const queueItems = db.prepare(`
      SELECT 
        hq.id as queueId,
        hq.grievance_id,
        hq.priority,
        hq.queue_status,
        hq.scheduled_time,
        hq.assigned_officer_id,
        hq.created_at as queuedAt,
        g.title as grievanceTitle,
        g.category,
        g.district,
        c.name as citizenName,
        c.phone as citizenPhone,
        cv.status as kycStatus,
        o.name as assignedOfficerName,
        o.designation as assignedOfficerDesignation
      FROM hearing_queue hq
      LEFT JOIN grievances g ON hq.grievance_id = g.id
      LEFT JOIN citizens c ON g.citizen_id = c.id
      LEFT JOIN citizen_verifications cv ON c.id = cv.citizen_id
      LEFT JOIN officers o ON hq.assigned_officer_id = o.id
      ORDER BY 
        CASE hq.priority 
          WHEN 'Urgent' THEN 1 
          WHEN 'High' THEN 2 
          WHEN 'Medium' THEN 3 
          ELSE 4 
        END,
        hq.created_at ASC
    `).all();

    res.json({ success: true, count: queueItems.length, queue: queueItems });
  } catch (error: any) {
    console.error('[CallCenter] Error fetching queue:', error);
    res.status(500).json({ error: 'Failed to fetch queue' });
  }
});

/**
 * POST /api/call-center/dispatch
 *
 * Dispatch a queued call to an active hearing or change its status.
 */
router.post('/dispatch', (req: Request, res: Response) => {
  try {
    const { queueId, officerId, scheduledTime, queueStatus, agentName, agentPhone } = req.body;
    if (!queueId) {
      res.status(400).json({ error: 'queueId is required' });
      return;
    }

    const item = db.prepare('SELECT * FROM hearing_queue WHERE id = ?').get(queueId) as any;
    if (!item) {
      res.status(404).json({ error: 'Queue item not found' });
      return;
    }

    const newStatus = queueStatus || 'dispatched';
    db.prepare(`
      UPDATE hearing_queue 
      SET queue_status = ?, assigned_officer_id = COALESCE(?, assigned_officer_id),
          scheduled_time = COALESCE(?, scheduled_time), dispatched_at = datetime('now'),
          dispatched_by = ?
      WHERE id = ?
    `).run(newStatus, officerId || null, scheduledTime || null, agentName || agentPhone || 'Agent', queueId);

    insertAuditLog({
      eventType: 'QUEUE_CALL_DISPATCHED',
      actorName: agentName || 'Call Centre Rep',
      actorRole: 'call_center',
      targetId: item.grievance_id,
      targetName: `Grievance ${item.grievance_id}`,
      details: `Call Centre Rep dispatched queue item ${queueId} (status: ${newStatus}, officer: ${officerId || item.assigned_officer_id})`,
    });

    res.json({ success: true, message: `Hearing queue item ${queueId} updated to ${newStatus}` });
  } catch (error: any) {
    console.error('[CallCenter] Error dispatching queue item:', error);
    res.status(500).json({ error: 'Failed to dispatch hearing queue item' });
  }
});

/**
 * POST /api/call-center/verify-citizen
 *
 * Verify citizen identity (Jan Aadhaar / Aadhaar KYC).
 */
router.post('/verify-citizen', (req: Request, res: Response) => {
  try {
    const { citizenPhone, citizenId, janAadhaarId, aadhaarLast4, status, notes, agentName } = req.body;

    let targetCitizenId = citizenId;
    if (!targetCitizenId && citizenPhone) {
      const user = lookupUserByPhone(citizenPhone);
      if (user) targetCitizenId = user.id;
    }

    if (!targetCitizenId) {
      res.status(400).json({ error: 'citizenId or valid citizenPhone is required' });
      return;
    }

    const verifyStatus = status || 'verified';
    db.prepare(`
      INSERT INTO citizen_verifications (citizen_id, jan_aadhaar_id, aadhaar_last4, status, verified_by, verified_at, notes, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), ?, datetime('now'))
      ON CONFLICT(citizen_id) DO UPDATE SET
        jan_aadhaar_id = COALESCE(excluded.jan_aadhaar_id, jan_aadhaar_id),
        aadhaar_last4 = COALESCE(excluded.aadhaar_last4, aadhaar_last4),
        status = excluded.status,
        verified_by = excluded.verified_by,
        verified_at = datetime('now'),
        notes = excluded.notes,
        updated_at = datetime('now')
    `).run(
      targetCitizenId,
      janAadhaarId || null,
      aadhaarLast4 || null,
      verifyStatus,
      agentName || 'Call Centre Rep',
      notes || 'Verified through official portal'
    );

    insertAuditLog({
      eventType: 'CITIZEN_KYC_VERIFIED',
      actorName: agentName || 'Call Centre Rep',
      actorRole: 'call_center',
      targetId: targetCitizenId,
      targetName: citizenPhone || targetCitizenId,
      details: `Citizen KYC status updated to '${verifyStatus}'. Jan Aadhaar: ${janAadhaarId || 'N/A'}, Aadhaar: ${aadhaarLast4 || 'N/A'}`,
    });

    res.json({ success: true, message: `Citizen KYC updated to ${verifyStatus}`, status: verifyStatus });
  } catch (error: any) {
    console.error('[CallCenter] Error verifying citizen:', error);
    res.status(500).json({ error: 'Failed to verify citizen identity' });
  }
});

/**
 * GET /api/call-center/citizen-records/:phone
 *
 * Consult comprehensive citizen records: identity, past grievances, verification history, call records.
 */
router.get('/citizen-records/:phone', (req: Request, res: Response) => {
  try {
    const { phone } = req.params;
    const cleanDigits = phone.replace(/\D/g, '');
    const bare10 = cleanDigits.slice(-10);

    const citizen = db.prepare(`
      SELECT * FROM citizens 
      WHERE phone LIKE ?
    `).get(`%${bare10}`) as any;

    if (!citizen) {
      res.status(404).json({ error: 'Citizen records not found for this number' });
      return;
    }

    const verification = db.prepare(`
      SELECT * FROM citizen_verifications WHERE citizen_id = ?
    `).get(citizen.id) as any;

    const grievances = db.prepare(`
      SELECT g.*, e.name as assignedEmployeeName, e.designation as assignedEmployeeDesignation, e.department as assignedEmployeeDepartment
      FROM grievances g
      LEFT JOIN employees e ON g.assigned_employee_id = e.id
      WHERE g.citizen_id = ?
      ORDER BY g.created_at DESC
    `).all(citizen.id);

    res.json({
      success: true,
      citizen: {
        id: citizen.id,
        name: citizen.name,
        phone: citizen.phone,
        village: citizen.village,
        district: citizen.district,
        tehsil: citizen.tehsil,
        registeredAt: citizen.created_at,
      },
      kycVerification: verification || {
        status: 'pending',
        janAadhaarId: null,
        aadhaarLast4: null,
        notes: 'Verification pending consultation',
      },
      grievances,
    });
  } catch (error: any) {
    console.error('[CallCenter] Error consulting citizen records:', error);
    res.status(500).json({ error: 'Failed to fetch citizen records' });
  }
});

export default router;
