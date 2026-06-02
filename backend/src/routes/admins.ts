import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { getAdmins, getCandidates, promoteAdmin, demoteAdmin } from '../controllers/admins';

const router = Router();

router.use(authenticate);
router.use(authorize(['ADMIN']));

router.get('/', getAdmins);
router.get('/candidates', getCandidates);
router.post('/promote', promoteAdmin);
router.post('/demote', demoteAdmin);

export default router;
