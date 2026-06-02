import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { getBalances, applyLeave, getMyLeaves, cancelLeave } from '../controllers/leaves';

const router = Router();

router.use(authenticate);
router.use(authorize(['EMPLOYEE']));

router.get('/balances', getBalances);
router.get('/', getMyLeaves);
router.post('/apply', applyLeave);
router.patch('/:id/cancel', cancelLeave);

export default router;
