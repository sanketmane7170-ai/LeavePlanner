import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import {
  listLateRecords,
  createLateRecord,
  deleteLateRecord,
  deleteLateRecordByDate,
} from '../controllers/lateRecord';

const router = Router();

router.use(authenticate);
router.use(authorize(['ADMIN']));

router.get('/',           listLateRecords);
router.post('/',          createLateRecord);
router.delete('/by-date', deleteLateRecordByDate);
router.delete('/:id',     deleteLateRecord);

export default router;
