import { Router } from 'express';
import { buildingData } from '../data/index.js';
import { requireAuth } from '../middleware/auth.js';
import { userData } from '../data/index.js';
import { createApiHandler } from '../utils/api-response.js';

const router = Router();

router.get(
  '/buildings',
  createApiHandler(
    async (req) => {
      const { search, borough, neighborhood, riskLevel, sortBy, sortOrder, page, limit } =
        req.query;

      return buildingData.getAllBuildings({
        search,
        borough,
        neighborhood,
        riskLevel,
        sortBy,
        sortOrder,
        page,
        limit
      });
    },
    {
      getErrorStatus: (error) => (typeof error === 'string' ? 400 : 500)
    }
  )
);

router.get(
  '/buildings/:id',
  createApiHandler(
    async (req) => buildingData.getBuildingById(req.params.id),
    { errorStatus: 404 }
  )
);

router.get(
  '/portfolios/:ownerName',
  createApiHandler(
    async (req) => buildingData.getBuildingsByOwner(req.params.ownerName),
    { errorStatus: 404 }
  )
);

router.post(
  '/watchlist/toggle',
  requireAuth,
  createApiHandler(
    async (req) => {
      await buildingData.getBuildingById(req.body.buildingId);
      return userData.toggleWatchlist(req.session.user._id, req.body.buildingId)
    },
    { getErrorStatus: (error) =>
        error === 'building not found' ? 404 : 400
    }
  )
);

export default router;
