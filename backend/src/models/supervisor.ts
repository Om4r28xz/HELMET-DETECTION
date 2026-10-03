import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type SupervisorStatus = 'active' | 'inactive';

export class Supervisor extends Model<InferAttributes<Supervisor>, InferCreationAttributes<Supervisor>> {
  declare id: CreationOptional<string>;
  declare identifier: string;
  declare fullName: string;
  declare email: string | null;
  declare phone: string | null;
  declare status: CreationOptional<SupervisorStatus>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Supervisor.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    identifier: { type: DataTypes.STRING(128), allowNull: false, unique: true },
    fullName: { type: DataTypes.STRING(200), allowNull: false, field: 'full_name' },
    email: { type: DataTypes.STRING(254), allowNull: true, unique: true },
    phone: { type: DataTypes.STRING(20), allowNull: true },
    status: { type: DataTypes.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'active' },
    createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
    updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' }
  },
  { sequelize, tableName: 'supervisors' }
);