import { Router } from 'express';
import { route } from '../controllers/route.controller.js';

export const routeRouter = Router();

routeRouter.get('/', route);
