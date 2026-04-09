import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as chatterGroupController from '../controllers/chatter-group.controller';

const router = Router();

router.post('/', authenticate, chatterGroupController.createChatterGroup);
router.get('/', authenticate, chatterGroupController.listChatterGroups);
router.get('/:id', authenticate, chatterGroupController.getChatterGroup);
router.put('/:id', authenticate, chatterGroupController.updateChatterGroup);
router.delete('/:id', authenticate, chatterGroupController.deleteChatterGroup);

// Member management
router.post('/:id/members', authenticate, chatterGroupController.addMember);
router.delete('/:id/members/:chatterId', authenticate, chatterGroupController.removeMember);

// Promoter linking
router.put('/:id/promoter', authenticate, chatterGroupController.linkPromoter);
router.delete('/:id/promoter/:promoterId', authenticate, chatterGroupController.unlinkPromoter);

export default router;
