import * as homeService from '../services/home.service.js';
import { ok } from '../utils/response.js';

export async function home(req, res) {
  ok(res, await homeService.getHome(req.user?.id ?? null));
}
