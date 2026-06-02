import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  resetPassword,
  getDepartments,
  getEmployeePoliciesAdmin,
  explainEmployeePolicyAdmin,
} from '../controllers/employees';

const router = Router();

router.use(authenticate);
router.use(authorize(['ADMIN']));

router.get('/', getEmployees);
router.get('/departments', getDepartments);
router.get('/:id', getEmployee);
router.get('/:id/policies', getEmployeePoliciesAdmin);
router.post('/:id/policy-explain', explainEmployeePolicyAdmin);
router.post('/', createEmployee);
router.patch('/:id', updateEmployee);
router.post('/:id/reset-password', resetPassword);

export default router;
