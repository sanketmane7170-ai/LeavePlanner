import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import {
  getLeavePolicies,
  createLeavePolicy,
  updateLeavePolicy,
  deleteLeavePolicy,
  addPolicyException,
  deletePolicyException,
  addPolicyRule,
  updatePolicyRule,
  deletePolicyRule,
  getWfhPolicies,
  createWfhPolicy,
  updateWfhPolicy,
  deleteWfhPolicy,
  addWfhPolicyException,
  deleteWfhPolicyException,
  addWfhPolicyRule,
  updateWfhPolicyRule,
  deleteWfhPolicyRule,
} from '../controllers/policies';

const router = Router();

router.use(authenticate);
router.use(authorize(['ADMIN']));

// Leave policies — static segments must come before :id to avoid false matches
router.get('/leave', getLeavePolicies);
router.post('/leave', createLeavePolicy);
router.delete('/leave/exceptions/:id', deletePolicyException);
router.delete('/leave/rules/:ruleId', deletePolicyRule);
router.patch('/leave/rules/:ruleId', updatePolicyRule);
router.patch('/leave/:id', updateLeavePolicy);
router.delete('/leave/:id', deleteLeavePolicy);
router.post('/leave/:id/exceptions', addPolicyException);
router.post('/leave/:id/rules', addPolicyRule);

// WFH policies
router.get('/wfh', getWfhPolicies);
router.post('/wfh', createWfhPolicy);
router.delete('/wfh/exceptions/:id', deleteWfhPolicyException);
router.delete('/wfh/rules/:ruleId', deleteWfhPolicyRule);
router.patch('/wfh/rules/:ruleId', updateWfhPolicyRule);
router.patch('/wfh/:id', updateWfhPolicy);
router.delete('/wfh/:id', deleteWfhPolicy);
router.post('/wfh/:id/exceptions', addWfhPolicyException);
router.post('/wfh/:id/rules', addWfhPolicyRule);

export default router;
