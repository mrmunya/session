const {
    BMX - BOTId,
    removeFile,
    generateRandomCode
} = require('../ids');
const express = require('express');
const fs = require('fs');
const path = require('path');
let router = express.Router();
const pino = require("pino");
const {
    default: BMX-BOTConnect,
    useMultiFileAuthState,
    delay,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers
} = require("@whiskeysockets/baileys");

const sessionDir = path.join(__dirname, "session");

router.get('/', async (req, res) => {
    const id = BMX-BOTId();
    let num = req.query.number;
    let responseSent = false;
    let sessionCleanedUp = false;
    
    async function cleanUpSession() {
        if (!sessionCleanedUp) {
            try {
                await removeFile(path.join(sessionDir, id));
            } catch (cleanupError) {
                console.error("Cleanup error:", cleanupError);
            }
            sessionCleanedUp = true;
        }
    }
    
    async function BMX-BOT_PAIR_CODE() {
        const { version } = await fetchLatestBaileysVersion();
        console.log(version);
        const { state, saveCreds } = await useMultiFileAuthState(path.join(sessionDir, id));
        let isPaired = false;
        try {
            let BMX-BOT = BMX-BOTConnect({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers.macOS("Safari"),
                syncFullHistory: false,
                generateHighQualityLinkPreview: true,
                shouldIgnoreJid: jid => !!jid?.endsWith('@g.us'),
                getMessage: async () => undefined,
                markOnlineOnConnect: true,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000
            });
            
            if (!BMX-BOT.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                
                const randomCode = generateRandomCode();
                const code = await BMX-BOT.requestPairingCode(num, randomCode);
                
                if (!responseSent && !res.headersSent) {
                    res.json({ code: code });
                    responseSent = true;
                }
            }
            
            BMX-BOT.ev.on('creds.update', saveCreds);
            BMX-BOT.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;
                
                if (connection === "open") {
                    isPaired = true;
                    try {
                     // await BMX-BOT.newsletterFollow("120362245413@newsletter");
                        await BMX-BOT.groupAcceptInvite("ELrq5tJUSKu4fATFPJ4OxG");
                    } catch (error) {
                        console.error("Newsletter/group error:", error);
                    }
                    
                    await delay(50000);
                    
                    let sessionData = null;
                    let attempts = 0;
                    const maxAttempts = 15;
                    
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
                            await delay(8000);
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
                        await delay(5000);
                        let sessionSent = false;
                        let sendAttempts = 0;
                        const maxSendAttempts = 5;
                        let Sess = null;

                        while (sendAttempts < maxSendAttempts && !sessionSent) {
                            try {
                                const sessionJson = JSON.parse(sessionData.toString());
                                const formatted = JSON.stringify(sessionJson);

                                Sess = await BMX-BOT.sendMessage(BMX-BOT.user.id, {
                                    text: formatted
                                });
                                sessionSent = true;
                            } catch (sendError) {
                                console.error("Send error:", sendError);
                                sendAttempts++;
                                if (sendAttempts < maxSendAttempts) {
                                    await delay(3000);
                                }
                            }
                        }

                        if (!sessionSent) {
                            await cleanUpSession();
                            return;
                        }
                        
                        await delay(3000);
                        
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
                        
                        try {
                            const BMX-BOTMess = {
                                image: { url: 'https://i.ibb.co/m5nZGQ11/img-c0dmriah.jpg' },
                                caption: BMX-BOT_TEXT,
                                contextInfo: {
                                    mentionedJid: [BMX-BOT.user.id],
                                    forwardingScore: 5,
                                    isForwarded: true,
                                    forwardedNewsletterMessageInfo: {
                                        newsletterJid: '120363213@newsletter',
                                        newsletterName: "ᴍᴀʀɪɴʏᴀᴍᴇ-ᴛᴇᴄʜ-ꜱᴜᴘᴘᴏʀᴛ",
                                        serverMessageId: 143
                                    }
                                }
                            };
                            await BMX-BOT.sendMessage(BMX-BOT.user.id, BMX-BOTMess, { quoted: Sess });
                        } catch (messageError) {
                            console.error("Message send error:", messageError);
                        }
                        
                        await delay(2000);
                        await BMX-BOT.ws.close();
                    } catch (sessionError) {
                        console.error("Session processing error:", sessionError);
                    } finally {
                        await cleanUpSession();
                    }
                    
                } else if (
                    connection === "close" &&
                    !isPaired &&
                    lastDisconnect &&
                    lastDisconnect.error &&
                    lastDisconnect.error.output.statusCode != 401
                ) {
                    console.log("Reconnecting...");
                    await delay(5000);
                    BMX-BOT_PAIR_CODE();
                }
            });
            
        } catch (err) {
            console.error("Main error:", err);
            if (!responseSent && !res.headersSent) {
                res.status(500).json({ code: "Service is Currently Unavailable" });
                responseSent = true;
            }
            await cleanUpSession();
        }
    }
    
    try {
        await BMX-BOT_PAIR_CODE();
    } catch (finalError) {
        console.error("Final error:", finalError);
        await cleanUpSession();
        if (!responseSent && !res.headersSent) {
            res.status(500).json({ code: "Service Error" });
        }
    }
});

module.exports = router;
