import express from "express";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";
import { OAuth2Client } from "google-auth-library";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import * as msal from "@azure/msal-node";
import webpush from "web-push";
import { GoogleGenAI } from "@google/genai";
import http from "http";
import { WebSocketServer, WebSocket as WS } from "ws";
import mammoth from 'mammoth';
import * as xlsx from 'xlsx';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Document as DocxDocument, Packer, Paragraph, TextRun, Table as DocxTable, TableRow as DocxTableRow, TableCell as DocxTableCell, WidthType, AlignmentType, BorderStyle } from 'docx';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;

const msalConfig = {
    auth: {
        clientId: MICROSOFT_CLIENT_ID,
        authority: "https://login.microsoftonline.com/common",
        clientSecret: MICROSOFT_CLIENT_SECRET,
    }
};

let cca: any = null;
if (MICROSOFT_CLIENT_ID && MICROSOFT_CLIENT_SECRET) {
    cca = new msal.ConfidentialClientApplication(msalConfig);
} else {
    console.warn("ADVERTENCIA: MICROSOFT_CLIENT_ID o MICROSOFT_CLIENT_SECRET no están configurados. La integración con Microsoft no funcionará.");
}

import admin from 'firebase-admin';
import cryptoNode from 'crypto';

// Initialize Firebase Admin
let adminOptions: admin.AppOptions = {};

if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        if (serviceAccount.private_key) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
        adminOptions = {
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID,
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id}.firebasestorage.app`
        };
        console.log("[FIREBASE ADMIN] Initialized with SERVICE ACCOUNT JSON");
    } catch (e) {
        console.error("[FIREBASE ADMIN] Error parsing service account JSON:", e);
        adminOptions = {
            projectId: process.env.FIREBASE_PROJECT_ID || 'goatify-app-ia',
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'goatify-app-ia.firebasestorage.app'
        };
    }
} else {
    adminOptions = {
        projectId: process.env.FIREBASE_PROJECT_ID || 'goatify-app-ia',
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'goatify-app-ia.firebasestorage.app'
    };
    console.warn("[FIREBASE ADMIN] Using Application Default Credentials (ADC). If on Cloud Run, ensure Service Account has permissions.");
}

if (!admin.apps.length) {
    admin.initializeApp(adminOptions);
}
const firestore = admin.firestore();
const storage = admin.storage();

// --- MIDDLEWARE: requireFirebaseUser ---
async function requireFirebaseUser(req: any, res: any, next: any) {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
        console.warn("[AUTH] No token provided for path:", req.path);
        return res.status(401).json({ ok: false, error: "No Firebase ID token provided." });
    }

    try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.user = {
            uid: decoded.uid,
            email: decoded.email || null,
            name: decoded.name || decoded.email || "Usuario Goatify"
        };
        next();
    } catch (e: any) {
        console.error("[AUTH] Invalid Firebase token:", e.message);
        return res.status(401).json({ ok: false, error: "Token de autenticación inválido o expirado." });
    }
}

// --- SISTEMA DE PERSISTENCIA SEGURA Y ENCRIPTACIÓN ---
const ENCRYPTION_KEY = process.env.EMAIL_ENCRYPTION_KEY ? cryptoNode.scryptSync(process.env.EMAIL_ENCRYPTION_KEY, 'salt', 32) : null; 
const ALGORITHM = 'aes-256-gcm';

if (!ENCRYPTION_KEY) {
    console.warn("ADVERTENCIA: EMAIL_ENCRYPTION_KEY no está configurada. El cifrado de cuentas de correo no funcionará.");
}

export const encryptAccountData = (data: any): string => {
    if (!ENCRYPTION_KEY) {
        throw new Error("EMAIL_ENCRYPTION_KEY no está configurada en el servidor.");
    }
    const iv = cryptoNode.randomBytes(12);
    const cipher = cryptoNode.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
};

export const decryptAccountData = (encryptedData: string): any => {
    if (!ENCRYPTION_KEY) return null;
    try {
        const [ivHex, authTagHex, encryptedTextHex] = encryptedData.split(':');
        if (!ivHex || !authTagHex || !encryptedTextHex) return null;
        const decipher = cryptoNode.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, Buffer.from(ivHex, 'hex'));
        decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
        let decrypted = decipher.update(encryptedTextHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
    } catch (e) {
        console.error("Error decrypting account data:", e);
        return null;
    }
};

const syncAccountsToFirestore = async (userId: string, accounts: any[]) => {
    if (!userId) return;
    try {
        const encrypted = encryptAccountData(accounts);
        await firestore.collection('user_email_accounts').doc(userId).set({ 
            encryptedAccounts: encrypted,
            updatedAt: new Date().toISOString()
        });
    } catch (e) {
        console.error("Error syncing accounts to Firestore:", e);
    }
};
// --------------------------------------------------------


async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  const isProduction = process.env.NODE_ENV === "production";

  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean);

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origen no permitido por CORS"));
    },
    credentials: true
  }));

  // Body limits by endpoint. Keep global payload small for speed/cost, and allow heavy media only where needed.
  const defaultJsonLimit = process.env.API_JSON_LIMIT || "10mb";
  const imageJsonLimit = process.env.API_IMAGE_JSON_LIMIT || "25mb";
  const docsJsonLimit = process.env.API_DOCS_JSON_LIMIT || "50mb";
  const mediaJsonLimit = process.env.API_MEDIA_JSON_LIMIT || "100mb";
  app.use(['/api/gemini/media'], express.json({ limit: mediaJsonLimit }));
  app.use(['/api/gemini/images'], express.json({ limit: imageJsonLimit }));
  app.use(['/api/files/extract', '/api/artifacts/generate'], express.json({ limit: docsJsonLimit }));
  app.use(express.json({ limit: defaultJsonLimit }));
  app.use(express.urlencoded({ extended: true, limit: defaultJsonLimit }));

  // --- DEBUG FIREBASE ADMIN ---
  app.get("/api/debug/firestore-admin", async (req: any, res: any) => {
    if (process.env.NODE_ENV === "production") return res.status(404).send();
    try {
        const testDocPath = `debug_admin_health/${Date.now()}`;
        const hasServiceAccount = !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        
        let canRead = false;
        let canWrite = false;
        let errorMsg = null;

        try {
            // Prueba de escritura
            await firestore.doc(testDocPath).set({ 
                health: 'ok', 
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                debug: true 
            });
            canWrite = true;
            
            // Prueba de lectura
            const snap = await firestore.doc(testDocPath).get();
            canRead = snap.exists;
            
            // Limpieza
            await firestore.doc(testDocPath).delete();
        } catch (e: any) {
            errorMsg = e.message;
        }

        res.json({
            ok: true,
            adminInitialized: admin.apps.length > 0,
            hasServiceAccountJson: hasServiceAccount,
            projectId: admin.app().options.projectId,
            storageBucket: admin.app().options.storageBucket,
            canReadFirestore: canRead,
            canWriteFirestore: canWrite,
            errorMessage: errorMsg
        });
    } catch (e: any) {
        res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Sesiones en memoria (Para producción usa una DB)
  const sessions = new Map();

  // Memoria para Scheduled Emails (Mailing & Reminders)
  const scheduledEmails = new Map();

  // Background cron to process scheduled emails and mail_queue every minute
  const vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY
  };
  
  if (vapidKeys.publicKey && vapidKeys.privateKey) {
    webpush.setVapidDetails(
      'mailto:info@goatify.app',
      vapidKeys.publicKey,
      vapidKeys.privateKey
    );
  } else {
    console.warn("ADVERTENCIA: VAPID_PUBLIC_KEY o VAPID_PRIVATE_KEY no están configurados. Las notificaciones Push no funcionarán.");
  }

  // Background monitor: Silencio Sentry para Correos Push
  // ... (existing code for email interval)

  // --- Real-time Push Guard for all App Notifications ---
  // Este listener captura mensajes, llamadas, tareas y todo lo que genere una notificación en la app
  firestore.collectionGroup('notifications').where('read', '==', false).onSnapshot(snapshot => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added') {
        const notif = change.doc.data();
        const docPath = change.doc.ref.path; // users/{userId}/notifications/{notifId}
        const pathParts = docPath.split('/');
        if (pathParts.length >= 4) {
          const userId = pathParts[1];
          
          // Solo notificar si es reciente (evitar spam de notificaciones antiguas al reiniciar servidor)
          const timestamp = notif.timestamp ? new Date(notif.timestamp).getTime() : Date.now();
          if (Date.now() - timestamp > 60000) return; 

          try {
            const pushSnap = await firestore.collection(`users/${userId}/push_subscriptions`).get();
            if (!pushSnap.empty) {
              const payload = JSON.stringify({
                title: notif.type === 'new_message' ? 'Nuevo Mensaje' : 
                       notif.type === 'incoming_call' ? 'Llamada Entrante' : 'Notificación Goatify',
                body: notif.text.replace(/<\/?[^>]+(>|$)/g, ""), // Limpiar HTML
                icon: '/Logos HD.png',
                data: { url: notif.link || '/' }
              });

              for (const pushDoc of pushSnap.docs) {
                const sub = pushDoc.data();
                webpush.sendNotification(sub as any, payload).catch(e => {
                  if (e.statusCode === 410 || e.statusCode === 404) pushDoc.ref.delete();
                });
              }
            }
          } catch (e) {
            console.error("Error in Global Push Guard:", e);
          }
        }
      }
    });
  }, err => console.error("Notification Collection Group error:", err));

  // --- Reminder Worker: posts sociales y reuniones próximas ---
  // Genera notificaciones internas; el Push Guard global las entrega al celular/escritorio si existe suscripción.
  const reminderWorkerEnabled = process.env.ENABLE_REMINDER_WORKER !== "false";
  const reminderWorkerIntervalMs = Number(process.env.REMINDER_WORKER_INTERVAL_MS || 60000);
  const reminderLookaheadMinutes = Number(process.env.REMINDER_LOOKAHEAD_MINUTES || 90);

  const createReminderNotification = async (userId: string, reminderId: string, payload: { title: string; text: string; link?: string; type?: string; }) => {
    if (!userId || !reminderId) return;
    const cacheRef = firestore.collection('system_cache').doc(`reminder_${reminderId}`);
    const cacheSnap = await cacheRef.get();
    if (cacheSnap.exists) return;

    const nowIso = new Date().toISOString();
    await cacheRef.set({
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      userId,
      reminderId,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
    }, { merge: true });

    await firestore.collection(`users/${userId}/notifications`).doc(`reminder_${reminderId}`).set({
      id: `reminder_${reminderId}`,
      type: payload.type || 'scheduled_reminder',
      text: payload.text,
      title: payload.title,
      link: payload.link || '/',
      read: false,
      timestamp: nowIso,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  };

  const processScheduledReminders = async () => {
    const now = new Date();
    const ahead = new Date(now.getTime() + reminderLookaheadMinutes * 60000);
    const nowIso = now.toISOString().slice(0, 19);
    const aheadIso = ahead.toISOString().slice(0, 19);

    try {
      // Social Media Studio: users/{uid}/socialCalendar/{itemId}
      const socialSnap = await firestore.collectionGroup('socialCalendar')
        .where('scheduledAt', '>=', nowIso)
        .where('scheduledAt', '<=', aheadIso)
        .get();

      for (const docSnap of socialSnap.docs) {
        const item = docSnap.data();
        const pathParts = docSnap.ref.path.split('/');
        const userId = pathParts[0] === 'users' ? pathParts[1] : item.userId;
        const scheduledAt = item.scheduledAt;
        if (!userId || !scheduledAt) continue;

        const scheduledDate = new Date(String(scheduledAt));
        if (Number.isNaN(scheduledDate.getTime())) continue;
        const minutesBefore = Math.max(0, Number(item.reminderMinutes ?? 30));
        const reminderAt = new Date(scheduledDate.getTime() - minutesBefore * 60000);
        if (now.getTime() < reminderAt.getTime() || now.getTime() > scheduledDate.getTime() + 5 * 60000) continue;

        const platform = item.platform || 'red social';
        const title = item.title || item.campaignName || 'Contenido programado';
        await createReminderNotification(userId, `social_${docSnap.id}_${minutesBefore}`, {
          type: 'social_post_reminder',
          title: 'Post listo para publicar',
          text: `📣 ${platform}: ${title}. Toca para abrir tu calendario de contenidos.`,
          link: '/#/calendar'
        });
      }
    } catch (e) {
      console.error('[REMINDER WORKER] Social reminders failed:', e);
    }

    try {
      // Goatify Meet: llamadas/reuniones próximas
      const callsSnap = await firestore.collection('calls')
        .where('scheduledAt', '>=', nowIso)
        .where('scheduledAt', '<=', aheadIso)
        .get();

      for (const docSnap of callsSnap.docs) {
        const call = docSnap.data();
        const scheduledAt = call.scheduledAt;
        if (!scheduledAt) continue;
        const scheduledDate = new Date(String(scheduledAt));
        if (Number.isNaN(scheduledDate.getTime())) continue;
        const reminderAt = new Date(scheduledDate.getTime() - 30 * 60000);
        if (now.getTime() < reminderAt.getTime() || now.getTime() > scheduledDate.getTime() + 5 * 60000) continue;

        const recipients = Array.from(new Set([...(call.participants || []), ...(call.invited || []), call.adminId].filter(Boolean)));
        for (const uid of recipients) {
          await createReminderNotification(String(uid), `meet_${docSnap.id}_30_${uid}`, {
            type: 'meeting_reminder',
            title: 'Reunión próxima',
            text: `🎥 ${call.title || 'Reunión Goatify'} empieza pronto.`,
            link: call.meetingUrl || `/#/call/${docSnap.id}`
          });
        }
      }
    } catch (e) {
      console.error('[REMINDER WORKER] Meeting reminders failed:', e);
    }
  };

  if (reminderWorkerEnabled) {
    setInterval(processScheduledReminders, reminderWorkerIntervalMs);
    setTimeout(processScheduledReminders, 15000);
  }

  if (process.env.ENABLE_MAIL_POLLING === "true") {
    const mailPollIntervalMs = Number(process.env.MAIL_POLL_INTERVAL_MS || 900000);
    setInterval(async () => {
    try {
      // 1. Obtener todos los usuarios con sesiones de push activas
      const accountsSnap = await firestore.collection('user_email_accounts').get();
      for (const docUser of accountsSnap.docs) {
        const userId = docUser.id;
        const data = docUser.data();
        if (!data.encryptedAccounts) continue;

        // Obtener subscripciones push del usuario
        const pushSnap = await firestore.collection(`users/${userId}/push_subscriptions`).get();
        if (pushSnap.empty) continue;

        const accounts = decryptAccountData(data.encryptedAccounts);
        if (!accounts || !Array.isArray(accounts)) continue;

        for (const acc of accounts) {
          try {
            await refreshAccountTokens(acc);
            const client = new ImapFlow(getImapClientOptions(acc));
            await client.connect();
            let lock = await client.getMailboxLock('INBOX');
            try {
              // Buscar mensajes no leídos recientes (última hora para evitar spam de notificaciones antiguas)
              const sinceDate = new Date();
              sinceDate.setHours(sinceDate.getHours() - 1);
              
              const messages = await client.search({ seen: false, since: sinceDate });
              if (messages && Array.isArray(messages)) {
                for (const uid of messages) {
                  const cacheId = `notif_${userId}_${acc.email}_${uid}`;
                  const alreadyNotified = await firestore.collection('system_cache').doc(cacheId).get();
                  
                  if (!alreadyNotified.exists) {
                    const msg = await client.fetchOne(uid, { envelope: true });
                    if (msg && msg.envelope) {
                      const subject = msg.envelope.subject || '(Sin Asunto)';
                      const from = msg.envelope.from ? msg.envelope.from[0].name || msg.envelope.from[0].address : 'Desconocido';
                      
                      // Notificar a todos los dispositivos suscritos
                      for (const pushDoc of pushSnap.docs) {
                        const sub = pushDoc.data();
                        await webpush.sendNotification(sub as any, JSON.stringify({
                          title: `Nuevo Email de ${from}`,
                          body: subject,
                          icon: '/Logos HD.png',
                          data: { url: '/#/mail' }
                        })).catch(e => {
                            if (e.statusCode === 410 || e.statusCode === 404) {
                              pushDoc.ref.delete(); // Limpiar suscripciones expiradas
                            }
                        });
                      }
                      
                      // Marcar como notificado en cache para no repetir
                      await firestore.collection('system_cache').doc(cacheId).set({ 
                        sentAt: admin.firestore.FieldValue.serverTimestamp(),
                        expiresAt: new Date(Date.now() + 86400000) // 24h cache
                      });
                    }
                  }
                }
              }
            } finally {
              lock.release();
            }
            await client.logout();
          } catch (e) {
            // Error silencioso para un solo usuario/cuenta
          }
        }
      }
    } catch (e) {
      console.error("Error en Silent Sentry Push Monitor:", e);
    }
  }, mailPollIntervalMs); // configurable: default 15 minutos para no saturar servidores
  } else {
    console.log("[MAIL POLLING] Desactivado. Activa ENABLE_MAIL_POLLING=true si necesitas monitoreo IMAP automático.");
  }

  setInterval(async () => {
    const now = Date.now();
    
    // 1. Process local scheduledEmails (already exists)
    // We will keep this for backward compatibility but prioritize Firestore queue
    for (const [jobId, job] of scheduledEmails.entries()) {
      if (now >= job.sendAt) {
        let ownerSession = null;
        for (const sess of sessions.values()) {
          if (sess.userId === job.ownerId) {
            ownerSession = sess;
            break;
          }
        }
        scheduledEmails.delete(jobId);

        if (ownerSession && ownerSession.accounts && ownerSession.accounts.length > 0) {
          const acc = ownerSession.accounts[0]; 
          await refreshAccountTokens(acc);
          
          const transporterOptions: any = getTransporterOptions(acc);
          
          try {
            const transporter = nodemailer.createTransport(transporterOptions);
            const mailOptions = {
              ...job.mailOptions,
              bcc: job.mailOptions.bcc ? (job.mailOptions.bcc.includes(acc.email) ? job.mailOptions.bcc : `${job.mailOptions.bcc}, ${acc.email}`) : acc.email
            };
            await transporter.sendMail(mailOptions);
            console.log(`Scheduled email ${jobId} sent successfully to ${job.mailOptions.to}`);
          } catch (err) {
            console.error(`Error sending scheduled email ${jobId}:`, err);
          }
        }
      }
    }

    // 2. Process mail_queue from Firestore (AUTONOMOUS)
    try {
      const queueSnap = await firestore.collection('mail_queue')
        .where('status', '==', 'pending')
        .limit(10) // Process in chunks to be safe
        .get();

      if (!queueSnap.empty) {
        // Find sessions for all jobs
        for (const doc of queueSnap.docs) {
          const job = doc.data();
          let sessionToUse = null;
          
          // Try to find the owner's session
          if (job.ownerId) {
            for (const sess of sessions.values()) {
              if (sess.userId === job.ownerId) {
                sessionToUse = sess;
                break;
              }
            }
          }

          // Fallback to system admin if it's a notification and owner is offline
          if (!sessionToUse && job.isSystemNotification) {
            for (const sess of sessions.values()) {
              if (sess.accounts && sess.accounts.some((a: any) => a.email === 'info@goatify.app')) {
                sessionToUse = sess;
                break;
              }
            }
            // Last resort: any superAdmin
            if (!sessionToUse) {
              for (const sess of sessions.values()) {
                if (sess.isSuperAdmin) {
                  sessionToUse = sess;
                  break;
                }
              }
            }
          }

          if (sessionToUse && sessionToUse.accounts && sessionToUse.accounts.length > 0) {
            const acc = sessionToUse.accounts[0];
            await refreshAccountTokens(acc);
            
            const transporterOptions: any = getTransporterOptions(acc);
            const transporter = nodemailer.createTransport(transporterOptions);

            try {
              const mailOptions = {
                from: job.from || `"${acc.email === 'info@goatify.app' ? 'Goatify Service' : (sessionToUse.name || 'Goatify')}" <${acc.email}>`,
                to: job.to,
                bcc: job.bcc ? (job.bcc.includes(acc.email) ? job.bcc : `${job.bcc}, ${acc.email}`) : acc.email,
                subject: job.subject,
                html: job.htmlBody
              };
              await transporter.sendMail(mailOptions);
              await doc.ref.update({ 
                status: 'sent', 
                sentAt: admin.firestore.FieldValue.serverTimestamp(),
                usedAccount: acc.email
              });
              console.log(`Queue job ${doc.id} sent successfully to ${job.to} via ${acc.email}`);
            } catch (err) {
              console.error(`Error sending queue job ${doc.id}:`, err);
              // Mark as failed or wait for session refresh
              await doc.ref.update({ lastError: String(err), lastAttempt: admin.firestore.FieldValue.serverTimestamp() });
            }
          }
        }
      }
    } catch (err) {
      console.error("Error processing mail_queue:", err);
    }

    // 3. News Automation (7 AM)
    try {
        const settingsSnap = await firestore.collection('automation_settings').doc('status').get();
        if (settingsSnap.exists) {
            const settings = settingsSnap.data();
            const nowObj = new Date();
            const is7AM = nowObj.getHours() === 7 && nowObj.getMinutes() < 60; 
            
            if (process.env.ENABLE_NEWS_AUTOMATION === "true" && settings?.newsEnabled && is7AM) {
                const todayId = `news-auto-${nowObj.getFullYear()}-${nowObj.getMonth() + 1}-${nowObj.getDate()}`;
                const dailyCheck = await firestore.collection('mail_queue').doc(todayId).get();
                
                if (!dailyCheck.exists) {
                    const newsSnap = await firestore.collection('system_news').orderBy('createdAt', 'desc').limit(1).get();
                    if (!newsSnap.empty) {
                        const newsData = newsSnap.docs[0].data();
                        const articles = newsData.articles || [];
                        
                        if (articles.length > 0) {
                            const slugify = (text: string) => {
                                return text.toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
                                    .replace(/\s+/g, '-').replace(/[^\w-]+/g, '')
                                    .replace(/--+/g, '-').replace(/^-+/, '').replace(/-+$/, '');
                            };

                            const newsItemsHtml = articles.slice(0, 6).map((n: any, i: number) => {
                                const articleSlug = slugify(n.title);
                                const articleLink = n.url && n.url.startsWith('http') ? n.url : `https://ia.goatify.app/#/article/${articleSlug}`;
                                
                                return `
                            <div style="margin-bottom: 30px; padding: 25px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                                <div style="display: flex; align-items: center; margin-bottom: 12px;">
                                    <span style="background-color: #10b981; color: white; font-size: 10px; font-weight: 900; padding: 4px 10px; border-radius: 6px; text-transform: uppercase; letter-spacing: 1.5px; display: inline-block;">${n.category || 'Actualidad'}</span>
                                </div>
                                <h3 style="color: #0f172a; font-size: 20px; font-weight: 900; line-height: 1.2; margin: 0 0 12px 0; letter-spacing: -0.5px;">${n.title}</h3>
                                <p style="font-size: 15px; color: #475569; line-height: 1.6; margin: 0 0 20px 0;">${n.summary}</p>
                                
                                <div style="background-color: #f1f5f9; padding: 15px 18px; border-radius: 12px; margin-bottom: 20px;">
                                    <p style="margin: 0; font-size: 13px; color: #1e293b; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px;">🧬 Consejo para tu Marca:</p>
                                    <p style="margin: 0; font-size: 14px; color: #334155; line-height: 1.5; font-style: italic;">${n.goatifyTakeaway || 'Aplica esta tendencia para escalar tu posicionamiento hoy mismo.'}</p>
                                </div>

                                <div style="text-align: right;">
                                    <a href="${articleLink}" style="display: inline-block; color: #10b981; font-size: 14px; font-weight: 800; text-decoration: none; text-transform: uppercase; letter-spacing: 0.5px;">Leer análisis completo &rarr;</a>
                                </div>
                            </div>`;
                            }).join('');

                            const dailyNewsHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 40px 10px; background-color: #f8fafc;">
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; width: 100%; max-width: 680px; margin: 0 auto;">
        <div style="background-color: #0f172a; padding: 45px 30px; text-align: center; border-radius: 24px 24px 0 0; border-bottom: 5px solid #10b981;">
            <p style="color: #10b981; margin: 0 0 10px 0; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 3px;">PULSO DE INNOVACIÓN</p>
            <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-weight: 900; letter-spacing: -1px; line-height: 1;">NOTICIAS DEL DÍA</h1>
            <p style="color: #94a3b8; margin: 15px 0 0 0; font-size: 14px; font-weight: 500; line-height: 1.4;">Consejos estratégicos y tendencias para potenciar tu marca con Inteligencia Artificial.</p>
        </div>
        
        <div style="padding: 35px 0;">
            ${newsItemsHtml}
        </div>

        <div style="background-color: #ffffff; padding: 35px 30px; border-radius: 24px; border: 1px solid #e2e8f0; text-align: center; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); margin-bottom: 30px;">
            <div style="width: 60px; height: 60px; background-color: #ecfdf5; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 20px;">
                <span style="font-size: 30px;">🤑</span>
            </div>
            <h2 style="margin: 0 0 10px 0; font-size: 22px; font-weight: 900; color: #0f172a; letter-spacing: -0.5px;">¿Quieres generar ingresos extra?</h2>
            <p style="margin: 0 0 25px 0; font-size: 15px; color: #64748b; line-height: 1.6;">Únete a nuestro programa de socios y genera comisiones recurrentes vendiendo nuestras soluciones tecnológicas de élite.</p>
            <a href="https://ia.goatify.app/#/partners" style="display: inline-block; width: 100%; box-sizing: border-box; background-color: #10b981; color: #ffffff; padding: 18px 25px; text-decoration: none; border-radius: 12px; font-weight: 900; font-size: 15px; text-transform: uppercase; letter-spacing: 1px;">Quiero Ser Socio Goatify</a>
        </div>

        <div style="text-align: center; padding: 20px;">
            <p style="margin: 0 0 5px 0; font-size: 14px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 1px;">Goatify Innovation Lab</p>
            <p style="margin: 0; font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">© 2026 Inteligencia que Transforma Negocios.</p>
        </div>
    </div>
</body>
</html>`;

                            // Get all user emails
                            const usersSnap = await firestore.collection('users').get();
                            const bccList = usersSnap.docs.map(u => u.data().email).filter(e => e && e.includes('@')).join(',');

                            await firestore.collection('mail_queue').doc(todayId).set({
                                type: 'DAILY_NEWS',
                                to: '',
                                bcc: bccList,
                                subject: 'Noticias del día y consejos para tu marca',
                                htmlBody: dailyNewsHtml,
                                status: 'pending',
                                createdAt: admin.firestore.FieldValue.serverTimestamp()
                            });
                            console.log(`Automatic daily news queued for ${nowObj.toDateString()}`);
                        }
                    }
                }
            }
        }
    } catch (err) {
        console.error("Error in News Automation logic:", err);
    }

  }, 60000);

  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.warn("ADVERTENCIA: GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET no están configurados. La integración con Google no funcionará correctamente.");
  }

  const getOAuth2Client = (redirectUri?: string) => {
    return new OAuth2Client(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      redirectUri
    );
  };

  const requireAuth = async (req: any, res: any, next: any) => {
    const token = req.headers.authorization?.split(" ")[1] || req.query.token;
    if (!token) return res.status(401).json({ error: "No autorizado" });

    // Sesión legacy para el módulo de correo. Solo aceptamos tokens creados por /api/auth/login.
    if (String(token).startsWith("goatify_")) {
      if (!sessions.has(token)) return res.status(401).json({ error: "Sesión expirada. Vuelve a iniciar sesión." });
      req.session = sessions.get(token);
      return next();
    }

    // Fallback seguro: también aceptamos Firebase ID Token real.
    try {
      const decoded = await admin.auth().verifyIdToken(token);
      const sessionKey = `firebase_${decoded.uid}`;
      if (!sessions.has(sessionKey)) {
        sessions.set(sessionKey, { id: sessionKey, userId: decoded.uid, email: decoded.email || null, accounts: [] });
      }
      req.session = sessions.get(sessionKey);
      req.user = { uid: decoded.uid, email: decoded.email || null, name: decoded.name || decoded.email || "Usuario Goatify" };
      return next();
    } catch (e) {
      return res.status(401).json({ error: "Token inválido o sesión expirada." });
    }
  };

  const getImapClientOptions = (acc: any) => {
    const isGoogleOAuth = acc.provider === 'google';
    const isMicrosoftOAuth = acc.provider === 'microsoft';
    const isGmailManual = acc.provider === 'gmail_manual';
    const isOutlookManual = acc.provider === 'outlook_manual';
    const isGmail = isGoogleOAuth || isGmailManual;

    const options: any = {
      host: isGmail ? "imap.gmail.com" : (isOutlookManual || isMicrosoftOAuth) ? "outlook.office365.com" : "imappro.zoho.com",
      port: 993,
      secure: true,
      auth: isGoogleOAuth ? { user: acc.email, accessToken: acc.tokens.access_token } : 
            isMicrosoftOAuth ? { user: acc.email, accessToken: acc.tokens.access_token } : 
            { user: acc.email, pass: acc.password },
      logger: false as const
    };

    if (isMicrosoftOAuth || isOutlookManual) {
      options.tls = { rejectUnauthorized: false };
    }

    return options;
  };
  // Helper to centralize transporter options
  const getTransporterOptions = (acc: any) => {
    const isGoogleOAuth = acc.provider === 'google';
    const isMicrosoftOAuth = acc.provider === 'microsoft';
    const isGmailManual = acc.provider === 'gmail_manual';
    const isOutlookManual = acc.provider === 'outlook_manual';

    if (isGoogleOAuth) {
      return {
        host: 'smtp.gmail.com', port: 465, secure: true,
        auth: { type: 'OAuth2', user: acc.email, clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, refreshToken: acc.tokens.refresh_token, accessToken: acc.tokens.access_token }
      };
    } else if (isMicrosoftOAuth) {
      return {
        host: 'smtp.office365.com', port: 587, secure: false,
        auth: { type: 'OAuth2', user: acc.email, accessToken: acc.tokens.access_token },
        tls: { ciphers: 'SSLv3' }
      };
    } else {
      const host = (isGmailManual) ? "smtp.gmail.com" : (isOutlookManual) ? "smtp.office365.com" : "smtppro.zoho.com";
      const port = isOutlookManual ? 587 : 465;
      const secure = !isOutlookManual;
      return { host, port, secure, auth: { user: acc.email, pass: acc.password } };
    }
  };

  const refreshAccountTokens = async (acc: any) => {
    if (acc.provider === 'google') {
      const oauth2Client = getOAuth2Client();
      oauth2Client.setCredentials(acc.tokens);
      try {
        const { token } = await oauth2Client.getAccessToken();
        if (token) acc.tokens.access_token = token;
      } catch (e) {
        console.error("Error refreshing token for", acc.email, e);
      }
    } else if (acc.provider === 'microsoft' && acc.tokens.refresh_token) {
        if (!cca) {
            console.error("Microsoft Client not initialized (missing secrets)");
            return;
        }
        try {
            const refreshTokenRequest = {
                refreshToken: acc.tokens.refresh_token,
                scopes: ["https://outlook.office.com/IMAP.AccessAsUser.All", "https://outlook.office.com/SMTP.Send", "User.Read", "offline_access"],
            };
            const response = await cca.acquireTokenByRefreshToken(refreshTokenRequest) as any;
            if (response && response.accessToken) {
                acc.tokens.access_token = response.accessToken;
                if (response.refreshToken) {
                    acc.tokens.refresh_token = response.refreshToken;
                }
            }
        } catch (e) {
            console.error("Error refreshing Microsoft token for", acc.email, e);
        }
    }
  };

  // --- ENDPOINTS ULTRA PRO ---
  
  app.get("/api/health", (req: any, res: any) => {
    res.json({
      ok: true,
      service: "goatify-ia",
      mode: process.env.NODE_ENV || "development",
      timestamp: new Date().toISOString()
    });
  });

  app.get("/api/health/runtime", (req: any, res: any) => {
    if (isProduction && process.env.EXPOSE_RUNTIME_HEALTH !== "true") return res.status(404).send();
    res.json({
      ok: true,
      node: process.version,
      uptimeSeconds: Math.round(process.uptime()),
      memory: process.memoryUsage(),
      hasFirebaseAdmin: admin.apps.length > 0,
      hasGeminiKey: !!getValidGeminiApiKey().key,
      hasPerplexityKey: !!process.env.PERPLEXITY_API_KEY,
      timestamp: new Date().toISOString()
    });
  });

  app.get("/api/version", (req: any, res: any) => {
    res.json({
      buildId: "goatify-cloudrun-secure-v1",
      timestamp: new Date().toISOString(),
      mode: "backend-only"
    });
  });

  // Ensure /api always responds with JSON and never index.html, with no cache
  app.use('/api', (req: any, res: any, next: any) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  // Prevent caching of index.html to force build updates
  app.use((req: any, res: any, next: any) => {
    if (req.path === "/" || req.path.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
    next();
  });
  
  function getValidGeminiApiKey() {
    const keys = [
      { name: "GEMINI_API_KEY", val: process.env.GEMINI_API_KEY },
      { name: "API_KEY", val: process.env.API_KEY },
      { name: "GOOGLE_API_KEY", val: process.env.GOOGLE_API_KEY }
    ];

    const ignored: string[] = [];
    let selected = { key: null as string | null, source: null as string | null };

    for (const k of keys) {
      if (!k.val) continue;
      // Limpiamos de posibles prefijos erróneos o comillas
      const clean = k.val.replace(/^(GEMINI_API_KEY|API_KEY|GOOGLE_API_KEY)=/, '').replace(/['"]/g, '').trim();
      
      if (clean.startsWith("AIza") && clean.length >= 35) {
        selected = { key: clean, source: k.name };
        break;
      } else {
        ignored.push(k.name);
      }
    }

    return { ...selected, ignored };
  }


  // --- AI MODEL POLICY / COST GUARDRAIL ---
  // Regla maestra: Gemini Pro SOLO para usuarios Premium con suscripción activa ($12/mes).
  // Usuarios Free, Pro, Premium trialing o Premium cancelado se enrutan a Lite/Flash aunque el frontend pida Pro.
  const TEXT_LITE_MODEL = process.env.CHAT_FAST_MODEL || "gemini-3.1-flash-lite-preview";
  const TEXT_FLASH_MODEL = process.env.CHAT_STANDARD_MODEL || "gemini-3-flash-preview";
  const TEXT_PRO_MODEL = process.env.CHAT_PRO_MODEL || "gemini-2.5-pro";

  const ALLOWED_TEXT_FLASH_MODELS = new Set([
    "gemini-3.1-flash-lite-preview",
    "gemini-3-flash-preview",
    "gemini-2.5-flash",
    "gemini-2.0-flash-lite-preview-02-05",
    "gemini-1.5-flash-latest"
  ]);

  const ALLOWED_TEXT_PRO_MODELS = new Set([
    "gemini-2.5-pro",
    "gemini-3.1-pro-preview"
  ]);

  const normalizeTextModelName = (model?: string | null): string => {
    return String(model || "").replace(/^models\//, "").trim();
  };

  const modelLooksPro = (model: string): boolean => /(^|[-/])pro($|-)/i.test(model);

  async function getUserAiPlan(uid: string) {
    try {
      const snap = await firestore.collection("users").doc(uid).get();
      const data = snap.exists ? (snap.data() || {}) : {};
      const plan = String((data as any).plan || "free").toLowerCase();
      const subscriptionStatus = String((data as any).subscriptionStatus || "").toLowerCase();
      const paidPremium = plan === "premium" && subscriptionStatus === "active";
      return { plan, subscriptionStatus, paidPremium };
    } catch (e: any) {
      console.warn("[AI POLICY] No se pudo leer plan del usuario; usando free:", e?.message || e);
      return { plan: "free", subscriptionStatus: "", paidPremium: false };
    }
  }

  function fallbackTextModelForPlan(plan: string, moduleName?: string): string {
    if (plan === "free" || moduleName === "chat") return TEXT_LITE_MODEL;
    return TEXT_FLASH_MODEL;
  }

  function tokenCapForPlan(plan: string, paidPremium: boolean, moduleName?: string, requested?: number): number {
    const requestedTokens = Number(requested || 0) || 0;
    let cap = 4096;

    if (plan === "free") {
      cap = moduleName === "summaries" ? 8192 : 4096;
    } else if (plan === "pro" || plan === "premium") {
      cap = ["web", "summaries", "contracts"].includes(moduleName || "") ? 16384 : 8192;
    }

    if (paidPremium) {
      cap = ["web", "summaries", "contracts", "cfo"].includes(moduleName || "") ? 32768 : 16384;
    }

    return Math.min(requestedTokens || cap, cap);
  }

  async function resolveTextAiPolicy(req: any, requestedModel?: string | null, moduleName?: string) {
    const { plan, subscriptionStatus, paidPremium } = await getUserAiPlan(req.user.uid);
    const requested = normalizeTextModelName(requestedModel);
    const fallback = fallbackTextModelForPlan(plan, moduleName);

    let selectedModel = fallback;
    let downgraded = false;

    if (requested) {
      if (modelLooksPro(requested)) {
        if (paidPremium) {
          selectedModel = ALLOWED_TEXT_PRO_MODELS.has(requested) ? requested : TEXT_PRO_MODEL;
        } else {
          selectedModel = fallback;
          downgraded = true;
          console.warn(`[AI POLICY] Pro bloqueado para uid=${req.user.uid} plan=${plan} status=${subscriptionStatus || "none"}. Usando ${selectedModel}.`);
        }
      } else if (ALLOWED_TEXT_FLASH_MODELS.has(requested)) {
        selectedModel = requested;
      }
    }

    return { selectedModel, downgraded, plan, subscriptionStatus, paidPremium };
  }


  // --- SERVER-SIDE CREDIT ENGINE / PLAN LIMITS ---
  // Candado real: aunque alguien llame los endpoints directamente con token válido,
  // el backend valida y descuenta límites por usuario antes de ejecutar IA o storage caro.
  type ServerFeatureKey = 'ai_chat' | 'ai_image' | 'web_programmer' | 'presentation' | 'social_post' | 'agent_response' | 'voice_command' | 'voice_live_minute' | 'video_live_minute' | 'project_create' | 'task_create' | 'form_create' | 'agent_create' | 'storage' | 'crm_client_create' | 'meeting_create' | 'ai_grounding' | 'ai_video' | 'live_session' | 'article_publish' | 'site_publish';

  const SERVER_FEATURE_LIMIT_MAP: Record<ServerFeatureKey, { limitKey: string; usageKey: string; reset: 'daily' | 'monthly' | 'none' }> = {
    ai_chat: { limitKey: 'ai_chat_daily_queries', usageKey: 'daily_chat_count', reset: 'daily' },
    ai_image: { limitKey: 'ai_images_monthly', usageKey: 'monthly_images_used', reset: 'monthly' },
    web_programmer: { limitKey: 'web_programmer_ops', usageKey: 'monthly_web_ops_used', reset: 'monthly' },
    presentation: { limitKey: 'presentations_monthly', usageKey: 'monthly_presentations_used', reset: 'monthly' },
    social_post: { limitKey: 'social_posts_monthly', usageKey: 'monthly_posts_used', reset: 'monthly' },
    agent_response: { limitKey: 'agent_responses_monthly', usageKey: 'monthly_agent_responses', reset: 'monthly' },
    voice_command: { limitKey: 'voice_commands_monthly', usageKey: 'monthly_voice_commands', reset: 'monthly' },
    voice_live_minute: { limitKey: 'voice_live_minutes', usageKey: 'monthly_voice_minutes', reset: 'monthly' },
    video_live_minute: { limitKey: 'video_live_minutes', usageKey: 'monthly_video_minutes', reset: 'monthly' },
    project_create: { limitKey: 'active_projects', usageKey: 'current_projects_count', reset: 'none' },
    task_create: { limitKey: 'active_tasks', usageKey: 'current_tasks_count', reset: 'none' },
    form_create: { limitKey: 'active_forms', usageKey: 'current_forms_count', reset: 'none' },
    agent_create: { limitKey: 'agent_create', usageKey: 'current_agents_count', reset: 'none' },
    storage: { limitKey: 'storage_gb', usageKey: 'current_storage_bytes', reset: 'none' },
    crm_client_create: { limitKey: 'crm_clients_monthly', usageKey: 'monthly_crm_clients_created', reset: 'monthly' },
    meeting_create: { limitKey: 'meetings_monthly', usageKey: 'monthly_meetings_created', reset: 'monthly' },
    ai_grounding: { limitKey: 'grounding_monthly', usageKey: 'monthly_grounding_used', reset: 'monthly' },
    ai_video: { limitKey: 'ai_video_analysis_monthly', usageKey: 'monthly_videos_analyzed', reset: 'monthly' },
    live_session: { limitKey: 'live_sessions_monthly', usageKey: 'monthly_live_sessions_used', reset: 'monthly' },
    article_publish: { limitKey: 'articles_monthly', usageKey: 'monthly_articles_published', reset: 'monthly' },
    site_publish: { limitKey: 'publish_sites', usageKey: 'current_published_sites', reset: 'none' }
  };

  const SERVER_PLAN_LIMITS: Record<string, Record<string, number>> = {
    free: {
      active_projects: 3, active_tasks: 50, active_forms: 1,
      ai_chat_daily_queries: 30, ai_images_monthly: 3,
      agent_responses_monthly: 100, voice_commands_monthly: 10,
      voice_live_minutes: 5, video_live_minutes: 1,
      storage_gb: 1, crm_clients_monthly: 4, meetings_monthly: 30,
      grounding_monthly: 20, live_sessions_monthly: 0, articles_monthly: 0,
      publish_sites: 1, web_programmer_ops: 10, presentations_monthly: 1,
      social_posts_monthly: 30, ai_video_analysis_monthly: 2, agent_create: 1
    },
    pro: {
      active_projects: 999999, active_tasks: 999999, active_forms: 10,
      ai_chat_daily_queries: 150, ai_images_monthly: 15,
      agent_responses_monthly: 500, voice_commands_monthly: 60,
      voice_live_minutes: 30, video_live_minutes: 5,
      storage_gb: 10, crm_clients_monthly: 999999, meetings_monthly: 60,
      grounding_monthly: 100, live_sessions_monthly: 30, articles_monthly: 0,
      publish_sites: 10, web_programmer_ops: 120, presentations_monthly: 10,
      social_posts_monthly: 100, ai_video_analysis_monthly: 10, agent_create: 1
    },
    premium: {
      active_projects: 999999, active_tasks: 999999, active_forms: 50,
      ai_chat_daily_queries: 500, ai_images_monthly: 60,
      agent_responses_monthly: 1500, voice_commands_monthly: 240,
      voice_live_minutes: 120, video_live_minutes: 20,
      storage_gb: 50, crm_clients_monthly: 999999, meetings_monthly: 999999,
      grounding_monthly: 300, live_sessions_monthly: 999999, articles_monthly: 10,
      publish_sites: 30, web_programmer_ops: 350, presentations_monthly: 50,
      social_posts_monthly: 300, ai_video_analysis_monthly: 40, agent_create: 3
    }
  };

  const serverDefaultCounters = (nowIso: string) => ({
    daily_chat_count: 0,
    daily_entry_count: 0,
    daily_form_edits: 0,
    last_daily_reset: nowIso,
    monthly_images_used: 0,
    monthly_web_ops_used: 0,
    monthly_presentations_used: 0,
    monthly_posts_used: 0,
    monthly_agent_responses: 0,
    monthly_voice_commands: 0,
    monthly_voice_minutes: 0,
    monthly_video_minutes: 0,
    monthly_meetings_created: 0,
    monthly_grounding_used: 0,
    monthly_live_sessions_used: 0,
    monthly_videos_analyzed: 0,
    monthly_crm_clients_created: 0,
    monthly_articles_published: 0,
    current_projects_count: 0,
    current_tasks_count: 0,
    current_forms_count: 0,
    current_agents_count: 0,
    current_storage_bytes: 0,
    current_published_sites: 0,
    last_activity: nowIso
  });

  const SERVER_MONTHLY_USAGE_KEYS = Array.from(new Set(Object.values(SERVER_FEATURE_LIMIT_MAP).filter(v => v.reset === 'monthly').map(v => v.usageKey)));
  const SERVER_DAILY_USAGE_KEYS = Array.from(new Set(Object.values(SERVER_FEATURE_LIMIT_MAP).filter(v => v.reset === 'daily').map(v => v.usageKey)));

  function serverModuleChatCost(moduleName?: string | null): number {
    const m = String(moduleName || 'chat').toLowerCase();
    if (['web', 'contracts', 'cfo', 'media', 'summaries'].includes(m)) return 2;
    return 1;
  }

  async function consumeFeatureOrReject(req: any, featureKey: ServerFeatureKey, amount: number = 1, metadata: any = {}) {
    const uid = req.user?.uid;
    if (!uid) {
      const err: any = new Error('Usuario no autenticado.');
      err.status = 401;
      throw err;
    }

    const feature = SERVER_FEATURE_LIMIT_MAP[featureKey];
    const usageRef = firestore.collection('user_usage').doc(uid);
    const userRef = firestore.collection('users').doc(uid);

    await firestore.runTransaction(async (tx) => {
      const [usageSnap, userSnap] = await Promise.all([tx.get(usageRef), tx.get(userRef)]);
      const now = new Date();
      const nowIso = now.toISOString();
      const nextMonth = new Date(now);
      nextMonth.setMonth(now.getMonth() + 1);

      const userData = userSnap.exists ? (userSnap.data() || {}) : {};
      const userEmail = String((userData as any).email || req.user?.email || '').toLowerCase();
      const isSuperAdminUser = ['deoc29@gmail.com', 'deoc29@hotmail.com', 'vaoc93@hotmail.com', 'info@goatify.app'].includes(userEmail) || Boolean((userData as any).isSuperAdmin);
      let plan = String((userData as any).plan || 'free').toLowerCase();
      const subscriptionStatus = String((userData as any).subscriptionStatus || 'active').toLowerCase();
      if (subscriptionStatus === 'canceled' && plan !== 'free') plan = 'free';
      if (!SERVER_PLAN_LIMITS[plan]) plan = 'free';

      const defaultUsage: any = {
        user_id: uid,
        plan_id: plan,
        total_cost_usd: 0,
        tokens_in: 0,
        tokens_out: 0,
        billing_cycle_start: nowIso,
        billing_cycle_end: nextMonth.toISOString(),
        counters: serverDefaultCounters(nowIso)
      };

      const rawUsage: any = usageSnap.exists ? (usageSnap.data() || {}) : defaultUsage;
      const counters: any = { ...serverDefaultCounters(nowIso), ...(rawUsage.counters || {}) };
      const updates: any = {
        plan_id: plan,
        [`counters.last_activity`]: nowIso
      };

      if (!usageSnap.exists) {
        tx.set(usageRef, defaultUsage, { merge: true });
      }

      const lastDaily = counters.last_daily_reset ? new Date(counters.last_daily_reset) : new Date(0);
      if (now.getUTCDate() !== lastDaily.getUTCDate() || now.getUTCMonth() !== lastDaily.getUTCMonth() || now.getUTCFullYear() !== lastDaily.getUTCFullYear()) {
        for (const key of SERVER_DAILY_USAGE_KEYS) {
          counters[key] = 0;
          updates[`counters.${key}`] = 0;
        }
        updates[`counters.last_daily_reset`] = nowIso;
      }

      const billingEnd = rawUsage.billing_cycle_end ? new Date(rawUsage.billing_cycle_end) : nextMonth;
      if (now >= billingEnd) {
        for (const key of SERVER_MONTHLY_USAGE_KEYS) {
          counters[key] = 0;
          updates[`counters.${key}`] = 0;
        }
        updates.billing_cycle_start = nowIso;
        updates.billing_cycle_end = nextMonth.toISOString();
        updates.total_cost_usd = 0;
        updates.tokens_in = 0;
        updates.tokens_out = 0;
        if (subscriptionStatus === 'canceled' && userSnap.exists) {
          tx.update(userRef, { plan: 'free', subscriptionStatus: 'active' });
        }
      }

      let limitValue = SERVER_PLAN_LIMITS[plan][feature.limitKey];
      if (typeof limitValue !== 'number') limitValue = 0;
      const extraAgents = Number((userData as any).extraAgentsPurchased || 0);
      if (featureKey === 'ai_chat') limitValue += (extraAgents * 50);
      if (featureKey === 'agent_response') limitValue += (extraAgents * 1000);
      if (featureKey === 'voice_live_minute') limitValue += (extraAgents * 30);
      if (featureKey === 'agent_create') limitValue += extraAgents;
      if (isSuperAdminUser) limitValue = 999999;

      const currentValue = Number(counters[feature.usageKey] || 0);
      const safeAmount = ['voice_live_minute', 'video_live_minute'].includes(featureKey) ? Math.max(0.1, Number(amount) || 0.1) : Math.max(1, Number(amount) || 1);

      if (featureKey === 'storage') {
        const limitInBytes = limitValue * 1024 * 1024 * 1024;
        if (limitInBytes > 0 && limitValue !== 999999 && (currentValue + safeAmount) > limitInBytes) {
          const err: any = new Error(`Espacio insuficiente. Tu plan permite ${limitValue} GB de Drive.`);
          err.status = 402;
          throw err;
        }
      } else if (limitValue !== 999999 && (currentValue + safeAmount) > limitValue) {
        const err: any = new Error(`Límite alcanzado para ${featureKey}. Usado: ${currentValue}/${limitValue}.`);
        err.status = 402;
        throw err;
      }

      updates[`counters.${feature.usageKey}`] = admin.firestore.FieldValue.increment(safeAmount);
      tx.set(usageRef, updates, { merge: true });
      const logRef = firestore.collection('users').doc(uid).collection('usage_logs').doc();
      tx.set(logRef, {
        module: metadata.module || 'backend',
        action: metadata.action || featureKey,
        featureKey,
        amount: safeAmount,
        plan,
        endpoint: metadata.endpoint || req.path,
        createdAt: nowIso,
        success: true
      });
    });
  }

  async function releaseFeatureConsumption(req: any, featureKey: ServerFeatureKey, amount: number = 1) {
    const uid = req.user?.uid;
    if (!uid) return;
    const feature = SERVER_FEATURE_LIMIT_MAP[featureKey];
    const safeAmount = ['voice_live_minute', 'video_live_minute'].includes(featureKey) ? Math.max(0.1, Number(amount) || 0.1) : Math.max(1, Number(amount) || 1);
    const usageRef = firestore.collection('user_usage').doc(uid);
    try {
      await firestore.runTransaction(async (tx) => {
        const snap = await tx.get(usageRef);
        const current = Number((snap.data()?.counters || {})[feature.usageKey] || 0);
        tx.set(usageRef, {
          counters: {
            [feature.usageKey]: Math.max(0, current - safeAmount),
            last_activity: new Date().toISOString()
          }
        }, { merge: true });
      });
    } catch (e) {
      console.warn('[CREDIT RELEASE] No se pudo revertir consumo:', e);
    }
  }

  function sendLimitError(res: any, e: any) {
    const status = Number(e?.status || 402);
    return res.status(status).json({ ok: false, error: e?.message || 'Límite del plan alcanzado.', code: 'PLAN_LIMIT_REACHED' });
  }


  // --- USAGE API (SERVER-AUTHORIZED NON-AI COUNTERS) ---
  // V11: métricas de producto como social_post/presentation/web_programmer se consumen desde Cloud Run,
  // no desde escrituras directas del cliente, para evitar doble conteo o manipulación fácil.
  const PUBLIC_CONSUMABLE_FEATURES: ServerFeatureKey[] = Object.keys(SERVER_FEATURE_LIMIT_MAP) as ServerFeatureKey[];

  app.post('/api/usage/consume', requireFirebaseUser, async (req: any, res: any) => {
    const { featureKey, amount = 1, metadata = {} } = req.body || {};
    if (!PUBLIC_CONSUMABLE_FEATURES.includes(featureKey)) {
      return res.status(400).json({ ok: false, error: 'Feature no permitida para consumo directo.' });
    }
    const baseAmount = ['voice_live_minute', 'video_live_minute'].includes(featureKey) ? Math.max(0.1, Number(amount) || 0.1) : Math.max(1, Number(amount) || 1);
    const safeAmount = Math.min(baseAmount, featureKey === 'storage' ? 2 * 1024 * 1024 * 1024 : 500);
    try {
      await consumeFeatureOrReject(req, featureKey, safeAmount, { module: 'client_usage', action: 'consume_feature', ...metadata });
      return res.json({ ok: true, featureKey, amount: safeAmount });
    } catch (e: any) {
      return sendLimitError(res, e);
    }
  });

  app.post('/api/usage/release', requireFirebaseUser, async (req: any, res: any) => {
    const { featureKey, amount = 1 } = req.body || {};
    if (!PUBLIC_CONSUMABLE_FEATURES.includes(featureKey)) {
      return res.status(400).json({ ok: false, error: 'Feature no permitida para rollback directo.' });
    }
    const baseAmount = ['voice_live_minute', 'video_live_minute'].includes(featureKey) ? Math.max(0.1, Number(amount) || 0.1) : Math.max(1, Number(amount) || 1);
    const safeAmount = Math.min(baseAmount, featureKey === 'storage' ? 2 * 1024 * 1024 * 1024 : 500);
    await releaseFeatureConsumption(req, featureKey, safeAmount);
    return res.json({ ok: true });
  });


  async function recalculateUsageForUid(uid: string) {
    const nowIso = new Date().toISOString();
    const projectsSnap = await firestore.collection('projects').where('ownerId', '==', uid).get();
    let taskCount = 0;
    let totalBytes = 0;
    projectsSnap.forEach((pDoc: any) => {
      const p = pDoc.data() || {};
      (p.folders || []).forEach((f: any) => { taskCount += Array.isArray(f.tasks) ? f.tasks.length : 0; });
      (p.documents || []).forEach((d: any) => { totalBytes += Number(d.size || d.sizeBytes || 0); });
      (p.clients || []).forEach((c: any) => (c.files || []).forEach((f: any) => { totalBytes += Number(f.size || f.sizeBytes || 0); }));
    });
    const [agentsSnap, formsSnap, sitesSnap, recordingsSnap, stickersSnap, driveSnap] = await Promise.all([
      firestore.collection('agents').where('ownerId', '==', uid).get(),
      firestore.collection('forms').where('ownerId', '==', uid).get(),
      firestore.collection('published_sites').where('ownerId', '==', uid).get(),
      firestore.collection('users').doc(uid).collection('recordings').get(),
      firestore.collection('users').doc(uid).collection('customStickers').get(),
      firestore.collection('users').doc(uid).collection('settings').doc('drive').get()
    ]);
    const activeSites = sitesSnap.docs.filter((d: any) => d.data()?.active !== false).length;
    recordingsSnap.forEach((d: any) => { totalBytes += Number(d.data()?.sizeBytes || d.data()?.size || 0); });
    stickersSnap.forEach(() => { totalBytes += 204800; });
    const driveData = driveSnap.exists ? (driveSnap.data() || {}) : {};
    if (Array.isArray((driveData as any).personalFiles)) {
      (driveData as any).personalFiles.forEach((f: any) => { totalBytes += Number(f.size || f.sizeBytes || 0); });
    }
    await firestore.collection('user_usage').doc(uid).set({
      user_id: uid,
      counters: {
        current_projects_count: projectsSnap.size,
        current_tasks_count: taskCount,
        current_agents_count: agentsSnap.size,
        current_forms_count: formsSnap.size,
        current_published_sites: activeSites,
        current_storage_bytes: totalBytes,
        last_activity: nowIso
      }
    }, { merge: true });
    return { projects: projectsSnap.size, tasks: taskCount, agents: agentsSnap.size, forms: formsSnap.size, publishedSites: activeSites, storageBytes: totalBytes };
  }

  app.post('/api/usage/sync', requireFirebaseUser, async (req: any, res: any) => {
    const uid = req.user.uid;
    const userSnap = await firestore.collection('users').doc(uid).get();
    const userPlan = String((userSnap.data() || {}).plan || req.body?.plan || 'free').toLowerCase();
    const now = new Date();
    const nextMonth = new Date(now);
    nextMonth.setMonth(now.getMonth() + 1);
    await firestore.collection('user_usage').doc(uid).set({
      user_id: uid,
      plan_id: SERVER_PLAN_LIMITS[userPlan] ? userPlan : 'free',
      billing_cycle_start: now.toISOString(),
      billing_cycle_end: nextMonth.toISOString(),
      counters: { ...serverDefaultCounters(now.toISOString()) }
    }, { merge: true });
    return res.json({ ok: true });
  });

  app.post('/api/usage/recalculate', requireFirebaseUser, async (req: any, res: any) => {
    const stats = await recalculateUsageForUid(req.user.uid);
    return res.json({ ok: true, stats });
  });

  app.post('/api/usage/entry', requireFirebaseUser, async (req: any, res: any) => {
    const uid = req.user.uid;
    const usageRef = firestore.collection('user_usage').doc(uid);
    await firestore.runTransaction(async (tx) => {
      const snap = await tx.get(usageRef);
      const now = new Date();
      const nowIso = now.toISOString();
      const today = now.toISOString().split('T')[0];
      if (!snap.exists) {
        tx.set(usageRef, { user_id: uid, counters: { ...serverDefaultCounters(nowIso), daily_entry_count: 1, last_entry_date: today } }, { merge: true });
        return;
      }
      const data: any = snap.data() || {};
      const counters = data.counters || {};
      const lastDaily = counters.last_daily_reset ? new Date(counters.last_daily_reset) : new Date(0);
      const updates: any = { 'counters.last_entry_date': today, 'counters.last_activity': nowIso };
      if (now.getUTCDate() !== lastDaily.getUTCDate() || now.getUTCMonth() !== lastDaily.getUTCMonth() || now.getUTCFullYear() !== lastDaily.getUTCFullYear()) {
        for (const key of SERVER_DAILY_USAGE_KEYS) updates[`counters.${key}`] = 0;
        updates['counters.daily_entry_count'] = 1;
        updates['counters.last_daily_reset'] = nowIso;
      } else {
        updates['counters.daily_entry_count'] = admin.firestore.FieldValue.increment(1);
      }
      tx.set(usageRef, updates, { merge: true });
    });
    return res.json({ ok: true });
  });

  const OWNER_AGENT_FEATURES: ServerFeatureKey[] = ['ai_chat', 'agent_response', 'voice_live_minute', 'video_live_minute'];



  async function canOwnerUseFeature(ownerId: string, featureKey: ServerFeatureKey, amount: number = 1) {
    const feature = SERVER_FEATURE_LIMIT_MAP[featureKey];
    const [usageSnap, userSnap] = await Promise.all([
      firestore.collection('user_usage').doc(ownerId).get(),
      firestore.collection('users').doc(ownerId).get()
    ]);
    const userData: any = userSnap.exists ? (userSnap.data() || {}) : {};
    const email = String(userData.email || '').toLowerCase();
    const isSuperAdminUser = ['deoc29@gmail.com', 'deoc29@hotmail.com', 'vaoc93@hotmail.com', 'info@goatify.app'].includes(email) || Boolean(userData.isSuperAdmin);
    let plan = String(userData.plan || 'free').toLowerCase();
    const subscriptionStatus = String(userData.subscriptionStatus || 'active').toLowerCase();
    if (subscriptionStatus === 'canceled' && plan !== 'free') plan = 'free';
    if (!SERVER_PLAN_LIMITS[plan]) plan = 'free';
    const counters = { ...serverDefaultCounters(new Date().toISOString()), ...((usageSnap.data() || {}).counters || {}) };
    let limitValue = SERVER_PLAN_LIMITS[plan][feature.limitKey];
    if (typeof limitValue !== 'number') limitValue = 0;
    const extraAgents = Number(userData.extraAgentsPurchased || 0);
    if (featureKey === 'ai_chat') limitValue += (extraAgents * 50);
    if (featureKey === 'agent_response') limitValue += (extraAgents * 1000);
    if (featureKey === 'voice_live_minute') limitValue += (extraAgents * 30);
    if (featureKey === 'agent_create') limitValue += extraAgents;
    if (isSuperAdminUser) return true;
    const currentValue = Number((counters as any)[feature.usageKey] || 0);
    const safeAmount = ['voice_live_minute', 'video_live_minute'].includes(featureKey) ? Math.max(0.1, Number(amount) || 0.1) : Math.max(1, Number(amount) || 1);
    if (featureKey === 'storage') {
      const limitInBytes = limitValue * 1024 * 1024 * 1024;
      return !(limitInBytes > 0 && (currentValue + safeAmount) > limitInBytes);
    }
    return limitValue === 999999 || (currentValue + safeAmount) <= limitValue;
  }

  app.post('/api/usage/can-use-agent-owner', requireFirebaseUser, async (req: any, res: any) => {
    const { ownerId, agentId, featureKey, amount = 1 } = req.body || {};
    if (!ownerId || !agentId || !OWNER_AGENT_FEATURES.includes(featureKey)) {
      return res.status(400).json({ ok: false, error: 'Solicitud de validación de agente inválida.' });
    }
    const agentSnap = await firestore.collection('agents').doc(agentId).get();
    if (!agentSnap.exists || agentSnap.data()?.ownerId !== ownerId) {
      return res.status(403).json({ ok: false, error: 'Agente no autorizado para este owner.' });
    }
    const ok = await canOwnerUseFeature(ownerId, featureKey, amount);
    return res.json({ ok: true, allowed: ok });
  });

  app.post('/api/usage/consume-agent-owner', requireFirebaseUser, async (req: any, res: any) => {
    const { ownerId, agentId, featureKey, amount = 1, metadata = {} } = req.body || {};
    if (!ownerId || !agentId || !OWNER_AGENT_FEATURES.includes(featureKey)) {
      return res.status(400).json({ ok: false, error: 'Solicitud de consumo de agente inválida.' });
    }
    const agentSnap = await firestore.collection('agents').doc(agentId).get();
    if (!agentSnap.exists || agentSnap.data()?.ownerId !== ownerId) {
      return res.status(403).json({ ok: false, error: 'Agente no autorizado para este owner.' });
    }
    const ownerSnap = await firestore.collection('users').doc(ownerId).get();
    const fakeReq = { ...req, user: { uid: ownerId, email: ownerSnap.data()?.email || '' }, path: req.path };
    try {
      await consumeFeatureOrReject(fakeReq, featureKey, Math.max(1, Number(amount) || 1), { module: 'public_agent', agentId, visitorUid: req.user.uid, ...metadata });
      return res.json({ ok: true });
    } catch (e: any) {
      return sendLimitError(res, e);
    }
  });

  app.post('/api/usage/release-agent-owner', requireFirebaseUser, async (req: any, res: any) => {
    const { ownerId, agentId, featureKey, amount = 1 } = req.body || {};
    if (!ownerId || !agentId || !OWNER_AGENT_FEATURES.includes(featureKey)) {
      return res.status(400).json({ ok: false, error: 'Solicitud de rollback de agente inválida.' });
    }
    const agentSnap = await firestore.collection('agents').doc(agentId).get();
    if (!agentSnap.exists || agentSnap.data()?.ownerId !== ownerId) {
      return res.status(403).json({ ok: false, error: 'Agente no autorizado para este owner.' });
    }
    const fakeReq = { ...req, user: { uid: ownerId }, path: req.path };
    await releaseFeatureConsumption(fakeReq, featureKey, Math.max(1, Number(amount) || 1));
    return res.json({ ok: true });
  });

  app.get("/api/debug/gemini-key", (req: any, res: any) => {
    if (process.env.NODE_ENV === "production") return res.status(404).send();
    const { key, source, ignored } = getValidGeminiApiKey();
    
    res.json({
      timestamp: new Date().toISOString(),
      selectedVariable: source || "NONE",
      ignoredVariables: ignored,
      selectedKeyAnalysis: key ? {
        length: key.length,
        startsWithAIza: key.startsWith("AIza"),
        sha256Prefix10: crypto.createHash('sha256').update(key).digest('hex').substring(0, 10)
      } : null,
      rawEnvNames: Object.keys(process.env).filter(k => k.includes("KEY"))
    });
  });

  app.get("/api/health/gemini", async (req: any, res: any) => {
    const { key: apiKey, source } = getValidGeminiApiKey();
    
    const report: any = {
      status: "DIAGNOSING",
      sourceUsed: source || "NONE",
      checks: {
        ENV: !!apiKey ? "OK" : "MISSING",
        KEY: "PENDING",
        MODEL: "PENDING",
        BILLING: "PENDING",
        RESTRICTIONS: "PENDING",
      },
      details: ""
    };

    if (!apiKey) {
      report.status = "FAIL";
      report.details = "No se encontró ninguna API Key válida (debe empezar con AIza y tener >35 caracteres). Variables revisadas: GEMINI_API_KEY, API_KEY, GOOGLE_API_KEY.";
      return res.status(500).json(report);
    }

    const targetModel = "gemini-3.1-flash-lite-preview";
    try {
      const ai = new GoogleGenAI({ apiKey } as any); 
      
      const result = await (ai as any).models.generateContent({
        model: targetModel,
        contents: "Responde solo OK"
      });

      if (result && result.text) {
        report.status = "OK";
        report.checks.KEY = "OK";
        report.checks.MODEL = "OK";
        report.checks.BILLING = "OK";
        report.checks.RESTRICTIONS = "OK";
        report.details = `Gemini responde correctamente usando la variable ${source}. (Modelo: ${targetModel})`;
        return res.json(report);
      } else {
        report.status = "WARNING";
        report.details = "Respuesta recibida pero estructura inesperada o texto vacío.";
        return res.json(report);
      }
    } catch (error: any) {
      report.status = "FAIL";
      const message = error.message || String(error);
      const status = error.status || 500;

      console.error(`[Gemini HealthCheck] Error: ${message.substring(0, 150)}`);

      if (message.includes("403") || message.includes("PERMISSION_DENIED") || message.includes("API key not valid")) {
        report.checks.KEY = "INVALID";
        report.details = `403/Invalid: La clave de ${source} es rechazada por Google. Mensaje: ${message.substring(0, 50)}`;
      } else if (message.includes("404") || message.includes("not found")) {
        report.checks.MODEL = "INVALID";
        report.details = `404: El modelo ${targetModel} no está disponible o no existe. Mensaje: ${message.substring(0, 50)}`;
      } else if (message.includes("429") || message.includes("RESOURCE_EXHAUSTED")) {
        report.checks.BILLING = "QUOTA_EXCEEDED";
        report.details = `429: Cuota excedida. Mensaje: ${message.substring(0, 50)}`;
      } else {
        report.details = message.substring(0, 200);
      }

      return res.status(status).json(report);
    }
  });

  // --- PERPLEXITY PROXY (SECURE) ---
  app.post("/api/perplexity", requireFirebaseUser, async (req: any, res: any) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "Se requiere un query" });

    let creditConsumed = false;
    try {
      await consumeFeatureOrReject(req, 'ai_grounding', 1, { module: 'search', action: 'perplexity_search' });
      creditConsumed = true;
    } catch (e: any) {
      return sendLimitError(res, e);
    }

    const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
    const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";

    if (!PERPLEXITY_API_KEY) {
      if (creditConsumed) await releaseFeatureConsumption(req, 'ai_grounding', 1);
      return res.status(500).json({ error: "PERPLEXITY_API_KEY no está configurada en el servidor." });
    }

    try {
      const response = await fetch(PERPLEXITY_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "sonar",
          messages: [
            {
              role: "system",
              content: "Se preciso, ejecutivo y proporciona información actualizada. Responde siempre en el idioma en que se te pregunta."
            },
            {
              role: "user",
              content: query
            }
          ],
          temperature: 0.2,
          top_p: 0.9,
          return_citations: true,
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Error de API Perplexity:", errorText);
        if (creditConsumed) await releaseFeatureConsumption(req, 'ai_grounding', 1);
        return res.status(response.status).json({ error: "Error en la búsqueda web" });
      }

      const data = await response.json();
      res.json({
        text: data.choices[0].message.content,
        citations: data.citations || []
      });
    } catch (error) {
      if (creditConsumed) await releaseFeatureConsumption(req, 'ai_grounding', 1);
      console.error("Fallo en proxy Perplexity:", error);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  });


  // --- PUSH NOTIFICATIONS ---
  app.post("/api/push/subscribe", requireAuth, async (req: any, res) => {
    const { subscription } = req.body;
    const userId = req.session.userId;
    if (!userId || !subscription) return res.status(400).json({ error: "Faltan datos" });

    try {
      // Usar el endpoint como ID único para evitar duplicados
      const subId = Buffer.from(subscription.endpoint).toString('base64').substring(0, 100);
      await firestore.collection(`users/${userId}/push_subscriptions`).doc(subId).set({
        ...subscription,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      res.json({ success: true });
    } catch (e) {
      console.error("Error saving push subscription:", e);
      res.status(500).json({ error: "No se pudo guardar la suscripción" });
    }
  });

  // 1. Entrada Directa segura para Mail/Calendar legacy.
  // Ya no confiamos en userId enviado desde el navegador: se valida con Firebase ID Token.
  app.post("/api/auth/login", async (req: any, res: any) => {
    try {
      const firebaseToken = req.headers.authorization?.split(" ")[1];
      if (!firebaseToken) return res.status(401).json({ error: "Firebase token requerido." });
      const decoded = await admin.auth().verifyIdToken(firebaseToken);
      const requestedUserId = req.body?.userId;
      if (requestedUserId && requestedUserId !== decoded.uid) {
        return res.status(403).json({ error: "No puedes crear sesión para otro usuario." });
      }
      const token = "goatify_" + crypto.randomUUID();
      sessions.set(token, { id: token, accounts: [], userId: decoded.uid, email: decoded.email || null });
      res.json({ token });
    } catch (e: any) {
      console.error("Secure auth login failed:", e?.message || e);
      res.status(401).json({ error: "Token inválido o sesión expirada." });
    }
  });

  app.post("/api/admin/deleteUser", requireFirebaseUser, async (req: any, res) => {
    const { targetUid } = req.body;
    const adminUid = req.user?.uid;
    if (!targetUid || !adminUid) return res.status(400).send("Faltan datos");
    
    try {
        // Doble verificación: solo un admin autenticado puede borrar
        const adminDoc = await firestore.collection('users').doc(adminUid).get();
        if (!adminDoc.exists || !adminDoc.data()?.isSuperAdmin) {
            return res.status(403).send("No autorizado");
        }

        await admin.auth().deleteUser(targetUid);
        res.json({ success: true });
    } catch (e: any) {
        console.error("Error deleting user from Auth:", e);
        res.status(500).json({ error: e.message });
    }
  });

  // 1.1 Identificar sesión con userId y cuentas guardadas
  app.post("/api/auth/identify", express.json(), async (req: any, res: any) => {
    const { token, userId } = req.query;
    const { accounts, isSuperAdmin } = req.body || {};
    if (token && userId) {
      if (!sessions.has(token as string)) {
        return res.status(401).json({ error: "Sesión no inicializada. Vuelve a entrar a Mail." });
      }
      const sess = sessions.get(token as string);
      if (sess.userId && sess.userId !== userId) {
        return res.status(403).json({ error: "Sesión no corresponde al usuario actual." });
      }
      sess.userId = userId as string;
      if (isSuperAdmin !== undefined) sess.isSuperAdmin = isSuperAdmin;
      
      // PERSISTENCIA SERVIDOR: Cargar cuentas desde backend Firestore (seguro)
      try {
        const docMap = await firestore.collection('user_email_accounts').doc(userId as string).get();
        if (docMap.exists) {
            const data = docMap.data() as any;
            if (data.encryptedAccounts) {
                const decrypted = decryptAccountData(data.encryptedAccounts);
                if (decrypted && Array.isArray(decrypted)) {
                    sess.accounts = decrypted;
                }
            }
        }
      } catch (e) {
        console.error("Error loading accounts from backend Firestore:", e);
      }

      // Migración legacy desde cliente (solo para cuentas pre-existentes no encriptadas si aplica)
      if (accounts && Array.isArray(accounts) && sess.accounts.length === 0) {
        accounts.forEach((acc: any) => {
          if (!sess.accounts.find((a: any) => a.email === acc.email)) {
            sess.accounts.push({
              ...acc,
              id: acc.id || crypto.randomUUID()
            });
          }
        });
        // Si recuperamos cuentas antiguas, las encriptamos y aseguramos ahora
        if (sess.accounts.length > 0) {
           await syncAccountsToFirestore(sess.userId, sess.accounts);
        }
      }
      
      res.json({ success: true, initialized: true });
    } else {
      res.status(400).json({ error: "Invalid token or userId" });
    }
  });

  app.post("/api/campaigns/schedule", requireAuth, async (req: any, res) => {
    const { ownerId, accountId, mailOptions, sendAt } = req.body;
    
    if (!ownerId || !mailOptions || !sendAt) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    scheduledEmails.set(jobId, {
      jobId,
      ownerId,
      accountId,
      mailOptions,
      sendAt // timestamp in ms
    });

    res.json({ success: true, jobId });
  });

  // 1.2 Endpoint público para confirmación de Scheduler
  app.post("/api/scheduler/confirm", async (req, res) => {
    const { ownerId, ownerEmail, guestEmail, guestName, date, time, meetingLink, notes } = req.body;
    
    // Buscar una sesión activa para este ownerId
    let ownerSession = null;
    for (const sess of sessions.values()) {
        if (sess.userId === ownerId) {
            ownerSession = sess;
            break;
        }
    }

    // SI NO HAY SESIÓN O FALLA, MANDAMOS A LA COLA AUTÓNOMA
    if (!ownerSession || !ownerSession.accounts || ownerSession.accounts.length === 0) {
        await firestore.collection('mail_queue').add({
            ownerId,
            to: guestEmail,
            bcc: ownerEmail,
            subject: `Confirmación de Reunión: ${date} a las ${time}`,
            htmlBody: `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
                <h2 style="color: #6366f1;">¡Hola ${guestName}!</h2>
                <p>Tu reunión ha sido agendada con éxito.</p>
                <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>Fecha:</strong> ${date}</p>
                    <p><strong>Hora:</strong> ${time}</p>
                    <p><strong>Notas:</strong> ${notes || 'Sin notas adicionales'}</p>
                </div>
                <p>Para unirte a la reunión en el momento acordado, haz clic en el siguiente enlace:</p>
                <a href="${meetingLink}" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Unirse a la Videollamada</a>
                <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;" />
                <p style="font-size: 12px; color: #aaa; text-align: center;">Este es un mensaje automático de Goatify Scheduler.</p>
                </div>
            `,
            status: 'pending',
            isSystemNotification: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return res.json({ success: true, queued: true });
    }

    const acc = ownerSession.accounts[0]; 
    await refreshAccountTokens(acc);

    const isGoogleOAuth = acc.provider === 'google';
    const isMicrosoftOAuth = acc.provider === 'microsoft';
    const isGmailManual = acc.provider === 'gmail_manual';
    const isOutlookManual = acc.provider === 'outlook_manual';

    let transporterOptions: any;
    if (isGoogleOAuth) {
      transporterOptions = {
        host: 'smtp.gmail.com', port: 465, secure: true,
        auth: { type: 'OAuth2', user: acc.email, clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, refreshToken: acc.tokens.refresh_token, accessToken: acc.tokens.access_token }
      };
    } else if (isMicrosoftOAuth) {
      transporterOptions = {
        host: 'smtp.office365.com', port: 587, secure: false,
        auth: { type: 'OAuth2', user: acc.email, accessToken: acc.tokens.access_token },
        tls: { ciphers: 'SSLv3' }
      };
    } else {
        const host = (isGmailManual) ? "smtp.gmail.com" : (isOutlookManual) ? "smtp.office365.com" : "smtppro.zoho.com";
        const port = isOutlookManual ? 587 : 465;
        const secure = !isOutlookManual;
        transporterOptions = { host, port, secure, auth: { user: acc.email, pass: acc.password } };
    }

    const transporter = nodemailer.createTransport(transporterOptions);

    const guestMailOptions = {
      from: `"Goatify Scheduler" <${acc.email}>`,
      to: guestEmail,
      bcc: acc.email,
      subject: `Confirmación de Reunión: ${date} a las ${time}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
          <h2 style="color: #6366f1;">¡Hola ${guestName}!</h2>
          <p>Tu reunión ha sido agendada con éxito.</p>
          <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Fecha:</strong> ${date}</p>
            <p><strong>Hora:</strong> ${time}</p>
            <p><strong>Notas:</strong> ${notes || 'Sin notas adicionales'}</p>
          </div>
          <p>Para unirte a la reunión en el momento acordado, haz clic en el siguiente enlace:</p>
          <a href="${meetingLink}" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Unirse a la Videollamada</a>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;" />
          <p style="font-size: 12px; color: #aaa; text-align: center;">Este es un mensaje automático de Goatify Scheduler.</p>
        </div>
      `
    };

    const ownerMailOptions = {
      from: `"Goatify Scheduler" <${acc.email}>`,
      to: ownerEmail,
      bcc: acc.email,
      subject: `NUEVA REUNIÓN AGENDADA: ${guestName} - ${date}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
          <h2 style="color: #6366f1;">¡Hola!</h2>
          <p>Alguien ha agendado una nueva reunión contigo.</p>
          <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Cliente:</strong> ${guestName}</p>
            <p><strong>Email:</strong> ${guestEmail}</p>
            <p><strong>Fecha:</strong> ${date}</p>
            <p><strong>Hora:</strong> ${time}</p>
            <p><strong>Notas:</strong> ${notes || 'Sin notas'}</p>
          </div>
          <p>Ver detalles en la app:</p>
          <a href="${meetingLink}" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Ver Reunión</a>
        </div>
      `
    };

    try {
      await transporter.sendMail(guestMailOptions);
      if (ownerEmail) await transporter.sendMail(ownerMailOptions);
      res.json({ success: true });
    } catch (err) {
      console.error("Error sending scheduler confirmation email:", err);
      res.status(500).json({ error: "Failed to send email" });
    }
  });

  // 1.3 Endpoint para invitaciones a proyectos
  app.post("/api/project/invite", async (req, res) => {
    const { ownerId, ownerName, projectName, guestEmail, targetUrl } = req.body;
    
    let ownerSession = null;
    for (const sess of sessions.values()) {
        if (sess.userId === ownerId) {
            ownerSession = sess;
            break;
        }
    }

    // SI NO HAY SESIÓN O FALLA, MANDAMOS A LA COLA AUTÓNOMA
    if (!ownerSession || !ownerSession.accounts || ownerSession.accounts.length === 0) {
        await firestore.collection('mail_queue').add({
            ownerId,
            to: guestEmail,
            bcc: ownerSession?.accounts?.[0]?.email,
            subject: `Invitación de Colaboración: ${projectName}`,
            htmlBody: `
                <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e5e7eb; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05);">
                <div style="background-color: #111827; padding: 40px 30px; text-align: center; background-image: linear-gradient(135deg, #111827 0%, #1e3a8a 100%);">
                    <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 900; letter-spacing: -0.01em; text-transform: uppercase;">Invitación a Proyecto</h1>
                    <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.2em;">Colaboración en Goatify</p>
                </div>
                <div style="padding: 40px 30px; background-color: #ffffff;">
                    <p style="font-size: 16px; color: #1e293b; line-height: 1.6;">Hola,</p>
                    <p style="font-size: 16px; color: #334155; line-height: 1.6;"><b>${ownerName}</b> te ha invitado a colaborar en el ecosistema digital del proyecto <b>${projectName}</b>.</p>
                    <div style="background: #f8fafc; padding: 25px; border-radius: 12px; margin: 25px 0; border-left: 4px solid #6366f1;">
                    <p style="margin: 0; font-size: 14px; color: #475569; line-height: 1.5;">Trabajen juntos, compartan archivos y gestionen tareas en tiempo real bajo la infraestructura de <b>Goatify</b>.</p>
                    </div>
                    <p style="font-size: 15px; color: #475569; margin-bottom: 30px;">Haz clic en el botón de abajo para aceptar la invitación y acceder:</p>
                    <div style="text-align: center;">
                    <a href="${targetUrl}" style="display: inline-block; background: #6366f1; color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: 900; font-size: 14px; text-transform: uppercase; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);">Aceptar y Acceder al Proyecto</a>
                    </div>
                    <p style="margin-top: 30px; font-size: 13px; color: #94a3b8; text-align: center; line-height: 1.5;">Si aún no tienes cuenta, regístrate con este mismo correo y el acceso se activará automáticamente.</p>
                </div>
                <div style="padding: 25px; text-align: center; background-color: #f8fafc; border-top: 1px solid #e5e7eb;">
                    <p style="font-size: 12px; color: #94a3b8; margin: 0;">Enviado vía Goatify Productivity Suite.<br/>© 2026 Goatify.</p>
                </div>
                </div>
            `,
            status: 'pending',
            isSystemNotification: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return res.json({ success: true, queued: true });
    }

    const acc = ownerSession.accounts[0]; 
    await refreshAccountTokens(acc);

    const transporter = nodemailer.createTransport(
        acc.provider === 'google' ? { host: 'smtp.gmail.com', port: 465, secure: true, auth: { type: 'OAuth2', user: acc.email, clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, refreshToken: acc.tokens.refresh_token, accessToken: acc.tokens.access_token } } :
        acc.provider === 'microsoft' ? { host: 'smtp.office365.com', port: 587, secure: false, auth: { type: 'OAuth2', user: acc.email, accessToken: acc.tokens.access_token }, tls: { ciphers: 'SSLv3' } } :
        { host: (acc.provider === 'gmail_manual') ? "smtp.gmail.com" : (acc.provider === 'outlook_manual') ? "smtp.office365.com" : "smtppro.zoho.com", port: acc.provider === 'outlook_manual' ? 587 : 465, secure: acc.provider !== 'outlook_manual', auth: { user: acc.email, pass: acc.password } }
    );

    const mailOptions = {
      from: `"${ownerName} vía Goatify Proyectos" <${acc.email}>`,
      to: guestEmail,
      bcc: acc.email,
      subject: `Invitación de Colaboración: ${projectName}`,
      html: `
        <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e5e7eb; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05);">
          <div style="background-color: #111827; padding: 40px 30px; text-align: center; background-image: linear-gradient(135deg, #111827 0%, #1e3a8a 100%);">
            <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 900; letter-spacing: -0.01em; text-transform: uppercase;">Invitación a Proyecto</h1>
            <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.2em;">Colaboración en Goatify</p>
          </div>
          
          <div style="padding: 40px 30px; background-color: #ffffff;">
            <p style="font-size: 16px; color: #1e293b; line-height: 1.6;">Hola,</p>
            <p style="font-size: 16px; color: #334155; line-height: 1.6;"><b>${ownerName}</b> te ha invitado a colaborar en el ecosistema digital del proyecto <b>${projectName}</b>.</p>
            
            <div style="background: #f8fafc; padding: 25px; border-radius: 12px; margin: 25px 0; border-left: 4px solid #6366f1;">
              <p style="margin: 0; font-size: 14px; color: #475569; line-height: 1.5;">Trabajen juntos, compartan archivos y gestionen tareas en tiempo real bajo la infraestructura de <b>Goatify</b>.</p>
            </div>
            
            <p style="font-size: 15px; color: #475569; margin-bottom: 30px;">Haz clic en el botón de abajo para aceptar la invitación y acceder:</p>
            
            <div style="text-align: center;">
              <a href="${targetUrl}" style="display: inline-block; background: #6366f1; color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: 900; font-size: 14px; text-transform: uppercase; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);">Aceptar y Acceder al Proyecto</a>
            </div>
            
            <p style="margin-top: 30px; font-size: 13px; color: #94a3b8; text-align: center; line-height: 1.5;">Si aún no tienes cuenta, regístrate con este mismo correo y el acceso se activará automáticamente.</p>
          </div>
          
          <div style="padding: 25px; text-align: center; background-color: #f8fafc; border-top: 1px solid #e5e7eb;">
            <p style="font-size: 12px; color: #94a3b8; margin: 0;">Enviado vía Goatify Productivity Suite.<br/>© 2026 Goatify.</p>
          </div>
        </div>
      `
    };

    try {
      await transporter.sendMail(mailOptions);
      res.json({ success: true });
    } catch (err) {
      console.error("Error sending project invite email:", err);
      res.status(500).json({ error: "Failed to send email" });
    }
  });

  // Endpoint para asignación de tareas
  app.post("/api/task/assign", async (req, res) => {
    const { ownerId, ownerName, projectName, taskName, guestEmail, targetUrl } = req.body;
    
    let ownerSession = null;
    for (const sess of sessions.values()) {
        if (sess.userId === ownerId) {
            ownerSession = sess;
            break;
        }
    }

    // SI NO HAY SESIÓN O FALLA, MANDAMOS A LA COLA AUTÓNOMA
    if (!ownerSession || !ownerSession.accounts || ownerSession.accounts.length === 0) {
        await firestore.collection('mail_queue').add({
            ownerId,
            to: guestEmail,
            bcc: ownerSession?.accounts?.[0]?.email,
            subject: `Nueva Tarea Asignada: ${taskName}`,
            htmlBody: `
                <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e5e7eb; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05);">
                <div style="background-color: #111827; padding: 40px 30px; text-align: center; background-image: linear-gradient(135deg, #111827 0%, #1e3a8a 100%);">
                    <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 900; letter-spacing: -0.01em; text-transform: uppercase;">Nueva Tarea Asignada</h1>
                    <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.2em;">Sistema de Gestión Goatify</p>
                </div>
                <div style="padding: 40px 30px; background-color: #ffffff;">
                    <p style="font-size: 16px; color: #1e293b; line-height: 1.6;">Hola,</p>
                    <p style="font-size: 16px; color: #334155; line-height: 1.6;"><b>${ownerName}</b> te ha asignado una nueva responsabilidad en el proyecto <b>${projectName}</b>:</p>
                    <div style="background: #f8fafc; padding: 25px; border-radius: 12px; margin: 25px 0; border-left: 4px solid #6366f1;">
                    <p style="margin: 0; font-size: 13px; color: #64748b; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">Tarea:</p>
                    <p style="margin: 5px 0 0 0; font-size: 18px; color: #111827; font-weight: 900;">${taskName}</p>
                    </div>
                    <p style="font-size: 15px; color: #475569; margin-bottom: 30px;">Puedes revisar los detalles, adjuntos y tiempos de entrega haciendo clic en el botón de abajo:</p>
                    <div style="text-align: center;">
                    <a href="${targetUrl}" style="display: inline-block; background: #6366f1; color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: 900; font-size: 14px; text-transform: uppercase; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);">Ver Detalles de Tarea</a>
                    </div>
                </div>
                <div style="padding: 25px; text-align: center; background-color: #f8fafc; border-top: 1px solid #e5e7eb;">
                    <p style="font-size: 12px; color: #94a3b8; margin: 0;">Enviado automáticamente vía Goatify Productivity Suite.<br/>© 2026 Goatify.</p>
                </div>
                </div>
            `,
            status: 'pending',
            isSystemNotification: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return res.json({ success: true, queued: true });
    }

    const acc = ownerSession.accounts[0]; 
    await refreshAccountTokens(acc);

    const transporter = nodemailer.createTransport(
        acc.provider === 'google' ? { host: 'smtp.gmail.com', port: 465, secure: true, auth: { type: 'OAuth2', user: acc.email, clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, refreshToken: acc.tokens.refresh_token, accessToken: acc.tokens.access_token } } :
        acc.provider === 'microsoft' ? { host: 'smtp.office365.com', port: 587, secure: false, auth: { type: 'OAuth2', user: acc.email, accessToken: acc.tokens.access_token }, tls: { ciphers: 'SSLv3' } } :
        { host: (acc.provider === 'gmail_manual') ? "smtp.gmail.com" : (acc.provider === 'outlook_manual') ? "smtp.office365.com" : "smtppro.zoho.com", port: acc.provider === 'outlook_manual' ? 587 : 465, secure: acc.provider !== 'outlook_manual', auth: { user: acc.email, pass: acc.password } }
    );

    const mailOptions = {
      from: `"${ownerName} vía Goatify Proyectos" <${acc.email}>`,
      to: guestEmail,
      bcc: acc.email,
      subject: `Nueva Tarea Asignada: ${taskName}`,
      html: `
        <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e5e7eb; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05);">
          <div style="background-color: #111827; padding: 40px 30px; text-align: center; background-image: linear-gradient(135deg, #111827 0%, #1e3a8a 100%);">
            <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 900; letter-spacing: -0.01em; text-transform: uppercase;">Nueva Tarea Asignada</h1>
            <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.2em;">Sistema de Gestión Goatify</p>
          </div>
          
          <div style="padding: 40px 30px; background-color: #ffffff;">
            <p style="font-size: 16px; color: #1e293b; line-height: 1.6;">Hola,</p>
            <p style="font-size: 16px; color: #334155; line-height: 1.6;"><b>${ownerName}</b> te ha asignado una nueva responsabilidad en el proyecto <b>${projectName}</b>:</p>
            
            <div style="background: #f8fafc; padding: 25px; border-radius: 12px; margin: 25px 0; border-left: 4px solid #6366f1;">
              <p style="margin: 0; font-size: 13px; color: #64748b; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">Tarea:</p>
              <p style="margin: 5px 0 0 0; font-size: 18px; color: #111827; font-weight: 900;">${taskName}</p>
            </div>
            
            <p style="font-size: 15px; color: #475569; margin-bottom: 30px;">Puedes revisar los detalles, adjuntos y tiempos de entrega haciendo clic en el botón de abajo:</p>
            
            <div style="text-align: center;">
              <a href="${targetUrl}" style="display: inline-block; background: #6366f1; color: white; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: 900; font-size: 14px; text-transform: uppercase; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);">Ver Detalles de Tarea</a>
            </div>
          </div>
          
          <div style="padding: 25px; text-align: center; background-color: #f8fafc; border-top: 1px solid #e5e7eb;">
            <p style="font-size: 12px; color: #94a3b8; margin: 0;">Enviado automáticamente vía Goatify Productivity Suite.<br/>© 2026 Goatify.</p>
          </div>
        </div>
      `
    };

    try {
      await transporter.sendMail(mailOptions);
      res.json({ success: true });
    } catch (err) {
      console.error("Error sending task assignment email:", err);
      res.status(500).json({ error: "Failed to send email" });
    }
  });

  // 1.35 Endpoint para recibos Intis
  app.post("/api/wallet/receipt", async (req, res) => {
    const { ownerId, ownerName, recipientEmail, amount, note, txId } = req.body;
    
    let ownerSession = null;
    for (const sess of sessions.values()) {
        if (sess.userId === ownerId) {
            ownerSession = sess;
            break;
        }
    }

    if (!ownerSession || !ownerSession.accounts || ownerSession.accounts.length === 0) {
        // Fallback para transacciones del sistema
        if (ownerId === 'system_goatify' || ownerId === 'system_admin_lead') {
            ownerSession = Array.from(sessions.values()).find(s => (s.role === 'admin' || s.email === 'deoc29@gmail.com') && s.accounts && s.accounts.length > 0);
        }
        
        if (!ownerSession || !ownerSession.accounts || ownerSession.accounts.length === 0) {
             return res.status(404).json({ error: "Owner has no email session active or no fallback admin session found" });
        }
    }

    const acc = ownerSession.accounts[0]; 
    await refreshAccountTokens(acc);

    const transporter = nodemailer.createTransport(
        acc.provider === 'google' ? { host: 'smtp.gmail.com', port: 465, secure: true, auth: { type: 'OAuth2', user: acc.email, clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, refreshToken: acc.tokens.refresh_token, accessToken: acc.tokens.access_token } } :
        acc.provider === 'microsoft' ? { host: 'smtp.office365.com', port: 587, secure: false, auth: { type: 'OAuth2', user: acc.email, accessToken: acc.tokens.access_token }, tls: { ciphers: 'SSLv3' } } :
        { host: (acc.provider === 'gmail_manual') ? "smtp.gmail.com" : (acc.provider === 'outlook_manual') ? "smtp.office365.com" : "smtppro.zoho.com", port: acc.provider === 'outlook_manual' ? 587 : 465, secure: acc.provider !== 'outlook_manual', auth: { user: acc.email, pass: acc.password } }
    );

    const mailOptions = {
      from: `"${ownerName} vía Goatify Finance" <${acc.email}>`,
      to: recipientEmail,
      bcc: acc.email,
      subject: `Recibo de Transacción Intis: ${txId}`,
      html: `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 650px; background-color: #f8fafc; padding: 20px; margin: 0 auto;">
        <div style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
            <div style="background-color: #111827; padding: 40px 30px; text-align: center; background-image: linear-gradient(135deg, #111827 0%, #4c1d95 100%);">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 900; letter-spacing: -0.01em;">RECIBO DE <span style="color: #a78bfa;">INTIS</span></h1>
                <p style="color: #94a3b8; margin: 8px 0 0 0; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.2em;">Comprobante de Envío</p>
            </div>
            
            <div style="padding: 40px 30px;">
                <p style="font-size: 16px; color: #1e293b; margin-bottom: 25px;">¡Hola!</p>
                <p style="font-size: 15px; color: #475569; line-height: 1.6; margin-bottom: 30px;"><b>${ownerName}</b> te ha enviado Intis a través de la infraestructura financiera de Goatify. Aquí están los detalles:</p>
                
                <div style="background-color: #f8fafc; border-radius: 16px; border: 1px solid #e2e8f0; padding: 30px; margin-bottom: 35px;">
                    <div style="text-align: center; margin-bottom: 25px;">
                        <span style="display: block; font-size: 11px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 5px;">Monto Recibido</span>
                        <span style="font-size: 42px; font-weight: 900; color: #10b981; letter-spacing: -0.02em;">+${amount} <span style="font-size: 18px; font-weight: 600; color: #94a3b8;">$I</span></span>
                    </div>
                    
                    <div style="border-top: 1px solid #e2e8f0; padding-top: 25px;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; color: #64748b; font-size: 13px; font-weight: 600; width: 40%;">ID de Transacción:</td>
                                <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 800; text-align: right; font-family: monospace;">${txId}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #64748b; font-size: 13px; font-weight: 600;">Remitente:</td>
                                <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 800; text-align: right;">${ownerName}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #64748b; font-size: 13px; font-weight: 600;">Nota:</td>
                                <td style="padding: 8px 0; color: #1e293b; font-size: 13px; font-weight: 800; text-align: right;">${note || 'Sin nota'}</td>
                            </tr>
                        </table>
                    </div>
                </div>

                <div style="text-align: center;">
                    <p style="font-size: 14px; color: #64748b; margin-bottom: 25px;">Puedes revisar tu billetera en la aplicación para ver tu nuevo saldo.</p>
                    <a href="https://ia.goatify.app" style="background-color: #111827; color: white; padding: 15px 30px; text-decoration: none; border-radius: 10px; font-weight: 800; display: inline-block; font-size: 14px; text-transform: uppercase;">Abrir Mi Billetera</a>
                </div>
            </div>
            
            <div style="padding: 30px; text-align: center; background-color: #f8fafc; border-top: 1px solid #e2e8f0;">
                <p style="font-size: 12px; color: #94a3b8; margin: 0;">Enviado vía Goatify Productivity Suite.<br/>© 2026 Goatify Innovation Lab.</p>
            </div>
        </div>
    </div>
      `
    };

    try {
      await transporter.sendMail(mailOptions);
      res.json({ success: true });
    } catch (err) {
      console.error("Error sending intis receipt email:", err);
      res.status(500).json({ error: "Failed to send email" });
    }
  });

  // 1.36 Endpoint para confirmación de registro de fidelización
  app.post("/api/loyalty/registration", async (req, res) => {
    const { ownerId, projectName, userEmail, rewardName, targetVisits } = req.body;
    
    // Buscar sesión del dueño para enviar desde su correo si es posible
    let ownerSession = Array.from(sessions.values()).find(s => s.userId === ownerId && s.accounts && s.accounts.length > 0);
    if (!ownerSession) {
        // Fallback admin
        ownerSession = Array.from(sessions.values()).find(s => (s.role === 'admin' || s.email === 'deoc29@gmail.com') && s.accounts && s.accounts.length > 0);
    }

    if (!ownerSession || !ownerSession.accounts || ownerSession.accounts.length === 0) {
        return res.status(404).json({ error: "No email session found for loyalty notification" });
    }

    const acc = ownerSession.accounts[0];
    await refreshAccountTokens(acc);

    const transporter = nodemailer.createTransport(
        acc.provider === 'google' ? { host: 'smtp.gmail.com', port: 465, secure: true, auth: { type: 'OAuth2', user: acc.email, clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, refreshToken: acc.tokens.refresh_token, accessToken: acc.tokens.access_token } } :
        acc.provider === 'microsoft' ? { host: 'smtp.office365.com', port: 587, secure: false, auth: { type: 'OAuth2', user: acc.email, accessToken: acc.tokens.access_token }, tls: { ciphers: 'SSLv3' } } :
        { host: (acc.provider === 'gmail_manual') ? "smtp.gmail.com" : (acc.provider === 'outlook_manual') ? "smtp.office365.com" : "smtppro.zoho.com", port: acc.provider === 'outlook_manual' ? 587 : 465, secure: acc.provider !== 'outlook_manual', auth: { user: acc.email, pass: acc.password } }
    );

    const mailOptions = {
        from: `"${projectName}" <${acc.email}>`,
        to: userEmail,
        bcc: acc.email,
        subject: `¡Te has unido al Programa de Fidelización de ${projectName}!`,
        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        .email-container { width: 100% !important; max-width: 850px !important; }
    </style>
</head>
<body style="margin: 0; padding: 20px 0; background-color: #f8fafc;">
<div class="email-container" style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; width: 100%; max-width: 850px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); border: 1px solid #e2e8f0; box-sizing: border-box;">
  
  <!-- Header -->
  <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 40px 20px; text-align: center; box-sizing: border-box;">
    <div style="display: inline-block; background: rgba(255, 255, 255, 0.1); padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 700; color: #38bdf8; text-transform: uppercase; letter-spacing: 1.5px; border: 1px solid rgba(56, 189, 248, 0.3); margin-bottom: 20px;">
      Confirmación de Fidelización
    </div>
    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 800; line-height: 1.3; letter-spacing: -0.5px;">
      ¡Bienvenido a ${projectName}!
    </h1>
  </div>

  <!-- Content Body -->
  <div style="padding: 40px 20px; background-color: #ffffff; box-sizing: border-box;">
    
    <p style="font-size: 16px; color: #334155; line-height: 1.8; margin-bottom: 25px;">Hola,</p>
    
    <p style="font-size: 16px; color: #334155; line-height: 1.8; margin-bottom: 30px;">
      Te has registrado exitosamente en nuestro programa de fidelización. Estamos muy felices de tenerte con nosotros y valorar tu lealtad.
    </p>

    <!-- Goal Box -->
    <div style="background-color: #f8fafc; border-left: 4px solid #10b981; padding: 24px 16px; border-radius: 0 8px 8px 0; margin-bottom: 35px; box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.02); box-sizing: border-box;">
      <p style="margin: 0 0 10px 0; color: #64748b; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; font-weight: 800;">Tu Objetivo</p>
      <p style="margin: 0 0 15px 0; color: #0f172a; font-size: 24px; font-weight: 900;">${rewardName}</p>
      <p style="margin: 0; color: #475569; font-size: 15px;">Completa <strong>${targetVisits} visitas</strong> para reclamar tu premio exclusivo.</p>
    </div>

    <p style="font-size: 16px; color: #334155; line-height: 1.8; margin-bottom: 35px;">
      Cada vez que nos visites, asegúrate de registrar tu consumo para acumular puntos y acercarte a tu recompensa.
    </p>

    <!-- Call to Action -->
    <div style="text-align: center; margin-bottom: 30px; box-sizing: border-box;">
      <a href="https://ia.goatify.app/p/${req.body.projectId || ''}" style="display: inline-block; padding: 16px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 16px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2), 0 2px 4px -1px rgba(37, 99, 235, 0.1); transition: all 0.2s;">
        Ver mi progreso
      </a>
    </div>
  </div>

  <!-- Footer -->
  <div style="padding: 24px 20px; text-align: center; background-color: #f8fafc; border-top: 1px solid #e2e8f0; box-sizing: border-box;">
    <p style="font-size: 12px; color: #94a3b8; margin: 0; font-weight: 500;">© 2026 ${projectName} - Gestionado con Goatify</p>
  </div>
</div>
</body>
</html>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ success: true });
    } catch (error) {
        console.error("Error sending loyalty registration email:", error);
        res.status(500).json({ error: "Failed to send email" });
    }
  });

  // 1.37 Endpoint para procesamiento de reclamo (Aprobado/Rechazado)
  app.post("/api/loyalty/processed", async (req, res) => {
    const { to, status, projectName, rewardName, currentVisits } = req.body;
    
    // Usar sesión admin como fallback para estas notificaciones de sistema
    const ownerSession = Array.from(sessions.values()).find(s => (s.role === 'admin' || s.email === 'deoc29@gmail.com') && s.accounts && s.accounts.length > 0);

    if (!ownerSession || !ownerSession.accounts || ownerSession.accounts.length === 0) {
        return res.status(404).json({ error: "No admin email session found" });
    }

    const acc = ownerSession.accounts[0];
    await refreshAccountTokens(acc);

    const transporter = nodemailer.createTransport(
        acc.provider === 'google' ? { host: 'smtp.gmail.com', port: 465, secure: true, auth: { type: 'OAuth2', user: acc.email, clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, refreshToken: acc.tokens.refresh_token, accessToken: acc.tokens.access_token } } :
        acc.provider === 'microsoft' ? { host: 'smtp.office365.com', port: 587, secure: false, auth: { type: 'OAuth2', user: acc.email, accessToken: acc.tokens.access_token }, tls: { ciphers: 'SSLv3' } } :
        { host: (acc.provider === 'gmail_manual') ? "smtp.gmail.com" : (acc.provider === 'outlook_manual') ? "smtp.office365.com" : "smtppro.zoho.com", port: acc.provider === 'outlook_manual' ? 587 : 465, secure: acc.provider !== 'outlook_manual', auth: { user: acc.email, pass: acc.password } }
    );

    const isApproved = status === 'approved';

    const mailOptions = {
        from: `"${projectName} Loyalty" <${acc.email}>`,
        to: to,
        subject: isApproved ? `✅ Consumo Aprobado en ${projectName}` : `❌ Información sobre tu registro en ${projectName}`,
        html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        .email-container { width: 100% !important; max-width: 850px !important; }
    </style>
</head>
<body style="margin: 0; padding: 20px 0; background-color: #f8fafc;">
<div class="email-container" style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; width: 100%; max-width: 850px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); border: 1px solid #e2e8f0; box-sizing: border-box;">
  
  <!-- Header -->
  <div style="background: linear-gradient(135deg, ${isApproved ? '#059669 0%, #047857 100%' : '#475569 0%, #334155 100%'}); padding: 40px 20px; text-align: center; box-sizing: border-box;">
    <div style="display: inline-block; background: rgba(255, 255, 255, 0.1); padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 700; color: #ffffff; text-transform: uppercase; letter-spacing: 1.5px; border: 1px solid rgba(255, 255, 255, 0.3); margin-bottom: 20px;">
      Estado de Consumo
    </div>
    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 800; line-height: 1.3; letter-spacing: -0.5px;">
      ${isApproved ? '¡Visita Validada!' : 'Registro Actualizado'}
    </h1>
  </div>

  <!-- Content Body -->
  <div style="padding: 40px 20px; background-color: #ffffff; box-sizing: border-box;">
    
    <p style="font-size: 16px; color: #334155; line-height: 1.8; margin-bottom: 25px;">Hola,</p>
    
    <p style="font-size: 16px; color: #334155; line-height: 1.8; margin-bottom: 30px;">
        ${isApproved 
            ? `Tu visita en <strong>${projectName}</strong> ha sido aprobada. ¡Estás un paso más cerca de tu premio: ${rewardName}!` 
            : `Lamentamos informarte que tu registro en <strong>${projectName}</strong> no ha podido ser validado en esta ocasión.`}
    </p>
    
    ${isApproved ? `
    <!-- Goal Box -->
    <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 24px 16px; border-radius: 0 8px 8px 0; margin-bottom: 35px; box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.02); box-sizing: border-box;">
      <p style="margin: 0 0 10px 0; color: #166534; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; font-weight: 800;">Estado Actual</p>
      <p style="margin: 0 0 15px 0; color: #047857; font-size: 24px; font-weight: 900;">${currentVisits || 0} Visitas Validadas</p>
      <p style="margin: 0; color: #166534; font-size: 15px;">¡Sigue así para completar tu tarjeta y disfrutar tu premio!</p>
    </div>
    ` : `
    <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 24px 16px; border-radius: 0 8px 8px 0; margin-bottom: 35px; box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.02); box-sizing: border-box;">
      <p style="margin: 0; color: #991b1b; font-size: 15px;">Si crees que esto es un error, por favor contacta directamente con el negocio.</p>
    </div>
    `}

    <p style="font-size: 16px; color: #334155; line-height: 1.8; margin-top: 35px;">
      Gracias por tu preferencia.
    </p>

    <!-- Call to Action -->
    <div style="text-align: center; margin-bottom: 30px; margin-top:30px; box-sizing: border-box;">
      <a href="https://ia.goatify.app/" style="display: inline-block; padding: 16px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 16px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2), 0 2px 4px -1px rgba(37, 99, 235, 0.1); transition: all 0.2s;">
        Ingresar a Goatify
      </a>
    </div>
  </div>

  <!-- Footer -->
  <div style="padding: 24px 20px; text-align: center; background-color: #f8fafc; border-top: 1px solid #e2e8f0; box-sizing: border-box;">
    <p style="font-size: 12px; color: #94a3b8; margin: 0; font-weight: 500;">© 2026 ${projectName} - Gestionado con Goatify</p>
  </div>
</div>
</body>
</html>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ success: true });
    } catch (error) {
        console.error("Error sending loyalty status email:", error);
        res.status(500).json({ error: "Failed to send email" });
    }
  });

  // 1.36 Endpoint para recibos POS
  app.post("/api/pos/email-receipt", async (req, res) => {
    const { ownerId, ownerName, customerEmail, subject, htmlBody } = req.body;
    
    let ownerSession = null;
    for (const sess of sessions.values()) {
        if (sess.userId === ownerId) {
            ownerSession = sess;
            break;
        }
    }

    if (!ownerSession || !ownerSession.accounts || ownerSession.accounts.length === 0) {
        // Fallback al administrador si el dueño no tiene sesión
        ownerSession = Array.from(sessions.values()).find(s => (s.role === 'admin' || s.email === 'deoc29@gmail.com') && s.accounts && s.accounts.length > 0);
        
        if (!ownerSession || !ownerSession.accounts || ownerSession.accounts.length === 0) {
            return res.status(404).json({ error: "No primary email account found for POS notification." });
        }
    }

    const acc = ownerSession.accounts[0]; 
    await refreshAccountTokens(acc);

    const transporter = nodemailer.createTransport(
        acc.provider === 'google' ? { host: 'smtp.gmail.com', port: 465, secure: true, auth: { type: 'OAuth2', user: acc.email, clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, refreshToken: acc.tokens.refresh_token, accessToken: acc.tokens.access_token } } :
        acc.provider === 'microsoft' ? { host: 'smtp.office365.com', port: 587, secure: false, auth: { type: 'OAuth2', user: acc.email, accessToken: acc.tokens.access_token }, tls: { ciphers: 'SSLv3' } } :
        { host: (acc.provider === 'gmail_manual') ? "smtp.gmail.com" : (acc.provider === 'outlook_manual') ? "smtp.office365.com" : "smtppro.zoho.com", port: acc.provider === 'outlook_manual' ? 587 : 465, secure: acc.provider !== 'outlook_manual', auth: { user: acc.email, pass: acc.password } }
    );

    const mailOptions = {
        from: `"${ownerName} POS" <${acc.email}>`,
        to: customerEmail,
        bcc: acc.email,
        subject: subject,
        html: htmlBody
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ success: true });
    } catch (err: any) {
        console.error("Error al enviar recibo POS:", err);
        res.status(500).json({ error: `Error al enviar el recibo POS: ${err.message}` });
    }
  });

  // 1.4 Endpoint para notificaciones de formularios
  app.post("/api/forms/notify", async (req, res) => {
    const { ownerId, ownerEmail, formName, guestEmail, guestData } = req.body;
    
    let ownerSession = null;
    for (const sess of sessions.values()) {
        if (sess.userId === ownerId) {
            ownerSession = sess;
            break;
        }
    }

    if (!ownerSession || !ownerSession.accounts || ownerSession.accounts.length === 0) {
        return res.status(404).json({ error: "Owner has no email session active" });
    }

    const acc = ownerSession.accounts[0]; 
    await refreshAccountTokens(acc);

    const transporter = nodemailer.createTransport(
        acc.provider === 'google' ? { host: 'smtp.gmail.com', port: 465, secure: true, auth: { type: 'OAuth2', user: acc.email, clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, refreshToken: acc.tokens.refresh_token, accessToken: acc.tokens.access_token } } :
        acc.provider === 'microsoft' ? { host: 'smtp.office365.com', port: 587, secure: false, auth: { type: 'OAuth2', user: acc.email, accessToken: acc.tokens.access_token }, tls: { ciphers: 'SSLv3' } } :
        { host: (acc.provider === 'gmail_manual') ? "smtp.gmail.com" : (acc.provider === 'outlook_manual') ? "smtp.office365.com" : "smtppro.zoho.com", port: acc.provider === 'outlook_manual' ? 587 : 465, secure: acc.provider !== 'outlook_manual', auth: { user: acc.email, pass: acc.password } }
    );

    // Email al Dueño
    const ownerMailOptions = {
        from: `"Goatify Forms" <${acc.email}>`,
        to: ownerEmail,
        bcc: acc.email,
        subject: `Nueva respuesta: ${formName}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
            <h2 style="color: #6366f1;">Nueva Respuesta de Formulario</h2>
            <p>Se ha recibido una nueva respuesta en el formulario <strong>"${formName}"</strong>.</p>
            <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <pre style="white-space: pre-wrap; font-size: 13px;">${JSON.stringify(guestData, null, 2)}</pre>
            </div>
            <a href="${req.headers.origin}/#/aiStudio/formBuilder" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Ver Respuestas</a>
          </div>
        `
    };

    // Email de Confirmación al Cliente (si tenemos su email)
    let guestMailOptions = null;
    if (guestEmail) {
        guestMailOptions = {
            from: `"Goatify Service" <${acc.email}>`,
            to: guestEmail,
            bcc: acc.email,
            subject: `Confirmación de envío: ${formName}`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
                <h2 style="color: #6366f1;">¡Gracias por contactarnos!</h2>
                <p>Hemos recibido tus datos correctamente en el formulario <strong>"${formName}"</strong>.</p>
                <p>Nos pondremos en contacto contigo lo antes posible si es necesario.</p>
                <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;" />
                <p style="font-size: 12px; color: #aaa; text-align: center;">Enviado vía Goatify Productivity Suite.</p>
              </div>
            `
        };
    }

    try {
        await transporter.sendMail(ownerMailOptions);
        if (guestMailOptions) await transporter.sendMail(guestMailOptions);
        res.json({ success: true });
    } catch (err) {
        console.error("Error sending form notification email:", err);
        res.status(500).json({ error: "Failed to send email" });
    }
  });




  // --- GOOGLE OAUTH ---
  app.get("/api/auth/google/url", requireAuth, (req: any, res) => {
    const redirectUri = req.query.redirectUri as string;
    const token = req.headers.authorization?.split(" ")[1] || req.query.token;
    
    // Pasar tanto el token de auth como la URL de retorno en el estado
    const stateObj = { token, redirectUri };
    const stateStr = Buffer.from(JSON.stringify(stateObj)).toString('base64');
    
    const oauth2Client = getOAuth2Client(redirectUri);

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      state: stateStr,
      scope: [
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.compose'
      ]
    });

    res.json({ url });
  });

  app.get("/api/auth/google/callback", async (req: any, res) => {
    const { code, state } = req.query;
    
    let stateObj;
    try {
        stateObj = JSON.parse(Buffer.from(state as string, 'base64').toString('utf-8'));
    } catch (e) {
        return res.status(400).send("Error: Estado de sesión inválido");
    }

    const token = stateObj.token;
    const redirectUri = stateObj.redirectUri;

    if (!token) return res.status(401).send("No autorizado: Falta token");
    if (!sessions.has(token)) {
      sessions.set(token, { id: token, accounts: [] });
    }
    const session = sessions.get(token);

    const oauth2Client = getOAuth2Client(redirectUri as string);

    try {
      const { tokens } = await oauth2Client.getToken(code as string);
      oauth2Client.setCredentials(tokens);

      const userInfoRes = await oauth2Client.request({
        url: 'https://www.googleapis.com/oauth2/v3/userinfo'
      });
      const email = (userInfoRes.data as any).email.toLowerCase();

      if (!session.accounts.find((a: any) => a.email.toLowerCase() === email)) {
        session.accounts.push({
          id: crypto.randomUUID(),
          email: email,
          tokens,
          provider: 'google'
        });
      } else {
        // Update tokens
        const acc = session.accounts.find((a: any) => a.email.toLowerCase() === email);
        acc.tokens = { ...acc.tokens, ...tokens };
        acc.email = email; // Asegurar minúsculas
      }

      // PERSISTIR EN FIREBASE AL CONECTAR
      if (session.userId) {
          await syncAccountsToFirestore(session.userId, session.accounts);
      }

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Autenticación exitosa. Esta ventana se cerrará automáticamente.</p>
          </body>
        </html>
      `);
    } catch (err) {
      console.error("Error en Google Callback:", err);
      res.status(500).send("Error en la autenticación con Google");
    }
  });

  // --- MICROSOFT OAUTH ---
  app.get("/api/auth/microsoft/url", requireAuth, async (req: any, res) => {
    const redirectUri = req.query.redirectUri as string;
    const token = req.headers.authorization?.split(" ")[1] || req.query.token;
    
    const stateObj = { token, redirectUri };
    const stateStr = Buffer.from(JSON.stringify(stateObj)).toString('base64');

    const authCodeUrlParameters = {
        scopes: ["https://outlook.office.com/IMAP.AccessAsUser.All", "https://outlook.office.com/SMTP.Send", "offline_access"],
        redirectUri: redirectUri,
        state: stateStr // Pass both token and redirectUri in state
    };

    try {
        const url = await cca.getAuthCodeUrl(authCodeUrlParameters);
        res.json({ url });
    } catch (error) {
        console.error("Error generating Microsoft Auth URL:", error);
        res.status(500).json({ error: "Error generating auth URL" });
    }
  });

  app.get("/api/auth/microsoft/callback", async (req: any, res) => {
    const { code, state } = req.query;
    
    let stateObj;
    try {
        stateObj = JSON.parse(Buffer.from(state as string, 'base64').toString('utf-8'));
    } catch (e) {
        return res.status(400).send("Error: Estado de sesión inválido");
    }

    const token = stateObj.token;
    const actualRedirectUri = stateObj.redirectUri;

    if (!token) {
        return res.status(401).send("No autorizado: Falta token de sesión");
    }

    if (!sessions.has(token)) {
        sessions.set(token, { id: token, accounts: [] });
    }
    const session = sessions.get(token);

    const tokenRequest = {
        code: code as string,
        scopes: ["https://outlook.office.com/IMAP.AccessAsUser.All", "https://outlook.office.com/SMTP.Send", "offline_access"],
        redirectUri: actualRedirectUri,
    };

    try {
        const response = await cca.acquireTokenByCode(tokenRequest) as any;
        
        if (!response || !response.account || !response.account.username) {
            throw new Error("No account info returned from Microsoft");
        }

        const email = response.account.username.toLowerCase();
        const tokens = {
            access_token: response.accessToken,
            refresh_token: response.refreshToken,
            expires_on: response.expiresOn
        };

        if (!session.accounts.find((a: any) => a.email.toLowerCase() === email)) {
            session.accounts.push({
                id: crypto.randomUUID(),
                email: email,
                tokens,
                provider: 'microsoft'
            });
        } else {
            const acc = session.accounts.find((a: any) => a.email.toLowerCase() === email);
            acc.tokens = { ...acc.tokens, ...tokens };
            acc.email = email; // Asegurar minúsculas
        }

        // PERSISTIR EN FIREBASE AL CONECTAR
        if (session.userId) {
            await syncAccountsToFirestore(session.userId, session.accounts);
        }

        res.send(`
          <html>
            <body>
              <script>
                try {
                  if (window.opener) {
                    window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                  }
                  localStorage.setItem('oauth_success', Date.now().toString());
                  window.close();
                } catch (e) {
                  console.error(e);
                }
                
                setTimeout(() => {
                  document.body.innerHTML = '<div style="font-family: sans-serif; text-align: center; padding: 40px;"><h2>¡Autenticación exitosa! 🎉</h2><p>Ya puedes cerrar esta pequeña ventana y volver a la aplicación principal.</p><button onclick="window.close()" style="padding: 10px 20px; background: #6366f1; color: white; border: none; border-radius: 8px; cursor: pointer;">Cerrar ventana</button></div>';
                }, 1000);
              </script>
              <p style="font-family: sans-serif; text-align: center; padding: 40px;">Autenticación exitosa. Cerrando ventana...</p>
            </body>
          </html>
        `);
    } catch (error: any) {
        console.error("Error in Microsoft Callback:", error);
        console.error("Error details:", JSON.stringify(error, null, 2));
        if (error.errorMessage) {
            console.error("MSAL Error Message:", error.errorMessage);
        }
        res.status(500).send(`Error en la autenticación con Microsoft: ${error.message || 'Error desconocido'}`);
    }
  });

  // 2. Obtener Cuentas
  app.get("/api/accounts", requireAuth, (req: any, res) => {
    res.json({ accounts: req.session.accounts.map((a: any) => ({ id: a.id, email: a.email, provider: a.provider })) });
  });

  // 3. Agregar Cuenta Manual (Zoho, Gmail o Outlook con App Password)
  app.post("/api/accounts", requireAuth, async (req: any, res) => {
    const { email, password, provider: selectedProvider } = req.body;
    const emailLower = email.toLowerCase();
    
    if (req.session.accounts.find((a: any) => a.email.toLowerCase() === emailLower)) {
      return res.json({ success: true, accounts: req.session.accounts.map((a: any) => ({ id: a.id, email: a.email, provider: a.provider })) });
    }

    let host = "imappro.zoho.com";
    let provider = selectedProvider || 'zoho';

    if (emailLower.endsWith('@gmail.com') || selectedProvider === 'gmail') {
      host = "imap.gmail.com";
      provider = 'gmail_manual';
    } else if (emailLower.endsWith('@outlook.com') || emailLower.endsWith('@hotmail.com') || selectedProvider === 'outlook') {
      host = "outlook.office365.com";
      provider = 'outlook_manual';
    }

    const client = new ImapFlow({
      host, 
      port: 993, 
      secure: true,
      auth: { user: email, pass: password }, 
      logger: false
    });

    client.on('error', (err) => {
      console.error("ImapFlow background error:", err);
    });

    try {
      await client.connect();
      await client.logout();
      const newAccount = { id: req.body.id || crypto.randomUUID(), email, password, provider };
      req.session.accounts.push(newAccount);
      if (req.session.userId) await syncAccountsToFirestore(req.session.userId, req.session.accounts);
      res.json({ success: true, message: "¡Cuenta conectada con éxito!", accounts: req.session.accounts.map((a: any) => ({ id: a.id, email: a.email, provider: a.provider })) });
    } catch (err) {
      console.error("Error al conectar cuenta:", err);
      res.status(401).json({ error: `Error: Credenciales inválidas. Verifica tu correo y contraseña.` });
    }
  });

  // 3.1 Eliminar Cuenta (Logout)
  app.delete("/api/accounts/:id", requireAuth, async (req: any, res) => {
    const { id } = req.params;
    req.session.accounts = req.session.accounts.filter((a: any) => a.id !== id);
    if (req.session.userId) await syncAccountsToFirestore(req.session.userId, req.session.accounts);
    res.json({ success: true, accounts: req.session.accounts.map((a: any) => ({ id: a.id, email: a.email, provider: a.provider })) });
  });

  // 3.2 Actualizar Contraseña de Cuenta
  app.patch("/api/accounts/:id", requireAuth, async (req: any, res) => {
    const { id } = req.params;
    const { password } = req.body;
    const acc = req.session.accounts.find((a: any) => a.id === id);
    if (!acc) return res.status(404).json({ error: "Cuenta no encontrada" });

    // Validate new credentials before saving
    let host = "imappro.zoho.com";
    if (acc.provider === 'gmail_manual') host = "imap.gmail.com";
    if (acc.provider === 'outlook_manual') host = "outlook.office365.com";

    const client = new ImapFlow({
      host, 
      port: 993, 
      secure: true,
      auth: { user: acc.email, pass: password }, 
      logger: false
    });

    try {
      await client.connect();
      await client.logout();
      acc.password = password;
      if (req.session.userId) await syncAccountsToFirestore(req.session.userId, req.session.accounts);
      res.json({ success: true, message: "Contraseña actualizada correctamente" });
    } catch (err) {
      console.error("Error al validar nueva contraseña:", err);
      res.status(401).json({ error: "No se pudo validar la nueva contraseña. Verifica tus datos." });
    }
  });

  // Helper to find the correct IMAP folder path
  const getImapFolder = async (client: any, folderType: string) => {
    try {
      const mailboxes = await client.list();
      const typeLower = folderType.toLowerCase();
      
      if (typeLower === 'inbox') return 'INBOX';
      
      // Try to find by special use flags first
      const flagMap: Record<string, string> = {
        'sent': '\\Sent',
        'drafts': '\\Drafts',
        'trash': '\\Trash',
        'spam': '\\Junk',
        'archive': '\\Archive'
      };
      
      const targetFlag = flagMap[typeLower];
      if (targetFlag) {
        for (let mb of mailboxes) {
          if (mb.specialUse === targetFlag || (mb.flags && mb.flags.has(targetFlag))) {
            return mb.path;
          }
        }
      }

      // Exact dictionary names preferred over fuzzy substring
      const nameMap: Record<string, string[]> = {
        'sent': ['sent', 'enviados', 'enviado', 'outbox', 'sent items', 'sent messages', 'elementos enviados', 'correos enviados', 'salida'],
        'drafts': ['drafts', 'borradores', 'draft', 'borrador'],
        'trash': ['trash', 'papelera', 'deleted', 'deleted items', 'bin', 'eliminados', 'basura'],
        'spam': ['spam', 'junk', 'correo no deseado', 'basura', 'no deseado'],
        'archive': ['archive', 'archivo', 'all mail', 'todos', 'archivados']
      };

      const possibleNames = nameMap[typeLower] || [];

      // 1. Try exact match (case-insensitive)
      for (let mb of mailboxes) {
        const pathLower = mb.path.toLowerCase();
        if (possibleNames.includes(pathLower)) {
          return mb.path;
        }
      }

      // 2. Try suffix match (e.g. INBOX.Drafts, [Gmail]/Sent Mail)
      for (let mb of mailboxes) {
        const pathLower = mb.path.toLowerCase();
        if (possibleNames.some(name => pathLower.endsWith(`/${name}`) || pathLower.endsWith(`.${name}`) || pathLower.endsWith(`]/${name}`))) {
          return mb.path;
        }
      }

      // 3. Last fallback: includes (fuzzy)
      for (let mb of mailboxes) {
        const pathLower = mb.path.toLowerCase();
        if (possibleNames.some(name => pathLower.includes(name))) {
          return mb.path;
        }
      }
      
      // Fallbacks
      const fallbacks: Record<string, string> = {
        'sent': 'Sent', 'drafts': 'Drafts', 'trash': 'Trash', 'spam': 'Spam', 'archive': 'Archive'
      };

      return fallbacks[typeLower] || 'INBOX';
    } catch (e) {
      console.error(`Error in getImapFolder for ${folderType}:`, e);
      return 'INBOX';
    }
  };

  // 4. Listar Correos Reales con Paginación y Búsqueda
  app.get("/api/emails", requireAuth, async (req: any, res) => {
    const { folder = 'inbox', accountId, q = '', filter = 'all', offset = 0, limit: limitQuery = 50, refresh = 'false' } = req.query;
    const allEmails: any[] = [];
    const limitCount = parseInt(limitQuery as string) || 50;
    const skip = parseInt(offset as string) || 0;
    const forceRefresh = refresh === 'true';
    
    let accountsToFetch = (accountId === 'all' || !accountId)
      ? (req.session.accounts || [])
      : (req.session.accounts || []).filter((a: any) => a.id === accountId);

    // Deduplicate accounts by email to prevent duplicate emails in UI
    const uniqueAccounts = new Map();
    for (const acc of accountsToFetch) {
      if (!uniqueAccounts.has(acc.email)) uniqueAccounts.set(acc.email, acc);
    }
    accountsToFetch = Array.from(uniqueAccounts.values());

    if (accountsToFetch.length === 0) {
      return res.json({ emails: [], inboxUnseenCount: 0, total: 0 });
    }

    let inboxUnseenCount = 0;

    for (const acc of accountsToFetch) {
      await refreshAccountTokens(acc);

      const clientOptions = getImapClientOptions(acc);

      const client = new ImapFlow(clientOptions);
      client.on('error', (err) => { console.error("ImapFlow background error:", err); });
      let currentImapFolder = 'INBOX';
      
      try {
        console.log(`[IMAP] Intentando conectar a ${acc.email} (${clientOptions.host})...`);
        await client.connect();
        console.log(`[IMAP] Conectado exitosamente a ${acc.email}`);
        
        // If searching, search in 'archive' (All Mail) to find everything
        const folderToOpen = q ? 'archive' : (folder as string);
        currentImapFolder = await getImapFolder(client, folderToOpen);

        try {
          const status = await client.status('INBOX', { unseen: true });
          inboxUnseenCount += (status.unseen || 0);
        } catch (e) {
          // Ignore status errors
        }

        let lock = await client.getMailboxLock(currentImapFolder);
        try {
          let searchCriteria: any = { all: true };
          if (folder === 'starred') searchCriteria = { flagged: true };
          if (filter === 'unread') searchCriteria = { ...searchCriteria, unseen: true };
          if (q) searchCriteria = { ...searchCriteria, text: q };

          const uidsResult = await client.search(searchCriteria, { uid: true });
          const uids = Array.isArray(uidsResult) ? uidsResult : [];
          
          const sortedUids = [...uids].sort((a, b) => b - a);
          // Fetch extra UIDs to account for deleted emails that get filtered out, so we don't break limit count
          const paginatedUids = sortedUids.slice(skip, skip + limitCount + 50);
          
          if (paginatedUids.length > 0) {
            let fetchedMsgs: any[] = [];
            for await (let msg of client.fetch(paginatedUids, { envelope: true, source: true, flags: true }, { uid: true })) {
               fetchedMsgs.push(msg);
            }
            
            // IMAP servers return fetched messages in ascending order. 
            // We must sort them descending by UID to process newest first, then cut off at limit.
            fetchedMsgs.sort((a, b) => b.uid - a.uid);

            let validAccEmailsCount = 0;
            for (let msg of fetchedMsgs) {
              if (validAccEmailsCount >= limitCount) break; // Don't fetch more than limit
              if (msg.flags && msg.flags.has('\\Deleted')) continue; // Skip ghost deleted emails
              validAccEmailsCount++;
              
              const parsed = await simpleParser(msg.source);
              const realDate = msg.envelope?.date || parsed.date || new Date();
              allEmails.push({
                id: `${acc.id}-${msg.uid}`,
                accountId: acc.id,
                accountEmail: acc.email,
                provider: acc.provider,
                subject: parsed.subject || "(Sin asunto)",
                sender: { 
                  name: (parsed.from as any)?.value?.[0]?.name || (parsed.from as any)?.value?.[0]?.address?.split('@')[0] || "Desconocido", 
                  email: (parsed.from as any)?.value?.[0]?.address || "" 
                },
                to: (parsed.to as any)?.value?.map((v: any) => ({ name: v.name || v.address?.split('@')[0], email: v.address })) || [],
                body: parsed.html || parsed.text || "",
                snippet: parsed.text?.substring(0, 150) || "",
                hasAttachments: parsed.attachments && parsed.attachments.length > 0,
                attachments: parsed.attachments?.map((att: any, idx: number) => ({
                  id: idx.toString(),
                  filename: att.filename || `adjunto-${idx}`,
                  contentType: att.contentType,
                  size: att.size
                })) || [],
                date: realDate.toISOString(),
                displayDate: realDate.toLocaleString(),
                read: msg.flags.has('\\Seen'),
                folder: folder
              });
            }
          }
        } finally {
          lock.release();
        }
        await client.logout();
      } catch (e) { 
        console.error(`Error en cuenta ${acc.email} carpeta ${currentImapFolder}:`, e); 
      }
    }
    const sorted = allEmails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    res.json({ 
      emails: sorted, 
      inboxUnseenCount,
      hasMore: sorted.length >= limitCount
    });
  });

  // 4.0.1 Obtener Detalles de un Correo Específico
  app.get("/api/emails/:id", requireAuth, async (req: any, res) => {
    const { id } = req.params;
    const { folder } = req.query;
    const lastDash = id.lastIndexOf('-');
    const accountId = id.substring(0, lastDash);
    const uid = id.substring(lastDash + 1);
    const acc = req.session.accounts.find((a: any) => a.id === accountId);
    if (!acc) return res.status(404).json({ error: "Cuenta no encontrada" });

    await refreshAccountTokens(acc);

    const clientOptions = getImapClientOptions(acc);

    const client = new ImapFlow(clientOptions);
    try {
      await client.connect();
      
      // Si nos pasan la carpeta, intentamos esa primero
      const foldersToTry = folder 
        ? [await getImapFolder(client, folder as string), 'INBOX', '[Gmail]/Sent Mail', 'Sent', 'Drafts', 'Trash', 'Spam', 'Archive']
        : ['INBOX', '[Gmail]/Sent Mail', 'Sent', 'Drafts', 'Trash', 'Spam', 'Archive'];
      
      let foundMsg = null;

      // Eliminar duplicados de carpetas a intentar
      const uniqueFolders = Array.from(new Set(foldersToTry));

      for (const f of uniqueFolders) {
        try {
          let lock = await client.getMailboxLock(f);
          try {
            const msg = await client.fetchOne(uid, { envelope: true, source: true, flags: true }, { uid: true });
            if (msg) {
              const parsed = await simpleParser(msg.source);
              const realDate = msg.envelope?.date || parsed.date || new Date();
              foundMsg = {
                id,
                accountId: acc.id,
                accountEmail: acc.email,
                provider: acc.provider,
                subject: parsed.subject || "(Sin asunto)",
                sender: { 
                  name: (parsed.from as any)?.value?.[0]?.name || (parsed.from as any)?.value?.[0]?.address?.split('@')[0] || "Desconocido", 
                  email: (parsed.from as any)?.value?.[0]?.address || "" 
                },
                to: (parsed.to as any)?.value?.map((v: any) => ({ name: v.name || v.address?.split('@')[0], email: v.address })) || [],
                body: parsed.html || parsed.text || "",
                attachments: parsed.attachments?.map((att: any, idx: number) => ({
                  id: idx.toString(),
                  filename: att.filename || `adjunto-${idx}`,
                  contentType: att.contentType,
                  size: att.size
                })) || [],
                date: realDate.toISOString(),
                displayDate: realDate.toLocaleString(),
                read: msg.flags.has('\\Seen'),
                folder: folder || f
              };
              break;
            }
          } finally {
            lock.release();
          }
        } catch (e) { /* ignore folder errors */ }
      }

      await client.logout();
      if (foundMsg) {
        res.json(foundMsg);
      } else {
        res.status(404).json({ error: "Correo no encontrado" });
      }
    } catch (err) {
      console.error("Error fetching email details:", err);
      res.status(500).json({ error: "Error al obtener detalles del correo" });
    }
  });

  // 4.0.2 Descargar Adjunto
  app.get("/api/emails/:id/attachments/:attachmentId", requireAuth, async (req: any, res) => {
    const { id, attachmentId } = req.params;
    const lastDash = id.lastIndexOf('-');
    const accountId = id.substring(0, lastDash);
    const uid = id.substring(lastDash + 1);
    const acc = req.session.accounts.find((a: any) => a.id === accountId);
    if (!acc) return res.status(404).json({ error: "Cuenta no encontrada" });

    await refreshAccountTokens(acc);

    const clientOptions = getImapClientOptions(acc);

    const client = new ImapFlow(clientOptions);
    try {
      await client.connect();
      const foldersToTry = ['INBOX', '[Gmail]/Sent Mail', 'Sent', 'Drafts', 'Trash', 'Spam', 'Archive'];
      let foundAttachment = null;

      for (const f of foldersToTry) {
        try {
          let lock = await client.getMailboxLock(f);
          try {
            const msg = await client.fetchOne(uid, { source: true }, { uid: true });
            if (msg) {
              const parsed = await simpleParser(msg.source);
              const att = parsed.attachments[parseInt(attachmentId)];
              if (att) {
                foundAttachment = att;
                break;
              }
            }
          } finally {
            lock.release();
          }
        } catch (e) { }
      }

      await client.logout();
      if (foundAttachment) {
        res.setHeader('Content-Type', foundAttachment.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${foundAttachment.filename}"`);
        res.send(foundAttachment.content);
      } else {
        res.status(404).json({ error: "Adjunto no encontrado" });
      }
    } catch (err) {
      console.error("Error downloading attachment:", err);
      res.status(500).json({ error: "Error al descargar adjunto" });
    }
  });

  // 4.1 Mover Correo
  app.put("/api/emails/:id/move", requireAuth, async (req: any, res) => {
    const { id } = req.params;
    const { sourceFolder, destinationFolder } = req.body;
    const lastDash = id.lastIndexOf('-');
    const accountId = id.substring(0, lastDash);
    const uid = id.substring(lastDash + 1);
    const acc = req.session.accounts.find((a: any) => a.id === accountId);
    if (!acc) return res.status(404).json({ error: "Cuenta no encontrada" });

    await refreshAccountTokens(acc);

    const clientOptions = getImapClientOptions(acc);

    const client = new ImapFlow(clientOptions);
    try {
      await client.connect();
      
      const src = await getImapFolder(client, sourceFolder.toLowerCase());
      const dest = await getImapFolder(client, destinationFolder.toLowerCase());

      let lock = await client.getMailboxLock(src);
      try {
        try {
          await client.messageMove(uid, dest, { uid: true });
        } catch (moveErr) {
          if (destinationFolder.toLowerCase() === 'trash' || destinationFolder.toLowerCase() === 'archive') {
            console.log(`Fallback for move to ${destinationFolder}. Setting \\Deleted flag on source.`);
            await client.messageFlagsAdd(uid, ['\\Deleted'], { uid: true });
          } else {
            throw moveErr;
          }
        }
        
        // Some servers like Zoho require explicit expunge to remove the ghost email immediately
        // Especially true for drafts
        if (sourceFolder.toLowerCase() === 'drafts' || destinationFolder.toLowerCase() === 'trash') {
          await client.messageFlagsAdd(uid, ['\\Deleted'], { uid: true });
          // No direct expunge on ImapFlow without dropping lock/closing, 
          // usually flags add is enough. Wait, messageMove already adds \Deleted.
          // In some providers, closing the mailbox with expunge=true is required.
        }
      } finally {
        lock.release(); // release lock (ImapFlow will expunge if close is used, but lock release doesn't necessarily expunge)
      }
      await client.logout();
      res.json({ success: true });
    } catch (err) {
      console.error("Error moving message:", err);
      res.status(500).json({ error: "Error al mover el mensaje" });
    }
  });

  // 4.1.5 Mover Correos en Masa (Bulk Move)
  app.put("/api/emails/bulk-move", requireAuth, async (req: any, res) => {
    const { ids, sourceFolder, destinationFolder } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "No ids provided" });

    // Agrupar por cuenta para optimizar conexiones
    const accountGroups: Record<string, string[]> = {};
    for (const id of ids) {
      const lastDash = id.lastIndexOf('-');
      const accountId = id.substring(0, lastDash);
      const uid = id.substring(lastDash + 1);
      if (!accountGroups[accountId]) accountGroups[accountId] = [];
      accountGroups[accountId].push(uid);
    }

    try {
      for (const [accountId, uids] of Object.entries(accountGroups)) {
        const acc = req.session.accounts.find((a: any) => a.id === accountId);
        if (!acc) continue;
        
        await refreshAccountTokens(acc);
        const clientOptions = getImapClientOptions(acc);
        const client = new ImapFlow(clientOptions);
        
        try {
          await client.connect();
          const src = await getImapFolder(client, sourceFolder.toLowerCase());
          const dest = await getImapFolder(client, destinationFolder.toLowerCase());

          let lock = await client.getMailboxLock(src);
          try {
            const uidSequence = uids.join(','); // ImapFlow accepts sequences like '1,2,3'
            try {
              await client.messageMove(uidSequence, dest, { uid: true });
            } catch (moveErr) {
              if (destinationFolder.toLowerCase() === 'trash' || destinationFolder.toLowerCase() === 'archive') {
                console.log(`Fallback mapping for bulk move to ${destinationFolder}. Setting \\Deleted.`);
                await client.messageFlagsAdd(uidSequence, ['\\Deleted'], { uid: true });
              } else {
                throw moveErr;
              }
            }
            if (sourceFolder.toLowerCase() === 'drafts' || destinationFolder.toLowerCase() === 'trash') {
              await client.messageFlagsAdd(uidSequence, ['\\Deleted'], { uid: true });
            }
          } finally {
            lock.release();
          }
          await client.logout();
        } catch (e) {
          console.error(`Error en bulk move cuenta ${acc.email}:`, e);
        }
      }
      res.json({ success: true });
    } catch (err) {
      console.error("Error bulk moving messages:", err);
      res.status(500).json({ error: "Error al mover los mensajes" });
    }
  });

  // 4.2 Marcar Leído/No Leído
  app.put("/api/emails/:id/read", requireAuth, async (req: any, res) => {
    const { id } = req.params;
    const { sourceFolder, read } = req.body;
    const lastDash = id.lastIndexOf('-');
    const accountId = id.substring(0, lastDash);
    const uid = id.substring(lastDash + 1);
    const acc = req.session.accounts.find((a: any) => a.id === accountId);
    if (!acc) return res.status(404).json({ error: "Cuenta no encontrada" });

    await refreshAccountTokens(acc);

    const clientOptions = getImapClientOptions(acc);

    const client = new ImapFlow(clientOptions);
    try {
      await client.connect();
      
      const src = await getImapFolder(client, sourceFolder.toLowerCase());

      let lock = await client.getMailboxLock(src);
      try {
        if (read) {
          await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
        } else {
          await client.messageFlagsRemove(uid, ['\\Seen'], { uid: true });
        }
      } finally {
        lock.release();
      }
      await client.logout();
      res.json({ success: true });
    } catch (err) {
      console.error("Error marking message:", err);
      res.status(500).json({ error: "Error al marcar el mensaje" });
    }
  });

  // 5. Enviar Correo con Adjuntos
  app.post("/api/send", requireAuth, async (req: any, res) => {
    const { accountId, to, cc, bcc, subject, body, attachments = [], senderName } = req.body;
    const acc = req.session.accounts.find((a: any) => a.id === accountId);
    
    if (!acc) return res.status(404).json({ error: "Cuenta no encontrada" });

    await refreshAccountTokens(acc);

    const formatEmails = (str: string) => {
      if (!str) return '';
      return str.replace(/[;\s]+/g, ',').split(',').map((e: string) => e.trim()).filter((e: string) => e).join(', ');
    };

    const isGoogleOAuth = acc.provider === 'google';
    const isMicrosoftOAuth = acc.provider === 'microsoft';
    const isGmailManual = acc.provider === 'gmail_manual';
    const isOutlookManual = acc.provider === 'outlook_manual';

    let transporterOptions: any;
    if (isGoogleOAuth) {
      transporterOptions = {
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
          type: 'OAuth2',
          user: acc.email,
          clientId: GOOGLE_CLIENT_ID,
          clientSecret: GOOGLE_CLIENT_SECRET,
          refreshToken: acc.tokens.refresh_token,
          accessToken: acc.tokens.access_token
        }
      };
    } else if (isMicrosoftOAuth) {
      transporterOptions = {
        host: 'smtp.office365.com',
        port: 587,
        secure: false, // STARTTLS
        auth: {
          type: 'OAuth2',
          user: acc.email,
          accessToken: acc.tokens.access_token
        },
        tls: {
          ciphers: 'SSLv3'
        }
      };
    } else if (isGmailManual) {
      transporterOptions = {
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: acc.email, pass: acc.password }
      };
    } else if (isOutlookManual) {
      transporterOptions = {
        host: "smtp.office365.com",
        port: 587,
        secure: false, // STARTTLS
        auth: { user: acc.email, pass: acc.password }
      };
    } else {
      transporterOptions = {
        host: "smtppro.zoho.com",
        port: 465,
        secure: true,
        auth: { user: acc.email, pass: acc.password }
      };
    }

    const transporter = nodemailer.createTransport(transporterOptions);

    try {
      // Verify transporter before sending
      try {
        await transporter.verify();
      } catch (verifyErr) {
        console.error("Transporter verification failed:", verifyErr);
        return res.status(500).json({ error: "Error de conexión con el servidor de correo. Revisa tus credenciales." });
      }

      const mailOptions: any = {
        from: senderName ? `"${senderName}" <${acc.email}>` : acc.email,
        to: formatEmails(to),
        cc: formatEmails(cc),
        bcc: formatEmails(bcc), // REMOVED SELF-BCC HACK
        subject,
        html: body,
        attachments: attachments.map((file: any) => {
          if (file.isLocal && file.content) {
            return {
              filename: file.name,
              content: Buffer.from(file.content, 'base64'),
              contentType: file.type
            };
          }
          return {
            filename: file.name,
            path: file.url
          };
        })
      };

      const info = await transporter.sendMail(mailOptions);
      
      // 2. Append to Sent folder via IMAP directly so it perfectly syncs, especially for Zoho!
      if (!isGoogleOAuth && !isGmailManual) { // Gmail automatically copies sent SMTP mails to Sent folder
        try {
          const clientOptions = getImapClientOptions(acc);
          const client = new ImapFlow(clientOptions);
          await client.connect();
          const sentFolder = await getImapFolder(client, 'sent');
          
          // Generate raw MIME for appending
          const dateHeader = `Date: ${new Date().toUTCString()}\r\n`;
          const toHeader = mailOptions.to ? `To: ${mailOptions.to}\r\n` : '';
          const ccHeader = mailOptions.cc ? `Cc: ${mailOptions.cc}\r\n` : '';
          const bccHeader = mailOptions.bcc ? `Bcc: ${mailOptions.bcc}\r\n` : '';
          
          let rawMessage = `${dateHeader}From: ${mailOptions.from}\r\n${toHeader}${ccHeader}${bccHeader}Subject: ${subject || 'Sin asunto'}\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${body || ''}`;
          
          await client.append(sentFolder, rawMessage, ['\\Seen']);
          await client.logout();
        } catch (imapErr) {
          console.error("Failed to append to Sent folder:", imapErr);
          // We don't fail the sending process if appending fails.
        }
      }

      res.json({ success: true, messageId: info.messageId });
    } catch (err: any) {
      console.error("Error al enviar correo:", err);
      res.status(500).json({ error: `Error al enviar el correo: ${err.message || 'Error desconocido'}` });
    }
  });

  // 6. Guardar Borrador
  app.post("/api/drafts", requireAuth, async (req: any, res) => {
    const { accountId, to, cc, bcc, subject, body } = req.body;
    const acc = req.session.accounts.find((a: any) => a.id === accountId);
    if (!acc) return res.status(404).json({ error: "Cuenta no encontrada" });

    await refreshAccountTokens(acc);

    const formatEmails = (str: string) => {
      if (!str) return '';
      return str.replace(/[;\s]+/g, ',').split(',').map((e: string) => e.trim()).filter((e: string) => e).join(', ');
    };

    const clientOptions = getImapClientOptions(acc);

    const client = new ImapFlow(clientOptions);
    try {
      await client.connect();
      const draftFolder = await getImapFolder(client, 'drafts');
      const dateHeader = `Date: ${new Date().toUTCString()}\r\n`;
      const rawMessage = `${dateHeader}From: ${acc.email}\r\nTo: ${formatEmails(to)}\r\nCc: ${formatEmails(cc)}\r\nBcc: ${formatEmails(bcc)}\r\nSubject: ${subject || 'Borrador sin asunto'}\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${body || ''}`;
      await client.append(draftFolder, rawMessage, ['\\Draft']);
      await client.logout();
      res.json({ success: true });
    } catch (err) {
      console.error("Error saving draft:", err);
      res.status(500).json({ error: "Error al guardar borrador" });
    }
  });

  // --- ENDPOINT DE EXTRACCIÓN DE CONTENIDO DE ARCHIVOS ---
  app.post("/api/files/extract", requireFirebaseUser, async (req: any, res: any) => {
    const { fileName, mimeType, base64Data } = req.body;
    if (!base64Data) return res.status(400).json({ ok: false, error: "No data provided" });

    try {
      const buffer = Buffer.from(base64Data, 'base64');
      let extractedText = "";
      const type = mimeType.toLowerCase();

      if (type.includes('text/') || type.includes('json') || type.includes('xml') || fileName.endsWith('.md')) {
        extractedText = buffer.toString('utf8');
      } else if (type.includes('wordprocessingml') || fileName.endsWith('.docx')) {
        const result = await mammoth.extractRawText({ buffer });
        extractedText = result.value;
      } else if (type.includes('spreadsheet') || type.includes('excel') || fileName.endsWith('.xlsx')) {
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        let excelContent = "";
        workbook.SheetNames.forEach(sheetName => {
          excelContent += `\nHOJA: ${sheetName}\n`;
          excelContent += xlsx.utils.sheet_to_csv(workbook.Sheets[sheetName]);
        });
        extractedText = excelContent;
      } else if (type === 'application/pdf' || fileName.endsWith('.pdf')) {
        try {
          const data = await pdfParse(buffer);
          extractedText = data.text;
        } catch (e) {
          extractedText = "Error al extraer texto del PDF en servidor. Gemini intentará procesarlo como imagen/PDF nativo.";
        }
      } else if (type.includes('zip') || fileName.endsWith('.zip')) {
        const zip = new JSZip();
        const contents = await zip.loadAsync(buffer);
        let zipInfo = `CONTENIDO DEL ZIP: ${fileName}\n`;
        const files = Object.keys(contents.files);
        zipInfo += `Archivos: ${files.join(', ')}\n\n`;
        
        // Extraer texto de los primeros 10 archivos de texto/md para no saturar
        let processedCount = 0;
        for (const f of files) {
          if (processedCount >= 10) break;
          const entry = contents.files[f];
          if (!entry.dir && (f.endsWith('.txt') || f.endsWith('.md') || f.endsWith('.json') || f.endsWith('.csv'))) {
            const content = await entry.async('string');
            zipInfo += `--- ARCHIVO: ${f} ---\n${content.substring(0, 5000)}\n\n`;
            processedCount++;
          }
        }
        extractedText = zipInfo;
      } else {
        extractedText = `Contenido binario no extraíble directamente para ${fileName}. Se enviará metadata básica.`;
      }

      res.json({
        ok: true,
        fileName,
        extractedText: extractedText.substring(0, 150000), // Límite de seguridad
        metadata: { size: buffer.length }
      });
    } catch (e: any) {
      console.error("Error extracting file:", e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // --- ENDPOINT DE GENERACIÓN DE ARTIFACTS (DOCX, XLSX, PDF) ---
  app.post("/api/artifacts/generate", requireFirebaseUser, async (req: any, res: any) => {
    const { artifactType, title, content, structuredData, fileName: suggestedName, saveToDrive } = req.body;
    const userId = req.user.uid;
    
    try {
      const finalTitle = title || "Documento IA";
      let normType = artifactType?.toLowerCase() || 'txt';
      if (normType === 'word' || normType === 'doc') normType = 'docx';
      if (normType === 'excel' || normType === 'sheet' || normType === 'spreadsheet') normType = 'xlsx';

      const fileName = suggestedName || `${finalTitle.replace(/\s+/g, '_')}_${Date.now()}.${normType}`;

      const generatePdfBuffer = async (docContent: string) => {
          const pdfDoc = await PDFDocument.create();
          const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
          const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
          let page = pdfDoc.addPage([600, 800]);
          const { width: pageWidth, height: pageHeight } = page.getSize();
          
          // Header con logo o nombre
          page.drawRectangle({
            x: 0,
            y: pageHeight - 60,
            width: pageWidth,
            height: 60,
            color: rgb(0.1, 0.1, 0.2),
          });
          
          page.drawText("Goatify Docs", {
            x: 50,
            y: pageHeight - 35,
            size: 20,
            font: boldFont,
            color: rgb(1, 1, 1),
          });

          page.drawText(finalTitle, { x: 50, y: pageHeight - 100, size: 16, font: boldFont, color: rgb(0, 0, 0) });
          
          let py = pageHeight - 130;
          const plines = docContent.split('\n');
          
          const wrapText = (text: string, maxWidth: number, font: any, size: number) => {
            const words = text.split(' ');
            const lines = [];
            let currentLine = '';
            for (const word of words) {
                const testLine = currentLine ? `${currentLine} ${word}` : word;
                const width = font.widthOfTextAtSize(testLine, size);
                if (width <= maxWidth) {
                    currentLine = testLine;
                } else {
                    lines.push(currentLine);
                    currentLine = word;
                }
            }
            lines.push(currentLine);
            return lines;
          };

          for (const rawLine of plines) {
            const wrapped = wrapText(rawLine || ' ', 500, font, 10);
            for (const line of wrapped) {
              if (py < 60) {
                page = pdfDoc.addPage([600, 800]);
                py = pageHeight - 50;
              }
              page.drawText(line, { x: 50, y: py, size: 10, font });
              py -= 15;
            }
            py -= 5; // Espacio extra entre párrafos
          }
          
          // Footer simple
          const totalPages = pdfDoc.getPageCount();
          for(let i=0; i<totalPages; i++) {
              const p = pdfDoc.getPage(i);
              p.drawText(`Página ${i+1} de ${totalPages} | Goatify Docs`, {
                  x: 50,
                  y: 30,
                  size: 8,
                  font,
                  color: rgb(0.5, 0.5, 0.5)
              });
          }

          return Buffer.from(await pdfDoc.save());
      };

      const generateDocxBuffer = async (docContent: string) => {
          const doc = new DocxDocument({
            sections: [{
              properties: {},
              children: [
                new Paragraph({
                  children: [new TextRun({ text: finalTitle, bold: true, size: 32 })],
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 400 }
                }),
                ...docContent.split('\n').filter(Boolean).map((line: string) => new Paragraph({
                  children: [new TextRun(line)],
                  spacing: { after: 200 }
                }))
              ],
            }],
          });
          return await Packer.toBuffer(doc);
      };

      const generateXlsxBuffer = async (docContent: string, sData: any) => {
          const wb = new ExcelJS.Workbook();
          const sheet = wb.addWorksheet('Datos');
          if (Array.isArray(sData) && sData.length > 0) {
              const headers = Object.keys(sData[0]);
              sheet.addRow(headers);
              sData.forEach(row => {
                sheet.addRow(headers.map(h => row[h]));
              });
          } else {
            docContent.split('\n').forEach((line: string, i: number) => {
              sheet.getCell(i + 1, 1).value = line;
            });
          }
          return await wb.xlsx.writeBuffer() as Buffer;
      };

      let buffer: Buffer;
      let mime: string;
      let variants: any = {};
      let primaryFormat = normType;

      switch (normType) {
        case 'docx':
          buffer = await generateDocxBuffer(content);
          mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
          try {
             const pdfBuf = await generatePdfBuffer(content);
             variants.pdf = { buffer: pdfBuf, mime: "application/pdf", ext: 'pdf' };
          } catch(e){}
          break;
        case 'xlsx':
          buffer = await generateXlsxBuffer(content, structuredData);
          mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
          break;
        case 'pdf':
          buffer = await generatePdfBuffer(content);
          mime = "application/pdf";
          try {
             const docxBuf = await generateDocxBuffer(content);
             variants.docx = { buffer: docxBuf, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: 'docx' };
          } catch(e){}
          break;
        case 'csv':
          buffer = Buffer.from('\uFEFF' + content, 'utf8'); // UTF-8 BOM
          mime = "text/csv";
          break;
        default:
          buffer = Buffer.from(content || '', 'utf8');
          mime = "text/plain";
      }

      // GUARDADO EN DRIVE (STORAGE + METADATA EN FIRESTORE)
      let publicUrl = `data:${mime};base64,${buffer.toString('base64')}`;
      let driveSaved = false;
      let artifactId = null;
      let driveError = null;
      
      if (saveToDrive) {
        let storageConsumedBytes = 0;
        try {
          let totalVariantSize = 0;
          for (let k in variants) totalVariantSize += variants[k].buffer.length;
          storageConsumedBytes = buffer.length + totalVariantSize;
          await consumeFeatureOrReject(req, 'storage', storageConsumedBytes, { module: 'drive', action: 'artifact_save_to_drive' });
          
          const bucket = storage.bucket();
          const storagePath = `users/${userId}/artifacts/${fileName}`;
          const storageFile = bucket.file(storagePath);
          
          await storageFile.save(buffer, {
            metadata: { contentType: mime },
            public: true
          });

          publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

          let variantMetadata: any = {};
          for (let key in variants) {
              const v = variants[key];
              const vFn = fileName.replace(`.${normType}`, `.${v.ext}`);
              const vPath = `users/${userId}/artifacts/${vFn}`;
              const vFile = bucket.file(vPath);
              await vFile.save(v.buffer, { metadata: { contentType: v.mime }, public: true });
              variantMetadata[key] = {
                  fileName: vFn,
                  mimeType: v.mime,
                  downloadUrl: `https://storage.googleapis.com/${bucket.name}/${vPath}`,
                  sizeBytes: v.buffer.length,
                  storagePath: vPath
              };
          }

          const driveRef = firestore.collection('users').doc(userId).collection('settings').doc('drive');
          const driveSnap = await driveRef.get();
          const driveData = driveSnap.exists ? driveSnap.data() : { personalFiles: [], folders: [], fileFolderMap: {} };
          
          artifactId = `art-${Date.now()}`;
          const newFile = {
            id: artifactId,
            name: fileName,
            url: publicUrl,
            type: mime,
            size: buffer.length,
            date: new Date().toISOString(),
            origin: 'AI Chat',
            parentId: 'root',
            parentName: 'Root',
            storagePath: storagePath,
            variants: variantMetadata,
            primaryFormat: normType
          };

          const updatedFiles = [...(driveData?.personalFiles || []), newFile];
          await driveRef.set({ personalFiles: updatedFiles, updatedAt: new Date().toISOString() }, { merge: true });
          driveSaved = true;
          
          // Actualizar out object map
          for (let key in variantMetadata) {
             variants[key] = variantMetadata[key];
          }
        } catch (driveErr: any) {
          if (storageConsumedBytes > 0) await releaseFeatureConsumption(req, 'storage', storageConsumedBytes);
          console.error("Error saving to storage or drive metadata:", driveErr);
          driveError = driveErr.message;
        }
      }

      res.json({
        ok: true,
        fileName,
        mimeType: mime,
        primaryFormat,
        downloadUrl: publicUrl,
        sizeBytes: buffer.length,
        base64Data: buffer.toString('base64'),
        driveSaved,
        artifactId,
        driveError,
        variants
      });

    } catch (e: any) {
      console.error("Error generating artifact:", e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // --- ENDPOINTS DE CREACIÓN DE TAREAS Y CALENDARIO ---
  app.post("/api/tasks/create", requireFirebaseUser, async (req: any, res: any) => {
    const { title, description, dueDate, priority, status: reqStatus, projectId, hours, tags, assignedTo } = req.body;
    const userId = req.user.uid;
    
    if (!title) return res.status(400).json({ ok: false, error: "Missing required field: title" });
 
    try {
      const taskObj: any = {
        id: `task-${Date.now()}`,
        title,
        description: description || "",
        date: dueDate?.split('T')[0] || new Date().toISOString().split('T')[0],
        time: dueDate?.includes('T') ? dueDate.split('T')[1].substring(0, 5) : "09:00",
        priority: priority || "Normal",
        status: reqStatus || "Por Hacer",
        hours: hours || null,
        tags: tags || [],
        assignedTo: assignedTo || [],
        createdAt: new Date().toISOString(),
        projectId: projectId || null,
        ownerId: userId,
        userId: userId
      };

      if (projectId) {
        const projectRef = firestore.collection('projects').doc(projectId);
        const projectSnap = await projectRef.get();
        if (projectSnap.exists) {
          const pData = projectSnap.data();
          const folders = pData?.folders || [];
          if (folders.length > 0) {
            folders[0].tasks = [...(folders[0].tasks || []), taskObj];
          } else {
            folders.push({ id: 'general', name: 'General', tasks: [taskObj] });
          }
          await projectRef.update({ folders });
        }
      } else {
        await firestore.collection('users').doc(userId).collection('tasks').doc(taskObj.id).set(taskObj);
      }

      res.json({ ok: true, task: taskObj });
    } catch (e: any) {
      console.error("Error creating task:", e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post("/api/projects/create", requireFirebaseUser, async (req: any, res: any) => {
    const { name, description } = req.body;
    const userId = req.user.uid;
    
    if (!name) return res.status(400).json({ ok: false, error: "Missing required field: name" });

    try {
      const userDoc = await firestore.collection('users').doc(userId).get();
      const userData = userDoc.data() || { name: req.user.name || "User", email: req.user.email, uid: userId };
      
      const newProjectId = `proj-${Date.now()}`;
      const projectObj = {
        id: newProjectId,
        name,
        title: name,
        description: description || "",
        ownerId: userId,
        memberIds: [userId],
        members: [{
          uid: userId,
          name: userData.name || "Usuario Goatify",
          email: userData.email,
          avatarUrl: userData.avatarUrl || `https://ui-avatars.com/api/?name=${(userData.name || 'User').replace(' ', '+')}`,
          headline: userData.headline || "Owner",
          plan: userData.plan || "Free"
        }], 
        status: 'active',
        statuses: [
          { id: 'status-todo', name: 'Por Hacer', color: '#FBBF24', isFixed: true },
          { id: 'status-inprogress', name: 'En Progreso', color: '#3B82F6', isFixed: true },
          { id: 'status-done', name: 'Hecho', color: '#10B981', isFixed: true }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        folders: [{ 
          id: 'folder-general', 
          name: 'General', 
          tasks: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }],
        source: 'chat'
      };

      await firestore.collection('projects').doc(newProjectId).set(projectObj);
      res.json({ ok: true, project: projectObj });
    } catch (e: any) {
      console.error("Error creating project:", e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post("/api/calendar/events/create", requireFirebaseUser, async (req: any, res: any) => {
    const { title, description, startDate, endDate, attendees, location, videoCall, projectId } = req.body;
    const userId = req.user.uid;
    
    if (!title || !startDate) return res.status(400).json({ ok: false, error: "Missing required fields" });

    try {
      const callId = `call-${Date.now()}`;
      const eventObj = {
        id: callId,
        title,
        description: description || "",
        scheduledAt: startDate,
        startAt: startDate,
        endAt: endDate || new Date(new Date(startDate).getTime() + 30 * 60000).toISOString(),
        endDate: endDate || new Date(new Date(startDate).getTime() + 30 * 60000).toISOString(),
        participants: [userId],
        invited: attendees || [],
        caller: {
            uid: userId,
            name: req.user.name,
            email: req.user.email
        },
        adminId: userId,
        isMeeting: true,
        isPrivate: false,
        status: 'scheduled',
        type: videoCall ? 'video' : 'event',
        videoCall: !!videoCall,
        maxDurationMinutes: 30,
        projectId: projectId || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'chat'
      };

      await firestore.collection('calls').doc(callId).set(eventObj);
      res.json({ ok: true, meetingId: callId, event: eventObj });
    } catch (e: any) {
      console.error("Error creating calendar event:", e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // --- AI PROXY FOR PUBLIC AGENTS & UNIVERSAL FRONTEND ---
  app.post("/api/gemini/chat", requireFirebaseUser, async (req: any, res: any) => {
    const { history, systemInstruction, model, config, module: reqModule } = req.body;
    const { key: apiKey, source } = getValidGeminiApiKey();
    const creditAmount = serverModuleChatCost(reqModule);
    let creditConsumed = false;

    if (!apiKey) {
      return res.status(500).json({ status: "FAIL", details: "No API Key available on server." });
    }

    try {
      await consumeFeatureOrReject(req, 'ai_chat', creditAmount, { module: reqModule || 'chat', action: 'gemini_chat' });
      creditConsumed = true;
      const ai = new GoogleGenAI({ apiKey } as any);
      const aiPolicy = await resolveTextAiPolicy(req, model, reqModule || "chat");
      const targetModel = aiPolicy.selectedModel;
      const maxOutputTokens = tokenCapForPlan(aiPolicy.plan, aiPolicy.paidPremium, reqModule || "chat", config?.maxOutputTokens);
      
      const result = await (ai as any).models.generateContent({
        model: targetModel,
        contents: history,
        config: {
          systemInstruction: systemInstruction,
          temperature: config?.temperature || 0.7,
          maxOutputTokens,
          responseMimeType: config?.responseMimeType || "text/plain",
          responseSchema: config?.responseSchema,
          responseModalities: config?.responseModalities
        }
      });

      res.json({
        text: result.text,
        parts: result.candidates?.[0]?.content?.parts,
        usageMetadata: result.usageMetadata,
        status: "OK",
        sourceUsed: source,
        modelUsed: targetModel,
        modelDowngraded: aiPolicy.downgraded
      });
    } catch (e: any) {
      if (e?.status === 402) return sendLimitError(res, e);
      if (creditConsumed) await releaseFeatureConsumption(req, 'ai_chat', creditAmount);
      console.error("Error in /api/gemini/chat:", e);
      res.status(500).json({ status: "FAIL", details: e.message || "No se pudo procesar la solicitud de IA." });
    }
  });

  // TTS Endpoint
  app.post("/api/gemini/tts", requireFirebaseUser, async (req: any, res: any) => {
    const { text, voice } = req.body;
    const { key: apiKey } = getValidGeminiApiKey();
    let creditConsumed = false;
    if (!apiKey) return res.status(500).json({ error: "No API Key" });

    try {
      await consumeFeatureOrReject(req, 'voice_command', 1, { module: 'voice', action: 'tts' });
      creditConsumed = true;
      const ai = new GoogleGenAI({ apiKey } as any);
      const response = await (ai as any).models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ role: "user", parts: [{ text }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice || "Kore" } } },
        },
      });
      const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!audioData) throw new Error("TTS failed to generate audio data");
      res.json({ audioData, mimeType: "audio/pcm;rate=24000" });
    } catch (e: any) {
      if (e?.status === 402) return sendLimitError(res, e);
      if (creditConsumed) await releaseFeatureConsumption(req, 'voice_command', 1);
      console.error("TTS Error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/debug/tts", requireFirebaseUser, async (req: any, res: any) => {
    if (isProduction && process.env.EXPOSE_DEBUG_TTS !== "true") return res.status(404).send();
    const { text, voice } = req.body;
    const { key: apiKey } = getValidGeminiApiKey();
    if (!apiKey) return res.status(500).json({ error: "No API Key" });

    try {
      const ai = new GoogleGenAI({ apiKey } as any);
      const response = await (ai as any).models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ role: "user", parts: [{ text: text || "Hola, esto es una prueba de voz de Goatify." }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice || "Kore" } } },
        },
      });
      const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!audioData) throw new Error("TTS failed to generate audio data");
      res.json({ status: "OK", audioData, mimeType: "audio/pcm;rate=24000" });
    } catch (e: any) {
      console.error("Debug TTS Error:", e);
      res.status(500).json({ status: "ERROR", error: e.message });
    }
  });

  // Images Endpoint (Imagen)
  app.post("/api/gemini/images", requireFirebaseUser, async (req: any, res: any) => {
    const { prompt, aspectRatio } = req.body;
    const { key: apiKey } = getValidGeminiApiKey();
    let creditConsumed = false;

    if (!apiKey) {
      return res.status(500).json({ error: "No API Key" });
    }

    const imagenModel = process.env.IMAGEN_MODEL || "imagen-4.0-generate-001";

    try {
      await consumeFeatureOrReject(req, 'ai_image', 1, { module: 'image', action: 'gemini_image' });
      creditConsumed = true;
      const ai = new GoogleGenAI({ apiKey } as any);

      console.log("[IMAGE] model used:", imagenModel);
      console.log("[IMAGE] prompt length:", prompt?.length || 0);
      console.log("[IMAGE] aspect ratio:", aspectRatio || "1:1");

      const response = await (ai as any).models.generateImages({
        model: imagenModel,
        prompt,
        config: {
          numberOfImages: 1,
          outputMimeType: "image/png",
          aspectRatio: aspectRatio || "1:1"
        }
      });

      const base64Bytes = response.generatedImages?.[0]?.image?.imageBytes;

      if (!base64Bytes) {
        if (creditConsumed) await releaseFeatureConsumption(req, 'ai_image', 1);
        return res.status(502).json({
          error: "No se recibió imagen desde Gemini Imagen.",
          model: imagenModel
        });
      }

      return res.json({
        imageUrl: `data:image/png;base64,${base64Bytes}`,
        mimeType: "image/png",
        model: imagenModel
      });

    } catch (e: any) {
      if (e?.status === 402) return sendLimitError(res, e);
      if (creditConsumed) await releaseFeatureConsumption(req, 'ai_image', 1);
      console.error("[IMAGE ERROR]", e);
      return res.status(500).json({
        error: "Error generando imagen con Gemini Imagen.",
        details: e?.message || String(e),
        model: imagenModel
      });
    }
  });

  // Alias para retrocompatibilidad parcial o casos específicos
  app.post("/api/ai/chat", requireFirebaseUser, async (req: any, res: any) => {
    const { history, systemInstruction, model, config, module: reqModule } = req.body;
    const { key: apiKey } = getValidGeminiApiKey();
    const creditAmount = serverModuleChatCost(reqModule);
    let creditConsumed = false;

    if (!apiKey) return res.status(500).json({ error: "No API Key" });

    try {
      await consumeFeatureOrReject(req, 'ai_chat', creditAmount, { module: reqModule || 'chat', action: 'ai_chat_alias' });
      creditConsumed = true;
      const client = new GoogleGenAI({ apiKey } as any);
      const aiPolicy = await resolveTextAiPolicy(req, model, reqModule || "chat");
      const modelToUse = aiPolicy.selectedModel;
      const maxOutputTokens = tokenCapForPlan(aiPolicy.plan, aiPolicy.paidPremium, reqModule || "chat", config?.maxOutputTokens || 1024);
      
      const result = await (client as any).models.generateContent({
        model: modelToUse,
        contents: history,
        config: {
          systemInstruction: systemInstruction,
          temperature: config?.temperature || 0.7,
          maxOutputTokens,
        }
      });

      res.json({
        candidates: [{ content: { parts: [{ text: result.text }] } }],
        usageMetadata: result.usageMetadata
      });
    } catch (e: any) {
      if (e?.status === 402) return sendLimitError(res, e);
      if (creditConsumed) await releaseFeatureConsumption(req, 'ai_chat', creditAmount);
      res.status(500).json({ error: e.message });
    }
  });

  // Endpoint para Streaming (Simulado o real vía SSE)
  app.post("/api/gemini/stream", requireFirebaseUser, async (req: any, res: any) => {
    const startTime = Date.now();
    const { history, systemInstruction, model, config, module: reqModule } = req.body;
    const { key: apiKey } = getValidGeminiApiKey();
    const creditAmount = serverModuleChatCost(reqModule);
    let creditConsumed = false;

    if (!apiKey) {
      res.status(500).write("data: Error: No API Key\n\n");
      return res.end();
    }

    try {
      await consumeFeatureOrReject(req, 'ai_chat', creditAmount, { module: reqModule || 'chat', action: 'gemini_stream' });
      creditConsumed = true;
    } catch (e: any) {
      return res.status(e?.status || 402).json({ ok: false, error: e?.message || 'Límite del plan alcanzado.', code: 'PLAN_LIMIT_REACHED' });
    }

    // Configuración SSE de Alto Rendimiento
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Crítico para proxies Nginx/Cloud Run

    // Heartbeat inicial para asegurar que el socket está abierto y reducir latencia percibida
    res.write(': heartbeat\n\n');

    try {
      const ai = new GoogleGenAI({ apiKey } as any);
      const aiPolicy = await resolveTextAiPolicy(req, model, reqModule || "chat");
      const targetModel = aiPolicy.selectedModel;
      const maxOutputTokens = tokenCapForPlan(aiPolicy.plan, aiPolicy.paidPremium, reqModule || "chat", config?.maxOutputTokens || 2048);
      
      const stream = await (ai as any).models.generateContentStream({
        model: targetModel,
        contents: history,
        config: {
          systemInstruction,
          temperature: config?.temperature || 0.7,
          maxOutputTokens,
        }
      });

      let firstToken = true;
      for await (const chunk of stream) {
        if (firstToken) {
          const firstTokenTime = Date.now() - startTime;
          console.log(`[CHAT LATENCY] Tiempo al primer token: ${firstTokenTime}ms (Modelo: ${targetModel})`);
          firstToken = false;
        }

        if (chunk.text) {
          // Envío inmediato sin acumulación
          res.write(`data: ${JSON.stringify({ text: chunk.text, usage: chunk.usageMetadata })}\n\n`);
        }
      }
      
      console.log(`[STREAM LATENCY] Fin de flujo en ${Date.now() - startTime}ms`);
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (e: any) {
      console.error("Stream Error:", e);
      res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
      res.end();
    }
  });

  // Endpoint para Multimedia (Imagen, Video, Audio)
  app.post("/api/gemini/media", requireFirebaseUser, async (req: any, res: any) => {
    const { prompt, type, fileData, config } = req.body;
    
    if (type === 'image-gen') {
      return res.status(400).json({ error: "Para generar imágenes usa el endpoint /api/gemini/images" });
    }

    const { key: apiKey } = getValidGeminiApiKey();
    const mediaFeature: ServerFeatureKey = String(fileData?.mimeType || '').startsWith('video/') ? 'ai_video' : 'ai_chat';
    const creditAmount = mediaFeature === 'ai_video' ? 1 : 2;
    let creditConsumed = false;

    if (!apiKey) return res.status(500).json({ error: "No API Key" });

    try {
      await consumeFeatureOrReject(req, mediaFeature, creditAmount, { module: 'media', action: 'gemini_media' });
      creditConsumed = true;
      const ai = new GoogleGenAI({ apiKey } as any);
      const aiPolicy = await resolveTextAiPolicy(req, TEXT_FLASH_MODEL, "media");
      const modelToUse = aiPolicy.selectedModel;
      
      let contents: any = prompt;
      if (fileData) {
        contents = [{
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: fileData.mimeType, data: fileData.data } }
          ]
        }];
      }

      const result = await (ai as any).models.generateContent({
        model: modelToUse,
        contents,
        config: { ...(config || {}), maxOutputTokens: tokenCapForPlan(aiPolicy.plan, aiPolicy.paidPremium, "media", config?.maxOutputTokens || 4096) }
      });

      res.json({ text: result.text, result });
    } catch (e: any) {
      if (e?.status === 402) return sendLimitError(res, e);
      if (creditConsumed) await releaseFeatureConsumption(req, mediaFeature, creditAmount);
      res.status(500).json({ error: e.message });
    }
  });

  // --- REAL-TIME LIVE PROXY BACKEND ---
  const server = http.createServer(app);
  const liveWss = new WebSocketServer({ server, path: "/api/live-proxy" });

  liveWss.on("connection", async (clientWs: WS, req: any) => {
    console.log("[LIVE] Client connected to /api/live-proxy");

    if (process.env.ALLOW_UNAUTHENTICATED_LIVE_PROXY !== "true") {
      try {
        const parsedUrl = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
        const token = parsedUrl.searchParams.get("token");
        if (!token) throw new Error("Missing Firebase token for live proxy");
        await admin.auth().verifyIdToken(token);
      } catch (e: any) {
        console.warn("[LIVE] Unauthorized WS connection:", e?.message || e);
        clientWs.close(1008, "No autorizado");
        return;
      }
    }
    
    const { key: apiKey } = getValidGeminiApiKey();
    if (!apiKey) {
      console.error("[LIVE] No API Key found");
      clientWs.close(1008, "No API Key");
      return;
    }

    // Gemini Multimodal Live API URL
    const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    console.log("[LIVE] Connecting to Gemini Live URL v1beta BidiGenerateContent");
    
    const geminiWs = new WS(geminiUrl);
    const messageQueue: any[] = [];
    let isGeminiOpen = false;
    let geminiReady = false;
    const realtimeQueue: any[] = [];

    geminiWs.on("open", () => {
      console.log("[LIVE] Gemini WS open");
      isGeminiOpen = true;
      while (messageQueue.length > 0) {
        const msg = messageQueue.shift();
        geminiWs.send(msg);
      }
    });

    geminiWs.on("message", (data) => {
      const resp = data.toString();
      // LOG DE RESPUESTA CRÍTICO PARA DEBUGGING
      console.log("[LIVE] Gemini raw message:", resp.slice(0, 1200));

      if (resp.includes('"setupComplete"')) {
        console.log("[LIVE] Gemini setupComplete received. Flushing realtime queue.");
        geminiReady = true;
        while (realtimeQueue.length > 0) {
          const qMsg = realtimeQueue.shift();
          geminiWs.send(qMsg);
        }
      }

      if (resp.includes('"error"')) {
        console.log("[LIVE] Gemini error detected in message");
      }
      clientWs.send(resp);
    });

    geminiWs.on("error", (error) => {
      console.error("[LIVE] Gemini WS error:", error.message);
      clientWs.send(JSON.stringify({ error: error.message }));
    });

    geminiWs.on("close", (code, reason) => {
      const reasonStr = reason ? reason.toString() : "No reason provided";
      console.log(`[LIVE] Gemini WS closed | Code: ${code} | Reason: ${reasonStr}`);
      clientWs.close(code, reasonStr);
    });

    clientWs.on("message", (message) => {
      try {
        const msg = JSON.parse(message.toString());
        
        if (msg.type === "setup") {
          console.log("[LIVE] Setup received from frontend. Preparing Gemini setup sequence...");
          // Formato SETUP exacto para v1beta Bidi Multimodal Live
          const setupMsg = {
            setup: {
              model: "models/gemini-3.1-flash-live-preview",
              generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName: msg.voiceName || "Kore"
                    }
                  }
                }
              },
              systemInstruction: {
                parts: [{ text: msg.systemInstruction || "Eres un asistente de voz llamado Shivo." }]
              },
              tools: [
                {
                  functionDeclarations: [
                    {
                      name: "create_task",
                      description: "Crea una nueva tarea en un proyecto o de forma personal.",
                      parameters: {
                        type: "object",
                        properties: {
                          title: { type: "string", description: "Título de la tarea" },
                          description: { type: "string", description: "Descripción detallada" },
                          date: { type: "string", description: "Fecha en formato YYYY-MM-DD" },
                          projectId: { type: "string", description: "ID opcional del proyecto" }
                        },
                        required: ["title"]
                      }
                    },
                    {
                      name: "create_project",
                      description: "Inicia un nuevo proyecto estratégico.",
                      parameters: {
                        type: "object",
                        properties: {
                          name: { type: "string", description: "Nombre del proyecto" },
                          industry: { type: "string", description: "Industria" },
                          objective: { type: "string", description: "Objetivo principal" }
                        },
                        required: ["name"]
                      }
                    },
                    {
                      name: "create_event",
                      description: "Agenda un evento o reunión en el calendario.",
                      parameters: {
                        type: "object",
                        properties: {
                          title: { type: "string", description: "Título del evento" },
                          description: { type: "string", description: "Descripción" },
                          startDate: { type: "string", description: "ISO 8601 start date" },
                          endDate: { type: "string", description: "ISO 8601 end date" },
                          videoCall: { type: "boolean", description: "Si requiere videollamada" }
                        },
                        required: ["title", "startDate", "endDate"]
                      }
                    },
                    {
                      name: "send_email",
                      description: "Envía un correo electrónico a un destinatario.",
                      parameters: {
                        type: "object",
                        properties: {
                          to: { type: "string", description: "Email del destinatario" },
                          subject: { type: "string", description: "Asunto del correo" },
                          body: { type: "string", description: "Cuerpo del mensaje (texto plano)" }
                        },
                        required: ["to", "subject", "body"]
                      }
                    },
                    {
                      name: "search_internet",
                      description: "Busca información actualizada en internet sobre cualquier tema.",
                      parameters: {
                        type: "object",
                        properties: {
                          query: { type: "string", description: "Búsqueda a realizar" }
                        },
                        required: ["query"]
                      }
                    }
                  ]
                }
              ]
            }
          };
          
          const rawSetup = JSON.stringify(setupMsg);
          if (isGeminiOpen) {
            console.log("[LIVE] Sending setup to Gemini...");
            geminiWs.send(rawSetup);
          } else {
            console.log("[LIVE] Gemini not open yet, queueing setup");
            messageQueue.push(rawSetup);
          }
        } else if (msg.type === "realtimeInput") {
          const rt = msg.realtimeInput || {};
          
          if (rt.audio) {
            // NUEVO FORMATO: Sin mediaChunks, directo audio
            const audioMsg = JSON.stringify({
              realtimeInput: {
                audio: {
                  mimeType: rt.audio.mimeType || "audio/pcm;rate=16000",
                  data: rt.audio.data
                }
              }
            });
            if (geminiReady) {
              geminiWs.send(audioMsg);
            } else {
              // Si la cola crece demasiado (ej: > 100 paquetes ~ 2-4 segundos), descartamos los más viejos
              if (realtimeQueue.length < 200) {
                realtimeQueue.push(audioMsg);
              }
            }
          }

          if (rt.video) {
            // NUEVO FORMATO: Sin mediaChunks, directo video
            const videoMsg = JSON.stringify({
              realtimeInput: {
                video: {
                  mimeType: rt.video.mimeType || "image/jpeg",
                  data: rt.video.data
                }
              }
            });
            if (geminiReady) {
              geminiWs.send(videoMsg);
            } else {
              // Video pesa más, limitamos la cola
              if (realtimeQueue.length < 50) {
                realtimeQueue.push(videoMsg);
              }
            }
          }
        } else if (msg.type === "toolResponse") {
          const rawTool = JSON.stringify({
            toolResponse: msg.toolResponse
          });
          if (geminiReady) {
            geminiWs.send(rawTool);
          } else {
            realtimeQueue.push(rawTool);
          }
        }
      } catch (e) {
        console.error("[LIVE] Error parsing client message:", e);
      }
    });

    clientWs.on("close", (code, reason) => {
      console.log("[LIVE] Client WS closed:", code, reason.toString());
      if (geminiWs.readyState === WS.OPEN) {
        geminiWs.close();
      }
    });
  });

  // Vite middleware para desarrollo
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
