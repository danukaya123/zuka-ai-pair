import express from 'express';
import fs from 'fs';
import pino from 'pino';
import path from 'path';
import os from 'os';
import {
  makeWASocket,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import pn from 'awesome-phonenumber';

const router = express.Router();

function removeFile(FilePath) {
  try {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true });
  } catch (e) {
    console.error('Error removing file:', e);
  }
}

router.get('/', async (req, res) => {
  let num = req.query.number;
  // 👉 use Vercel’s writable temp dir
  let dirs = path.join(os.tmpdir(), num || 'session');

  await removeFile(dirs);

  num = num.replace(/[^0-9]/g, '');
  const phone = pn('+' + num);
  if (!phone.isValid()) {
    if (!res.headersSent) {
      return res.status(400).send({
        code:
          'Invalid phone number. Please enter your full international number (e.g., 15551234567 for US, 447911123456 for UK, 84987654321 for Vietnam, etc.) without + or spaces.'
      });
    }
    return;
  }
  num = phone.getNumber('e164').replace('+', '');

  async function initiateSession() {
    const { state, saveCreds } = await useMultiFileAuthState(dirs);

    try {
      const { version } = await fetchLatestBaileysVersion();
      let KnightBot = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(
            state.keys,
            pino({ level: 'fatal' }).child({ level: 'fatal' })
          )
        },
        printQRInTerminal: false,
        logger: pino({ level: 'fatal' }).child({ level: 'fatal' }),
        browser: Browsers.windows('Chrome'),
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: false,
        defaultQueryTimeoutMs: 60000,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        retryRequestDelayMs: 250,
        maxRetries: 5
      });

      KnightBot.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, isNewLogin, isOnline } = update;

        if (connection === 'open') {
          console.log('✅ Connected successfully!');
          console.log('📱 Sending session file to user...');
          try {
            const sessionKnight = fs.readFileSync(path.join(dirs, 'creds.json'));
            const userJid = jidNormalizedUser(num + '@s.whatsapp.net');
            await KnightBot.sendMessage(userJid, {
              document: sessionKnight,
              mimetype: 'application/json',
              fileName: 'creds.json'
            });
            console.log('📄 Session file sent successfully');

            await KnightBot.sendMessage(userJid, {
              text: `⚠️Do not share this file with anybody⚠️\n 
┌┤✑  Thanks for using Zuka Ai
│└────────────┈ ⳹        
│©2025 5cents fka Dutsva
└─────────────────┈ ⳹\n\n`
            });
            console.log('⚠️ Warning message sent successfully');

            console.log('🧹 Cleaning up session...');
            setTimeout(() => removeFile(dirs), 5000); // small delay
            console.log('🎉 Process completed successfully!');
          } catch (error) {
            console.error('❌ Error sending messages:', error);
            removeFile(dirs);
          }
        }

        if (isNewLogin) console.log('🔐 New login via pair code');
        if (isOnline) console.log('📶 Client is online');

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          if (statusCode === 401) {
            console.log('❌ Logged out from WhatsApp. Need to generate new pair code.');
          } else {
            console.log('🔁 Connection closed — restarting...');
            initiateSession();
          }
        }
      });

      if (!KnightBot.authState.creds.registered) {
        await delay(3000);
        num = num.replace(/[^\d+]/g, '');
        if (num.startsWith('+')) num = num.substring(1);
        try {
let code = await KnightBot.requestPairingCode(num);
code = code?.match(/.{1,4}/g)?.join('-') || code;
if (!res.headersSent) {
  console.log({ num, code });
  // ✅ send response immediately (frontend can display instantly)
  res.status(200).json({ code });
}

// ⏳ keep WhatsApp socket alive for 45 seconds in background
setTimeout(async () => {
  console.log('⌛ waiting for user to complete pairing...');
}, 45000);
        } catch (error) {
          console.error('Error requesting pairing code:', error);
          if (!res.headersSent) {
            res.status(503).send({
              code:
                'Failed to get pairing code. Please check your phone number and try again.'
            });
          }
        }
      }

      KnightBot.ev.on('creds.update', saveCreds);
    } catch (err) {
      console.error('Error initializing session:', err);
      if (!res.headersSent) {
        res.status(503).send({ code: 'Service Unavailable' });
      }
    }
  }

  await initiateSession();
});

process.on('uncaughtException', (err) => {
  let e = String(err);
  if (
    e.includes('conflict') ||
    e.includes('not-authorized') ||
    e.includes('Socket connection timeout') ||
    e.includes('rate-overlimit') ||
    e.includes('Connection Closed') ||
    e.includes('Timed Out') ||
    e.includes('Value not found') ||
    e.includes('Stream Errored') ||
    e.includes('statusCode: 515') ||
    e.includes('statusCode: 503')
  )
    return;
  console.log('Caught exception: ', err);
});

export default router;
