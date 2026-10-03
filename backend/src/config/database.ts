import './env';
import { Sequelize } from 'sequelize';

export const sequelize = new Sequelize(
  process.env.DB_NAME || 'smart_safety_access',
  process.env.DB_USER || '',
  process.env.DB_PASSWORD || '',
  {
    dialect: 'mysql',
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    logging: false,
    define: {
      underscored: true,
      timestamps: true
    }
  }
);