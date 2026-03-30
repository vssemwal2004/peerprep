import { Router } from 'express';
import authRoutes from './auth.js';
import studentRoutes from './students.js';
import eventRoutes from './events.js';
import pairingRoutes from './pairing.js';
import scheduleRoutes from './schedule.js';
import feedbackRoutes from './feedback.js';
import coordinatorRoutes from './coordinators.js';
import subjectRoutes from './subjects.js';
import learningRoutes from './learning.js';
import activityRoutes from './activity.js';
import joinRoutes from './join.js';
import compilerRoutes from './compiler.js';

const router = Router();
router.use('/auth', authRoutes);
router.use('/students', studentRoutes);
router.use('/events', eventRoutes);
router.use('/pairing', pairingRoutes);
router.use('/schedule', scheduleRoutes);
router.use('/feedback', feedbackRoutes);
router.use('/coordinators', coordinatorRoutes);
router.use('/subjects', subjectRoutes);
router.use('/learning', learningRoutes);
router.use('/activity', activityRoutes);
router.use('/join', joinRoutes);
router.use('/compiler', compilerRoutes);

export default router;
