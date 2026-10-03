'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('workers', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      identifier: { type: DataTypes.STRING(128), allowNull: false, unique: true },
      full_name: { type: DataTypes.STRING(200), allowNull: false },
      department: { type: DataTypes.STRING(120), allowNull: true },
      status: { type: DataTypes.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'active' },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.createTable('supervisors', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      identifier: { type: DataTypes.STRING(128), allowNull: false, unique: true },
      full_name: { type: DataTypes.STRING(200), allowNull: false },
      email: { type: DataTypes.STRING(254), allowNull: true, unique: true },
      status: { type: DataTypes.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'active' },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.createTable('access_sessions', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      attempt_id: { type: DataTypes.UUID, allowNull: false, unique: true },
      worker_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'workers', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      supervisor_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'supervisors', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      status: { type: DataTypes.ENUM('active', 'completed', 'cancelled'), allowNull: false, defaultValue: 'active' },
      started_at: { type: DataTypes.DATE, allowNull: false },
      ended_at: { type: DataTypes.DATE, allowNull: true },
      decision: { type: DataTypes.ENUM('granted', 'denied'), allowNull: true },
      denial_reason: { type: DataTypes.STRING(200), allowNull: true },
      stable_frames: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      missing_equipment: { type: DataTypes.JSON, allowNull: false },
      missing_equipment_since: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.createTable('access_logs', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      session_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'access_sessions', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      worker_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'workers', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      event: { type: DataTypes.ENUM('entry', 'exit'), allowNull: false },
      result: { type: DataTypes.ENUM('granted', 'denied'), allowNull: false },
      helmet: { type: DataTypes.BOOLEAN, allowNull: false },
      vest: { type: DataTypes.BOOLEAN, allowNull: false },
      helmet_confidence: { type: DataTypes.FLOAT, allowNull: true },
      vest_confidence: { type: DataTypes.FLOAT, allowNull: true },
      denial_reason: { type: DataTypes.STRING(200), allowNull: true },
      occurred_at: { type: DataTypes.DATE, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.createTable('incidents', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      session_id: {
        type: DataTypes.UUID,
        allowNull: true,
        unique: true,
        references: { model: 'access_sessions', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      worker_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'workers', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      supervisor_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'supervisors', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      title: { type: DataTypes.STRING(200), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      severity: { type: DataTypes.ENUM('low', 'medium', 'high', 'critical'), allowNull: false, defaultValue: 'medium' },
      status: { type: DataTypes.ENUM('open', 'investigating', 'resolved', 'closed'), allowNull: false, defaultValue: 'open' },
      occurred_at: { type: DataTypes.DATE, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.createTable('notifications', {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      supervisor_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'supervisors', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      type: { type: DataTypes.ENUM('access', 'incident', 'system'), allowNull: false },
      status: { type: DataTypes.ENUM('pending', 'sent', 'read', 'failed'), allowNull: false, defaultValue: 'pending' },
      title: { type: DataTypes.STRING(200), allowNull: false },
      message: { type: DataTypes.TEXT, allowNull: false },
      sent_at: { type: DataTypes.DATE, allowNull: true },
      read_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('notifications');
    await queryInterface.dropTable('incidents');
    await queryInterface.dropTable('access_logs');
    await queryInterface.dropTable('access_sessions');
    await queryInterface.dropTable('supervisors');
    await queryInterface.dropTable('workers');
  }
};