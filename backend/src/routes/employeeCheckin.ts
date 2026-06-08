import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import {
  getMyCheckInStatus,
  employeeCheckIn,
  employeeCheckOut,
  getMyCheckInHistory,
} from '../controllers/checkin';

const router = Router();

router.use(authenticate);

router.get('/status',  getMyCheckInStatus);
router.post('/in',     employeeCheckIn);
router.post('/out',    employeeCheckOut);
router.get('/history', getMyCheckInHistory);

export default router;
