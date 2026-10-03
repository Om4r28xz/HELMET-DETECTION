import path from 'node:path';
import fs from 'node:fs';
import type { WASocket, ConnectionState } from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { Boom } from '@hapi/boom';
import { HttpError } from '../errors/http-error';

export interface WhatsAppTextMessage {
  to: string;
  body: string;
}

export interface WhatsAppSendResult {
  messageId: string;
  status: 'sent' | 'failed';
  error?: string;
}

export interface WhatsAppServiceStatus {
  isConfigured: boolean;
  isConnected: boolean;
  senderPhone: string;
  hasQR: boolean;
}

let sock: WASocket | null = null;
let isConnected = false;
let currentQR: string | null = null;
let currentQRDataUrl: string | null = null;
let currentQRTerminal: string | null = null;
let isInitializing = false;
let reconnectTimer: NodeJS.Timeout | null = null;

const AUTH_FOLDER = path.resolve(__dirname, '../../auth_info_baileys');
type BaileysModule = typeof import('@whiskeysockets/baileys');
let baileysModule: Promise<BaileysModule> | null = null;

function loadBaileys(): Promise<BaileysModule> {
  if (!baileysModule) {
    const importModule = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<BaileysModule>;
    baileysModule = importModule('@whiskeysockets/baileys');
  }
  return baileysModule;
}

/**
 * Normalizes a phone number to digits-only format for WhatsApp.
 * Mexican 10-digit number gets 52 prepended.
 */
export function normalizePhoneNumber(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');

  if (digits.length === 0) {
    throw new HttpError(400, 'INVALID_PHONE', 'Phone number must contain digits');
  }

  // Already has country code (11+ digits, e.g. 526141320311)
  if (digits.length >= 11 && digits.length <= 15) {
    return digits;
  }

  // Mexican 10-digit number → prepend 52
  if (digits.length === 10) {
    return `52${digits}`;
  }

  throw new HttpError(400, 'INVALID_PHONE', `Phone number has an unexpected length: ${digits.length} digits`);
}

export function isWhatsAppConfigured(): boolean {
  const enabled = process.env.WHATSAPP_ENABLED?.trim().toLowerCase() !== 'false';
  const senderPhone = process.env.WHATSAPP_SENDER_PHONE?.trim() ?? '';
  return enabled && senderPhone.length > 0;
}

export function getWhatsAppSenderPhone(): string {
  return process.env.WHATSAPP_SENDER_PHONE?.trim() ?? '526145139417';
}

/**
 * Initializes the Baileys WhatsApp client for QR code scanning.
 */
export async function initWhatsApp(): Promise<void> {
  if (!isWhatsAppConfigured()) {
    console.log('[WhatsApp] Deshabilitado o sin WHATSAPP_SENDER_PHONE configurado.');
    return;
  }

  if (isInitializing || isConnected) {
    return;
  }

  isInitializing = true;

  try {
    const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = await loadBaileys();
    if (!fs.existsSync(AUTH_FOLDER)) {
      fs.mkdirSync(AUTH_FOLDER, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

    const client = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: ['Smart Safety Access', 'Chrome', '1.0.0']
    });

    sock = client;

    client.ev.on('creds.update', saveCreds);

    client.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        currentQR = qr;
        currentQRDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 8 });
        currentQRTerminal = await QRCode.toString(qr, { type: 'terminal', small: true });
        console.log('[WhatsApp] QR listo en http://localhost:3000/api/notifications/whatsapp/qr');
      }

      if (connection === 'close') {
        isConnected = false;
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`[WhatsApp] Conexión cerrada. Razón: ${statusCode}. Reintentando: ${shouldReconnect}`);

        if (statusCode === DisconnectReason.loggedOut) {
          console.log('[WhatsApp] Sesión cerrada. Limpiando credenciales...');
          fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
          currentQR = null;
          currentQRDataUrl = null;
          currentQRTerminal = null;
        }

        if (shouldReconnect) {
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            isInitializing = false;
            initWhatsApp();
          }, 3000);
        }
      } else if (connection === 'open') {
        isConnected = true;
        currentQR = null;
        currentQRDataUrl = null;
        currentQRTerminal = null;
        console.log('====================================================');
        console.log('✅ [WhatsApp] Conectado exitosamente como remitente!');
        console.log('====================================================');
      }
    });
  } catch (error) {
    console.error('[WhatsApp] Error al inicializar cliente:', error);
  } finally {
    isInitializing = false;
  }
}

/**
 * Returns current QR code data.
 */
export function getWhatsAppQRCode(): {
  qr: string | null;
  qrDataUrl: string | null;
  qrTerminal: string | null;
  isConnected: boolean;
} {
  return {
    qr: currentQR,
    qrDataUrl: currentQRDataUrl,
    qrTerminal: currentQRTerminal,
    isConnected
  };
}

/**
 * Returns current WhatsApp connection status.
 */
export function getWhatsAppStatus(): WhatsAppServiceStatus {
  return {
    isConfigured: isWhatsAppConfigured(),
    isConnected,
    senderPhone: getWhatsAppSenderPhone(),
    hasQR: currentQR !== null
  };
}

/**
 * Sends a WhatsApp text message via Baileys.
 */
export async function sendTextMessage(message: WhatsAppTextMessage): Promise<WhatsAppSendResult> {
  if (!isWhatsAppConfigured()) {
    return { messageId: '', status: 'failed', error: 'WhatsApp notifications are disabled' };
  }

  if (!sock || !isConnected) {
    return {
      messageId: '',
      status: 'failed',
      error: 'WhatsApp no está vinculado. Por favor escanea el código QR primero.'
    };
  }

  try {
    const normalizedTo = normalizePhoneNumber(message.to);
    let targetJid = `${normalizedTo}@s.whatsapp.net`;

    // In Mexico, WhatsApp JIDs often require '521' instead of '52'
    const candidates = [normalizedTo];
    if (normalizedTo.startsWith('52') && !normalizedTo.startsWith('521') && normalizedTo.length === 12) {
      candidates.push(`521${normalizedTo.slice(2)}`);
    } else if (normalizedTo.startsWith('521') && normalizedTo.length === 13) {
      candidates.push(`52${normalizedTo.slice(3)}`);
    }

    try {
      const checked = await sock.onWhatsApp(...candidates);
      console.log(`[WhatsApp] Verificando destinatario ${message.to}:`, checked);
      const existing = checked?.find((item) => item.exists);
      if (existing?.jid) {
        targetJid = existing.jid;
        console.log(`[WhatsApp] JID confirmado en WhatsApp: ${targetJid}`);
      }
    } catch (checkErr) {
      console.warn('[WhatsApp] No se pudo verificar onWhatsApp, usando default:', checkErr);
    }

    console.log(`[WhatsApp] Enviando mensaje a ${targetJid}...`);
    const result = await sock.sendMessage(targetJid, {
      text: message.body
    });

    const messageId = result?.key?.id ?? '';
    console.log(`[WhatsApp] Mensaje enviado exitosamente. ID: ${messageId}`);
    return {
      messageId,
      status: 'sent'
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Error desconocido al enviar mensaje';
    return {
      messageId: '',
      status: 'failed',
      error: errorMsg
    };
  }
}
