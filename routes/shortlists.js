import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createApiHandler } from '../utils/api-response.js';
import { shortlistData, buildingData } from '../data/index.js';

const router = Router();

const getShortlistErrorStatus = (error) => {
  if (error === 'building not found') return 404;
  return 400;
};

router.get(
  '/shortlists',
  requireAuth,
  createApiHandler(
    async (req) => shortlistData.getShortlistsByUser(req.session.user._id)
  )
);

router.post(
  '/shortlists',
  requireAuth,
  createApiHandler(
    async (req) => shortlistData.createShortlist(req.session.user._id, req.body.shortlistName),
    { successStatus: 201, errorStatus: 400 }
  )
);

router.post(
  '/shortlists/:id/items',
  requireAuth,
  createApiHandler(
    async (req) =>{
      const buildingId = req.body.buildingId;
      await buildingData.getBuildingById(buildingId);

      return shortlistData.addItemToShortlist(
        req.params.id,
        req.session.user._id,
        buildingId
      );
    },
    { getErrorStatus: getShortlistErrorStatus }
  )
);

router.patch(
  '/shortlists/:id/items/:buildingId/note',
  requireAuth,
  createApiHandler(
    async (req) =>{
      const buildingId = req.params.buildingId;
      await buildingData.getBuildingById(buildingId);

      return await shortlistData.updateItemNote(
        req.params.id,
        req.session.user._id,
        req.params.buildingId,
        req.body.privateNote
      );
    },
    { getErrorStatus: getShortlistErrorStatus }
  )
);

router.delete(
  '/shortlists/:id/items/:buildingId',
  requireAuth,
  createApiHandler(
    async (req) =>{
      const buildingId = req.params.buildingId;
      await buildingData.getBuildingById(buildingId);

      return await shortlistData.removeItemFromShortlist(
        req.params.id,
        req.session.user._id,
        req.params.buildingId
      );
    },
    { getErrorStatus: getShortlistErrorStatus }
  )
);

router.delete(
  '/shortlists/:id',
  requireAuth,
  createApiHandler(
    async (req) => shortlistData.deleteShortlist(req.params.id, req.session.user._id),
    { errorStatus: 400 }
  )
);

export default router;
