import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import {
  getAdminLeaves,
  approveLeave,
  rejectLeave,
  bulkApproveLeaves,
  bulkRejectLeaves,
  overrideAbsent,
  getEmployeeBalanceAdmin,
  getEmployeeLeavesAdmin,
  importLeave,
  importBulkLeaves,
} from '../controllers/adminLeaves';

const router = Router();

router.use(authenticate);
router.use(authorize(['ADMIN']));

// All static paths before dynamic :id paths
router.get('/', getAdminLeaves);
router.post('/bulk-approve', bulkApproveLeaves);
router.post('/bulk-reject', bulkRejectLeaves);
router.post('/import/bulk', importBulkLeaves); // must be before /import
router.post('/import', importLeave);
router.get('/balance/:employeeId', getEmployeeBalanceAdmin);
router.get('/employee/:employeeId', getEmployeeLeavesAdmin);

// Dynamic :id routes
router.patch('/:id/approve', approveLeave);
router.patch('/:id/reject', rejectLeave);
router.patch('/:id/override-absent', overrideAbsent);

export default router;
