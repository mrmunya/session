import { Router } from 'express';
import { makeWaSocket } from './whatsapp.js';
import { globalSessions } from './index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// ===== GENERATE PAIRING CODE =====
router.post('/', async (req, res) => {
    try {
        const { number, sessionId } = req.body;
        
        if (!number) {
            return res.status(400).json({
                success: false,
                message: 'Phone number is required'
            });
        }

        // Format the number (remove any non-numeric characters)
        const formattedNumber = number.replace(/[^0-9]/g, '');
        
        // Validate number (basic check)
        if (formattedNumber.length < 10) {
            return res.status(400).json({
                success: false,
                message: 'Invalid phone number. Please include country code.'
            });
        }
        
        // Generate a session ID if not provided
        const sessionIdToUse = sessionId || `pair_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        
        // Create a new WhatsApp socket for pairing
        const sock = await makeWaSocket(formattedNumber);
        
        // Generate pairing code
        const code = await sock.requestPairingCode(formattedNumber);
        
        // Store session in global sessions
        globalSessions.pair.set(sessionIdToUse, {
            number: formattedNumber,
            code: code,
            timestamp: Date.now(),
            sock: sock,
            status: 'paired',
            type: 'pair',
            createdAt: new Date().toISOString()
        });

        // Also store in session success storage
        if (globalSessions.sessionSuccess) {
            globalSessions.sessionSuccess.set(sessionIdToUse, {
                id: sessionIdToUse,
                type: 'pair',
                number: formattedNumber,
                createdAt: new Date().toISOString(),
                status: 'active'
            });
        }

        // Return success response with session info
        res.json({
            success: true,
            code: code,
            sessionId: sessionIdToUse,
            number: formattedNumber,
            message: '✅ Pairing code generated successfully!',
            instructions: 'Open WhatsApp > Linked Devices > Link with phone number and enter this code',
            viewPage: `/session/session-success/${sessionIdToUse}?number=${formattedNumber}&type=pair`,
            channels: {
                telegram: 'https://t.me/marinyametech',
                youtube: 'https://youtube.com/@marinyametech',
                website: 'https://Marinyame.zone.id'
            },
            warning: 'Do NOT share your session ID or pairing code with anyone.'
        });

    } catch (error) {
        console.error('Pairing error:', error);
        
        // Check for specific errors
        let errorMessage = error.message || 'Failed to generate pairing code';
        if (errorMessage.includes('not-authorized')) {
            errorMessage = 'Invalid phone number or not registered on WhatsApp';
        } else if (errorMessage.includes('timeout')) {
            errorMessage = 'Request timed out. Please try again.';
        } else if (errorMessage.includes('rate-overlimit')) {
            errorMessage = 'Too many attempts. Please wait a few minutes.';
        }
        
        res.status(500).json({
            success: false,
            message: errorMessage,
            error: error.message
        });
    }
});

// ===== GENERATE PAIRING CODE WITH REDIRECT =====
router.post('/generate-redirect', async (req, res) => {
    try {
        const { number } = req.body;
        
        if (!number) {
            return res.status(400).json({
                success: false,
                message: 'Phone number is required'
            });
        }

        const formattedNumber = number.replace(/[^0-9]/g, '');
        const sessionId = `pair_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        
        const sock = await makeWaSocket(formattedNumber);
        const code = await sock.requestPairingCode(formattedNumber);
        
        globalSessions.pair.set(sessionId, {
            number: formattedNumber,
            code: code,
            timestamp: Date.now(),
            sock: sock,
            status: 'paired',
            type: 'pair',
            createdAt: new Date().toISOString()
        });

        // Redirect to session success page
        res.redirect(`/session/session-success/${sessionId}?number=${formattedNumber}&type=pair`);

    } catch (error) {
        console.error('Pairing redirect error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ===== GET ALL PAIR SESSIONS =====
router.get('/sessions', (req, res) => {
    try {
        const sessions = Array.from(globalSessions.pair.entries()).map(([id, data]) => ({
            sessionId: id,
            type: 'pair',
            number: data.number,
            code: data.code,
            status: data.status || 'active',
            timestamp: data.timestamp,
            createdAt: data.createdAt || new Date(data.timestamp).toISOString(),
            age: Math.floor((Date.now() - (data.timestamp || Date.now())) / 1000)
        }));
        
        res.json({
            success: true,
            count: sessions.length,
            sessions: sessions
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ===== GET SPECIFIC PAIR SESSION =====
router.get('/session/:id', (req, res) => {
    try {
        const { id } = req.params;
        const session = globalSessions.pair.get(id);
        
        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }

        res.json({
            success: true,
            session: {
                sessionId: id,
                type: 'pair',
                number: session.number,
                code: session.code,
                status: session.status,
                timestamp: session.timestamp,
                createdAt: session.createdAt || new Date(session.timestamp).toISOString(),
                age: Math.floor((Date.now() - (session.timestamp || Date.now())) / 1000)
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ===== DELETE PAIR SESSION =====
router.delete('/session/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const session = globalSessions.pair.get(id);
        
        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }

        // Close socket if exists
        if (session.sock) {
            try {
                await session.sock.logout();
                await session.sock.end();
                await session.sock.destroy();
            } catch (error) {
                console.error('Error closing session socket:', error);
            }
        }

        // Delete session folder if exists
        const sessionPath = path.join(__dirname, 'sessions', id);
        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
        }

        globalSessions.pair.delete(id);
        
        res.json({
            success: true,
            message: '✅ Session deleted successfully',
            sessionId: id,
            deletedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error deleting session:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ===== CHECK PAIRING STATUS =====
router.get('/status/:sessionId', (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = globalSessions.pair.get(sessionId);
        
        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }

        res.json({
            success: true,
            sessionId: sessionId,
            number: session.number,
            status: session.status || 'active',
            hasCode: !!session.code,
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

// ===== REGENERATE PAIRING CODE =====
router.post('/regenerate/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = globalSessions.pair.get(sessionId);
        
        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }

        // Generate new pairing code
        const newCode = await session.sock.requestPairingCode(session.number);
        
        session.code = newCode;
        session.timestamp = Date.now();
        session.status = 'regenerated';
        globalSessions.pair.set(sessionId, session);

        res.json({
            success: true,
            message: 'Pairing code regenerated successfully',
            sessionId: sessionId,
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

// ===== BULK DELETE SESSIONS =====
router.delete('/sessions/bulk', async (req, res) => {
    try {
        const { sessionIds } = req.body;
        
        if (!sessionIds || !Array.isArray(sessionIds) || sessionIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Session IDs array is required'
            });
        }

        let deleted = 0;
        let failed = 0;

        for (const id of sessionIds) {
            try {
                const session = globalSessions.pair.get(id);
                if (session) {
                    if (session.sock) {
                        await session.sock.logout();
                        await session.sock.end();
                        await session.sock.destroy();
                    }
                    globalSessions.pair.delete(id);
                    deleted++;
                } else {
                    failed++;
                }
            } catch (error) {
                failed++;
                console.error(`Error deleting session ${id}:`, error);
            }
        }

        res.json({
            success: true,
            message: `Deleted ${deleted} sessions, ${failed} failed`,
            deleted: deleted,
            failed: failed
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

export default router;
