import { Router } from 'express';
import { userData } from '../data/index.js';
import { requireAuth } from '../middleware/auth.js';
import { createApiHandler, sendApiSuccess } from '../utils/api-response.js';

const router = Router();

router.get(
  '/users/me',
  requireAuth,
  createApiHandler(
    async (req) => userData.getProfile(req.session.user._id),
    { errorStatus: 400 }
  )
);

router.put(
  '/users/me',
  requireAuth,
  createApiHandler(
    async (req) => {
      const { firstName, lastName, email, username } = req.body;
      const updated = await userData.updateProfile(req.session.user._id, {
        firstName, lastName, email, username
      });
      req.session.user = updated;
      return updated;
    },
    { errorStatus: 400 }
  )
);

router.put(
  '/users/me/password',
  requireAuth,
  createApiHandler(
    async (req) => {
      const { currentPassword, newPassword } = req.body;
      return userData.changePassword(req.session.user._id, currentPassword, newPassword);
    },
    { errorStatus: 400 }
  )
);

router.delete(
  '/users/me',
  requireAuth,
  (req, res, next) => {
    const userId = req.session.user._id;
    userData.deleteUser(userId)
      .then(() => {
        req.session.destroy(() => sendApiSuccess(res, { deleted: true }));
      })
      .catch((error) => {
        const status = typeof error === 'string' ? 400 : 500;
        const message = status >= 500 ? 'internal server error' : error;
        res.status(status).json({ error: message });
      });
  }
);

export default router;
