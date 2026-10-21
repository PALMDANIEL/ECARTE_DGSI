import { IsString, IsOptional } from 'class-validator';
export class CreateTeamDto { @IsString() name!: string; @IsOptional() @IsString() companyId?: string; }
export class UpdateTeamDto { @IsOptional() @IsString() name?: string; }
