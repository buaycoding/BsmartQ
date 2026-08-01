const test = require('node:test');
const assert = require('node:assert/strict');
const { createEmailService } = require('../lib/emailService');

test('setDbPool updates the database target without throwing', async () => {
  const queries = [];
  const fakeDbPool = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      return { rows: [] };
    },
  };

  const service = createEmailService();
  service.setDbPool(fakeDbPool);
  await service.ensureNotificationsTable();

  assert.ok(queries.some((entry) => String(entry.sql).includes('CREATE TABLE IF NOT EXISTS notifications')));
});

test('retries delivery and logs the email', async () => {
  const queries = [];
  const fakeDbPool = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      return { rows: [] };
    },
  };

  let attempts = 0;
  const transport = async () => {
    attempts += 1;
    if (attempts < 2) {
      throw new Error('temporary failure');
    }

    return { ok: true, data: { id: 'msg_123' } };
  };

  const service = createEmailService({ dbPool: fakeDbPool, transport });
  const result = await service.sendEmail({
    to: 'client@example.com',
    subject: 'Test email',
    text: 'Hello',
    html: '<p>Hello</p>',
    category: 'test',
  });

  assert.equal(result.ok, true);
  assert.equal(attempts, 2);
  assert.ok(queries.some((entry) => String(entry.sql).includes('INSERT INTO notifications')));
});
