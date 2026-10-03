import { Notification } from '../models/notification';
import { Supervisor } from '../models/supervisor';
import { Worker } from '../models/worker';
import { isWhatsAppConfigured, sendTextMessage, type WhatsAppSendResult } from './whatsapp';

export interface AccessDeniedContext {
  workerId: string;
  workerName: string;
  workerIdentifier: string;
  missingEquipment: string[];
  sessionId: string;
}

export interface NotificationResult {
  notificationId: string;
  whatsappResult: WhatsAppSendResult | null;
  supervisorName: string;
  supervisorPhone: string | null;
}

function equipmentLabel(equipment: string): string {
  const normalized = equipment.toLowerCase();
  if (normalized === 'helmet') return 'casco';
  if (normalized === 'vest') return 'chaleco';
  return equipment;
}

function buildDenialMessage(context: AccessDeniedContext): { title: string; body: string } {
  const missing = context.missingEquipment.map(equipmentLabel);
  const missingText = missing.length > 1
    ? `${missing.slice(0, -1).join(', ')} y ${missing[missing.length - 1]}`
    : missing[0] || 'equipo no especificado';

  const title = `⚠️ Acceso denegado: ${context.workerName}`;
  const body = [
    `🚨 *ALERTA DE SEGURIDAD*`,
    ``,
    `Se ha denegado el acceso al trabajador *${context.workerName}* (${context.workerIdentifier}).`,
    ``,
    `📋 *Equipo faltante:* ${missingText}`,
    `🕐 *Fecha:* ${new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}`,
    `🔑 *Sesión:* ${context.sessionId.slice(0, 8)}…`,
    ``,
    `Por favor, tome las medidas necesarias.`
  ].join('\n');

  return { title, body };
}

/**
 * Dispatches a notification to all active supervisors when a worker is denied access.
 * Creates a Notification record for each supervisor and sends a WhatsApp message
 * to those who have a phone number configured.
 *
 * This function never throws — failures are recorded in the Notification status.
 */
export async function dispatchAccessDeniedNotifications(
  context: AccessDeniedContext
): Promise<NotificationResult[]> {
  const results: NotificationResult[] = [];

  try {
    const supervisors = await Supervisor.findAll({
      where: { status: 'active' },
      attributes: ['id', 'fullName', 'phone']
    });

    if (supervisors.length === 0) {
      return results;
    }

    const { title, body } = buildDenialMessage(context);
    const whatsappEnabled = isWhatsAppConfigured();

    for (const supervisor of supervisors) {
      try {
        // Create notification record
        const notification = await Notification.create({
          supervisorId: supervisor.id,
          type: 'incident',
          channel: supervisor.phone && whatsappEnabled ? 'whatsapp' : 'in_app',
          title,
          message: body,
          status: 'pending'
        });

        let whatsappResult: WhatsAppSendResult | null = null;

        // Send WhatsApp message if supervisor has a phone and WhatsApp is configured
        if (supervisor.phone && whatsappEnabled) {
          whatsappResult = await sendTextMessage({
            to: supervisor.phone,
            body
          });

          await notification.update({
            status: whatsappResult.status === 'sent' ? 'sent' : 'failed',
            externalMessageId: whatsappResult.messageId || null,
            sentAt: whatsappResult.status === 'sent' ? new Date() : null,
            failureReason: whatsappResult.error ?? null
          });
        }

        results.push({
          notificationId: notification.id,
          whatsappResult,
          supervisorName: supervisor.fullName,
          supervisorPhone: supervisor.phone
        });
      } catch (error) {
        // Log but don't fail the entire dispatch for one supervisor
        console.error(`[notification-dispatcher] Failed to notify supervisor ${supervisor.id}:`, error);
      }
    }
  } catch (error) {
    console.error('[notification-dispatcher] Failed to dispatch access denied notifications:', error);
  }

  return results;
}

/**
 * Sends a test WhatsApp message to verify the integration is working.
 */
export async function sendTestNotification(phone: string): Promise<WhatsAppSendResult> {
  if (!isWhatsAppConfigured()) {
    return { messageId: '', status: 'failed', error: 'WhatsApp is not configured' };
  }

  return sendTextMessage({
    to: phone,
    body: '✅ *Smart Safety Access System*\n\nEsta es una notificación de prueba. La integración con WhatsApp está funcionando correctamente.'
  });
}

/**
 * Retrieves the notification status summary for monitoring.
 */
export async function getNotificationStats(): Promise<{
  total: number;
  sent: number;
  failed: number;
  pending: number;
  whatsappConfigured: boolean;
}> {
  const [total, sent, failed, pending] = await Promise.all([
    Notification.count(),
    Notification.count({ where: { status: 'sent' } }),
    Notification.count({ where: { status: 'failed' } }),
    Notification.count({ where: { status: 'pending' } })
  ]);

  return { total, sent, failed, pending, whatsappConfigured: isWhatsAppConfigured() };
}
