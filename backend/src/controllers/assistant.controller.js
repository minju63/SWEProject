import * as assistant from '../services/assistant.service.js';
import { ok, AppError } from '../utils/response.js';

export async function recommend(req, res) {
  ok(
    res,
    await assistant.recommend({ userId: req.user?.id ?? null, categoryId: req.query.categoryId })
  );
}

export async function chat(req, res) {
  const { message, context } = req.body ?? {};
  if (!message || typeof message !== 'string')
    throw new AppError(400, 'MESSAGE_REQUIRED', '질문을 입력해 주세요.');
  ok(res, await assistant.chat({ userId: req.user?.id ?? null, message, context }));
}
