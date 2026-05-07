import { Router } from 'express';
import { buildingData, userData } from '../data/index.js';
import { requireAdmin } from '../middleware/auth.js';
import { createApiHandler } from '../utils/api-response.js';

const router = Router();

router.get(
  '/admin/users',
  requireAdmin,
  createApiHandler(
    async () => userData.getAllUsersForAdmin(),
    { errorStatus: 400 }
  )
);

router.patch(
  '/admin/users/:id/ban',
  requireAdmin,
  createApiHandler(
    async (req) => userData.banUser(req.params.id, req.session.user._id),
    { errorStatus: 400 }
  )
);

router.patch(
  '/admin/users/:id/promote',
  requireAdmin,
  createApiHandler(
    async (req) => userData.promoteUserToAdmin(req.params.id, req.session.user._id),
    { errorStatus: 400 }
  )
);

router.post(
  '/admin/buildings',
  requireAdmin,
  createApiHandler(
    async (req) => buildingData.createBuilding(req.body, req.session.user._id),
    { successStatus: 201, errorStatus: 400 }
  )
);

router.put(
  '/admin/buildings/:id',
  requireAdmin,
  createApiHandler(
    async (req) => buildingData.updateBuilding(req.params.id, req.body, req.session.user._id),
    { errorStatus: 400 }
  )
);

router.delete(
  '/admin/buildings/:id',
  requireAdmin,
  createApiHandler(
    async (req) => buildingData.deleteBuilding(req.params.id),
    { errorStatus: 400 }
  )
);

export default router;
