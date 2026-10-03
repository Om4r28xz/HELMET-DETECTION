import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type AccessLogEvent = 'entry' | 'exit';
export type AccessLogResult = 'granted' | 'denied';

export class AccessLog extends Model<InferAttributes<AccessLog>, InferCreationAttributes<AccessLog>> {
  declare id: CreationOptional<string>;
  declare sessionId: string;
  declare workerId: string;
  declare event: AccessLogEvent;
  declare result: AccessLogResult;
  declare helmet: boolean;
  declare vest: boolean;
  declare helmetConfidence: number | null;
  declare vestConfidence: number | null;
  declare denialReason: string | null;
  declare occurredAt: CreationOptional<Date>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

AccessLog.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    sessionId: { type: DataTypes.UUID, allowNull: false, unique: true, field: 'session_id' },
    workerId: { type: DataTypes.UUID, allowNull: false, field: 'worker_id' },
    event: { type: DataTypes.ENUM('entry', 'exit'), allowNull: false },
    result: { type: DataTypes.ENUM('granted', 'denied'), allowNull: false },
    helmet: { type: DataTypes.BOOLEAN, allowNull: false },
    vest: { type: DataTypes.BOOLEAN, allowNull: false },
    helmetConfidence: { type: DataTypes.FLOAT, allowNull: true, field: 'helmet_confidence' },
    vestConfidence: { type: DataTypes.FLOAT, allowNull: true, field: 'vest_confidence' },
    denialReason: { type: DataTypes.STRING(200), allowNull: true, field: 'denial_reason' },
    occurredAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'occurred_at' },
    createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
    updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' }
  },
  { sequelize, tableName: 'access_logs' }
);