import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { getDashboardStats, getMonthlyReport, getTypeReport } from '../controllers/dashboard';

const router = Router();

router.use(authenticate);
router.use(authorize(['ADMIN']));

router.get('/stats', getDashboardStats);
router.get('/reports/monthly', getMonthlyReport);
router.get('/reports/type', getTypeReport);

export default router;
