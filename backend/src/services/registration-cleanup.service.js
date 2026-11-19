// Leased jobs are durable. Two API instances can run this worker safely.
export function createRegistrationCleanup({ state, auth, storage }) {
  async function runJob(id = null) {
    const job = await state.command('claim_cleanup', id);
    if (!job) return false;
    try {
      let userId = job.user_id;
      if (!userId && job.request_id) {
        const user = await auth.findPending(job.request_id, job.request?.email);
        userId = user?.id || null;
      }
      const user = userId ? await auth.readUser(userId) : null;
      if (
        user &&
        job.reason !== 'withdrawal' &&
        user.app_metadata?.registration_request_id !== job.request_id
      )
        throw Error('CLEANUP_OWNER_MISMATCH');
      const renew = () => state.command('renew_cleanup', job.id, { operationId: job.operation_id });
      await renew();
      if (userId) await storage.purge(userId, renew);
      await renew();
      if (user) await auth.deleteUser(userId);
      await state.command('ack_cleanup', job.id, { operationId: job.operation_id });
      return true;
    } catch {
      await state
        .command('fail_cleanup', job.id, { operationId: job.operation_id })
        .catch(() => {});
      return false;
    }
  }
  return {
    runJob,
    async runBatch(limit = 50) {
      await state.command('enqueue_expired');
      let removed = 0;
      for (let i = 0; i < limit; i++) {
        if (!(await runJob())) break;
        removed++;
      }
      return { removed };
    },
  };
}
