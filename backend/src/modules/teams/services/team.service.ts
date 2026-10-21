import { TeamRepository } from '../repositories/team.repository';
import { CreateTeamDto, UpdateTeamDto } from '../dto';
import { AppError } from '../../../shared/errors/app-error';
export class TeamService { constructor(private repo: TeamRepository) {} async create(dto: CreateTeamDto) { return this.repo.create({ name: dto.name, company: { connect: { id: dto.companyId } } }); } async findAll(companyId: string) { return this.repo.findMany({ companyId }); } async findById(id: string) { const team = await this.repo.findById(id); if (!team) throw new AppError('Team not found', 404); return team; } async update(id: string, dto: UpdateTeamDto) { return this.repo.update(id, dto); } async delete(id: string) { await this.repo.update(id, { isActive: false }); } }
