import authRoutes from './auth.js';
import userRoutes from './users.js';
import buildingRoutes from './buildings.js';
import reviewRoutes from './reviews.js';
import shortlistRoutes from './shortlists.js';
import adminRoutes from './admin.js';
import { sendApiError } from '../utils/api-response.js';

export default function registerRoutes(app) {
  app.use(authRoutes);
  app.use(userRoutes);
  app.use(buildingRoutes);
  app.use(reviewRoutes);
  app.use(shortlistRoutes);
  app.use(adminRoutes);

  app.use((req, res) => sendApiError(res, 'not found', { status: 404 }));
  app.use((err, req, res, next) =>
    sendApiError(res, err, {
      status: Number.isInteger(err?.status) ? err.status : Number.isInteger(err?.statusCode) ? err.statusCode : 500
    })
  );
}
