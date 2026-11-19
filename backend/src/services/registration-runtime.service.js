import { registrationState } from './registration-state.service.js';
import { registrationAuth } from './registration-auth.service.js';
import { createRegistrationStorage } from './registration-storage.service.js';
import { createRegistrationCleanup } from './registration-cleanup.service.js';
import { createSignupService } from './signup.service.js';
import { createAccountMailer } from './account-mail.service.js';
import { createAccountRecovery } from './account-recovery.service.js';
export const registrationCleanup = createRegistrationCleanup({
  state: registrationState,
  auth: registrationAuth,
  storage: createRegistrationStorage(),
});
export const signupService = createSignupService({
  state: registrationState,
  auth: registrationAuth,
  cleanup: registrationCleanup,
});
export const accountRecovery = createAccountRecovery({
  state: registrationState,
  auth: registrationAuth,
  mail: createAccountMailer(),
  secret: process.env.SUPABASE_SERVICE_ROLE_KEY,
});
