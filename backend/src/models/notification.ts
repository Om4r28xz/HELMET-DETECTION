import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type NotificationType = 'access' | 'incident' | 'system';
export type NotificationStatus = 'pending' | 'sent' | 'read' | 'failed';

export class Notification extends Model<InferAttributes<Notification>, InferCreationAttributes<Notification>> {
  declare id: CreationOptional<string>;
  declare supervisorId: string;
  declare type: NotificationType;
  declare status: CreationOptional<NotificationStatus>;
  declare title: string;
  declare message: string;
  declare sentAt: Date | null;
  declare readAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Notification.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    supervisorId: { type: DataTypes.UUID, allowNull: false, field: 'supervisor_id' },
    type: { type: DataTypes.ENUM('access', 'incident', 'system'), allowNull: false },
    status: { type: DataTypes.ENUM('pending', 'sent', 'read', 'failed'), allowNull: false, defaultValue: 'pending' },
    title: { type: DataTypes.STRING(200), allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    sentAt: { type: DataTypes.DATE, allowNull: true, field: 'sent_at' },
    readAt: { type: DataTypes.DATE, allowNull: true, field: 'read_at' },
    createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
    updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' }
  },
  { sequelize, tableName: 'notifications' }
);