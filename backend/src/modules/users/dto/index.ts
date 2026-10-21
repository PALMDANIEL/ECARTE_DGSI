import { IsEmail, IsString, IsOptional, IsBoolean, IsEnum, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @IsString() firstName!: string;
  @IsString() lastName!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() jobTitle?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsEnum(Role) role?: Role;
  companyId!: string;
  @IsOptional() @IsString() teamId?: string;
}

export class UpdateUserDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() jobTitle?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsString() teamId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateProfileDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() jobTitle?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() photo?: string;
}
