/**
 * Authentication Routes — Jan Sunwai Video Call Platform
 *
 * Mobile-number-based OTP authentication (like WhatsApp).
 * All users log in with their phone number verified via OTP.
 *
 * In production, integrates with Rajasthan Sampark employee directory
 * for automatic role assignment. In development, uses mock OTPs.
 *
 * Routes:
 *   POST /api/auth/otp/send   — Send OTP to mobile number
 *   POST /api/auth/otp/verify — Verify OTP and return JWT + user profile
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';

const router = Router();

import db, { lookupUserByPhone } from '../db/database';

// ─── Types ────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  phone: string;
  name: string;
  role: 'officer' | 'employee' | 'citizen' | 'admin';
  designation?: string;
  department?: string;
  district?: string;
  employeeCode?: string;
}

// ─── Mock OTP Store (Development) ─────────────────────────────

/** In-memory OTP store: phone → { otp, expiresAt } */
const otpStore = new Map<string, { otp: string; expiresAt: number }>();

/** Development bypass: OTP "987654" (demo OTP) */
const DEV_OTP = '987654';

/**
 * Look up user profile dynamically from SQLite database (officers, employees, citizens).
 * Automatically detects whether the number belongs to a Collector, SDM, Engineer, Employee, or Citizen.
 */
export function getUserProfileByPhone(phone: string): UserProfile | null {
  const dbUser = lookupUserByPhone(phone);
  if (dbUser) {
    return {
      id: dbUser.id,
      phone: dbUser.phone,
      name: dbUser.name,
      role: dbUser.role,
      designation: dbUser.designation,
      department: dbUser.department,
      district: dbUser.district,
      employeeCode: dbUser.employeeCode,
    };
  }
  return null;
}


// ─── Helper Functions ─────────────────────────────────────────

function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+91')) return cleaned;
  if (cleaned.startsWith('91') && cleaned.length === 12) return `+${cleaned}`;
  if (cleaned.length === 10) return `+91${cleaned}`;
  return cleaned;
}

function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Simple JWT-like token generation for development.
 * In production, use a proper JWT library with RS256 signing.
 */
function generateAuthToken(user: UserProfile): string {
  const payload = {
    userId: user.id,
    phone: user.phone,
    role: user.role,
    name: user.name,
    iat: Date.now(),
    exp: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/**
 * Decode and validate a dev auth token.
 */
export function decodeAuthToken(token: string): UserProfile | null {
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    const phone = payload.phone as string;
    return getUserProfileByPhone(phone) || {
      id: payload.userId,
      phone: payload.phone,
      name: payload.name,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

// ─── Routes ───────────────────────────────────────────────────

/**
 * POST /api/auth/otp/send
 *
 * Send a one-time password to the given mobile number.
 * In development, logs the OTP to console. In production,
 * integrates with Rajasthan State SMS gateway.
 *
 * Body: { phone: "+919876543210" }
 */
router.post('/otp/send', (req: Request, res: Response) => {
  const { phone } = req.body;

  if (!phone) {
    res.status(400).json({ error: 'Phone number is required' });
    return;
  }

  const normalizedPhone = normalizePhone(phone);

  // Generate OTP (in dev, always "123456")
  const otp = process.env.NODE_ENV === 'production' ? generateOtp() : DEV_OTP;
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

  otpStore.set(normalizedPhone, { otp, expiresAt });

  console.log(`[Auth] OTP for ${normalizedPhone}: ${otp}`);

  // Check if user exists in SQLite database or officer directory
  const existingUser = getUserProfileByPhone(normalizedPhone);

  res.json({
    success: true,
    message: `OTP sent to ${normalizedPhone}`,
    userExists: !!existingUser,
    detectedRole: existingUser?.role || 'citizen',
    userName: existingUser?.name || null,
    designation: existingUser?.designation || (existingUser ? 'Citizen' : 'New Citizen'),
    department: existingUser?.department || null,
    district: existingUser?.district || 'Rajasthan',
    // In dev mode, include OTP in response for easy testing
    ...(process.env.NODE_ENV !== 'production' && { devOtp: otp }),
  });
});

/**
 * POST /api/auth/otp/verify
 *
 * Verify the OTP and return a session token + user profile.
 * If the phone number is recognized in SQLite (citizens/employees/officers),
 * the user's role and designation are automatically assigned.
 *
 * Body: { phone: "+919876543210", otp: "123456" }
 */
router.post('/otp/verify', (req: Request, res: Response) => {
  const { phone, otp, requestedRole, name } = req.body;

  if (!phone || !otp) {
    res.status(400).json({ error: 'Phone and OTP are required' });
    return;
  }

  const normalizedPhone = normalizePhone(phone);
  const stored = otpStore.get(normalizedPhone);

  // Validate OTP (allow DEV_OTP in non-production)
  const isValidDevOtp = process.env.NODE_ENV !== 'production' && (otp === '987654' || otp === '123456');
  if (!isValidDevOtp) {
    if (!stored) {
      res.status(400).json({ error: 'OTP not found. Please request a new OTP.' });
      return;
    }

    if (Date.now() > stored.expiresAt) {
      otpStore.delete(normalizedPhone);
      res.status(400).json({ error: 'OTP expired. Please request a new OTP.' });
      return;
    }

    if (stored.otp !== otp) {
      res.status(400).json({ error: 'Invalid OTP' });
      return;
    }
  }

  // Clear OTP
  otpStore.delete(normalizedPhone);

  // Look up user dynamically from SQLite database (officers, employees, citizens)
  let user: UserProfile | null = getUserProfileByPhone(normalizedPhone);

  if (!user) {
    const assignedRole = requestedRole === 'employee' ? 'employee' : requestedRole === 'officer' ? 'officer' : 'citizen';
    const assignedName = name || (assignedRole === 'citizen' ? `Citizen (${normalizedPhone.slice(-4)})` : `Officer (${normalizedPhone.slice(-4)})`);
    const newId = `cit-${Date.now()}`;

    // Automatically persist newly registered citizen into SQLite database!
    try {
      db.prepare(`
        INSERT OR IGNORE INTO citizens (id, name, phone, village, district, tehsil)
        VALUES (?, ?, ?, 'Jaipur', 'Rajasthan', 'Jaipur')
      `).run(newId, assignedName, normalizedPhone);
    } catch (e) {
      console.error('[Auth] Error inserting new citizen into SQLite:', e);
    }

    user = {
      id: newId,
      phone: normalizedPhone,
      name: assignedName,
      role: assignedRole,
      designation: assignedRole === 'citizen' ? 'Citizen' : 'Field Officer',
      district: 'Rajasthan',
    };
  }


  // Generate auth token
  const token = generateAuthToken(user);

  console.log(`[Auth] User logged in: ${user.name} (${user.role}) — ${normalizedPhone}`);

  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      phone: user.phone,
      name: user.name,
      role: user.role,
      designation: user.designation,
      department: user.department,
      district: user.district,
      employeeCode: user.employeeCode,
    },
  });
});

/**
 * GET /api/auth/me
 *
 * Get the current authenticated user's profile.
 * Requires Authorization: Bearer <token> header.
 */
router.get('/me', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = authHeader.split(' ')[1];
  const user = decodeAuthToken(token);

  if (!user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  res.json({ user });
});

export default router;
