import { IsString, IsOptional, IsEmail, IsNumber, IsBoolean } from 'class-validator';

export class CreateCardDto {
  @IsString() fullName!: string;
  @IsOptional() @IsString() jobTitle?: string;
  @IsOptional() @IsString() ministry?: string;
  @IsOptional() @IsString() direction?: string;
  @IsOptional() @IsString() service?: string;
  @IsOptional() @IsString() phoneMobile?: string;
  @IsOptional() @IsString() phoneWork?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() whatsapp?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() linkedin?: string;
  @IsOptional() @IsString() facebook?: string;
  @IsOptional() @IsString() instagram?: string;
  @IsOptional() @IsString() tiktok?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsNumber() gpsLat?: number;
  @IsOptional() @IsNumber() gpsLng?: number;
}

export class UpdateCardDto extends CreateCardDto {
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isArchived?: boolean;
}
