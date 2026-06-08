import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import {
  getEmployeeDashboard,
  getEmployeeProfile,
  getMyPolicies,
  explainPolicy,
  getMonthlyCalendar,
  getMyHolidays,
  getMySchedule,
  getOnboardingStatus,
  completeOnboarding,
} from '../controllers/employeePortal';
import {
  getEmployeeAnnouncements,
  dismissAnnouncement,
} from '../controllers/announcements';

const router = Router();

router.use(authenticate);
router.use(authorize(['EMPLOYEE']));

router.get('/dashboard',            getEmployeeDashboard);
router.get('/profile',              getEmployeeProfile);
router.get('/my-policies',          getMyPolicies);
router.post('/policy-explain',      explainPolicy);
router.get('/monthly-calendar',     getMonthlyCalendar);
router.get('/holidays',             getMyHolidays);
router.get('/my-schedule',          getMySchedule);
router.get('/onboarding',           getOnboardingStatus);
router.post('/onboarding/complete', completeOnboarding);

router.get('/announcements', getEmployeeAnnouncements);
router.post('/announcements/:id/dismiss', dismissAnnouncement);

export default router;
