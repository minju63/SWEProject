import { Router } from 'express';
import * as place from '../controllers/place.controller.js';

const router = Router();

router.get('/places', place.list);
router.get('/places/:placeId', place.detail);

export default router;
