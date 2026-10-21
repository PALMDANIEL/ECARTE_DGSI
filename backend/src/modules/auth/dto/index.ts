import { IsEmail, IsString, MinLength, IsOptional, IsNotEmpty } from 'class-validator';
export class RegisterDto { @IsString() @IsNotEmpty() firstName!: string; @IsString() @IsNotEmpty() lastName!: string; @IsEmail() email!: string; @MinLength(8) password!: string; @IsString() @IsOptional() phone?: string; @IsString() @IsNotEmpty() companyName!: string; }
export class LoginDto { @IsEmail() email!: string; @IsString() password!: string; }
export class RefreshTokenDto { @IsString() refreshToken!: string; }
export class ChangePasswordDto { @IsString() currentPassword!: string; @MinLength(8) newPassword!: string; }
export class ForgotPasswordDto { @IsEmail() email!: string; }
export class ResetPasswordDto { @IsString() token!: string; @MinLength(8) newPassword!: string; }
