/**
 * SQLite Database Connection & Schema Management
 *
 * Provides persistent SQLite storage using sql.js (pure JS) for:
 * - Citizens (name, phone, village, tehsil, district)
 * - Assigned Field Employees (name, phone, designation, department)
 * - Grievances (id, title, description, category, status, links to citizen & employee)
 * - Hearing Call Records (call_id, grievance_id, host, status, duration, timestamps)
 *
 * Exports a compatibility wrapper that mimics the better-sqlite3 API so that
 * consuming modules (sampark.ts, callManager.ts, routes/*) need no changes.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const initSqlJs = require('sql.js');
import path from 'path';
import fs from 'fs';

// ─── Database Path ─────────────────────────────────────────────
const DATA_DIR = path.resolve(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'jansunwai.db');

// ─── Internal sql.js instance ──────────────────────────────────
let _db: any;
let _inTransaction = false;

/** Persist the in-memory database to disk */
function saveToDisk(): void {
  if (!_db) return;
  const data = _db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// ─── Compatibility Wrapper (mimics better-sqlite3 API) ────────

/**
 * A thin compatibility layer over sql.js that exposes the same API surface
 * as better-sqlite3 so that consuming code needs no changes.
 *
 * Supported:
 *   db.prepare(sql)          → { get(...), all(...), run(...) }
 *   db.exec(sql)             → execute raw SQL
 *   db.pragma(str)           → execute PRAGMA
 *   db.transaction(fn)       → returns a function that wraps fn in BEGIN/COMMIT
 */
const db = {
  /** Prepare a SQL statement and return an object with get/all/run methods */
  prepare(sql: string) {
    return {
      /** Execute and return the first matching row, or undefined */
      get(...params: any[]): any {
        const stmt = _db.prepare(sql);
        try {
          if (params.length > 0) stmt.bind(params);
          if (stmt.step()) {
            return stmt.getAsObject();
          }
          return undefined;
        } finally {
          stmt.free();
        }
      },

      /** Execute and return all matching rows as an array of objects */
      all(...params: any[]): any[] {
        const results: any[] = [];
        const stmt = _db.prepare(sql);
        try {
          if (params.length > 0) stmt.bind(params);
          while (stmt.step()) {
            results.push(stmt.getAsObject());
          }
          return results;
        } finally {
          stmt.free();
        }
      },

      /** Execute a write statement (INSERT/UPDATE/DELETE) with positional params */
      run(...params: any[]): void {
        if (params.length > 0) {
          _db.run(sql, params);
        } else {
          _db.run(sql);
        }
        if (!_inTransaction) saveToDisk();
      },
    };
  },

  /** Execute raw SQL (DDL, multi-statement) */
  exec(sql: string): void {
    _db.exec(sql);
  },

  /** Execute a PRAGMA statement */
  pragma(pragmaStr: string): void {
    _db.exec(`PRAGMA ${pragmaStr};`);
  },

  /**
   * Create a transaction wrapper.
   * Returns a function that, when called, executes fn() inside BEGIN/COMMIT.
   */
  transaction<T extends (...args: any[]) => any>(fn: T): T {
    const wrapper = ((...args: any[]) => {
      _db.exec('BEGIN TRANSACTION;');
      _inTransaction = true;
      try {
        const result = fn(...args);
        _inTransaction = false;
        _db.exec('COMMIT;');
        saveToDisk();
        return result;
      } catch (err) {
        _inTransaction = false;
        try { _db.exec('ROLLBACK;'); } catch (_) { /* already rolled back */ }
        throw err;
      }
    }) as unknown as T;
    return wrapper;
  },
};

// ─── Initialize Schema ─────────────────────────────────────────
export async function initializeDatabase(): Promise<void> {
  const SQL = await initSqlJs();

  // Load existing database from disk if it exists
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    _db = new SQL.Database(fileBuffer);
  } else {
    _db = new SQL.Database();
  }

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS citizens (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      village TEXT,
      district TEXT,
      tehsil TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      designation TEXT NOT NULL,
      department TEXT NOT NULL,
      employee_code TEXT UNIQUE,
      posting_location TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS grievances (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      location TEXT NOT NULL,
      district TEXT NOT NULL,
      status TEXT DEFAULT 'Escalated to Higher Authority',
      citizen_id TEXT NOT NULL,
      assigned_employee_id TEXT NOT NULL,
      filed_date TEXT DEFAULT (date('now')),
      last_updated TEXT DEFAULT (date('now')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (citizen_id) REFERENCES citizens(id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_employee_id) REFERENCES employees(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS officers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      designation TEXT NOT NULL,
      department TEXT NOT NULL,
      district TEXT NOT NULL,
      cadre TEXT DEFAULT 'IAS',
      posting_location TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS call_center_reps (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      designation TEXT NOT NULL,
      department TEXT NOT NULL,
      desk_number TEXT,
      shift TEXT DEFAULT 'General',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      designation TEXT NOT NULL,
      department TEXT NOT NULL,
      role_level TEXT DEFAULT 'super_admin',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT DEFAULT (datetime('now')),
      event_type TEXT NOT NULL,
      actor_id TEXT,
      actor_name TEXT,
      actor_role TEXT,
      target_id TEXT,
      target_name TEXT,
      details TEXT,
      ip_address TEXT
    );

    CREATE TABLE IF NOT EXISTS citizen_verifications (
      citizen_id TEXT PRIMARY KEY,
      jan_aadhaar_id TEXT,
      aadhaar_last4 TEXT,
      status TEXT DEFAULT 'pending',
      verified_by TEXT,
      verified_at TEXT,
      notes TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS hearing_queue (
      id TEXT PRIMARY KEY,
      grievance_id TEXT NOT NULL,
      priority TEXT DEFAULT 'Medium',
      queue_status TEXT DEFAULT 'in_queue',
      scheduled_time TEXT,
      assigned_officer_id TEXT,
      dispatched_at TEXT,
      dispatched_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS call_records (
      id TEXT PRIMARY KEY,
      grievance_id TEXT,
      host_name TEXT NOT NULL,
      status TEXT NOT NULL,
      duration_seconds INTEGER DEFAULT 0,
      recording_url TEXT,
      started_at TEXT,
      ended_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Seed initial records if database is empty
  seedInitialData();
}


function seedInitialData(): void {
  const insertOfficer = db.prepare(`
    INSERT OR REPLACE INTO officers (id, name, phone, designation, department, district, cadre, posting_location)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertCallCenterRep = db.prepare(`
    INSERT OR REPLACE INTO call_center_reps (id, name, phone, designation, department, desk_number, shift)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAdmin = db.prepare(`
    INSERT OR REPLACE INTO admins (id, name, phone, designation, department, role_level)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertCitizen = db.prepare(`
    INSERT OR REPLACE INTO citizens (id, name, phone, village, district, tehsil)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertEmployee = db.prepare(`
    INSERT OR REPLACE INTO employees (id, name, phone, designation, department, employee_code, posting_location)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertGrievance = db.prepare(`
    INSERT OR REPLACE INTO grievances (id, title, description, category, location, district, status, citizen_id, assigned_employee_id, filed_date, last_updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertVerification = db.prepare(`
    INSERT OR REPLACE INTO citizen_verifications (citizen_id, jan_aadhaar_id, aadhaar_last4, status, verified_by, verified_at, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertQueueItem = db.prepare(`
    INSERT OR REPLACE INTO hearing_queue (id, grievance_id, priority, queue_status, scheduled_time, assigned_officer_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertSetting = db.prepare(`
    INSERT OR REPLACE INTO system_settings (key, value, description)
    VALUES (?, ?, ?)
  `);

  const insertAudit = db.prepare(`
    INSERT OR REPLACE INTO audit_logs (id, timestamp, event_type, actor_id, actor_name, actor_role, target_id, target_name, details, ip_address)
    VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, '127.0.0.1')
  `);

  const seedTransaction = db.transaction(() => {
    // ─── 1. Super Admins ──────────────────────────────────────────
    const adminsSeed = [
      { id: 'adm-001', name: 'Rajasthan DOIT&C Admin', phone: '+919999999999', designation: 'Chief System Administrator', department: 'Department of Information Technology & Communication (DOIT&C)', role_level: 'super_admin' },
      { id: 'adm-002', name: 'State IT Operations Admin', phone: '+919888888888', designation: 'IT Operations Lead', department: 'DOIT&C State Data Center, Jaipur', role_level: 'super_admin' },
    ];
    for (const adm of adminsSeed) {
      insertAdmin.run(adm.id, adm.name, adm.phone, adm.designation, adm.department, adm.role_level);
    }

    // ─── 2. Call Centre Representatives (181 Sampark Helpdesk) ───
    const repsSeed = [
      { id: 'rep-001', name: 'Priya Sharma', phone: '+917749852013', designation: 'Senior Call Centre Representative', department: '181 Rajasthan Sampark Call Centre', desk_number: 'DESK-A12', shift: 'Morning' },
      { id: 'rep-002', name: 'Anjali Meena', phone: '+911800181001', designation: 'Queue Dispatcher & KYC Verifier', department: '181 Rajasthan Sampark Call Centre', desk_number: 'DESK-B04', shift: 'General' },
      { id: 'rep-003', name: 'Rohit Verma', phone: '+919337453713', designation: 'Hearing Coordination Executive', department: '181 Rajasthan Sampark Call Centre', desk_number: 'DESK-C09', shift: 'Afternoon' },
    ];
    for (const rep of repsSeed) {
      insertCallCenterRep.run(rep.id, rep.name, rep.phone, rep.designation, rep.department, rep.desk_number, rep.shift);
    }

    // ─── 3. Higher Administrative Officers (Collectors, SDM, SP) ───
    const officersSeed = [
      { id: 'off-001', name: 'Sh. Alok Sharma, IAS', phone: '+919414000001', designation: 'District Collector & DM', department: 'District Administration & Collectorate', district: 'Jaipur', cadre: 'IAS', posting_location: 'District Collectorate, Jaipur' },
      { id: 'off-002', name: 'Vivek, IAS', phone: '+919024594520', designation: 'District Collector & DM', department: 'District Administration & Collectorate', district: 'Jaipur', cadre: 'IAS', posting_location: 'Collectorate Campus, Bani Park, Jaipur' },
      { id: 'off-003', name: 'Kalyan, RAS', phone: '+919964235548', designation: 'Sub-Divisional Magistrate (SDM)', department: 'Revenue & Sub-Divisional Administration', district: 'Jaipur', cadre: 'RAS', posting_location: 'SDM Office Sanganer, Jaipur' },
      { id: 'off-004', name: 'Jasobanta, IAS', phone: '+918093868707', designation: 'District Collector & DM', department: 'District Administration & Collectorate', district: 'Barmer', cadre: 'IAS', posting_location: 'Collectorate Campus, Barmer' },
      { id: 'off-005', name: 'Sanjit, IPS', phone: '+918249963060', designation: 'Superintendent of Police (SP)', department: 'Rajasthan Police (राजस्थान पुलिस)', district: 'Jaipur', cadre: 'IPS', posting_location: 'Police Headquarters, Jaipur City' },
      { id: 'off-006', name: 'Pragyan, IAS', phone: '+917008318289', designation: 'District Collector & DM', department: 'District Administration & Collectorate', district: 'Jodhpur', cadre: 'IAS', posting_location: 'Collectorate Campus, Jodhpur' },
    ];

    for (const off of officersSeed) {
      insertOfficer.run(off.id, off.name, off.phone, off.designation, off.department, off.district, off.cadre, off.posting_location);
    }

    // Clean up any accidental citizen records for admin/officer/rep numbers
    try {
      db.prepare(`
        DELETE FROM citizens 
        WHERE phone IN (SELECT phone FROM officers) 
           OR phone IN (SELECT phone FROM call_center_reps)
           OR phone IN (SELECT phone FROM admins)
      `).run();
    } catch (err) {
      console.error('[SQLite] Error purging conflicting citizen records:', err);
    }

    // ─── 4. Citizens ──────────────────────────────────────────────
    insertCitizen.run('cit-001', 'Janmejay Sethi', '+917735807328', 'Sanganer', 'Jaipur', 'Sanganer');
    insertCitizen.run('cit-002', 'Mandal Sahoo', '+918249884033', 'Gudamalani', 'Barmer', 'Barmer');

    // Employees (mapped for backward compatibility)
    insertEmployee.run('emp-001', 'Chandan Kumar', '+917749852014', 'Junior Engineer (JEn)', 'PHED — Public Health Engineering', 'PHED-JP-2019-0342', 'Sub-Division Sanganer, Jaipur');
    insertEmployee.run('emp-002', 'Mrityunjay Singh', '+919337453714', 'Patwari', 'Revenue Department', 'REV-BM-2015-0187', 'Patwar Circle Gudamalani, Barmer');

    // Grievances
    insertGrievance.run(
      'RAJ-2024-88421',
      'Water pipeline leak unresolved for 3 weeks — Sanganer, Jaipur',
      'Main water supply pipeline leaking at Ward 15, Sanganer. Despite repeated complaints to local PHED office, Junior Engineer has not visited the site. Water wastage is causing damage to road and nearby houses. Complaint marked as "Resolved" on portal without actual repair.',
      'Public Health Engineering (PHED) — Water Supply',
      'Ward 15, Sanganer, Jaipur',
      'Jaipur',
      'Escalated to Higher Authority',
      'cit-001',
      'emp-001',
      '2024-08-15',
      '2024-09-10'
    );

    insertGrievance.run(
      'RAJ-2024-71205',
      'Pension not disbursed for 6 months — Barmer',
      'Widow pension (Vidhwa Pension Yojana) stopped since March 2024 without any notice. Multiple visits to Tehsil office yielded no resolution. Patwari says file is pending at SDM office.',
      'Social Justice — Pension Disbursement',
      'Gram Panchayat Gudamalani, Barmer',
      'Barmer',
      'Escalated to Higher Authority',
      'cit-002',
      'emp-002',
      '2024-06-22',
      '2024-09-08'
    );

    // ─── 5. Citizen KYC Identity Verifications ────────────────────
    insertVerification.run('cit-001', 'JA-88492011', '7328', 'verified', 'rep-001', '2024-09-12 11:30:00', 'Jan Aadhaar and Aadhaar matched with live phone record.');
    insertVerification.run('cit-002', 'JA-10928472', '4033', 'pending', null, null, 'Awaiting document upload from Tehsil office.');

    // ─── 6. Hearing Queue Items ───────────────────────────────────
    insertQueueItem.run('q-001', 'RAJ-2024-88421', 'High', 'ready_for_dispatch', '2024-09-16 16:30', 'off-001');
    insertQueueItem.run('q-002', 'RAJ-2024-71205', 'Urgent', 'in_queue', '2024-09-16 17:00', 'off-004');

    // ─── 7. System Settings ───────────────────────────────────────
    insertSetting.run('max_meeting_participants', '1500', 'Maximum concurrent participant limit per LiveKit video hearing room');
    insertSetting.run('e2ee_encryption_enabled', 'true', 'End-to-End Encryption enabled for real-time video audio and chat');
    insertSetting.run('sas_safety_numbers_required', 'true', 'Enable Cryptographic Safety Numbers verification on citizen sessions');
    insertSetting.run('token_expiry_minutes', '120', 'LiveKit WebRTC token lifespan for multi-party hearings');
    insertSetting.run('auto_recording_default', 'true', 'Automatically record official hearings via LiveKit Egress MP4');
    insertSetting.run('call_queue_dispatch_mode', 'manual_by_agent', 'Queue dispatch policy: manual_by_agent or auto_round_robin');

    // ─── 8. Initial Audit Logs ────────────────────────────────────
    insertAudit.run('aud-001', 'SYSTEM_INITIALIZE', 'system', 'Jan Sunwai Core', 'system', null, null, 'Platform initialized with 4 roles and 1500 concurrent participant capacity.');
    insertAudit.run('aud-002', 'SECURITY_POLICY_SET', 'adm-001', 'Rajasthan DOIT&C Admin', 'admin', null, null, 'E2EE encryption enforced and safety numbers active.');
    insertAudit.run('aud-003', 'CITIZEN_KYC_VERIFIED', 'rep-001', 'Priya Sharma', 'call_center', 'cit-001', 'Janmejay Sethi', 'Citizen identity successfully verified against Jan Aadhaar JA-88492011.');
  });

  seedTransaction();
  console.log('[SQLite] Database initialized and seeded successfully with 4 personas.');
}

// ─── Dynamic Database User & Designation Lookup ─────────────────
export interface DatabaseUserRecord {
  id: string;
  name: string;
  phone: string;
  role: 'officer' | 'call_center' | 'citizen' | 'admin' | 'employee';
  designation: string;
  department?: string;
  district?: string;
  cadre?: string;
  employeeCode?: string;
  deskNumber?: string;
  shift?: string;
  village?: string;
  tehsil?: string;
  postingLocation?: string;
}

/**
 * Dynamically look up any user from SQLite database across all 4 roles:
 * 1. Admin (Super Administrator)
 * 2. Officer (District Collector, DM, SDM, SP, Magistrate)
 * 3. Call Centre Representative (181 Sampark Helpdesk)
 * 4. Citizen (Registered complainants)
 */
export function lookupUserByPhone(inputPhone: string): DatabaseUserRecord | null {
  const cleanDigits = inputPhone.replace(/\D/g, '');
  const bare10 = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits;
  const withPlus91 = `+91${bare10}`;
  const with91 = `91${bare10}`;
  const withZero = `0${bare10}`;

  // 1. Check SQLite admins table
  try {
    const adminRow = db
      .prepare(`
        SELECT id, name, phone, designation, department, role_level
        FROM admins
        WHERE phone = ? OR phone = ? OR phone = ? OR phone = ? OR phone LIKE ?
      `)
      .get(withPlus91, bare10, with91, withZero, `%${bare10}`) as any;

    if (adminRow) {
      return {
        id: adminRow.id,
        name: adminRow.name,
        phone: adminRow.phone,
        role: 'admin',
        designation: adminRow.designation,
        department: adminRow.department,
        district: 'State IT Headquarters, Jaipur',
      };
    }
  } catch (err) {
    console.error('[SQLite] Error querying admins table:', err);
  }

  // 2. Check SQLite officers table (District Collector, DM, SDM, SP, etc.)
  try {
    const officerRow = db
      .prepare(`
        SELECT id, name, phone, designation, department, district, cadre, posting_location
        FROM officers
        WHERE phone = ? OR phone = ? OR phone = ? OR phone = ? OR phone LIKE ?
      `)
      .get(withPlus91, bare10, with91, withZero, `%${bare10}`) as any;

    if (officerRow) {
      return {
        id: officerRow.id,
        name: officerRow.name,
        phone: officerRow.phone,
        role: 'officer',
        designation: officerRow.designation,
        department: officerRow.department,
        district: officerRow.district,
        cadre: officerRow.cadre,
        postingLocation: officerRow.posting_location,
      };
    }
  } catch (err) {
    console.error('[SQLite] Error querying officers table:', err);
  }

  // 3. Check SQLite call_center_reps table (181 Sampark Helpdesk)
  try {
    const repRow = db
      .prepare(`
        SELECT id, name, phone, designation, department, desk_number, shift
        FROM call_center_reps
        WHERE phone = ? OR phone = ? OR phone = ? OR phone = ? OR phone LIKE ?
      `)
      .get(withPlus91, bare10, with91, withZero, `%${bare10}`) as any;

    if (repRow) {
      return {
        id: repRow.id,
        name: repRow.name,
        phone: repRow.phone,
        role: 'call_center',
        designation: repRow.designation,
        department: repRow.department,
        deskNumber: repRow.desk_number,
        shift: repRow.shift,
        district: 'Jaipur (Central Call Centre)',
      };
    }
  } catch (err) {
    console.error('[SQLite] Error querying call_center_reps table:', err);
  }

  // 4. Check SQLite employees table (Backwards compatibility)
  try {
    const empRow = db
      .prepare(`
        SELECT id, name, phone, designation, department, employee_code, posting_location
        FROM employees
        WHERE phone = ? OR phone = ? OR phone = ? OR phone = ? OR phone LIKE ?
      `)
      .get(withPlus91, bare10, with91, withZero, `%${bare10}`) as any;

    if (empRow) {
      return {
        id: empRow.id,
        name: empRow.name,
        phone: empRow.phone,
        role: 'call_center',
        designation: empRow.designation,
        department: empRow.department,
        district: empRow.posting_location || 'Rajasthan',
        employeeCode: empRow.employee_code,
        postingLocation: empRow.posting_location,
      };
    }
  } catch (err) {
    console.error('[SQLite] Error querying employees table:', err);
  }

  // 5. Check SQLite citizens table (Registered complainants)
  try {
    const citRow = db
      .prepare(`
        SELECT id, name, phone, village, district, tehsil
        FROM citizens
        WHERE phone = ? OR phone = ? OR phone = ? OR phone = ? OR phone LIKE ?
      `)
      .get(withPlus91, bare10, with91, withZero, `%${bare10}`) as any;

    if (citRow) {
      return {
        id: citRow.id,
        name: citRow.name,
        phone: citRow.phone,
        role: 'citizen',
        designation: 'Citizen Complainant',
        district: citRow.district || 'Rajasthan',
        village: citRow.village,
        tehsil: citRow.tehsil,
      };
    }
  } catch (err) {
    console.error('[SQLite] Error querying citizens table:', err);
  }

  return null;
}

// ─── System Audit Logging Helper ────────────────────────────────
export function insertAuditLog(data: {
  eventType: string;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
  targetId?: string;
  targetName?: string;
  details?: string;
  ipAddress?: string;
}) {
  try {
    const id = `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    db.prepare(`
      INSERT INTO audit_logs (id, timestamp, event_type, actor_id, actor_name, actor_role, target_id, target_name, details, ip_address)
      VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.eventType,
      data.actorId || null,
      data.actorName || null,
      data.actorRole || null,
      data.targetId || null,
      data.targetName || null,
      data.details || null,
      data.ipAddress || '127.0.0.1'
    );
  } catch (err) {
    console.error('[SQLite] Error inserting audit log:', err);
  }
}

export default db;
