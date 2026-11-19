import 'dotenv/config';
import { createRegistrationState } from '../../src/services/registration-state.service.js';
const registrationState = createRegistrationState();
const expected = 'flkoszigqobfkztbvsyw';
const url = new URL(process.env.SUPABASE_URL);
if (url.hostname !== `${expected}.supabase.co`)
  throw Error('Unexpected Supabase project; readiness check stopped.');
let ready = true;
try {
  const result = await registrationState.command('health');
  const valid = result?.version === 2;
  ready &&= valid;
  console.log(`Registration database v2: ${valid ? 'OK' : 'MISSING'}`);
} catch {
  ready = false;
  console.log('Registration database v2: NOT READY (migration or RPC access required)');
}
try {
  const response = await fetch(new URL('/auth/v1/settings', url), {
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error('SETTINGS_FAILED');
  const settings = await response.json();
  const disabled = settings.disable_signup === true;
  ready &&= disabled;
  console.log(`Public Auth signup disabled: ${disabled ? 'OK' : 'CHECK DASHBOARD'}`);
} catch {
  ready = false;
  console.log('Public Auth signup disabled: UNKNOWN');
}
console.log(
  'Check Auth hook, OTP length/expiry and mail template in Dashboard separately. No accounts or emails were created.'
);
process.exitCode = ready ? 0 : 1;
