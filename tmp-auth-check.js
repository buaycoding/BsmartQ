const { initializeAuth, createWorkspaceInvite } = require('./routes/auth');

(async () => {
  const fakePool = {
    query: async (text, params) => {
      if (String(text).includes('SELECT * FROM users WHERE email')) {
        return { rows: [{ id: 'user-1', email: 'staff@example.com', is_deleted: true }] };
      }
      if (String(text).includes('UPDATE users')) {
        return { rows: [{ id: 'user-1', email: 'staff@example.com', name: 'Jane Doe', role: 'counter', is_deleted: false }] };
      }
      return { rows: [] };
    }
  };

  initializeAuth(fakePool);

  const result = await createWorkspaceInvite({
    inviter: { tenant_id: 'tenant-1', tenant_name: 'Example Org', branch_id: 'branch-1', organizationName: 'Example Org', email: 'admin@example.com' },
    email: 'staff@example.com',
    name: 'Jane Doe',
    role: 'counter',
  });

  console.log(JSON.stringify({ ok: !!result.user, email: result.user.email, password: result.temporaryPassword }, null, 2));
})();
