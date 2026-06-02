import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import {
  getOrgSettings, updateOrgSettings,
  getHolidays, addHoliday, deleteHoliday,
  getDepartments, addDepartment, deleteDepartment,
  getRoles, addRole, deleteRole,
  getAuditLog,
} from '../controllers/settings';
import {
  listEmailTemplates,
  getEmailTemplate,
  updateEmailTemplate,
  resetEmailTemplate,
  resetAllEmailTemplates,
  seedEmailTemplates,
} from '../controllers/emailTemplates';

const router = Router();

router.use(authenticate);
router.use(authorize(['ADMIN']));

// Org & Holidays & Departments & Audit
router.get('/org', getOrgSettings);
router.patch('/org', updateOrgSettings);
router.get('/holidays', getHolidays);
router.post('/holidays', addHoliday);
router.delete('/holidays/:id', deleteHoliday);
router.get('/departments', getDepartments);
router.post('/departments', addDepartment);
router.delete('/departments/:id', deleteDepartment);

router.get('/roles', getRoles);
router.post('/roles', addRole);
router.delete('/roles/:id', deleteRole);

router.get('/audit-log', getAuditLog);

// Email Templates
router.get('/email-templates', listEmailTemplates);
router.post('/email-templates/seed', seedEmailTemplates);
router.post('/email-templates/reset-all', resetAllEmailTemplates);
router.get('/email-templates/:key', getEmailTemplate);
router.put('/email-templates/:key', updateEmailTemplate);
router.post('/email-templates/:key/reset', resetEmailTemplate);

export default router;
