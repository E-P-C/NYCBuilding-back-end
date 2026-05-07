import { Router } from 'express';
import { userData } from '../data/index.js';
import { requireAuth } from '../middleware/auth.js';
import { createApiHandler, sendApiSuccess } from '../utils/api-response.js';

const router = Router();

const getUserErrorStatus = (error) => {
  if (error === 'user not found') return 404;
  if (error === 'forbidden') return 403;
  return 400;
};

router.get(
  '/users/me',
  requireAuth,
  createApiHandler(
    async (req) => userData.getProfile(req.session.user._id),
    { getErrorStatus: getUserErrorStatus }
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
    { getErrorStatus: getUserErrorStatus }
  )
);

router.get(
  '/users/:id/watchlist',
  requireAuth,
  createApiHandler(
    async (req) => {
      const targetId = req.params.id.trim();
      const currentUserId = String(req.session.user._id);

      if (targetId !== currentUserId && req.session.user.role !== 'admin') {
        throw 'forbidden';
      }

      return userData.getUserWatchlist(targetId);
    },
    { getErrorStatus: getUserErrorStatus }
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
