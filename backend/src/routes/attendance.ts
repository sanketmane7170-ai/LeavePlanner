import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { getMuster, getTodaySummary, getMonthlySummaryAdmin, upsertCorrection, deleteCorrection } from '../controllers/attendance';

const router = Router();

router.use(authenticate);
router.use(authorize(['ADMIN']));

router.get('/muster',             getMuster);
router.get('/today-summary',      getTodaySummary);
router.get('/monthly-summary',    getMonthlySummaryAdmin);
router.post('/correction',        upsertCorrection);
router.delete('/correction/:id',  deleteCorrection);

export default router;
