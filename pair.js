import { Router } from 'express';
import { makeWaSocket } from './whatsapp.js';
import { globalSessions } from './index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { encodeSession } from './session.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();
const sessionsDir = path.join(__dirname, 'sessions');
fs.mkdirSync(sessionsDir, { recursive: true });

/* |--------------------------------------------------------------------------
| Helpers
|-------------------------------------------------------------------------- */

function cleanNumber(number) {
    return String(number || '').replace(/\D/g, '');
}

function createInternalId() {
    return `pair_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function getSessionPath(internalId) {
    return path.join(sessionsDir, internalId);
}

function createSessionId(internalId) {
    const sessionPath = getSessionPath(internalId);
    if (!fs.existsSync(sessionPath)) {
        throw new Error('Session authentication files are not ready yet.');
    }
    return encodeSession(sessionPath);
}

function ensurePairMap() {
    if (!globalSessions.pair) {
        globalSessions.pair = new Map();
    }
    return globalSessions.pair;
}

/* |--------------------------------------------------------------------------
| GENERATE PAIRING CODE
|-------------------------------------------------------------------------- */

router.post('/', async (req, res) => {
    try {
        const { number } = req.body;

        if (!number) {
            return res.status(400).json({
                success: false,
                message: 'Phone number is required'
            });
        }

        const formattedNumber = cleanNumber(number);

        if (!/^\d{8,15}$/.test(formattedNumber)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid phone number. Please include country code.'
            });
        }

        const internalId = createInternalId();
        const pairSessions = ensurePairMap();

        /* 
         * Create WhatsApp socket.
         * whatsapp.js should create/save the Baileys auth state
         * inside the session directory associated with this ID.
         */
        const result = await makeWaSocket(formattedNumber, internalId, sessionsDir);
        const sock = result?.socket || result;
        const sessionPath = result?.sessionPath || getSessionPath(internalId);

        if (!sock || typeof sock.requestPairingCode !== 'function') {
            throw new Error('WhatsApp socket was not created correctly.');
        }

        /* Generate WhatsApp pairing code. */
        const code = await sock.requestPairingCode(formattedNumber);
        const createdAt = new Date().toISOString();

        const sessionData = {
            internalId,
            number: formattedNumber,
            code,
            timestamp: Date.now(),
            sock,
            socket: sock,
            status: 'waiting',
            type: 'pair',
            createdAt,
            sessionPath,
            sessionId: null,
            connected: false
        };

        pairSessions.set(internalId, sessionData);

        /* Watch the WhatsApp connection. */
        if (sock.ev) {
            sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
                try {
                    const current = pairSessions.get(internalId);
                    if (!current) return;

                    if (connection === 'open') {
                        current.connected = true;
                        current.status = 'connected';
                        current.code = null;

                        /* Give Baileys a moment to finish writing authentication files. */
                        await new Promise(resolve => setTimeout(resolve, 1500));

                        try {
                            const realSessionId = createSessionId(internalId);
                            current.sessionId = realSessionId;
                            current.status = 'active';

                            /* Store the session-success information. */
                            if (!globalSessions.sessionSuccess) {
                                globalSessions.sessionSuccess = new Map();
                            }

                            globalSessions.sessionSuccess.set(realSessionId, {
                                id: realSessionId,
                                type: 'pair',
                                number: formattedNumber,
                                createdAt,
                                status: 'active',
                                internalId,
                                sessionPath
                            });

                            pairSessions.set(internalId, current);
                            console.log(`✅ MARINYAMETECH Session generated for ${formattedNumber}`);

                        } catch (error) {
                            current.status = 'session_generation_failed';
                            current.error = error.message;
                            console.error('❌ Session generation failed:', error.message);
                        }
                    }

                    if (connection === 'close') {
                        current.connected = false;
                        if (current.status !== 'active') {
                            current.status = 'closed';
                        }
                        console.log(`⚠️ WhatsApp connection closed for ${formattedNumber}`);
                        pairSessions.set(internalId, current);
                    }

                } catch (error) {
                    console.error('Connection update error:', error);
                }
            });
        }

        res.json({
            success: true,
            code,
            sessionId: null,
            internalId,
            number: formattedNumber,
            status: 'waiting',
            message: '✅ Pairing code generated successfully!',
            instructions: 'Open WhatsApp > Linked Devices > Link with phone number and enter this code.',
            statusUrl: `/pair/status/${internalId}`,
            channels: {
                telegram: 'https://t.me/marinyametech',
                youtube: 'https://youtube.com/@marinyametech',
                website: 'https://Marinyame.zone.id'
            },
            warning: 'Do NOT share your pairing code or Session ID.'
        });

    } catch (error) {
        console.error('❌ Pairing error:', error);
        let errorMessage = error.message || 'Failed to generate pairing code';

        if (errorMessage.includes('not-authorized')) {
            errorMessage = 'The phone number could not be authorized.';
        } else if (errorMessage.toLowerCase().includes('timeout')) {
            errorMessage = 'Request timed out. Please try again.';
        } else if (errorMessage.includes('rate-overlimit')) {
            errorMessage = 'Too many attempts. Please wait before trying again.';
        }

        res.status(500).json({
            success: false,
            message: errorMessage
        });
    }
});

/* |--------------------------------------------------------------------------
| GENERATE PAIRING CODE WITH REDIRECT
|-------------------------------------------------------------------------- */

router.post('/generate-redirect', async (req, res) => {
    try {
        const { number } = req.body;

        if (!number) {
            return res.status(400).json({
                success: false,
                message: 'Phone number is required'
            });
        }

        const formattedNumber = cleanNumber(number);

        if (!/^\d{8,15}$/.test(formattedNumber)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid phone number.'
            });
        }

        const internalId = createInternalId();
        const pairSessions = ensurePairMap();

        const result = await makeWaSocket(formattedNumber, internalId, sessionsDir);
        const sock = result?.socket || result;
        const sessionPath = result?.sessionPath || getSessionPath(internalId);

        const code = await sock.requestPairingCode(formattedNumber);
        const createdAt = new Date().toISOString();

        pairSessions.set(internalId, {
            internalId,
            number: formattedNumber,
            code,
            timestamp: Date.now(),
            sock,
            socket: sock,
            status: 'waiting',
            type: 'pair',
            createdAt,
            sessionPath,
            sessionId: null,
            connected: false
        });

        if (sock.ev) {
            sock.ev.on('connection.update', async ({ connection }) => {
                const current = pairSessions.get(internalId);
                if (!current) return;

                if (connection === 'open') {
                    current.connected = true;
                    await new Promise(resolve => setTimeout(resolve, 1500));

                    try {
                        current.sessionId = createSessionId(internalId);
                        current.status = 'active';
                        pairSessions.set(internalId, current);
                        console.log('✅ Session generated:', current.sessionId.substring(0, 25) + '...');
                    } catch (error) {
                        current.status = 'session_generation_failed';
                        current.error = error.message;
                        pairSessions.set(internalId, current);
                    }
                }
            });
        }

        res.redirect(`/session/session-success/${internalId}?number=${formattedNumber}&type=pair`);

    } catch (error) {
        console.error('Pairing redirect error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/* |--------------------------------------------------------------------------
| GET ALL PAIR SESSIONS
|-------------------------------------------------------------------------- */

router.get('/sessions', (req, res) => {
    try {
        const pairSessions = ensurePairMap();
        const sessions = Array.from(pairSessions.entries()).map(([id, data]) => ({
            sessionId: data.sessionId,
            internalId: id,
            type: 'pair',
            number: data.number,
            status: data.status || 'active',
            connected: !!data.connected,
            timestamp: data.timestamp,
            createdAt: data.createdAt,
            age: Math.floor((Date.now() - data.timestamp) / 1000)
        }));

        res.json({
            success: true,
            count: sessions.length,
            sessions
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/* |--------------------------------------------------------------------------
| GET SPECIFIC PAIR SESSION
|-------------------------------------------------------------------------- */

router.get('/session/:id', (req, res) => {
    try {
        const { id } = req.params;
        const pairSessions = ensurePairMap();
        const session = pairSessions.get(id);

        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }

        res.json({
            success: true,
            session: {
                internalId: id,
                sessionId: session.sessionId,
                type: 'pair',
                number: session.number,
                status: session.status,
                connected: !!session.connected,
                timestamp: session.timestamp,
                createdAt: session.createdAt,
                age: Math.floor((Date.now() - session.timestamp) / 1000)
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/* |--------------------------------------------------------------------------
| DELETE PAIR SESSION
|-------------------------------------------------------------------------- */

router.delete('/session/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const pairSessions = ensurePairMap();
        const session = pairSessions.get(id);

        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }

        if (session.sock) {
            try {
                if (typeof session.sock.end === 'function') {
                    await session.sock.end();
                }
            } catch (error) {
                console.error('Socket close error:', error.message);
            }
        }

        const sessionPath = session.sessionPath || getSessionPath(id);

        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
        }

        if (session.sessionId && globalSessions.sessionSuccess) {
            globalSessions.sessionSuccess.delete(session.sessionId);
        }

        pairSessions.delete(id);

        res.json({
            success: true,
            message: '✅ Session deleted successfully',
            internalId: id,
            sessionId: session.sessionId,
            deletedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('Delete session error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/* |--------------------------------------------------------------------------
| CHECK PAIRING STATUS
|-------------------------------------------------------------------------- */

router.get('/status/:sessionId', (req, res) => {
    try {
        const { sessionId } = req.params;
        const pairSessions = ensurePairMap();
        const session = pairSessions.get(sessionId);

        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }

        res.json({
            success: true,
            internalId: session.internalId,
            sessionId: session.sessionId,
            number: session.number,
            status: session.status || 'waiting',
            connected: !!session.connected,
            hasCode: !!session.code,
            code: session.connected ? null : session.code,
            sessionReady: !!session.sessionId,
            timestamp: session.timestamp,
            age: Math.floor((Date.now() - session.timestamp) / 1000)
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/* |--------------------------------------------------------------------------
| REGENERATE PAIRING CODE
|-------------------------------------------------------------------------- */

router.post('/regenerate/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const pairSessions = ensurePairMap();
        const session = pairSessions.get(sessionId);

        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }

        if (!session.sock || typeof session.sock.requestPairingCode !== 'function') {
            return res.status(400).json({
                success: false,
                message: 'Session socket not available'
            });
        }

        if (session.connected) {
            return res.status(400).json({
                success: false,
                message: 'WhatsApp is already connected.'
            });
        }

        const newCode = await session.sock.requestPairingCode(session.number);
        session.code = newCode;
        session.timestamp = Date.now();
        session.status = 'waiting';
        pairSessions.set(sessionId, session);

        res.json({
            success: true,
            message: 'Pairing code regenerated successfully',
            internalId: sessionId,
            code: newCode,
            number: session.number
        });

    } catch (error) {
        console.error('Regenerate pairing error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/* |--------------------------------------------------------------------------
| BULK DELETE SESSIONS
|-------------------------------------------------------------------------- */

router.delete('/sessions/bulk', async (req, res) => {
    try {
        const { sessionIds } = req.body;

        if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Session IDs array is required'
            });
        }

        const pairSessions = ensurePairMap();
        let deleted = 0;
        let failed = 0;

        for (const id of sessionIds) {
            try {
                const session = pairSessions.get(id);

                if (!session) {
                    failed++;
                    continue;
                }

                if (session.sock && typeof session.sock.end === 'function') {
                    try {
                        await session.sock.end();
                    } catch {}
                }

                const sessionPath = session.sessionPath || getSessionPath(id);

                if (fs.existsSync(sessionPath)) {
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                }

                if (session.sessionId && globalSessions.sessionSuccess) {
                    globalSessions.sessionSuccess.delete(session.sessionId);
                }

                pairSessions.delete(id);
                deleted++;

            } catch (error) {
                failed++;
                console.error(`Error deleting ${id}:`, error.message);
            }
        }

        res.json({
            success: true,
            message: `Deleted ${deleted} sessions, ${failed} failed`,
            deleted,
            failed
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

export default router;
