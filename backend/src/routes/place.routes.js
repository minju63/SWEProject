import { Router } from 'express';
import * as place from '../controllers/place.controller.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

router.get('/places', place.list);
router.get('/places/saved', requireAuth, place.saved); // :placeId 보다 먼저
router.get('/places/:placeId', place.detail);
router.put('/places/:placeId/saved', requireAuth, place.save);
router.delete('/places/:placeId/saved', requireAuth, place.unsave);

export default router;
