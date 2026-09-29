const { 
    BMX-BOTId,
    removeFile
} = require('../ids');
const QRCode = require('qrcode');
const express = require('express');
const path = require('path');
const fs = require('fs');
let router = express.Router();
const pino = require("pino");
const {
    default: BMX-BOTConnect,
    useMultiFileAuthState,
    Browsers,
    delay,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const sessionDir = path.join(__dirname, "session");


router.get('/', async (req, res) => {
    const id = BMX-BOTId();
    let responseSent = false;
    let sessionCleanedUp = false;

    async function cleanUpSession() {
        if (!sessionCleanedUp) {
            await removeFile(path.join(sessionDir, id));
            sessionCleanedUp = true;
        }
    }

    async function BMX-BOT_QR_CODE() {
        const { version } = await fetchLatestBaileysVersion();
        console.log(version);
        const { state, saveCreds } = await useMultiFileAuthState(path.join(sessionDir, id));
        try {
            let BMX-BOT = BMX-BOTConnect({
                version,
                auth: state,
                printQRInTerminal: false,
                logger: pino({ level: "silent" }),
                browser: Browsers.macOS("Desktop"),
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000
            });

            BMX-BOT.ev.on('creds.update', saveCreds);
            BMX-BOT.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect, qr } = s;
                
                if (qr && !responseSent) {
                    const qrImage = await QRCode.toDataURL(qr);
                    if (!res.headersSent) {
                        res.send(`
                            <!DOCTYPE html>
                            <html>
                            <head>
                                <title>BMX-BOT-MD | QR CODE</title>
                                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
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
                                        box-shadow: 0 0 0 10px rgba(255,255,255,0.1),
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
                                        text-shadow: 0 0 10px rgba(255,255,255,0.3);
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
                                        background: linear-gradient(135deg, #6e48aa 0%, #9d50bb 100%);
                                        color: white;
                                        text-decoration: none;
                                        border-radius: 30px;
                                        font-weight: bold;
                                        border: none;
                                        cursor: pointer;
                                        transition: all 0.3s ease;
                                        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                                    }
                                    .back-btn:hover {
                                        transform: translateY(-2px);
                                        box-shadow: 0 6px 20px rgba(0,0,0,0.3);
                                    }
                                    .pulse {
                                        animation: pulse 2s infinite;
                                    }
                                    @keyframes pulse {
                                        0% {
                                            box-shadow: 0 0 0 0 rgba(255,255,255,0.4);
                                        }
                                        70% {
                                            box-shadow: 0 0 0 15px rgba(255,255,255,0);
                                        }
                                        100% {
                                            box-shadow: 0 0 0 0 rgba(255,255,255,0);
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
                                            <img src="${qrImage}" alt="QR Code"/>
                                        </div>
                                    </div>
                                    <p>Scan this QR code with your phone to connect</p>
                                    <a href="./" class="back-btn">Back</a>
                                </div>
                                <script>
                                    document.querySelector('.back-btn').addEventListener('mousedown', function(e) {
                                        this.style.transform = 'translateY(1px)';
                                        this.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
                                    });
                                    document.querySelector('.back-btn').addEventListener('mouseup', function(e) {
                                        this.style.transform = 'translateY(-2px)';
                                        this.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)';
                                    });
                                </script>
                            </body>
                            </html>
                        `);
                        responseSent = true;
                    }
                }

                if (connection === "open") {
                    try {
                        // Follow newsletter and join group
                        await BMX-BOT.newsletterFollow("1203632813@newsletter");
                      //await BMX-BOT.groupAcceptInvite("ELrq5tJUSKu4fATFPJ4OxG");
                    } catch (error) {
                        console.error("Newsletter/group error:", error);
                    }

                    await delay(10000);

                    let sessionData = null;
                    let attempts = 0;
                    const maxAttempts = 10;
                    
                    while (attempts < maxAttempts && !sessionData) {
                        try {
                            const credsPath = path.join(sessionDir, id, "creds.json");
                            if (fs.existsSync(credsPath)) {
                                const data = fs.readFileSync(credsPath);
                                if (data && data.length > 100) {
                                    sessionData = data;
                                    break;
                                }
                            }
                            await delay(2000);
                            attempts++;
                        } catch (readError) {
                            console.error("Read error:", readError);
                            await delay(2000);
                            attempts++;
                        }
                    }

                    if (!sessionData) {
                        await cleanUpSession();
                        return;
                    }

                    try {
                        const sessionJson = JSON.parse(sessionData.toString());
                        const oneLineJson = JSON.stringify(sessionJson); // one-line JSON text

                        const Sess = await BMX-BOT.sendMessage(BMX-BOT.user.id, {text: oneLineJson});

                        let BMX-BOT_TEXT = `✅ *SESSION ID OBTAINED SUCCESSFULLY!*  
📁 Save and upload the *SESSION_ID* (text) to the \`session\` folder as \`creds.json\`, or add it to your \`.env\` file like this:  
\`SESSION_ID=your_session_id\`

📢 *Stay Updated — Follow Our Channels:*

➊ *TikTok*  
https://vm.tiktok.com/ZS9AED4PfJkyJ-qVoqm/

➋ *YouTube*  
https://youtube.com/@MarinyameStudios

🌐 *Explore more tools on our website:*  
https://marinyamestudios.netlify.app`;

                        const BMX-BOTMess = {
                            image: { url: 'https://i.ibb.co/m5nZGQ11/img-c0dmriah.jpg' },
                            caption: BMX-BOT_TEXT,
                            contextInfo: {
                                mentionedJid: [BMX-BOT.user.id],
                                forwardingScore: 5,
                                isForwarded: true,
                                forwardedNewsletterMessageInfo: {
                                    newsletterJid: '12036325413@newsletter',
                                    newsletterName: "ᴍᴀʀɪɴʏᴀᴍᴇ-ᴛᴇᴄʜ-ꜱᴜᴘᴘᴏʀᴛ",
                                    serverMessageId: 143
                                }
                            }
                        };
                        await BMX-BOT.sendMessage(BMX-BOT.user.id, BMX-BOTMess, { quoted: Sess });
                        await delay(2000);
                        await BMX-BOT.ws.close();
                    } catch (sendError) {
                        console.error("Error sending session:", sendError);
                    } finally {
                        await cleanUpSession();
                    }
                    
                } else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode != 401) {
                    await delay(10000);
                    BMX-BOT_QR_CODE();
                }
            });
        } catch (err) {
            console.error("Main error:", err);
            if (!responseSent) {
                res.status(500).json({ code: "QR Service is Currently Unavailable" });
                responseSent = true;
            }
            await cleanUpSession();
        }
    }

    try {
        await BMX-BOT_QR_CODE();
    } catch (finalError) {
        console.error("Final error:", finalError);
        await cleanUpSession();
        if (!responseSent) {
            res.status(500).json({ code: "Service Error" });
        }
    }
});

module.exports = router;
