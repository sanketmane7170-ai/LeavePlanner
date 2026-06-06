import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { getWfhBalance, applyWfh, getMyWfh, cancelWfh } from '../controllers/wfh';

const router = Router();

router.use(authenticate);
router.use(authorize(['EMPLOYEE']));

// Static paths before :id
router.get('/balance', getWfhBalance);
router.get('/', getMyWfh);
router.post('/apply', applyWfh);
router.patch('/:id/cancel', cancelWfh);

export default router;
