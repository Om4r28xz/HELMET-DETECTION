'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('notifications', 'access_session_id', {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'access_sessions', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addIndex('notifications', ['access_session_id', 'supervisor_id'], {
      name: 'notifications_access_session_supervisor_unique',
      unique: true
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('notifications', 'notifications_access_session_supervisor_unique');
    await queryInterface.removeColumn('notifications', 'access_session_id');
  }
};