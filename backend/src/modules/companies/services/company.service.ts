import { CompanyRepository } from '../repositories/company.repository';
import { CreateCompanyDto, UpdateCompanyDto } from '../dto';
import { AppError } from '../../../shared/errors/app-error';
export class CompanyService { constructor(private companyRepo: CompanyRepository) {} async create(dto: CreateCompanyDto) { return this.companyRepo.create(dto); } async findAll() { return this.companyRepo.findMany({ isActive: true }); } async findById(id: string) { const company = await this.companyRepo.findById(id); if (!company) throw new AppError('Company not found', 404); return company; } async update(id: string, dto: UpdateCompanyDto) { return this.companyRepo.update(id, dto); } async delete(id: string) { await this.companyRepo.update(id, { isActive: false }); } }
