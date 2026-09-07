import express from 'express';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';
import path from 'path';

// Import routers
import pairRouter from './pair.js';
import sessionRouter from './session.js';

// Resolve directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8000;

// ===== GLOBAL SESSION STORAGE =====
export const globalSessions = {
    pair: new Map(),
    sessionSuccess: new Map() // For session success tracking
};

// Increase max listeners to handle multiple connections
import('events').then(events => {
    events.EventEmitter.defaultMaxListeners = 500;
});

// ===== MIDDLEWARE =====
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// ===== ROUTES =====

// Home page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'pair.html'));
});

// Use routers
app.use('/pair', pairRouter);
app.use('/session', sessionRouter);

// ===== API ROUTES =====

// Get all sessions
app.get('/api/sessions', (req, res) => {
    try {
        const pairSessions = Array.from(globalSessions.pair.entries()).map(([id, data]) => ({
            sessionId: id,
            type: 'pair',
            number: data.number,
            status: data.status || 'active',
            timestamp: data.timestamp,
            createdAt: data.createdAt || new Date(data.timestamp).toISOString(),
            age: Math.floor((Date.now() - (data.timestamp || Date.now())) / 1000)
        }));

        res.json({
            success: true,
            total: pairSessions.length,
            sessions: pairSessions
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get specific session by ID
app.get('/api/session/:id', (req, res) => {
    try {
        const { id } = req.params;
        
        // Check in pair sessions
        let session = globalSessions.pair.get(id);
        let type = 'pair';
        
        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }

        const response = {
            success: true,
            session: {
                sessionId: id,
                type: type,
                ...session,
                createdAt: session.createdAt || new Date(session.timestamp).toISOString()
            }
        };

        // Don't send sensitive data
        if (response.session.sock) {
            delete response.session.sock;
        }

        res.json(response);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Delete session by ID
app.delete('/api/session/:id', async (req, res) => {
    try {
        const { id } = req.params;
        let deleted = false;
        let session = null;

        // Check in pair sessions
        if (globalSessions.pair.has(id)) {
            session = globalSessions.pair.get(id);
            if (session.sock) {
                try {
                    await session.sock.logout();
                    await session.sock.end();
                    await session.sock.destroy();
                } catch (error) {
                    console.error('Error logging out session:', error);
                }
            }
            globalSessions.pair.delete(id);
            deleted = true;
        }

        // Also delete from session success storage
        if (globalSessions.sessionSuccess.has(id)) {
            globalSessions.sessionSuccess.delete(id);
        }

        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }

        res.json({
            success: true,
            message: 'Session deleted successfully',
            sessionId: id,
            deletedAt: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get session statistics
app.get('/api/stats', (req, res) => {
    try {
        const pairCount = globalSessions.pair.size;
        const total = pairCount;

        res.json({
            success: true,
            stats: {
                totalSessions: total,
                pairSessions: pairCount,
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                memoryUsage: process.memoryUsage(),
                nodeVersion: process.version,
                platform: process.platform
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Clean up all expired sessions
app.post('/api/cleanup', (req, res) => {
    try {
        const now = Date.now();
        const maxAge = 30 * 60 * 1000; // 30 minutes
        let cleaned = 0;

        // Clean pair sessions
        for (const [id, data] of globalSessions.pair.entries()) {
            const timestamp = data.timestamp || Date.now();
            if (now - timestamp > maxAge) {
                if (data.sock) {
                    try {
                        data.sock.end();
                        data.sock.destroy();
                    } catch (error) {
                        // Ignore errors
                    }
                }
                globalSessions.pair.delete(id);
                cleaned++;
            }
        }

        res.json({
            success: true,
            message: `Cleaned up ${cleaned} expired sessions`,
            cleaned: cleaned,
            remaining: globalSessions.pair.size
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ===== HEALTH CHECK =====
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        sessions: {
            pair: globalSessions.pair.size,
            total: globalSessions.pair.size
        },
        memory: process.memoryUsage()
    });
});

// ===== ERROR HANDLING =====
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        message: err.message || 'Internal Server Error',
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// ===== START SERVER =====
app.listen(PORT, () => {
    console.log('🚀 ====================================');
    console.log('📱 WhatsApp Bot Server');
    console.log('🚀 ====================================');
    console.log(`🔗 Server running on http://localhost:${PORT}`);
    console.log('📋 ====================================');
    console.log('📋 Available Endpoints:');
    console.log('   GET  /                     - Home page');
    console.log('   GET  /health               - Health check');
    console.log('   GET  /api/sessions         - List all sessions');
    console.log('   GET  /api/session/:id      - Get session details');
    console.log('   DELETE /api/session/:id    - Delete a session');
    console.log('   GET  /api/stats            - Session statistics');
    console.log('   POST /api/cleanup          - Clean expired sessions');
    console.log('📋 ====================================');
    console.log('🔑 Pair Endpoints:');
    console.log('   POST /pair                 - Generate pairing code');
    console.log('   GET  /pair/sessions        - List pair sessions');
    console.log('   GET  /pair/session/:id     - Get pair session');
    console.log('   DELETE /pair/session/:id   - Delete pair session');
    console.log('📋 Session Endpoints:');
    console.log('   GET  /session/sessions     - List all sessions');
    console.log('   GET  /session/:id          - Get session details');
    console.log('   DELETE /session/:id        - Delete session');
    console.log('   GET  /session/session-success/:id - Success page');
    console.log('🚀 ====================================');
    console.log('👨‍💻 YouTube: @marinyametech');
    console.log('🐙 GitHub: @mrmosesclr');
    console.log('🚀 ====================================');
});

// ===== AUTO CLEANUP =====
// Clean up old sessions every 5 minutes
setInterval(() => {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes
    let cleaned = 0;

    // Clean pair sessions
    for (const [id, data] of globalSessions.pair.entries()) {
        const timestamp = data.timestamp || Date.now();
        if (now - timestamp > maxAge) {
            if (data.sock) {
                try {
                    data.sock.end();
                    data.sock.destroy();
                } catch (error) {
                    // Ignore errors
                }
            }
            globalSessions.pair.delete(id);
            cleaned++;
        }
    }

    if (cleaned > 0) {
        console.log(`🧹 Auto-cleaned ${cleaned} expired sessions`);
    }
}, 5 * 60 * 1000);

export default app;
