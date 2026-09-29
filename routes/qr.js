const {
    BMX_BOTId,
    removeFile
} = require('../ids');

const QRCode = require('qrcode');
const express = require('express');
const path = require('path');
const fs = require('fs');
const pino = require('pino');

const {
    default: makeWASocket,
    useMultiFileAuthState,
    Browsers,
    delay,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const router = express.Router();

const sessionDir = path.join(__dirname, 'session');

router.get('/', async (req, res) => {
    const id = BMX_BOTId();

    let responseSent = false;
    let sessionCleanedUp = false;

    async function cleanUpSession() {
        if (!sessionCleanedUp) {
            try {
                await removeFile(
                    path.join(sessionDir, id)
                );
            } catch (error) {
                console.error(
                    'Cleanup error:',
                    error
                );
            }

            sessionCleanedUp = true;
        }
    }

    async function BMX_BOT_QR_CODE() {
        try {
            const { version } =
                await fetchLatestBaileysVersion();

            console.log('Baileys version:', version);

            const { state, saveCreds } =
                await useMultiFileAuthState(
                    path.join(sessionDir, id)
                );

            const sock = makeWASocket({
                version,

                auth: state,

                printQRInTerminal: false,

                logger: pino({
                    level: 'silent'
                }),

                browser: Browsers.macOS('Desktop'),

                connectTimeoutMs: 60000,

                keepAliveIntervalMs: 30000
            });

            sock.ev.on(
                'creds.update',
                saveCreds
            );

            sock.ev.on(
                'connection.update',
                async update => {
                    const {
                        connection,
                        lastDisconnect,
                        qr
                    } = update;

                    /*
                     * QR CODE
                     */
                    if (
                        qr &&
                        !responseSent
                    ) {
                        try {
                            const qrImage =
                                await QRCode.toDataURL(
                                    qr
                                );

                            if (!res.headersSent) {
                                res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>BMX-BOT-MD | QR CODE</title>

    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
    >

    <style>
        body {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background-color: #000;
            font-family: Arial, sans-serif;
            color: #fff;
            text-align: center;
            padding: 20px;
            box-sizing: border-box;
        }

        .container {
            width: 100%;
            max-width: 600px;
        }

        .qr-container {
            position: relative;
            margin: 20px auto;
            width: 300px;
            height: 300px;

            display: flex;
            justify-content: center;
            align-items: center;
        }

        .qr-code {
            width: 300px;
            height: 300px;
            padding: 10px;
            background: white;
            border-radius: 20px;

            box-shadow:
                0 0 0 10px rgba(255,255,255,0.1),
                0 0 0 20px rgba(255,255,255,0.05),
                0 0 30px rgba(255,255,255,0.2);
        }

        .qr-code img {
            width: 100%;
            height: 100%;
        }

        h1 {
            color: #fff;
            margin: 0 0 15px 0;
            font-size: 28px;
            font-weight: 800;

            text-shadow:
                0 0 10px rgba(255,255,255,0.3);
        }

        p {
            color: #ccc;
            margin: 20px 0;
            font-size: 16px;
        }

        .back-btn {
            display: inline-block;

            padding: 12px 25px;
            margin-top: 15px;

            background:
                linear-gradient(
                    135deg,
                    #6e48aa 0%,
                    #9d50bb 100%
                );

            color: white;
            text-decoration: none;

            border-radius: 30px;

            font-weight: bold;

            border: none;
            cursor: pointer;

            transition: all 0.3s ease;

            box-shadow:
                0 4px 15px rgba(0,0,0,0.2);
        }

        .back-btn:hover {
            transform: translateY(-2px);

            box-shadow:
                0 6px 20px rgba(0,0,0,0.3);
        }

        .pulse {
            animation:
                pulse 2s infinite;
        }

        @keyframes pulse {
            0% {
                box-shadow:
                    0 0 0 0
                    rgba(255,255,255,0.4);
            }

            70% {
                box-shadow:
                    0 0 0 15px
                    rgba(255,255,255,0);
            }

            100% {
                box-shadow:
                    0 0 0 0
                    rgba(255,255,255,0);
            }
        }

        @media (max-width: 480px) {
            .qr-container {
                width: 260px;
                height: 260px;
            }

            .qr-code {
                width: 220px;
                height: 220px;
            }

            h1 {
                font-size: 24px;
            }
        }
    </style>
</head>

<body>

    <div class="container">

        <h1>BMX-BOT QR CODE</h1>

        <div class="qr-container">

            <div class="qr-code pulse">

                <img
                    src="${qrImage}"
                    alt="QR Code"
                />

            </div>

        </div>

        <p>
            Scan this QR code with your phone
            to connect
        </p>

        <a
            href="./"
            class="back-btn"
        >
            Back
        </a>

    </div>

    <script>
        const button =
            document.querySelector('.back-btn');

        button.addEventListener(
            'mousedown',
            function () {
                this.style.transform =
                    'translateY(1px)';

                this.style.boxShadow =
                    '0 2px 10px rgba(0,0,0,0.2)';
            }
        );

        button.addEventListener(
            'mouseup',
            function () {
                this.style.transform =
                    'translateY(-2px)';

                this.style.boxShadow =
                    '0 6px 20px rgba(0,0,0,0.3)';
            }
        );
    </script>

</body>
</html>
`);

                                responseSent = true;
                            }

                        } catch (qrError) {
                            console.error(
                                'QR generation error:',
                                qrError
                            );
                        }
                    }

                    /*
                     * CONNECTION OPEN
                     */
                    if (connection === 'open') {

                        console.log(
                            'BMX-BOT connected successfully'
                        );

                        try {
                            /*
                             * Optional newsletter follow.
                             *
                             * Keep this disabled unless
                             * you specifically need it.
                             */

                            // await sock.newsletterFollow(
                            //     "1203632813@newsletter"
                            // );

                        } catch (error) {
                            console.error(
                                'Newsletter error:',
                                error
                            );
                        }

                        await delay(10000);

                        /*
                         * Wait for credentials to be
                         * saved.
                         */
                        let sessionData = null;

                        let attempts = 0;

                        const maxAttempts = 10;

                        while (
                            attempts < maxAttempts &&
                            !sessionData
                        ) {
                            try {
                                const credsPath =
                                    path.join(
                                        sessionDir,
                                        id,
                                        'creds.json'
                                    );

                                if (
                                    fs.existsSync(
                                        credsPath
                                    )
                                ) {
                                    const data =
                                        fs.readFileSync(
                                            credsPath
                                        );

                                    if (
                                        data &&
                                        data.length > 100
                                    ) {
                                        sessionData = data;
                                        break;
                                    }
                                }

                                await delay(2000);

                                attempts++;

                            } catch (readError) {

                                console.error(
                                    'Read error:',
                                    readError
                                );

                                await delay(2000);

                                attempts++;
                            }
                        }

                        if (!sessionData) {
                            console.error(
                                'Credentials were not found.'
                            );

                            await cleanUpSession();

                            return;
                        }

                        /*
                         * IMPORTANT:
                         *
                         * Do not send raw creds.json
                         * as a transferable credential.
                         *
                         * Keep the authentication state
                         * on the server or use your
                         * protected session mechanism.
                         */

                        try {

                            console.log(
                                'BMX-BOT QR session created successfully.'
                            );

                            await delay(2000);

                            try {
                                sock.ws.close();
                            } catch (closeError) {
                                console.error(
                                    'Socket close error:',
                                    closeError
                                );
                            }

                        } catch (sessionError) {

                            console.error(
                                'Session processing error:',
                                sessionError
                            );

                        } finally {

                            await cleanUpSession();
                        }
                    }

                    /*
                     * CONNECTION CLOSED
                     */
                    else if (
                        connection === 'close' &&
                        lastDisconnect &&
                        lastDisconnect.error &&
                        lastDisconnect.error.output &&
                        lastDisconnect.error.output.statusCode !== 401
                    ) {

                        console.log(
                            'Connection closed. Reconnecting...'
                        );

                        await delay(10000);

                        BMX_BOT_QR_CODE();
                    }
                }
            );

        } catch (err) {

            console.error(
                'Main error:',
                err
            );

            if (
                !responseSent &&
                !res.headersSent
            ) {
                res.status(500).json({
                    code:
                        'QR Service is Currently Unavailable'
                });

                responseSent = true;
            }

            await cleanUpSession();
        }
    }

    try {

        await BMX_BOT_QR_CODE();

    } catch (finalError) {

        console.error(
            'Final error:',
            finalError
        );

        await cleanUpSession();

        if (
            !responseSent &&
            !res.headersSent
        ) {
            res.status(500).json({
                code: 'Service Error'
            });
        }
    }
});

module.exports = router;
