'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    // Add phone column to supervisors
    await queryInterface.addColumn('supervisors', 'phone', {
      type: DataTypes.STRING(20),
      allowNull: true,
      after: 'email'
    });

    // Add channel column to notifications
    await queryInterface.addColumn('notifications', 'channel', {
      type: DataTypes.ENUM('in_app', 'whatsapp'),
      allowNull: false,
      defaultValue: 'in_app',
      after: 'type'
    });

    // Add external_message_id column to notifications
    await queryInterface.addColumn('notifications', 'external_message_id', {
      type: DataTypes.STRING(200),
      allowNull: true,
      after: 'message'
    });

    // Add failure_reason column to notifications
    await queryInterface.addColumn('notifications', 'failure_reason', {
      type: DataTypes.TEXT,
      allowNull: true,
      after: 'external_message_id'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('notifications', 'failure_reason');
    await queryInterface.removeColumn('notifications', 'external_message_id');
    await queryInterface.removeColumn('notifications', 'channel');
    await queryInterface.removeColumn('supervisors', 'phone');
  }
};
