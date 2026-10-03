import { AccessLog } from './access-log';
import { AccessSession } from './access-session';
import { Incident } from './incident';
import { Notification } from './notification';
import { Supervisor } from './supervisor';
import { Worker } from './worker';

Worker.hasMany(AccessSession, { foreignKey: 'workerId', as: 'sessions' });
AccessSession.belongsTo(Worker, { foreignKey: 'workerId', as: 'worker' });
Supervisor.hasMany(AccessSession, { foreignKey: 'supervisorId', as: 'sessions' });
AccessSession.belongsTo(Supervisor, { foreignKey: 'supervisorId', as: 'supervisor' });
AccessSession.hasOne(AccessLog, { foreignKey: 'sessionId', as: 'accessLog' });
AccessLog.belongsTo(AccessSession, { foreignKey: 'sessionId', as: 'session' });
Worker.hasMany(AccessLog, { foreignKey: 'workerId', as: 'accessLogs' });
AccessLog.belongsTo(Worker, { foreignKey: 'workerId', as: 'worker' });
AccessSession.hasMany(Incident, { foreignKey: 'sessionId', as: 'incidents' });
Incident.belongsTo(AccessSession, { foreignKey: 'sessionId', as: 'session' });
Worker.hasMany(Incident, { foreignKey: 'workerId', as: 'incidents' });
Incident.belongsTo(Worker, { foreignKey: 'workerId', as: 'worker' });
Supervisor.hasMany(Incident, { foreignKey: 'supervisorId', as: 'incidents' });
Incident.belongsTo(Supervisor, { foreignKey: 'supervisorId', as: 'supervisor' });
Supervisor.hasMany(Notification, { foreignKey: 'supervisorId', as: 'notifications' });
Notification.belongsTo(Supervisor, { foreignKey: 'supervisorId', as: 'supervisor' });

export { AccessLog, AccessSession, Incident, Notification, Supervisor, Worker };