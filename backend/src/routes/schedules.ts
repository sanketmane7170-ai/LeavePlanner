import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { getSchedule, upsertSchedule } from '../controllers/schedules';

const router = Router();

router.use(authenticate);
router.use(authorize(['ADMIN']));

router.get('/:employeeId', getSchedule);
router.post('/:employeeId', upsertSchedule);
router.patch('/:employeeId', upsertSchedule);

export default router;
