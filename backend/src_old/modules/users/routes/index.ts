import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { UserService } from '../services/user.service';
import { UserRepository } from '../repositories/user.repository';
import { authenticate, authorize } from '../../../middlewares/auth.middleware';

const router = Router();
const userRepo = new UserRepository();
const userService = new UserService(userRepo);
const controller = new UserController(userService);

router.use(authenticate);
router.post('/', authorize('ADMIN', 'SUPER_ADMIN'), controller.create.bind(controller));
router.get('/', controller.findAll.bind(controller));
router.get('/:id', controller.findOne.bind(controller));
router.put('/:id', authorize('ADMIN', 'SUPER_ADMIN'), controller.update.bind(controller));
router.delete('/:id', authorize('ADMIN', 'SUPER_ADMIN'), controller.delete.bind(controller));

export { router as userRouter };
