import { Router } from 'express';
import { Op } from 'sequelize';
import { z } from 'zod';
import { sequelize } from '../config/database';
import { HttpError } from '../errors/http-error';
import { AccessLog, AccessSession, Incident, Worker } from '../models';
import { persistTerminalDecision } from '../services/access-session-finalization';
import { evaluatePpeFrame, getPpePolicyConfig } from '../services/ppe-policy';
import { inferImage } from '../services/roboflow-inference';

export const apiRouter = Router();

const workerLookupSchema = z.object({ identifier: z.string().trim().min(1).max(128) });
const createSessionSchema = z.object({
  identifier: z.string().trim().min(1).max(128),
  attempt_id: z.uuid().optional()
});
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

apiRouter.get('/health', async (_request, response) => {
  try {
    await sequelize.authenticate();
    response.status(200).json({ status: 'ok', database: 'connected' });
  } catch {
    response.status(503).json({ status: 'degraded', database: 'unavailable' });
  }
});

apiRouter.get('/workers/lookup', async (request, response) => {
  const { identifier } = workerLookupSchema.parse(request.query);
  const workers = await Worker.findAll({
    where: { [Op.or]: [{ identifier }, { fullName: identifier }] },
    attributes: ['id', 'identifier', 'fullName', 'department', 'status']
  });

  if (workers.length > 1) {
    throw new HttpError(409, 'AMBIGUOUS_WORKER', 'Multiple workers match this name; use the employee identifier');
  }
  const worker = workers.at(0);
  if (!worker) {
    throw new HttpError(404, 'WORKER_NOT_FOUND', 'No worker matches the supplied identifier');
  }

  response.json({ worker });
});

apiRouter.post('/access-sessions', async (request, response) => {
  const { identifier, attempt_id: attemptId } = createSessionSchema.parse(request.body);
  const worker = await Worker.findOne({ where: { identifier } });

  if (!worker) {
    throw new HttpError(404, 'WORKER_NOT_FOUND', 'No worker matches the supplied identifier');
  }
  if (worker.status !== 'active') {
    throw new HttpError(403, 'WORKER_INACTIVE', 'Inactive workers cannot start an access session');
  }

  const session = await AccessSession.create({
    workerId: worker.id,
    ...(attemptId ? { attemptId } : {})
  });

  response.status(201).json({
    session: {
      id: session.id,
      attempt_id: session.attemptId,
      worker_id: session.workerId,
      status: session.status,
      started_at: session.startedAt
    },
    worker: {
      id: worker.id,
      identifier: worker.identifier,
      full_name: worker.fullName
    }
  });
});

apiRouter.get('/access-sessions/:id', async (request, response) => {
  const idResult = z.uuid().safeParse(request.params.id);
  if (!idResult.success) {
    throw new HttpError(400, 'INVALID_SESSION_ID', 'Session id must be a UUID');
  }

  const session = await AccessSession.findByPk(idResult.data, {
    include: [{ model: Worker, as: 'worker', attributes: ['id', 'identifier', 'fullName', 'department', 'status'] }]
  });
  if (!session) {
    throw new HttpError(404, 'SESSION_NOT_FOUND', 'Access session was not found');
  }

  response.json({ session });
});

apiRouter.post('/access-sessions/:id/inference', async (request, response) => {
  const idResult = z.uuid().safeParse(request.params.id);
  if (!idResult.success) {
    throw new HttpError(400, 'INVALID_SESSION_ID', 'Session id must be a UUID');
  }

  const session = await AccessSession.findByPk(idResult.data);
  if (!session) {
    throw new HttpError(404, 'SESSION_NOT_FOUND', 'Access session was not found');
  }
  const sessionResponse = (record: AccessSession) => ({
    status: record.status,
    decision: record.decision,
    denialReason: record.denialReason,
    stableFrames: record.stableFrames,
    missingEquipment: record.missingEquipment
  });
  if (session.status !== 'active') {
    const accessLog = await AccessLog.findOne({ where: { sessionId: session.id } });
    response.json({ session: sessionResponse(session), ...(accessLog ? { accessLog } : {}) });
    return;
  }

  const { image } = z.object({ image: z.string() }).parse(request.body);
  const inference = await inferImage(image);
  const config = getPpePolicyConfig();

  // Fetch worker info for notification context (needed if access is denied)
  const worker = await Worker.findByPk(session.workerId, { attributes: ['id', 'identifier', 'fullName'] });

  const result = await sequelize.transaction(async (transaction) => {
    const lockedSession = await AccessSession.findByPk(session.id, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!lockedSession) {
      throw new HttpError(404, 'SESSION_NOT_FOUND', 'Access session was not found');
    }
    if (lockedSession.status !== 'active') {
      const accessLog = await AccessLog.findOne({ where: { sessionId: lockedSession.id }, transaction });
      return { session: sessionResponse(lockedSession), accessLog };
    }

    const policy = evaluatePpeFrame(
      {
        stableFrames: lockedSession.stableFrames,
        missingEquipment: lockedSession.missingEquipment,
        missingEquipmentSince: lockedSession.missingEquipmentSince?.getTime() ?? null
      },
      {
        personCount: inference.personCount,
        helmet: inference.equipment.helmet,
        vest: inference.equipment.vest
      },
      Date.now(),
      config
    );
    await lockedSession.update({
      stableFrames: policy.stableFrames,
      missingEquipment: policy.missingEquipment,
      missingEquipmentSince: policy.missingEquipmentSince === null ? null : new Date(policy.missingEquipmentSince)
    }, { transaction });

    let accessLog: AccessLog | null = null;
    if (policy.decision) {
      accessLog = await persistTerminalDecision({
        sessionId: lockedSession.id,
        workerId: lockedSession.workerId,
        result: policy.decision,
        helmet: inference.equipment.helmet,
        vest: inference.equipment.vest,
        helmetConfidence: inference.equipmentConfidences.helmet,
        vestConfidence: inference.equipmentConfidences.vest,
        denialReason: policy.denialReason,
        missingEquipment: policy.missingEquipment
      }, {
        findAccessLog: (sessionId) => AccessLog.findOne({ where: { sessionId }, transaction }),
        createAccessLog: (values) => AccessLog.create({ event: 'entry', ...values }, { transaction }),
        createIncident: async ({ sessionId, workerId, missingEquipment, denialReason }) => {
          await Incident.findOrCreate({
            where: { sessionId },
            defaults: {
              sessionId,
              workerId,
              title: 'PPE requirements not met',
              description: `Missing required equipment: ${missingEquipment.join(', ')}. Decision: ${denialReason}`
            },
            transaction
          });
        },
        completeSession: async ({ decision, denialReason, endedAt }) => {
          await lockedSession.update({ status: 'completed', decision, denialReason, endedAt }, { transaction });
        }
      },
      new Date(),
      worker ? { workerName: worker.fullName, workerIdentifier: worker.identifier } : undefined
      ) as AccessLog;
    }

    return { session: sessionResponse(lockedSession), accessLog };
  });

  response.status(200).json({ ...inference, ...result });
});

apiRouter.get('/access-logs', async (request, response) => {
  const { page, limit } = paginationSchema.parse(request.query);
  const { count, rows } = await AccessLog.findAndCountAll({
    limit,
    offset: (page - 1) * limit,
    order: [['occurredAt', 'DESC']],
    include: [{ model: Worker, as: 'worker', attributes: ['id', 'identifier', 'fullName'] }]
  });

  response.json({
    items: rows,
    pagination: { page, limit, total: count, total_pages: Math.ceil(count / limit) }
  });
});

apiRouter.post('/access-sessions/:id/cancel', async (request, response) => {
  const idResult = z.uuid().safeParse(request.params.id);
  if (!idResult.success) {
    throw new HttpError(400, 'INVALID_SESSION_ID', 'Session id must be a UUID');
  }

  const session = await AccessSession.findByPk(idResult.data);
  if (!session) {
    throw new HttpError(404, 'SESSION_NOT_FOUND', 'Access session was not found');
  }
  if (session.status !== 'active') {
    throw new HttpError(409, 'SESSION_NOT_ACTIVE', 'Only active sessions can be cancelled');
  }

  await session.update({ status: 'cancelled', endedAt: new Date() });
  response.json({ session: { id: session.id, status: session.status, ended_at: session.endedAt } });
});