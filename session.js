import fs from 'fs';
import path from 'path';

export function encodeSession(sessionPath) {
    try {
        // Check if session path exists
        if (!fs.existsSync(sessionPath)) {
            throw new Error('Session path does not exist');
        }

        // Check if creds.json exists
        const credsPath = path.join(sessionPath, 'creds.json');
        if (!fs.existsSync(credsPath)) {
            throw new Error('creds.json not found in session path');
        }

        // Read the creds file
        const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
        
        // Create session data with MARINYAMETECH format
        const sessionData = {
            clientId: creds.clientId || 'unknown',
            me: creds.me || {},
            platform: creds.platform || 'unknown',
            timestamp: Date.now(),
            sessionPath: sessionPath,
            version: '1.0.0',
            provider: 'MARINYAMETECH'
        };
        
        // Encode as base64
        const encoded = Buffer.from(JSON.stringify(sessionData)).toString('base64');
        
        return encoded;
        
    } catch (error) {
        console.error('❌ Error encoding session:', error);
        throw new Error(`Failed to encode session: ${error.message}`);
    }
}

export function decodeSession(encodedSession) {
    try {
        if (!encodedSession || typeof encodedSession !== 'string') {
            throw new Error('Invalid session ID format');
        }

        // Decode from base64
        const decoded = Buffer.from(encodedSession, 'base64').toString('utf-8');
        const sessionData = JSON.parse(decoded);
        
        return sessionData;
        
    } catch (error) {
        console.error('❌ Error decoding session:', error);
        throw new Error(`Failed to decode session: ${error.message}`);
    }
}

export function validateSession(encodedSession) {
    try {
        const sessionData = decodeSession(encodedSession);
        
        // Check if session path exists
        if (sessionData.sessionPath) {
            const credsPath = path.join(sessionData.sessionPath, 'creds.json');
            return fs.existsSync(credsPath);
        }
        
        return false;
        
    } catch (error) {
        console.error('❌ Session validation failed:', error);
        return false;
    }
}

export function getSessionInfo(encodedSession) {
    try {
        const sessionData = decodeSession(encodedSession);
        return {
            clientId: sessionData.clientId,
            me: sessionData.me || {},
            platform: sessionData.platform,
            timestamp: sessionData.timestamp,
            sessionPath: sessionData.sessionPath,
            version: sessionData.version || '1.0.0',
            provider: sessionData.provider || 'MARINYAMETECH'
        };
    } catch (error) {
        console.error('❌ Error getting session info:', error);
        return null;
    }
}

export default {
    encodeSession,
    decodeSession,
    validateSession,
    getSessionInfo
};
