import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import registerRoutes from './routes/index.js';
import { apiRateLimiter } from './middleware/rate-limit.js';

const app = express();
const port = Number(process.env.PORT) || 3001;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  name: 'leasewise.sid',
  secret: process.env.SESSION_SECRET || 'leasewise-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 }
}));
app.use(apiRateLimiter);

registerRoutes(app);

app.listen(port, () => {
  console.log(`LeaseWise NYC back-end running on http://localhost:${port}`);
});
