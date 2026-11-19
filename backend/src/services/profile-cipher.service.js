import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError } from '../utils/response.js';
const keyPath = fileURLToPath(new URL('../../.local/profile-encryption-key.json', import.meta.url));
const unavailable = () =>
  new AppError(
    503,
    'PROFILE_PROTECTION_UNAVAILABLE',
    '보호된 맞춤정보를 처리하지 못했어요. 관리자에게 저장소와 암호화 키 확인을 요청해주세요.'
  );
export function createProfileCipher({ path = keyPath } = {}) {
  async function key(create = false) {
    let record;
    try {
      record = JSON.parse(await readFile(path, 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT' || !create) throw unavailable();
      await mkdir(dirname(path), { recursive: true });
      try {
        await writeFile(
          path,
          JSON.stringify({ version: 1, key: randomBytes(32).toString('base64') }),
          { flag: 'wx', mode: 0o600 }
        );
      } catch (error) {
        if (error.code !== 'EEXIST') throw unavailable();
      }
      return key(false);
    }
    const value = Buffer.from(record.key || '', 'base64');
    if (record.version !== 1 || value.length !== 32 || value.toString('base64') !== record.key)
      throw unavailable();
    return value;
  }
  const id = (k) => createHash('sha256').update(k).digest('hex').slice(0, 16);
  return {
    async initialize() {
      const k = await key(true);
      return { key_id: id(k) };
    },
    async encrypt(owner, value) {
      const k = await key(false),
        iv = randomBytes(12),
        cipher = createCipheriv('aes-256-gcm', k, iv);
      cipher.setAAD(Buffer.from('profile/1:' + owner));
      const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(value), 'utf8'),
        cipher.final(),
      ]);
      return {
        version: 1,
        key_id: id(k),
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        ciphertext: ciphertext.toString('base64'),
      };
    },
    async decrypt(owner, value) {
      try {
        const k = await key(false);
        if (value.version !== 1 || value.key_id !== id(k)) throw unavailable();
        const cipher = createDecipheriv('aes-256-gcm', k, Buffer.from(value.iv, 'base64'));
        cipher.setAAD(Buffer.from('profile/1:' + owner));
        cipher.setAuthTag(Buffer.from(value.tag, 'base64'));
        return JSON.parse(
          Buffer.concat([
            cipher.update(Buffer.from(value.ciphertext, 'base64')),
            cipher.final(),
          ]).toString('utf8')
        );
      } catch {
        throw unavailable();
      }
    },
  };
}
export const profileCipher = createProfileCipher();
