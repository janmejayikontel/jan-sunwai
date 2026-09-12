/**
 * SQLite Database Connection & Schema Management
 *
 * Provides persistent SQLite storage using better-sqlite3 for:
 * - Citizens (name, phone, village, tehsil, district)
 * - Assigned Field Employees (name, phone, designation, department)
 * - Grievances (id, title, description, category, status, links to citizen & employee)
 * - Hearing Call Records (call_id, grievance_id, host, status, duration, timestamps)
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// ─── Database Path ─────────────────────────────────────────────
const DATA_DIR = path.resolve(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'jansunwai.db');
export const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency and foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Initialize Schema ─────────────────────────────────────────
export function initializeDatabase(): void {
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
    VALUES (@id, @name, @phone, @designation, @department, @district, @cadre, @posting_location)
  `);

  const insertCitizen = db.prepare(`
    INSERT OR REPLACE INTO citizens (id, name, phone, village, district, tehsil)
    VALUES (@id, @name, @phone, @village, @district, @tehsil)
  `);

  const insertEmployee = db.prepare(`
    INSERT OR REPLACE INTO employees (id, name, phone, designation, department, employee_code, posting_location)
    VALUES (@id, @name, @phone, @designation, @department, @employee_code, @posting_location)
  `);

  const insertGrievance = db.prepare(`
    INSERT OR REPLACE INTO grievances (id, title, description, category, location, district, status, citizen_id, assigned_employee_id, filed_date, last_updated)
    VALUES (@id, @title, @description, @category, @location, @district, @status, @citizen_id, @assigned_employee_id, @filed_date, @last_updated)
  `);

  const seedTransaction = db.transaction(() => {
    // ─── 1. Higher Administrative Officers (Collectors, SDM, SP) ───
    const officersSeed = [
      {
        id: 'off-001',
        name: 'Vivek, IAS',
        phone: '+919024594520',
        designation: 'District Collector & DM',
        department: 'District Administration & Collectorate',
        district: 'Jaipur',
        cadre: 'IAS',
        posting_location: 'Collectorate Campus, Bani Park, Jaipur',
      },
      {
        id: 'off-002',
        name: 'Kalyan, RAS',
        phone: '+919964235548',
        designation: 'Sub-Divisional Magistrate (SDM)',
        department: 'Revenue & Sub-Divisional Administration',
        district: 'Jaipur',
        cadre: 'RAS',
        posting_location: 'SDM Office Sanganer, Jaipur',
      },
      {
        id: 'off-003',
        name: 'Jasobanta, IAS',
        phone: '+918093868707',
        designation: 'District Collector & DM',
        department: 'District Administration & Collectorate',
        district: 'Barmer',
        cadre: 'IAS',
        posting_location: 'Collectorate Campus, Barmer',
      },
      {
        id: 'off-004',
        name: 'Sanjit, IPS',
        phone: '+918249963060',
        designation: 'Superintendent of Police (SP)',
        department: 'Rajasthan Police (राजस्थान पुलिस)',
        district: 'Jaipur',
        cadre: 'IPS',
        posting_location: 'Police Headquarters, Jaipur City',
      },
      {
        id: 'off-005',
        name: 'Pragyan, IAS',
        phone: '+917008318289',
        designation: 'District Collector & DM',
        department: 'District Administration & Collectorate',
        district: 'Jodhpur',
        cadre: 'IAS',
        posting_location: 'Collectorate Campus, Jodhpur',
      },
      {
        id: 'off-006',
        name: 'Rajesh, IAS',
        phone: '+911234567890',
        designation: 'District Collector & DM',
        department: 'District Administration',
        district: 'Jaipur',
        cadre: 'IAS',
        posting_location: 'District Collectorate, Jaipur',
      },
      {
        id: 'off-007',
        name: 'Ashok, IAS',
        phone: '+919876543210',
        designation: 'Divisional Commissioner',
        department: 'General Administration Department',
        district: 'Jaipur',
        cadre: 'IAS',
        posting_location: 'Divisional Commissioner Office, Jaipur',
      },
      {
        id: 'off-008',
        name: 'Dharmendra, IAS',
        phone: '+919876543211',
        designation: 'Chief Executive Officer (CEO), Zila Parishad',
        department: 'Rural Development & Panchayati Raj',
        district: 'Jaipur',
        cadre: 'IAS',
        posting_location: 'Zila Parishad Bhawan, Jaipur',
      },
    ];

    for (const off of officersSeed) {
      insertOfficer.run(off);
    }

    // Clean up any accidental citizen records for officer/employee phone numbers
    try {
      db.prepare(`
        DELETE FROM citizens 
        WHERE phone IN (SELECT phone FROM officers) 
           OR phone IN (SELECT phone FROM employees)
      `).run();
    } catch (err) {
      console.error('[SQLite] Error purging conflicting citizen records:', err);
    }


    // 1. Citizen Ramesh
    insertCitizen.run({
      id: 'cit-001',
      name: 'Janmejay Sethi',
      phone: '+917735807328',
      village: 'Sanganer',
      district: 'Jaipur',
      tehsil: 'Sanganer',
    });

    // 2. Employee Rajesh
    insertEmployee.run({
      id: 'emp-001',
      name: 'Chandan',
      phone: '+917749852013',
      designation: 'Junior Engineer (JEn)',
      department: 'PHED — Public Health Engineering Department',
      employee_code: 'PHED-JP-2019-0342',
      posting_location: 'Sub-Division Sanganer, Jaipur',
    });

    // Grievance 1
    insertGrievance.run({
      id: 'RAJ-2024-88421',
      title: 'Water pipeline leak unresolved for 3 weeks — Sanganer, Jaipur',
      description:
        'Main water supply pipeline leaking at Ward 15, Sanganer. Despite repeated complaints to local PHED office, Junior Engineer has not visited the site. Water wastage is causing damage to road and nearby houses. Complaint marked as "Resolved" on portal without actual repair.',
      category: 'Public Health Engineering (PHED) — Water Supply',
      location: 'Ward 15, Sanganer, Jaipur',
      district: 'Jaipur',
      status: 'Escalated to Higher Authority',
      citizen_id: 'cit-001',
      assigned_employee_id: 'emp-001',
      filed_date: '2024-08-15',
      last_updated: '2024-09-10',
    });

    // Citizen 2
    insertCitizen.run({
      id: 'cit-002',
      name: 'Mandal Sahoo',
      phone: '+918249884033',
      village: 'Gudamalani',
      district: 'Barmer',
      tehsil: 'Barmer',
    });

    // Employee 2
    insertEmployee.run({
      id: 'emp-002',
      name: 'Mrityunjay',
      phone: '+919337453713',
      designation: 'Patwari',
      department: 'Revenue Department',
      employee_code: 'REV-BM-2015-0187',
      posting_location: 'Patwar Circle Gudamalani, Barmer',
    });

    // Grievance 2
    insertGrievance.run({
      id: 'RAJ-2024-71205',
      title: 'Pension not disbursed for 6 months — Barmer',
      description:
        'Widow pension (Vidhwa Pension Yojana) stopped since March 2024 without any notice. Multiple visits to Tehsil office yielded no resolution. Patwari says file is pending at SDM office.',
      category: 'Social Justice — Pension Disbursement',
      location: 'Gram Panchayat Gudamalani, Barmer',
      district: 'Barmer',
      status: 'Escalated to Higher Authority',
      citizen_id: 'cit-002',
      assigned_employee_id: 'emp-002',
      filed_date: '2024-06-22',
      last_updated: '2024-09-08',
    });
    // ─── Additional Officers Directory across Rajasthan Departments ───
    const moreEmployees = [
      {
        id: 'emp-003',
        name: 'Ramswaroop Jat',
        phone: '+919414223344',
        designation: 'Tehsildar',
        department: 'Revenue Department (राजस्व विभाग)',
        employee_code: 'REV-JP-2012-0056',
        posting_location: 'Tehsil Office Sanganer, Jaipur',
      },
      {
        id: 'emp-004',
        name: 'Suresh Verma',
        phone: '+919414112233',
        designation: 'Assistant Engineer (AEn)',
        department: 'PHED (जल प्रदाय विभाग)',
        employee_code: 'PHED-JP-2016-0128',
        posting_location: 'Division Jaipur North, PHED',
      },
      {
        id: 'emp-005',
        name: 'Vikas Meena',
        phone: '+919414445566',
        designation: 'Junior Engineer (JEn)',
        department: 'Energy / JVVNL (विद्युत निगम)',
        employee_code: 'JVVNL-JP-2020-0451',
        posting_location: 'AEn Office Malviya Nagar, Jaipur',
      },
      {
        id: 'emp-006',
        name: 'Sunita Sharma',
        phone: '+919414556677',
        designation: 'Block Development Officer (BDO)',
        department: 'Panchayati Raj & Rural Development (पंचायती राज)',
        employee_code: 'PRRD-JP-2014-0089',
        posting_location: 'Panchayat Samiti Sanganer, Jaipur',
      },
      {
        id: 'emp-007',
        name: 'Ratan Lal Meena',
        phone: '+919414667788',
        designation: 'Station House Officer (SHO)',
        department: 'Rajasthan Police (राजस्थान पुलिस)',
        employee_code: 'POL-JP-2010-0234',
        posting_location: 'Police Station Sanganer, Jaipur City',
      },
      {
        id: 'emp-008',
        name: 'Manoj Agarwal',
        phone: '+919414778899',
        designation: 'Executive Engineer (XEn)',
        department: 'PWD (सार्वजनिक निर्माण विभाग)',
        employee_code: 'PWD-JP-2011-0072',
        posting_location: 'PWD City Division, Jaipur',
      },
      {
        id: 'emp-009',
        name: 'Dr. Anita Choudhary',
        phone: '+919414889900',
        designation: 'Chief Medical & Health Officer (CMHO)',
        department: 'Medical & Health Department (चिकित्सा विभाग)',
        employee_code: 'MED-JP-2009-0015',
        posting_location: 'CMHO Office Swasthya Bhawan, Jaipur',
      },
      {
        id: 'emp-010',
        name: 'Rajendra Prasad',
        phone: '+919414990011',
        designation: 'District Supply Officer (DSO)',
        department: 'Food & Civil Supplies (खाद्य एवं रसद विभाग)',
        employee_code: 'FCS-JP-2013-0098',
        posting_location: 'Collectorate Campus, Jaipur',
      },
      {
        id: 'emp-011',
        name: 'Bhanwar Singh',
        phone: '+919414334455',
        designation: 'Nayab Tehsildar',
        department: 'Revenue Department (राजस्व विभाग)',
        employee_code: 'REV-BM-2017-0209',
        posting_location: 'Sub-Tehsil Gudamalani, Barmer',
      },
      {
        id: 'emp-012',
        name: 'Ashok Gehlot',
        phone: '+919829234567',
        designation: 'Assistant Engineer (AEn)',
        department: 'Energy / JVVNL (विद्युत निगम)',
        employee_code: 'JVVNL-JP-2015-0312',
        posting_location: 'Sub-Division Sanganer Rural, Jaipur',
      },
      {
        id: 'emp-013',
        name: 'Devendra Bishnoi',
        phone: '+919829345678',
        designation: 'Gram Vikas Adhikari (VDO)',
        department: 'Panchayati Raj & Rural Development (पंचायती राज)',
        employee_code: 'PRRD-BM-2018-0419',
        posting_location: 'Gram Panchayat Gudamalani, Barmer',
      },
      {
        id: 'emp-014',
        name: 'Geeta Kumari',
        phone: '+919414001122',
        designation: 'Social Welfare Officer',
        department: 'Social Justice & Empowerment (सामाजिक न्याय)',
        employee_code: 'SJE-BM-2016-0165',
        posting_location: 'District Office SJE, Barmer',
      },
    ];

    for (const emp of moreEmployees) {
      insertEmployee.run(emp);
    }
  });

  seedTransaction();
  console.log('[SQLite] Database initialized and seeded successfully.');
}

// ─── Dynamic Database User & Designation Lookup ─────────────────
export interface DatabaseUserRecord {
  id: string;
  name: string;
  phone: string;
  role: 'officer' | 'employee' | 'citizen';
  designation: string;
  department?: string;
  district: string;
  cadre?: string;
  employeeCode?: string;
  village?: string;
  tehsil?: string;
  postingLocation?: string;
}

/**
 * Dynamically look up any user (Collector, SDM, Engineer, Employee, Citizen)
 * from the SQLite database by their mobile number.
 */
export function lookupUserByPhone(inputPhone: string): DatabaseUserRecord | null {
  const cleanDigits = inputPhone.replace(/\D/g, '');
  const bare10 = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits;
  const withPlus91 = `+91${bare10}`;
  const with91 = `91${bare10}`;
  const withZero = `0${bare10}`;

  // 1. Check SQLite officers table (District Collector, DM, SDM, SP, etc.)
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

  // 2. Check SQLite employees table (JEn, AEn, Patwari, VDO, BDO, SHO, etc.)
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
        role: 'employee',
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

  // 3. Check SQLite citizens table (Registered complainants)
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
        designation: 'Citizen / Complainant',
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

export default db;

