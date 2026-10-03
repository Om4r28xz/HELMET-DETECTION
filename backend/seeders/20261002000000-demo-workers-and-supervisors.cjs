'use strict';

const { randomUUID } = require('node:crypto');

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    await queryInterface.bulkInsert('workers', [
      {
        id: randomUUID(),
        identifier: 'DEMO-WORKER-001',
        full_name: 'Demo Worker',
        department: 'Operations',
        status: 'active',
        created_at: now,
        updated_at: now
      },
      {
        id: randomUUID(),
        identifier: 'DEMO-WORKER-002',
        full_name: 'Inactive Demo Worker',
        department: 'Operations',
        status: 'inactive',
        created_at: now,
        updated_at: now
      }
    ]);

    await queryInterface.bulkInsert('supervisors', [
      {
        id: randomUUID(),
        identifier: 'DEMO-SUPERVISOR-001',
        full_name: 'Demo Supervisor',
        email: null,
        phone: '526141320311',
        status: 'active',
        created_at: now,
        updated_at: now
      }
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('supervisors', { identifier: 'DEMO-SUPERVISOR-001' });
    await queryInterface.bulkDelete('workers', {
      identifier: ['DEMO-WORKER-001', 'DEMO-WORKER-002']
    });
  }
};