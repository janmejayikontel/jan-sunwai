/**
 * Sampark Grievance Directory Service — Jan Sunwai Video Call Platform
 *
 * Connected directly to local SQLite database (jansunwai.db) for:
 * - Grievance details (title, description, location, status, dates)
 * - Citizen contact information (name, phone, address)
 * - Assigned field employee/officer (name, phone, designation, department)
 * - Creating custom grievances dynamically
 * - Officer directory search for mid-call addition
 */

import { v4 as uuidv4 } from 'uuid';
import db, { lookupUserByPhone } from '../db/database';


// ─── Types ────────────────────────────────────────────────────

export interface CitizenInfo {
  name: string;
  phone: string;
  village: string;
  district: string;
  tehsil: string;
}

export interface EmployeeInfo {
  name: string;
  phone: string;
  designation: string;
  department: string;
  employeeCode: string;
  postingLocation: string;
}

export interface GrievanceDetails {
  grievanceId: string;
  title: string;
  description: string;
  category: string;
  location: string;
  district: string;
  status: string;
  filedDate: string;
  lastUpdated: string;
  citizen: CitizenInfo;
  assignedEmployee: EmployeeInfo;
}

export interface OfficerDirectoryEntry {
  name: string;
  phone: string;
  designation: string;
  department: string;
  postingDistrict: string;
  employeeCode: string;
}

export interface CreateGrievanceInput {
  title: string;
  description: string;
  category: string;
  location: string;
  district: string;
  citizenName: string;
  citizenPhone: string;
  citizenVillage?: string;
  citizenTehsil?: string;
  employeeName: string;
  employeePhone: string;
  employeeDesignation: string;
  employeeDepartment: string;
  employeePostingLocation?: string;
}

// ─── Service Functions (SQLite Powered) ───────────────────────

/**
 * Fetch grievance details from SQLite by grievance ID.
 */
export async function fetchGrievance(grievanceId: string): Promise<GrievanceDetails | null> {
  const normalizedId = grievanceId.startsWith('RAJ-')
    ? grievanceId
    : `RAJ-2024-${grievanceId.padStart(5, '0')}`;

  const row = db.prepare(`
    SELECT 
      g.id as grievanceId,
      g.title,
      g.description,
      g.category,
      g.location,
      g.district,
      g.status,
      g.filed_date as filedDate,
      g.last_updated as lastUpdated,
      c.name as citizenName,
      c.phone as citizenPhone,
      c.village as citizenVillage,
      c.district as citizenDistrict,
      c.tehsil as citizenTehsil,
      e.name as employeeName,
      e.phone as employeePhone,
      e.designation as employeeDesignation,
      e.department as employeeDepartment,
      e.employee_code as employeeCode,
      e.posting_location as employeePostingLocation
    FROM grievances g
    JOIN citizens c ON g.citizen_id = c.id
    JOIN employees e ON g.assigned_employee_id = e.id
    WHERE g.id = ? OR g.id = ?
  `).get(normalizedId, grievanceId) as any;

  if (!row) {
    console.log(`[Sampark/SQLite] Grievance not found: ${grievanceId}`);
    return null;
  }

  return {
    grievanceId: row.grievanceId,
    title: row.title,
    description: row.description,
    category: row.category,
    location: row.location,
    district: row.district,
    status: row.status,
    filedDate: row.filedDate,
    lastUpdated: row.lastUpdated,
    citizen: {
      name: row.citizenName,
      phone: row.citizenPhone,
      village: row.citizenVillage || '',
      district: row.citizenDistrict || '',
      tehsil: row.citizenTehsil || '',
    },
    assignedEmployee: {
      name: row.employeeName,
      phone: row.employeePhone,
      designation: row.employeeDesignation,
      department: row.employeeDepartment,
      employeeCode: row.employeeCode || '',
      postingLocation: row.employeePostingLocation || '',
    },
  };
}

/**
 * Get all available grievances from SQLite.
 */
export async function listGrievances(): Promise<GrievanceDetails[]> {
  const rows = db.prepare(`
    SELECT 
      g.id as grievanceId,
      g.title,
      g.description,
      g.category,
      g.location,
      g.district,
      g.status,
      g.filed_date as filedDate,
      g.last_updated as lastUpdated,
      c.name as citizenName,
      c.phone as citizenPhone,
      c.village as citizenVillage,
      c.district as citizenDistrict,
      c.tehsil as citizenTehsil,
      e.name as employeeName,
      e.phone as employeePhone,
      e.designation as employeeDesignation,
      e.department as employeeDepartment,
      e.employee_code as employeeCode,
      e.posting_location as employeePostingLocation
    FROM grievances g
    JOIN citizens c ON g.citizen_id = c.id
    JOIN employees e ON g.assigned_employee_id = e.id
    ORDER BY g.created_at DESC
  `).all() as any[];

  return rows.map((row) => ({
    grievanceId: row.grievanceId,
    title: row.title,
    description: row.description,
    category: row.category,
    location: row.location,
    district: row.district,
    status: row.status,
    filedDate: row.filedDate,
    lastUpdated: row.lastUpdated,
    citizen: {
      name: row.citizenName,
      phone: row.citizenPhone,
      village: row.citizenVillage || '',
      district: row.citizenDistrict || '',
      tehsil: row.citizenTehsil || '',
    },
    assignedEmployee: {
      name: row.employeeName,
      phone: row.employeePhone,
      designation: row.employeeDesignation,
      department: row.employeeDepartment,
      employeeCode: row.employeeCode || '',
      postingLocation: row.employeePostingLocation || '',
    },
  }));
}

/**
 * Create a new custom grievance in SQLite.
 * Allows entering custom phone numbers for live demo testing.
 */
export async function createGrievance(input: CreateGrievanceInput): Promise<GrievanceDetails> {
  const grievanceId = `RAJ-2024-${Math.floor(10000 + Math.random() * 90000)}`;
  const citizenId = `cit-${uuidv4().substring(0, 8)}`;
  const employeeId = `emp-${uuidv4().substring(0, 8)}`;
  const employeeCode = `EMP-${input.district.toUpperCase().substring(0, 3)}-${Math.floor(1000 + Math.random() * 9000)}`;

  const createTx = db.transaction(() => {
    // 1. Find or Insert Citizen by Phone
    let citizen = db.prepare('SELECT id FROM citizens WHERE phone = ?').get(input.citizenPhone) as any;
    let actualCitizenId = citizen?.id;

    if (!actualCitizenId) {
      db.prepare(`
        INSERT INTO citizens (id, name, phone, village, district, tehsil)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        citizenId,
        input.citizenName,
        input.citizenPhone,
        input.citizenVillage || input.location,
        input.district,
        input.citizenTehsil || input.district
      );
      actualCitizenId = citizenId;
    }

    // 2. Find or Insert Employee by Phone
    let employee = db.prepare('SELECT id FROM employees WHERE phone = ?').get(input.employeePhone) as any;
    let actualEmployeeId = employee?.id;

    if (!actualEmployeeId) {
      db.prepare(`
        INSERT INTO employees (id, name, phone, designation, department, employee_code, posting_location)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        employeeId,
        input.employeeName,
        input.employeePhone,
        input.employeeDesignation,
        input.employeeDepartment,
        employeeCode,
        input.employeePostingLocation || input.location
      );
      actualEmployeeId = employeeId;
    }

    // 3. Insert Grievance
    db.prepare(`
      INSERT INTO grievances (id, title, description, category, location, district, status, citizen_id, assigned_employee_id, filed_date, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, 'Escalated to Higher Authority', ?, ?, date('now'), date('now'))
    `).run(
      grievanceId,
      input.title,
      input.description,
      input.category,
      input.location,
      input.district,
      actualCitizenId,
      actualEmployeeId
    );
  });

  createTx();
  console.log(`[Sampark/SQLite] Created new grievance: ${grievanceId}`);

  const created = await fetchGrievance(grievanceId);
  if (!created) {
    throw new Error('Failed to retrieve newly created grievance');
  }
  return created;
}

/**
 * Get distinct departments from SQLite employees and officers tables.
 */
export function listDepartments(): string[] {
  const rows = db.prepare(`
    SELECT DISTINCT department FROM employees WHERE department IS NOT NULL AND department != ''
    UNION
    SELECT DISTINCT department FROM officers WHERE department IS NOT NULL AND department != ''
    ORDER BY department ASC
  `).all() as any[];
  return rows.map((r) => r.department);
}

/**
 * Get distinct designations from SQLite employees and officers tables.
 * Optionally filtered by department.
 */
export function listDesignations(department?: string): string[] {
  let empSql = `SELECT DISTINCT designation FROM employees WHERE designation IS NOT NULL AND designation != ''`;
  let offSql = `SELECT DISTINCT designation FROM officers WHERE designation IS NOT NULL AND designation != ''`;
  const params: any[] = [];

  if (department && department !== 'ALL' && department.trim() !== '') {
    empSql += ` AND (department = ? OR department LIKE ?)`;
    offSql += ` AND (department = ? OR department LIKE ?)`;
    params.push(department.trim(), `%${department.trim()}%`);
  }

  const empRows = db.prepare(empSql).all(...params) as any[];
  const offRows = db.prepare(offSql).all(...params) as any[];

  const set = new Set<string>();
  empRows.forEach((r) => r.designation && set.add(r.designation));
  offRows.forEach((r) => r.designation && set.add(r.designation));
  return Array.from(set).sort();
}

/**
 * Search officers, employees, and citizens from SQLite database by name, phone, designation, or department.
 * Also supports direct dialing any 10-digit phone number.
 */
export async function searchOfficers(
  query: string,
  department?: string,
  designation?: string
): Promise<OfficerDirectoryEntry[]> {
  const cleanQ = (query || '').trim();
  const lower = `%${cleanQ.toLowerCase()}%`;
  const digitsOnly = cleanQ.replace(/[^0-9]/g, '');
  const phonePattern = digitsOnly.length >= 6 ? `%${digitsOnly.slice(-10)}%` : lower;
  const cleanDesig = (designation || '').trim();

  // 1. Search officers table (Collectors, SDM, SP, etc.)
  let offRows: any[] = [];
  if (!department || department === 'ALL' || department.trim() === '') {
    let offSql = `
      SELECT name, phone, designation, department, posting_location as postingDistrict, cadre as employeeCode
      FROM officers
      WHERE 1=1
    `;
    const offParams: any[] = [];
    if (cleanQ) {
      offSql += ` AND (LOWER(name) LIKE ? OR LOWER(designation) LIKE ? OR LOWER(department) LIKE ? OR phone LIKE ? OR phone LIKE ?)`;
      offParams.push(lower, lower, lower, lower, phonePattern);
    }
    if (cleanDesig && cleanDesig !== 'ALL') {
      offSql += ` AND (designation = ? OR LOWER(designation) LIKE ?)`;
      offParams.push(cleanDesig, `%${cleanDesig.toLowerCase()}%`);
    }
    offSql += ` ORDER BY name ASC LIMIT 15`;
    offRows = db.prepare(offSql).all(...offParams) as any[];
  }

  // 2. Search employees table
  let empSql = `
    SELECT name, phone, designation, department, posting_location as postingDistrict, employee_code as employeeCode
    FROM employees
    WHERE 1=1
  `;
  const empParams: any[] = [];

  if (cleanQ) {
    empSql += ` AND (LOWER(name) LIKE ? OR LOWER(designation) LIKE ? OR LOWER(department) LIKE ? OR phone LIKE ? OR phone LIKE ?)`;
    empParams.push(lower, lower, lower, lower, phonePattern);
  }

  if (department && department !== 'ALL' && department.trim() !== '') {
    empSql += ` AND (department = ? OR department LIKE ?)`;
    empParams.push(department.trim(), `%${department.trim()}%`);
  }

  if (cleanDesig && cleanDesig !== 'ALL') {
    empSql += ` AND (designation = ? OR LOWER(designation) LIKE ?)`;
    empParams.push(cleanDesig, `%${cleanDesig.toLowerCase()}%`);
  }

  empSql += ` ORDER BY name ASC LIMIT 30`;
  const empRows = db.prepare(empSql).all(...empParams) as any[];

  // 3. Search citizens table if no department filter is specified
  let citRows: any[] = [];
  if (!department || department === 'ALL') {
    if (cleanQ) {
      citRows = db.prepare(`
        SELECT name, phone, ('Citizen (' || COALESCE(village, district, 'Complainant') || ')') as designation, 'Citizen Directory' as department, district as postingDistrict, '' as employeeCode
        FROM citizens
        WHERE LOWER(name) LIKE ? OR phone LIKE ? OR phone LIKE ?
        LIMIT 10
      `).all(lower, lower, phonePattern) as any[];
    }
  }

  const results: OfficerDirectoryEntry[] = [];
  const seenPhones = new Set<string>();

  for (const r of [...offRows, ...empRows, ...citRows]) {
    const norm = r.phone.replace(/[^0-9]/g, '').slice(-10);
    if (!seenPhones.has(norm)) {
      seenPhones.add(norm);
      results.push({
        name: r.name,
        phone: r.phone.startsWith('+91') ? r.phone : `+91${norm}`,
        designation: r.designation,
        department: r.department,
        postingDistrict: r.postingDistrict || '',
        employeeCode: r.employeeCode || '',
      });
    }
  }

  // 3. If collector typed a 10-digit phone number not already in results, provide a direct dial entry!
  if (digitsOnly.length >= 10) {
    const bare10 = digitsOnly.slice(-10);
    if (!seenPhones.has(bare10)) {
      results.unshift({
        name: `Dial Direct (+91 ${bare10})`,
        phone: `+91${bare10}`,
        designation: 'Direct Dial Participant',
        department: department && department !== 'ALL' ? department : 'Direct Mobile Call',
        postingDistrict: 'Rajasthan',
        employeeCode: 'DIRECT',
      });
    }
  }

  return results;
}

/**
 * Look up an employee by phone.
 */
export async function findOfficerByPhone(phone: string): Promise<OfficerDirectoryEntry | null> {
  const row = db.prepare(`
    SELECT name, phone, designation, department, posting_location as postingDistrict, employee_code as employeeCode
    FROM employees
    WHERE phone = ?
  `).get(phone) as any;

  if (!row) return null;

  return {
    name: row.name,
    phone: row.phone,
    designation: row.designation,
    department: row.department,
    postingDistrict: row.postingDistrict || '',
    employeeCode: row.employeeCode || '',
  };
}

/**
 * Get all grievances linked to a citizen or employee by phone.
 */
export async function getGrievancesByPhone(phone: string): Promise<GrievanceDetails[]> {
  const cleanPhone = phone.replace(/\D/g, '').slice(-10);

  // Check what role this user has in SQLite
  const user = lookupUserByPhone(phone);

  let query = '';
  let params: any[] = [];

  if (user && user.role === 'officer') {
    // District Collector or Administrative Officer:
    // Show grievances in their assigned district (e.g. Jaipur Collector sees Jaipur grievances)
    if (user.district && user.district !== 'Rajasthan') {
      query = `
        SELECT 
          g.id as grievanceId, g.title, g.description, g.category, g.location, g.district, g.status,
          g.filed_date as filedDate, g.last_updated as lastUpdated,
          c.name as citizenName, c.phone as citizenPhone, c.village as citizenVillage, c.district as citizenDistrict, c.tehsil as citizenTehsil,
          e.name as employeeName, e.phone as employeePhone, e.designation as employeeDesignation, e.department as employeeDepartment,
          e.employee_code as employeeCode, e.posting_location as employeePostingLocation
        FROM grievances g
        JOIN citizens c ON g.citizen_id = c.id
        JOIN employees e ON g.assigned_employee_id = e.id
        WHERE g.district LIKE ?
        ORDER BY g.created_at DESC
      `;
      params = [`%${user.district}%`];
    } else {
      query = `
        SELECT 
          g.id as grievanceId, g.title, g.description, g.category, g.location, g.district, g.status,
          g.filed_date as filedDate, g.last_updated as lastUpdated,
          c.name as citizenName, c.phone as citizenPhone, c.village as citizenVillage, c.district as citizenDistrict, c.tehsil as citizenTehsil,
          e.name as employeeName, e.phone as employeePhone, e.designation as employeeDesignation, e.department as employeeDepartment,
          e.employee_code as employeeCode, e.posting_location as employeePostingLocation
        FROM grievances g
        JOIN citizens c ON g.citizen_id = c.id
        JOIN employees e ON g.assigned_employee_id = e.id
        ORDER BY g.created_at DESC
      `;
      params = [];
    }
  } else if (user && user.role === 'employee') {
    // Field Employee: ONLY see grievances assigned to them!
    query = `
      SELECT 
        g.id as grievanceId, g.title, g.description, g.category, g.location, g.district, g.status,
        g.filed_date as filedDate, g.last_updated as lastUpdated,
        c.name as citizenName, c.phone as citizenPhone, c.village as citizenVillage, c.district as citizenDistrict, c.tehsil as citizenTehsil,
        e.name as employeeName, e.phone as employeePhone, e.designation as employeeDesignation, e.department as employeeDepartment,
        e.employee_code as employeeCode, e.posting_location as employeePostingLocation
      FROM grievances g
      JOIN citizens c ON g.citizen_id = c.id
      JOIN employees e ON g.assigned_employee_id = e.id
      WHERE e.phone LIKE ?
      ORDER BY g.created_at DESC
    `;
    params = [`%${cleanPhone}`];
  } else {
    // Citizen: ONLY see their own filed grievances!
    query = `
      SELECT 
        g.id as grievanceId, g.title, g.description, g.category, g.location, g.district, g.status,
        g.filed_date as filedDate, g.last_updated as lastUpdated,
        c.name as citizenName, c.phone as citizenPhone, c.village as citizenVillage, c.district as citizenDistrict, c.tehsil as citizenTehsil,
        e.name as employeeName, e.phone as employeePhone, e.designation as employeeDesignation, e.department as employeeDepartment,
        e.employee_code as employeeCode, e.posting_location as employeePostingLocation
      FROM grievances g
      JOIN citizens c ON g.citizen_id = c.id
      JOIN employees e ON g.assigned_employee_id = e.id
      WHERE c.phone LIKE ?
      ORDER BY g.created_at DESC
    `;
    params = [`%${cleanPhone}`];
  }

  const rows = db.prepare(query).all(...params) as any[];


  return rows.map((row) => ({
    grievanceId: row.grievanceId,
    title: row.title,
    description: row.description,
    category: row.category,
    location: row.location,
    district: row.district,
    status: row.status,
    filedDate: row.filedDate,
    lastUpdated: row.lastUpdated,
    citizen: {
      name: row.citizenName,
      phone: row.citizenPhone,
      village: row.citizenVillage || '',
      district: row.citizenDistrict || '',
      tehsil: row.citizenTehsil || '',
    },
    assignedEmployee: {
      name: row.employeeName,
      phone: row.employeePhone,
      designation: row.employeeDesignation,
      department: row.employeeDepartment,
      employeeCode: row.employeeCode || '',
      postingLocation: row.employeePostingLocation || '',
    },
  }));
}

// ─── Exports ──────────────────────────────────────────────────

export const samparkService = {
  fetchGrievance,
  listGrievances,
  getGrievancesByPhone,
  createGrievance,
  searchOfficers,
  findOfficerByPhone,
  listDepartments,
  listDesignations,
};

export default samparkService;

