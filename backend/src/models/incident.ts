import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentStatus = 'open' | 'investigating' | 'resolved' | 'closed';

export class Incident extends Model<InferAttributes<Incident>, InferCreationAttributes<Incident>> {
  declare id: CreationOptional<string>;
  declare sessionId: string | null;
  declare workerId: string | null;
  declare supervisorId: string | null;
  declare title: string;
  declare description: string | null;
  declare severity: CreationOptional<IncidentSeverity>;
  declare status: CreationOptional<IncidentStatus>;
  declare occurredAt: CreationOptional<Date>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Incident.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    sessionId: { type: DataTypes.UUID, allowNull: true, unique: true, field: 'session_id' },
    workerId: { type: DataTypes.UUID, allowNull: true, field: 'worker_id' },
    supervisorId: { type: DataTypes.UUID, allowNull: true, field: 'supervisor_id' },
    title: { type: DataTypes.STRING(200), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    severity: { type: DataTypes.ENUM('low', 'medium', 'high', 'critical'), allowNull: false, defaultValue: 'medium' },
    status: { type: DataTypes.ENUM('open', 'investigating', 'resolved', 'closed'), allowNull: false, defaultValue: 'open' },
    occurredAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'occurred_at' },
    createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
    updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' }
  },
  { sequelize, tableName: 'incidents' }
);