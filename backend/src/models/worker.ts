import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type WorkerStatus = 'active' | 'inactive';

export class Worker extends Model<InferAttributes<Worker>, InferCreationAttributes<Worker>> {
  declare id: CreationOptional<string>;
  declare identifier: string;
  declare fullName: string;
  declare department: string | null;
  declare status: CreationOptional<WorkerStatus>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Worker.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    identifier: { type: DataTypes.STRING(128), allowNull: false, unique: true },
    fullName: { type: DataTypes.STRING(200), allowNull: false, field: 'full_name' },
    department: { type: DataTypes.STRING(120), allowNull: true },
    status: { type: DataTypes.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'active' },
    createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
    updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' }
  },
  { sequelize, tableName: 'workers' }
);