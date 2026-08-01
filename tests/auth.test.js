const test = require('node:test');
const assert = require('node:assert/strict');

const { initializeAuth, createWorkspaceInvite, requestSubscriptionPlan } = require('../routes/auth');

test('createWorkspaceInvite restores soft-deleted accounts without crashing', async () => {
  const fakePool = {
    query: async (text, params) => {
      if (String(text).includes('SELECT * FROM users WHERE email')) {
        return {
          rows: [
            {
              id: 'user-1',
              email: 'staff@example.com',
              is_deleted: true,
            },
          ],
        };
      }

      if (String(text).includes('UPDATE users')) {
        return {
          rows: [
            {
              id: 'user-1',
              email: 'staff@example.com',
              name: 'Jane Doe',
              role: 'counter',
              is_deleted: false,
              is_active: false,
              is_approved: false,
            },
          ],
        };
      }

      return { rows: [] };
    },
  };

  initializeAuth(fakePool);

  const result = await createWorkspaceInvite({
    inviter: {
      tenant_id: 'tenant-1',
      tenant_name: 'Example Org',
      branch_id: 'branch-1',
      organizationName: 'Example Org',
      email: 'admin@example.com',
    },
    email: 'staff@example.com',
    name: 'Jane Doe',
    role: 'counter',
  });

  assert.equal(result.user.email, 'staff@example.com');
  assert.match(result.temporaryPassword, /^Q/);
});

test('createWorkspaceInvite marks invited clients as pending approval', async () => {
  const fakePool = {
    query: async (text, params) => {
      if (String(text).includes('SELECT * FROM users WHERE email')) {
        return { rows: [] };
      }

      if (String(text).includes('INSERT INTO users')) {
        return {
          rows: [
            {
              id: 'user-2',
              email: 'client@example.com',
              name: 'John Doe',
              role: 'client',
              is_approved: false,
              is_active: true,
            },
          ],
        };
      }

      return { rows: [] };
    },
  };

  initializeAuth(fakePool);

  const result = await createWorkspaceInvite({
    inviter: {
      tenant_id: 'tenant-1',
      tenant_name: 'Example Org',
      branch_id: 'branch-1',
      organizationName: 'Example Org',
      email: 'admin@example.com',
    },
    email: 'client@example.com',
    name: 'John Doe',
    role: 'client',
  });

  assert.equal(result.user.role, 'client');
  assert.equal(result.user.is_approved, false);
  assert.equal(result.user.is_active, true);
});

test('requestSubscriptionPlan creates a pending approval request', async () => {
  const fakePool = {
    query: async (text, params) => {
      if (String(text).includes('UPDATE users')) {
        return {
          rows: [
            {
              id: 'user-1',
              email: 'org@example.com',
              subscription_plan: '1-month',
              subscription_status: 'pending',
            },
          ],
        };
      }

      return { rows: [] };
    },
  };

  initializeAuth(fakePool);

  const result = await requestSubscriptionPlan({
    user: {
      id: 'user-1',
      email: 'org@example.com',
      organizationName: 'Example Org',
    },
    plan: '1-month',
  });

  assert.equal(result.plan, '1-month');
  assert.equal(result.status, 'pending');
  assert.equal(result.amountUsd, 50);
});
