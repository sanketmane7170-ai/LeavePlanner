import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorize }     from '../middleware/authorize';
import { getTeamCalendarLeaves, getAdminTeamCalendar } from '../controllers/teamCalendar';

const router = Router();

router.get('/leaves', authenticate, getTeamCalendarLeaves);
router.get('/admin',  authenticate, authorize(['ADMIN']), getAdminTeamCalendar);

export default router;
