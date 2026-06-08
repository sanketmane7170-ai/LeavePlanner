import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  resetPassword,
  getDepartments,
  getEmployeePoliciesAdmin,
  explainEmployeePolicyAdmin,
  getEmployeeBalanceSummary,
  getAllowanceOverview,
  updateEmployeeAllowance,
  getEmployeesOnNotice,
  setNoticePeriod,
  clearNoticePeriod,
} from '../controllers/employees';

const router = Router();

router.use(authenticate);
router.use(authorize(['ADMIN']));

router.get('/', getEmployees);
router.get('/departments', getDepartments);
router.get('/allowances', getAllowanceOverview);
router.get('/on-notice', getEmployeesOnNotice);
router.get('/:id', getEmployee);
router.get('/:id/balance', getEmployeeBalanceSummary);
router.get('/:id/policies', getEmployeePoliciesAdmin);
router.post('/:id/policy-explain', explainEmployeePolicyAdmin);
router.post('/', createEmployee);
router.patch('/:id/allowance', updateEmployeeAllowance);
router.patch('/:id/notice', setNoticePeriod);
router.delete('/:id/notice', clearNoticePeriod);
router.patch('/:id', updateEmployee);
router.post('/:id/reset-password', resetPassword);
router.delete('/:id', deleteEmployee);

export default router;
