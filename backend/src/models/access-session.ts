import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type AccessSessionStatus = 'active' | 'completed' | 'cancelled';
export type AccessDecision = 'granted' | 'denied';
export type MissingEquipment = 'helmet' | 'vest';

export class AccessSession extends Model<InferAttributes<AccessSession>, InferCreationAttributes<AccessSession>> {
  declare id: CreationOptional<string>;
  declare attemptId: CreationOptional<string>;
  declare workerId: string;
  declare supervisorId: string | null;
  declare status: CreationOptional<AccessSessionStatus>;
  declare startedAt: CreationOptional<Date>;
  declare endedAt: Date | null;
  declare decision: AccessDecision | null;
  declare denialReason: string | null;
  declare stableFrames: CreationOptional<number>;
  declare missingEquipment: CreationOptional<MissingEquipment[]>;
  declare missingEquipmentSince: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

AccessSession.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    attemptId: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, allowNull: false, unique: true, field: 'attempt_id' },
    workerId: { type: DataTypes.UUID, allowNull: false, field: 'worker_id' },
    supervisorId: { type: DataTypes.UUID, allowNull: true, field: 'supervisor_id' },
    status: { type: DataTypes.ENUM('active', 'completed', 'cancelled'), allowNull: false, defaultValue: 'active' },
    startedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'started_at' },
    endedAt: { type: DataTypes.DATE, allowNull: true, field: 'ended_at' },
    decision: { type: DataTypes.ENUM('granted', 'denied'), allowNull: true },
    denialReason: { type: DataTypes.STRING(200), allowNull: true, field: 'denial_reason' },
    stableFrames: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      field: 'stable_frames',
      validate: { min: 0 }
    },
    missingEquipment: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
      field: 'missing_equipment',
      validate: {
        isValidEquipmentList(value: unknown) {
          if (!Array.isArray(value) || value.some((item) => !['helmet', 'vest'].includes(item))) {
            throw new Error('missingEquipment must contain only helmet or vest');
          }
        }
      }
    },
    missingEquipmentSince: { type: DataTypes.DATE, allowNull: true, field: 'missing_equipment_since' },
    createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
    updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' }
  },
  { sequelize, tableName: 'access_sessions' }
);