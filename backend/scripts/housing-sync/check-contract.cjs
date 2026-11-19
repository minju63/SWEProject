'use strict';
const { clients } = require('./network.cjs');
const { CONTRACT_VERSION, assertRecord } = require('./record-contract.cjs');
async function checkContract(root, config, override) {
  const io = override || clients(root, config);
  const [schema, rows] = await Promise.all([
    io.db('', ''),
    io.db('policy', 'select=*&collection_domain=eq.HOUSING&order=policy_id&limit=1000'),
  ]);
  const expected = [
    'eligibility_conditions',
    'eligibility_verified',
    'application_period_unknown_reason',
    'application_process',
    'required_documents',
  ];
  const missing = expected.filter((k) => !schema.definitions?.policy?.properties?.[k]);
  if (missing.length) throw Error('Missing live policy columns: ' + missing.join(', '));
  if (rows.length === 1000) throw Error('Contract audit pagination required');
  const errors = [];
  let policies = 0,
    events = 0;
  for (const p of rows) {
    if (p.item_type === 'EVENT') {
      events++;
      continue;
    }
    policies++;
    try {
      assertRecord(p, config.allowedHosts);
    } catch (e) {
      errors.push({ policy_id: p.policy_id, title: p.title, reason: e.message });
    }
  }
  return {
    status: errors.length ? 'REVIEW_REQUIRED' : 'CONTRACT_MATCH',
    contract_version: CONTRACT_VERSION,
    db_writes: 0,
    housing_rows: rows.length,
    policies,
    events,
    valid_policies: policies - errors.length,
    errors,
  };
}
module.exports = { checkContract };
