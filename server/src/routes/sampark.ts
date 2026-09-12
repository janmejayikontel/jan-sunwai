/**
 * Sampark Directory Routes — Jan Sunwai Video Call Platform
 *
 * Exposes the Rajasthan Sampark Portal data through REST endpoints:
 * - Fetch grievance details by ID (citizen + employee contacts)
 * - List all grievances (for dashboard)
 * - Search officer directory (for mid-call addition)
 *
 * Routes:
 *   GET /api/sampark/grievance/:id   — Fetch grievance details
 *   GET /api/sampark/grievances      — List all grievances
 *   GET /api/sampark/officers        — Search officer directory
 */

import { Router, Request, Response } from 'express';
import samparkService from '../services/sampark';
import { lookupUserByPhone } from '../db/database';

const router = Router();

/**
 * GET /api/sampark/lookup-phone/:phone
 *
 * Automatically checks if a phone number exists in SQLite database
 * (officers, employees, or citizens) and returns their name, designation, department, and role.
 */
router.get('/lookup-phone/:phone', (req: Request, res: Response) => {
  const { phone } = req.params;
  try {
    const user = lookupUserByPhone(phone);
    if (user) {
      res.json({
        found: true,
        user: {
          name: user.name,
          phone: user.phone,
          designation: user.designation || (user.role === 'citizen' ? 'Citizen Complainant' : 'Official'),
          department: user.department || (user.role === 'citizen' ? 'Citizen Directory' : 'State Administration'),
          role: user.role,
          district: user.district,
        },
      });
    } else {
      res.json({ found: false });
    }
  } catch (error) {
    console.error('[Sampark] Error in lookup-phone:', error);
    res.status(500).json({ error: 'Failed to lookup phone number' });
  }
});

/**
 * GET /api/sampark/grievance/:id
 *
 * Fetch a specific grievance record from Sampark.
 * Returns citizen and assigned employee contact details.
 *
 * The Officer uses this to identify who to call for the Jan Sunwai hearing.
 *
 * Params: id — Grievance ID (e.g. "RAJ-2024-88421" or "88421")
 */
router.get('/grievance/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const grievance = await samparkService.fetchGrievance(id);

    if (!grievance) {
      res.status(404).json({
        error: 'Grievance not found',
        message: `No grievance found with ID "${id}". Try: RAJ-2024-88421, RAJ-2024-71205, RAJ-2024-93017, RAJ-2024-55890`,
      });
      return;
    }

    res.json({ grievance });
  } catch (error) {
    console.error('[Sampark] Error fetching grievance:', error);
    res.status(500).json({ error: 'Failed to fetch grievance from Sampark' });
  }
});

/**
 * GET /api/sampark/grievances
 *
 * List all grievances (for the Officer dashboard).
 * In production, supports pagination and filtering by district/status.
 */
router.get('/grievances', async (_req: Request, res: Response) => {
  try {
    const grievances = await samparkService.listGrievances();
    res.json({ grievances, total: grievances.length });
  } catch (error) {
    console.error('[Sampark] Error listing grievances:', error);
    res.status(500).json({ error: 'Failed to list grievances' });
  }
});

/**
 * GET /api/sampark/by-phone/:phone
 *
 * List all grievances linked to a citizen or employee phone number.
 */
router.get('/by-phone/:phone', async (req: Request, res: Response) => {
  const { phone } = req.params;
  try {
    const grievances = await samparkService.getGrievancesByPhone(phone);
    res.json({ grievances, total: grievances.length });
  } catch (error) {
    console.error('[Sampark] Error listing grievances by phone:', error);
    res.status(500).json({ error: 'Failed to list grievances for this phone number' });
  }
});

/**
 * GET /api/sampark/departments
 *
 * List all distinct departments in the SQLite directory.
 */
router.get('/departments', (_req: Request, res: Response) => {
  try {
    const departments = samparkService.listDepartments();
    res.json({ success: true, departments });
  } catch (error) {
    console.error('[Sampark] Error fetching departments:', error);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

/**
 * GET /api/sampark/officers?q=<search query>&department=<dept>
 *
 * Search the officer directory by name, designation, department, or phone number.
 * Used for the "Add Officer" mid-call dialing feature.
 */
router.get('/officers', async (req: Request, res: Response) => {
  const query = (req.query.q as string) || '';
  const department = (req.query.department as string) || '';

  try {
    const officers = await samparkService.searchOfficers(query, department);
    res.json({ success: true, officers, total: officers.length });
  } catch (error) {
    console.error('[Sampark] Error searching officers:', error);
    res.status(500).json({ error: 'Failed to search officers' });
  }
});

/**
 * POST /api/sampark/grievance
 *
 * File a new grievance into SQLite with custom citizen and employee phone numbers.
 */
router.post('/grievance', async (req: Request, res: Response) => {
  const {
    title,
    description,
    category,
    location,
    district,
    citizenName,
    citizenPhone,
    citizenVillage,
    citizenTehsil,
    employeeName,
    employeePhone,
    employeeDesignation,
    employeeDepartment,
    employeePostingLocation,
  } = req.body;

  if (!title || !description || !citizenName || !citizenPhone || !employeeName || !employeePhone) {
    res.status(400).json({
      error: 'Missing required fields',
      required: ['title', 'description', 'citizenName', 'citizenPhone', 'employeeName', 'employeePhone'],
    });
    return;
  }

  try {
    const grievance = await samparkService.createGrievance({
      title,
      description,
      category: category || 'General Administration',
      location: location || district || 'Jaipur',
      district: district || 'Jaipur',
      citizenName,
      citizenPhone,
      citizenVillage,
      citizenTehsil,
      employeeName,
      employeePhone,
      employeeDesignation: employeeDesignation || 'Field Officer',
      employeeDepartment: employeeDepartment || 'District Administration',
      employeePostingLocation,
    });

    res.status(201).json({
      success: true,
      message: 'Grievance created successfully in SQLite',
      grievance,
    });
  } catch (error) {
    console.error('[Sampark] Error creating grievance:', error);
    res.status(500).json({ error: 'Failed to create grievance in database' });
  }
});

export default router;
