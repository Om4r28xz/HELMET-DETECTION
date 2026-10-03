import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../errors/http-error';
import { Notification, Supervisor } from '../models';
import { getNotificationStats, sendTestNotification } from '../services/notification-dispatcher';
import { getWhatsAppStatus, isWhatsAppConfigured, getWhatsAppQRCode } from '../services/whatsapp';

export const notificationsRouter = Router();

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

/**
 * GET /api/notifications/whatsapp/status
 * Returns Baileys WhatsApp client connection status.
 */
notificationsRouter.get('/whatsapp/status', (_request, response) => {
  response.json(getWhatsAppStatus());
});

/**
 * GET /api/notifications/whatsapp/qr
 * Renders an HTML page with the WhatsApp QR code to scan.
 */
notificationsRouter.get('/whatsapp/qr', (_request, response) => {
  const qrData = getWhatsAppQRCode();

  if (qrData.isConnected) {
    return response.send(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>WhatsApp Conectado</title><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f172a;color:#fff;}.card{background:#1e293b;padding:2rem;border-radius:12px;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,0.4);}</style></head>
      <body><div class="card"><h2>✅ WhatsApp Conectado</h2><p>El dispositivo ya está vinculado y listo para enviar notificaciones.</p></div></body>
      </html>
    `);
  }

  if (!qrData.qrDataUrl) {
    return response.send(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta http-equiv="refresh" content="2"><title>Generando QR...</title><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f172a;color:#fff;}.card{background:#1e293b;padding:2rem;border-radius:12px;text-align:center;}</style></head>
      <body><div class="card"><h2>⏳ Generando código QR...</h2><p>Por favor espera un momento...</p></div></body>
      </html>
    `);
  }

  return response.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta http-equiv="refresh" content="20">
      <title>Escanear QR WhatsApp</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; }
        .card { background: #1e293b; padding: 2.5rem; border-radius: 16px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5); max-width: 420px; width: 90%; }
        h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: #38bdf8; }
        p { color: #94a3b8; font-size: 0.95rem; margin-bottom: 1.5rem; line-height: 1.4; }
        .qr-wrapper { background: #fff; padding: 12px; border-radius: 12px; display: inline-block; margin-bottom: 1.5rem; }
        .qr-wrapper img { display: block; width: 280px; height: 280px; }
        .instructions { text-align: left; background: #334155; padding: 1rem; border-radius: 8px; font-size: 0.85rem; color: #cbd5e1; }
        .instructions ol { margin: 0; padding-left: 1.25rem; }
        .instructions li { margin-bottom: 0.25rem; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Escanear QR de WhatsApp</h1>
        <p>Vincula el número que enviará los mensajes de acceso de seguridad.</p>
        <div class="qr-wrapper">
          <img src="${qrData.qrDataUrl}" alt="WhatsApp QR Code" />
        </div>
        <div class="instructions">
          <ol>
            <li>Abre <strong>WhatsApp</strong> en tu teléfono</li>
            <li>Toca <strong>Dispositivos vinculados</strong></li>
            <li>Toca <strong>Vincular un dispositivo</strong></li>
            <li>Apunta la cámara a este código QR</li>
          </ol>
        </div>
      </div>
    </body>
    </html>
  `);
});

/**
 * GET /api/notifications/whatsapp/qr-data
 * Returns raw QR data (data URL and terminal string).
 */
notificationsRouter.get('/whatsapp/qr-data', (_request, response) => {
  response.json(getWhatsAppQRCode());
});

/**
 * GET /api/notifications/status
 * Returns WhatsApp configuration status and notification stats.
 */
notificationsRouter.get('/status', async (_request, response) => {
  const stats = await getNotificationStats();
  const whatsappStatus = getWhatsAppStatus();
  response.json({ ...stats, ...whatsappStatus });
});

/**
 * GET /api/notifications
 * Lists notifications with pagination, most recent first.
 */
notificationsRouter.get('/', async (request, response) => {
  const { page, limit } = paginationSchema.parse(request.query);
  const { count, rows } = await Notification.findAndCountAll({
    limit,
    offset: (page - 1) * limit,
    order: [['createdAt', 'DESC']],
    include: [{ model: Supervisor, as: 'supervisor', attributes: ['id', 'identifier', 'fullName', 'phone'] }]
  });

  response.json({
    items: rows,
    pagination: { page, limit, total: count, total_pages: Math.ceil(count / limit) }
  });
});

/**
 * POST /api/notifications/test
 * Sends a test WhatsApp message to verify the integration.
 * Body: { phone: string }
 */
notificationsRouter.post('/test', async (request, response) => {
  const { phone } = z.object({ phone: z.string().trim().min(1) }).parse(request.body);

  if (!isWhatsAppConfigured()) {
    throw new HttpError(503, 'WHATSAPP_NOT_CONFIGURED', 'WhatsApp is not configured. Set WHATSAPP_SENDER_PHONE and WHATSAPP_ENABLED=true in backend/.env, then link the device using the QR page.');
  }

  const result = await sendTestNotification(phone);
  const statusCode = result.status === 'sent' ? 200 : 502;
  response.status(statusCode).json(result);
});

/**
 * GET /api/notifications/:id
 * Retrieves a single notification by ID.
 */
notificationsRouter.get('/:id', async (request, response) => {
  const idResult = z.uuid().safeParse(request.params.id);
  if (!idResult.success) {
    throw new HttpError(400, 'INVALID_NOTIFICATION_ID', 'Notification id must be a UUID');
  }

  const notification = await Notification.findByPk(idResult.data, {
    include: [{ model: Supervisor, as: 'supervisor', attributes: ['id', 'identifier', 'fullName', 'phone'] }]
  });
  if (!notification) {
    throw new HttpError(404, 'NOTIFICATION_NOT_FOUND', 'Notification was not found');
  }

  response.json({ notification });
});
