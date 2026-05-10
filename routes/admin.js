import { Router } from 'express';
import { buildingData, reviewData, userData } from '../data/index.js';
import { requireAdmin } from '../middleware/auth.js';
import { createApiHandler } from '../utils/api-response.js';
import { parseCsvObjects } from '../utils/csv.js';

const router = Router();

const getReviewModerationErrorStatus = (error) =>
  error === 'review not found' ? 404 : 400;

const getBuildingImportPayload = (body) => {
  if (Array.isArray(body)) {
    return body;
  }

  if (typeof body === 'string') {
    return parseCsvObjects(body);
  }

  if (!body || typeof body !== 'object') {
    throw 'building import payload must be a JSON array, a buildings array, or CSV text';
  }

  if (Array.isArray(body.buildings)) {
    return body.buildings;
  }

  if (typeof body.csv === 'string') {
    return parseCsvObjects(body.csv);
  }

  throw 'building import payload must be a JSON array, a buildings array, or CSV text';
};

router.get(
  '/admin/users',
  requireAdmin,
  createApiHandler(
    async () => userData.getAllUsersForAdmin(),
    { errorStatus: 400 }
  )
);

router.get(
  '/admin/reviews',
  requireAdmin,
  createApiHandler(
    async (req) => reviewData.getAllReviewsForAdmin({ limit: Number(req.query.limit) || 200 }),
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

router.post(
  '/admin/buildings/import',
  requireAdmin,
  createApiHandler(
    async (req) => buildingData.importBuildings(
      getBuildingImportPayload(req.body),
      req.session.user._id
    ),
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

router.patch(
  '/admin/reviews/:id/flag',
  requireAdmin,
  createApiHandler(
    async (req) => reviewData.flagReviewByAdmin(req.params.id, req.session.user._id),
    { getErrorStatus: getReviewModerationErrorStatus }
  )
);

router.patch(
  '/admin/reviews/:id/hide',
  requireAdmin,
  createApiHandler(
    async (req) => reviewData.hideReviewByAdmin(req.params.id, req.session.user._id),
    { getErrorStatus: getReviewModerationErrorStatus }
  )
);

router.delete(
  '/admin/reviews/:id',
  requireAdmin,
  createApiHandler(
    async (req) => reviewData.deleteReviewByAdmin(req.params.id, req.session.user._id),
    { getErrorStatus: getReviewModerationErrorStatus }
  )
);

export default router;
