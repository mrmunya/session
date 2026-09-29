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

            box
