import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { getAdminWfh, approveWfh, rejectWfh } from '../controllers/wfh';

const router = Router();

router.use(authenticate);
router.use(authorize(['ADMIN']));

router.get('/', getAdminWfh);
router.patch('/:id/approve', approveWfh);
router.patch('/:id/reject', rejectWfh);

export default router;
