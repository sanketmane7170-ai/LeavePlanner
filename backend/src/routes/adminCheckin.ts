import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import {
  getAdminCheckInCode,
  generateCheckInCode,
  getAdminTodayAttendance,
  adminOverrideCheckIn,
  exportAttendanceCsv,
  getCheckInSettings,
  updateCheckInSettings,
} from '../controllers/checkin';

const router = Router();

router.use(authenticate, authorize(['ADMIN']));

router.get('/code',             getAdminCheckInCode);
router.post('/code/generate',   generateCheckInCode);
router.get('/attendance',       getAdminTodayAttendance);
router.post('/override',        adminOverrideCheckIn);
router.get('/export',           exportAttendanceCsv);
router.get('/settings',         getCheckInSettings);
router.patch('/settings',       updateCheckInSettings);

export default router;
