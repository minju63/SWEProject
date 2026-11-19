import nodemailer from 'nodemailer';
import { AppError } from '../utils/response.js';
export function createAccountMailer(
  env = process.env,
  createTransport = nodemailer.createTransport
) {
  async function send(email, subject, text) {
    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD || !env.SMTP_FROM)
      throw new AppError(
        503,
        'MAIL_CONFIG',
        '아이디 안내 메일 발송 설정이 필요해요. 관리자에게 문의해주세요.'
      );
    const port = Number(env.SMTP_PORT || 587);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new AppError(503, 'MAIL_CONFIG', '메일 서버 포트 설정을 확인해주세요.');
    const transport = createTransport({
      host: env.SMTP_HOST,
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    try {
      const info = await transport.sendMail({
        from: env.SMTP_FROM,
        to: email,
        subject,
        text,
      });
      if (!info.accepted?.includes(email)) throw Error('RECIPIENT_NOT_ACCEPTED');
    } catch {
      throw new AppError(
        503,
        'MAIL_SEND',
        '아이디 안내 메일을 보내지 못했어요. 잠시 후 다시 시도해주세요.'
      );
    } finally {
      transport.close();
    }
  }
  return {
    sendUsername(email, username) {
      return send(
        email,
        '청해 아이디 안내',
        `요청하신 청해 아이디는 ${username} 입니다.\n본인이 요청하지 않았다면 이 메일을 무시해주세요.`
      );
    },
    sendIdentityCode(email, token, kind, isNew) {
      const label = kind === 'username' ? '아이디' : '이메일';
      return send(
        email,
        `청해 ${label} 변경 인증`,
        `${isNew ? '새 이메일' : '현재 등록 이메일'} 확인 인증번호: ${token}\n5분 동안 유효합니다.\n본인이 요청하지 않았다면 이 메일을 무시해주세요.`
      );
    },
  };
}
