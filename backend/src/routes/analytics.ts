import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import {
  getReportsOverview,
  getLeaveTrends,
  getDepartmentSummary,
  getTopLeavers,
  getAttendanceHeatmap,
} from '../controllers/analytics';

const router = Router();

router.use(authenticate);
router.use(authorize(['ADMIN']));

router.get('/overview',           getReportsOverview);
router.get('/leave-trends',       getLeaveTrends);
router.get('/department-summary', getDepartmentSummary);
router.get('/top-leavers',        getTopLeavers);
router.get('/attendance-heatmap', getAttendanceHeatmap);

export default router;
