import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { getTeamCalendarLeaves } from '../controllers/teamCalendar';

const router = Router();

router.get('/leaves', authenticate, getTeamCalendarLeaves);

export default router;
