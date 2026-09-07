import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';

import { Boom } from '@hapi/boom';
import path from 'path';
import fs from 'fs';

/* |--------------------------------------------------------------------------
| CREATE WHATSAPP SOCKET
|-------------------------------------------------------------------------- */

export async function makeWaSocket(
    phoneNumber,
    internalId,
    sessionsDir
) {
    try {
        if (!phoneNumber) {
            throw new Error(
                'Phone number is required'
            );
        }

        if (!internalId) {
            throw new Error(
                'Internal session ID is required'
            );
        }

        if (!sessionsDir) {
            throw new Error(
                'Sessions directory is required'
            );
        }

        /*
         * Create a separate directory for this
         * temporary/internal session.
         */
        const sessionPath = path.join(
            sessionsDir,
            internalId
        );

        fs.mkdirSync(
            sessionPath,
            {
                recursive: true
            }
        );

        console.log(
            `📱 Creating WhatsApp socket for ${phoneNumber}`
        );

        console.log(
            `📁 Session path: ${sessionPath}`
        );

        /*
         * Get the currently supported Baileys
         * WhatsApp version.
         */
        const {
            version,
            isLatest
        } = await fetchLatestBaileysVersion();

        console.log(
            `📦 Baileys version: ${version.join('.')}`
        );

        console.log(
            `📦 Latest version: ${isLatest ? 'yes' : 'no'}`
        );

        /*
         * Multi-file authentication.
         *
         * This creates:
         *
         * creds.json
         * app-state-sync-key-*.json
         * sender-key-*.json
         * session-*.json
         * etc.
         *
         * These files are what session.js later
         * packages into MARINYAMETECH~...
         */
        const {
            state,
            saveCreds
        } = await useMultiFileAuthState(
            sessionPath
        );

        /*
         * Create WhatsApp socket.
         */
        const sock = makeWASocket({
            version,

            auth: state,

            printQRInTerminal: false,

            browser: [
                'MARINYAMETECH',
                'Chrome',
                '1.0.0'
            ],

            syncFullHistory: false,

            markOnlineOnConnect: false,

            generateHighQualityLinkPreview: true,

            defaultQueryTimeoutMs: 30000,

            connectTimeoutMs: 30000,

            keepAliveIntervalMs: 30000,

            /*
             * Message compatibility patch.
             */
            patchMessageBeforeSending: (
                message
            ) => {
                const requiresPatch = !!(
                    message.buttonsMessage ||
                    message.templateMessage ||
                    message.listMessage
                );

                if (requiresPatch) {
                    message = {
                        viewOnceMessage: {
                            message: {
                                messageContextInfo: {
                                    deviceListMetadata: {},
                                    deviceListMetadataVersion: 2
                                },

                                ...message
                            }
                        }
                    };
                }

                return message;
            },

            /*
             * Optional message retrieval.
             */
            getMessage: async () => {
                return undefined;
            }
        });

        /*
         * CRITICAL:
         *
         * Always save Baileys credential updates.
         */
        sock.ev.on(
            'creds.update',
            saveCreds
        );

        /*
         * Connection events.
         *
         * pair.js also listens for connection.update
         * to generate the final Session ID.
         */
        sock.ev.on(
            'connection.update',
            ({
                connection,
                lastDisconnect
            }) => {
                if (
                    connection === 'open'
                ) {
                    console.log(
                        `✅ WhatsApp connected successfully for ${phoneNumber}`
                    );

                    /*
                     * Check whether creds.json exists.
                     */
                    const credsPath =
                        path.join(
                            sessionPath,
                            'creds.json'
                        );

                    if (
                        fs.existsSync(
                            credsPath
                        )
                    ) {
                        console.log(
                            `✅ Auth state saved: ${sessionPath}`
                        );
                    } else {
                        console.warn(
                            '⚠️ creds.json has not appeared yet.'
                        );
                    }
                }

                if (
                    connection === 'close'
                ) {
                    const statusCode =
                        new Boom(
                            lastDisconnect?.error
                        )?.output
                            ?.statusCode;

                    const shouldReconnect =
                        statusCode !==
                        DisconnectReason.loggedOut;

                    console.log(
                        `🔌 Connection closed for ${phoneNumber}`,
                        {
                            statusCode,
                            shouldReconnect
                        }
                    );

                    if (
                        statusCode ===
                        DisconnectReason.loggedOut
                    ) {
                        console.log(
                            `🚪 WhatsApp session logged out: ${phoneNumber}`
                        );
                    } else if (
                        shouldReconnect
                    ) {
                        console.log(
                            `🔄 Connection can be recreated for ${phoneNumber}`
                        );
                    }
                }
            }
        );

        console.log(
            `✅ WhatsApp socket created for ${phoneNumber}`
        );

        /*
         * Return everything pair.js needs.
         */
        return {
            socket: sock,

            sessionPath,

            saveCreds,

            state,

            internalId,

            phoneNumber
        };

    } catch (error) {
        console.error(
            '❌ Error creating WhatsApp socket:',
            error
        );

        throw error;
    }
}

/* |--------------------------------------------------------------------------
| GET SESSION STATUS
|-------------------------------------------------------------------------- */

export async function getSessionStatus(
    sessionPath
) {
    try {
        if (!sessionPath) {
            return {
                status: 'error',
                message:
                    'Session path is required'
            };
        }

        const credsPath =
            path.join(
                sessionPath,
                'creds.json'
            );

        if (
            !fs.existsSync(
                credsPath
            )
        ) {
            return {
                status: 'not_initialized',
                message:
                    'Session not initialized',
                sessionPath
            };
        }

        const creds =
            JSON.parse(
                fs.readFileSync(
                    credsPath,
                    'utf8'
                )
            );

        const files =
            fs.readdirSync(
                sessionPath
            );

        const jsonFiles =
            files.filter(
                file =>
                    file.endsWith('.json')
            );

        return {
            status: 'active',

            sessionPath,

            clientId:
                creds.clientId ||
                null,

            me:
                creds.me ||
                {},

            registered:
                !!creds.registered,

            platform:
                creds.platform ||
                'unknown',

            authFiles:
                jsonFiles.length,

            timestamp:
                new Date().toISOString()
        };

    } catch (error) {
        console.error(
            '❌ Error getting session status:',
            error
        );

        return {
            status: 'error',

            message:
                error.message,

            sessionPath
        };
    }
}

/* |--------------------------------------------------------------------------
| SEND MESSAGE
|-------------------------------------------------------------------------- */

export async function sendMessage(
    sock,
    jid,
    text,
    options = {}
) {
    try {
        if (
            !sock ||
            typeof sock.sendMessage !==
                'function'
        ) {
            throw new Error(
                'Invalid WhatsApp socket'
            );
        }

        if (!jid) {
            throw new Error(
                'JID is required'
            );
        }

        const response =
            await sock.sendMessage(
                jid,
                {
                    text,
                    ...options
                }
            );

        return {
            success: true,
            response,
            jid,
            timestamp:
                new Date().toISOString()
        };

    } catch (error) {
        console.error(
            '❌ Failed to send message:',
            error
        );

        return {
            success: false,
            error:
                error.message,
            jid,
            timestamp:
                new Date().toISOString()
        };
    }
}

/* |--------------------------------------------------------------------------
| GET CONNECTION STATUS
|-------------------------------------------------------------------------- */

export async function getConnectionStatus(
    sock
) {
    try {
        const user =
            sock?.user || null;

        const connected =
            !!user?.id;

        return {
            connected,

            user,

            status:
                connected
                    ? 'connected'
                    : 'disconnected',

            timestamp:
                new Date().toISOString()
        };

    } catch (error) {
        return {
            connected: false,

            status: 'error',

            error:
                error.message,

            timestamp:
                new Date().toISOString()
        };
    }
}

/* |--------------------------------------------------------------------------
| LOGOUT SESSION
|-------------------------------------------------------------------------- */

export async function logoutSession(
    sock
) {
    try {
        if (
            sock &&
            typeof sock.logout ===
                'function'
        ) {
            await sock.logout();

            return {
                success: true,
                message:
                    'Successfully logged out'
            };
        }

        return {
            success: false,
            message:
                'Socket unavailable'
        };

    } catch (error) {
        console.error(
            '❌ Error logging out:',
            error
        );

        return {
            success: false,
            error:
                error.message
        };
    }
}

/* |--------------------------------------------------------------------------
| CLEANUP SESSION FOLDER
|-------------------------------------------------------------------------- */

export function cleanupSessionFolder(
    sessionPath
) {
    try {
        if (
            !sessionPath
        ) {
            return {
                success: false,
                error:
                    'Session path is required'
            };
        }

        if (
            fs.existsSync(
                sessionPath
            )
        ) {
            fs.rmSync(
                sessionPath,
                {
                    recursive: true,
                    force: true
                }
            );

            return {
                success: true,
                message:
                    'Session folder cleaned up'
            };
        }

        return {
            success: true,
            message:
                'Session folder already removed'
        };

    } catch (error) {
        console.error(
            '❌ Error cleaning session:',
            error
        );

        return {
            success: false,
            error:
                error.message
        };
    }
}

/* |--------------------------------------------------------------------------
| LIST ALL SESSIONS
|-------------------------------------------------------------------------- */

export function listAllSessions(
    sessionsDir
) {
    try {
        if (
            !sessionsDir ||
            !fs.existsSync(
                sessionsDir
            )
        ) {
            return [];
        }

        return fs
            .readdirSync(
                sessionsDir
            )
            .filter(
                dir => {
                    const credsPath =
                        path.join(
                            sessionsDir,
                            dir,
                            'creds.json'
                        );

                    return fs.existsSync(
                        credsPath
                    );
                }
            )
            .map(dir => {
                const sessionPath =
                    path.join(
                        sessionsDir,
                        dir
                    );

                const credsPath =
                    path.join(
                        sessionPath,
                        'creds.json'
                    );

                try {
                    const creds =
                        JSON.parse(
                            fs.readFileSync(
                                credsPath,
                                'utf8'
                            )
                        );

                    return {
                        internalId:
                            dir,

                        sessionPath,

                        clientId:
                            creds.clientId ||
                            null,

                        me:
                            creds.me ||
                            {},

                        registered:
                            !!creds.registered,

                        timestamp:
                            creds.timestamp ||
                            null
                    };

                } catch {
                    return {
                        internalId:
                            dir,

                        sessionPath,

                        error:
                            'Invalid credentials'
                    };
                }
            });

    } catch (error) {
        console.error(
            '❌ Error listing sessions:',
            error
        );

        return [];
    }
}

/* |--------------------------------------------------------------------------
| DEFAULT EXPORT
|-------------------------------------------------------------------------- */

export default makeWaSocket;
