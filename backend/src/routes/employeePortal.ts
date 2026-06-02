import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import {
  getEmployeeDashboard,
  getEmployeeProfile,
  getMyPolicies,
  explainPolicy,
  getMonthlyCalendar,
} from '../controllers/employeePortal';

const router = Router();

router.use(authenticate);
router.use(authorize(['EMPLOYEE']));

router.get('/dashboard', getEmployeeDashboard);
router.get('/profile', getEmployeeProfile);
router.get('/my-policies', getMyPolicies);
router.post('/policy-explain', explainPolicy);
router.get('/monthly-calendar', getMonthlyCalendar);

export default router;
