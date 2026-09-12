/**
 * Jan Sunwai Video Call Platform — Server Entry Point
 *
 * Bootstraps the Express HTTP server with:
 * - CORS-enabled REST API
 * - WebSocket server for real-time VoIP call signaling
 * - Health check endpoint
 *
 * The WebSocket server handles:
 * - Client registration (phone-number-based identity)
 * - Incoming call ring signals
 * - Call state broadcasts (accepted, declined, ended)
 *
 * Usage:
 *   npm run dev    — Start with ts-node (development)
 *   npm run build  — Compile TypeScript
 *   npm start      — Run compiled JavaScript (production)
 */

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';

// Routes
import authRoutes from './routes/auth';
import samparkRoutes from './routes/sampark';
import callRoutes from './routes/calls';
import livekitService from './services/livekit';

// Database
import { initializeDatabase } from './db/database';


// Services
import callManager from './services/callManager';

// Initialize SQLite Database
initializeDatabase();

// ─── Configuration ────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3001', 10);
const app = express();

// ─── Middleware ────────────────────────────────────────────────

app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
}));

app.use(express.json());

// Request logging
app.use((req, _res, next) => {
  if (req.url !== '/api/health') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  }
  next();
});

// ─── API Routes ───────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api/sampark', samparkRoutes);
app.use('/api/calls', callRoutes);

// ─── LiveKit Token Endpoint (Web & Mobile Apps) ───────────────
app.post('/api/livekit/token', async (req, res) => {
  try {
    const { roomName, participantName, participantRole, identity } = req.body;
    if (!roomName || !participantName) {
      res.status(400).json({ error: 'roomName and participantName are required' });
      return;
    }
    const isHost = participantRole === 'officer' || participantRole === 'collector';
    const userIdentity = identity || `${participantRole || 'user'}_${Date.now()}`;

    const token = await livekitService.generateToken({
      identity: userIdentity,
      name: participantName,
      roomName,
      isHost,
      ttl: '2h',
    });

    console.log(`[LiveKit] Issued token for ${participantName} (${participantRole || 'citizen'}) in room ${roomName}`);

    res.json({
      success: true,
      token,
      roomName,
      serverUrl: process.env.LIVEKIT_URL || 'wss://jan-sunwai-demo-y7hrzb7k.livekit.cloud',
    });
  } catch (error: any) {
    console.error('[LiveKit] Error generating token:', error);
    res.status(500).json({ error: error.message || 'Failed to generate token' });
  }
});


// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Jan Sunwai Video Call Platform — Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    livekit: {
      url: process.env.LIVEKIT_URL || 'ws://localhost:7880',
      configured: !!(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET),
    },
  });
});

// API documentation
app.get('/api', (_req, res) => {
  res.json({
    name: 'Jan Sunwai Video Call Platform API',
    version: '1.0.0',
    endpoints: {
      auth: {
        'POST /api/auth/otp/send': 'Send OTP to mobile number',
        'POST /api/auth/otp/verify': 'Verify OTP → JWT + user profile',
        'GET /api/auth/me': 'Get current user profile',
      },
      sampark: {
        'GET /api/sampark/grievance/:id': 'Fetch grievance details + contacts',
        'GET /api/sampark/grievances': 'List all grievances',
        'GET /api/sampark/officers?q=': 'Search officer directory',
      },
      calls: {
        'POST /api/calls/initiate': 'Start multi-party hearing (ring all)',
        'POST /api/calls/:id/respond': 'Accept or decline incoming call',
        'POST /api/calls/:id/add-officer': 'Add officer mid-call',
        'GET  /api/calls/:id/token': 'Get LiveKit join token',
        'POST /api/calls/:id/end': 'End hearing call',
        'GET  /api/calls': 'List active calls',
        'GET  /api/calls/:id': 'Get call details',
      },
      health: {
        'GET /api/health': 'Server health check',
      },
    },
    websocket: {
      url: `ws://localhost:${PORT}/ws?phone=<phone_number>`,
      events: [
        'incoming_call — Phone rings with caller info',
        'call_accepted — Participant joined the hearing',
        'call_declined — Participant declined',
        'call_ended — Hearing terminated',
      ],
    },
  });
});

// ─── HTTP + WebSocket Server ──────────────────────────────────

const server = http.createServer(app);

const wss = new WebSocketServer({
  server,
  path: '/ws',
});

/**
 * WebSocket connection handler.
 *
 * Clients connect with their phone number as identity:
 *   ws://localhost:3001/ws?phone=+919876543210
 *
 * This registers them for incoming VoIP call signals.
 * When a call is initiated, the server pushes an `incoming_call`
 * event to all connected sockets for that phone number.
 */
wss.on('connection', (ws: WebSocket, req) => {
  // Extract phone number from query string
  const url = new URL(req.url || '', `http://localhost:${PORT}`);
  const phone = url.searchParams.get('phone');

  if (!phone) {
    ws.close(4001, 'Phone number required in query: ?phone=+919876543210');
    return;
  }

  console.log(`[WebSocket] Client connected: ${phone}`);

  // Register this connection for call signaling
  callManager.registerClient(phone, ws);

  // Send connection confirmation
  ws.send(JSON.stringify({
    type: 'connected',
    data: {
      phone,
      message: 'Connected to Jan Sunwai Call Signaling Server',
      timestamp: new Date().toISOString(),
    },
  }));

  // Handle incoming messages from client
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`[WebSocket] Message from ${phone}:`, message.type);

      // Handle client-side call actions via WebSocket
      switch (message.type) {
        case 'call_response':
          // Client accepts/declines call via WebSocket instead of REST
          callManager.respondToCall(message.callId, phone, message.action);
          break;
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;
        default:
          console.log(`[WebSocket] Unknown message type: ${message.type}`);
      }
    } catch (err) {
      console.error(`[WebSocket] Error parsing message from ${phone}:`, err);
    }
  });

  // Heartbeat ping every 30 seconds
  const heartbeat = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }, 30_000);

  // Cleanup on disconnect
  ws.on('close', () => {
    clearInterval(heartbeat);
    callManager.unregisterClient(phone, ws);
    console.log(`[WebSocket] Client disconnected: ${phone}`);
  });

  ws.on('error', (err) => {
    console.error(`[WebSocket] Error for ${phone}:`, err);
    clearInterval(heartbeat);
    callManager.unregisterClient(phone, ws);
  });
});

// ─── Start Server ─────────────────────────────────────────────

server.listen(PORT, () => {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                                                               ║');
  console.log('║   🏛️  Jan Sunwai Video Call Platform — Backend Server          ║');
  console.log('║                                                               ║');
  console.log(`║   HTTP API:    http://localhost:${PORT}/api                      ║`);
  console.log(`║   WebSocket:   ws://localhost:${PORT}/ws?phone=<phone>           ║`);
  console.log(`║   Health:      http://localhost:${PORT}/api/health               ║`);
  console.log('║                                                               ║');
  console.log(`║   LiveKit URL: ${process.env.LIVEKIT_URL || 'ws://localhost:7880'}                   ║`);
  console.log('║                                                               ║');
  console.log('║   Dev OTP:     123456 (for all phone numbers)                 ║');
  console.log('║                                                               ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');
});

export default server;
