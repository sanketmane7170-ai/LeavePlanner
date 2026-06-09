import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import {
  listSwapDays,
  getSwapDayById,
  createSwapDay,
  markCompensated,
  markDefaulted,
  deleteSwapDay,
  getSwapDayStats,
  getEmployeeSwapDays,
  setCompensationDate,
} from '../controllers/swapDay';

const router = Router();

router.use(authenticate);
router.use(authorize(['ADMIN']));

router.get('/stats',                    getSwapDayStats);
router.get('/employee/:employeeId',     getEmployeeSwapDays);
router.get('/',                         listSwapDays);
router.post('/',                        createSwapDay);
router.get('/:id',                      getSwapDayById);
router.patch('/:id/compensated',        markCompensated);
router.patch('/:id/defaulted',          markDefaulted);
router.patch('/:id/set-compensation',   setCompensationDate);
router.delete('/:id',                   deleteSwapDay);

export default router;
