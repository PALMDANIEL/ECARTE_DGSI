import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { RegisterDto, LoginDto, RefreshTokenDto, ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto } from '../dto';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { AppError } from '../../../shared/errors/app-error';
export class AuthController {
  constructor(private authService: AuthService) {}
  async register(req: Request, res: Response) { try { const dto = plainToClass(RegisterDto, req.body); const errors = await validate(dto); if (errors.length > 0) return res.status(400).json({ errors }); const result = await this.authService.register(dto); return res.status(201).json(result); } catch (error: any) { return res.status(error instanceof AppError ? error.statusCode : 400).json({ message: error.message || 'Erreur' }); } }
  async login(req: Request, res: Response) { try { const dto = plainToClass(LoginDto, req.body); const errors = await validate(dto); if (errors.length > 0) return res.status(400).json({ errors }); const result = await this.authService.login(dto); return res.json(result); } catch (error: any) { return res.status(401).json({ message: error.message || 'Erreur' }); } }
  async refreshToken(req: Request, res: Response) { try { const dto = plainToClass(RefreshTokenDto, req.body); const errors = await validate(dto); if (errors.length > 0) return res.status(400).json({ errors }); return res.json(await this.authService.refreshToken(dto)); } catch (error: any) { return res.status(401).json({ message: error.message }); } }
  async changePassword(req: Request & { user?: any }, res: Response) { try { const dto = plainToClass(ChangePasswordDto, req.body); const errors = await validate(dto); if (errors.length > 0) return res.status(400).json({ errors }); return res.json(await this.authService.changePassword(req.user!.id, dto)); } catch (error: any) { return res.status(400).json({ message: error.message }); } }
  async forgotPassword(req: Request, res: Response) { try { const dto = plainToClass(ForgotPasswordDto, req.body); const errors = await validate(dto); if (errors.length > 0) return res.status(400).json({ errors }); await this.authService.forgotPassword(dto); return res.json({ message: 'Reset link sent' }); } catch (error: any) { return res.status(400).json({ message: error.message }); } }
  async resetPassword(req: Request, res: Response) { try { const dto = plainToClass(ResetPasswordDto, req.body); const errors = await validate(dto); if (errors.length > 0) return res.status(400).json({ errors }); return res.json(await this.authService.resetPassword(dto)); } catch (error: any) { return res.status(400).json({ message: error.message }); } }
}
