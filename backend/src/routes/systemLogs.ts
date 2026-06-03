import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { getSystemLogs, getLogAdmins } from '../controllers/systemLogs';

const router = Router();

router.use(authenticate);
router.use(authorize(['ADMIN']));

router.get('/',       getSystemLogs);
router.get('/admins', getLogAdmins);

export default router;
