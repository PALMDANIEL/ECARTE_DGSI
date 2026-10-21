import { UserRepository } from '../repositories/user.repository';
import { CreateUserDto, UpdateUserDto, UpdateProfileDto } from '../dto';
import { AppError } from '../../../shared/errors/app-error';
import bcrypt from 'bcrypt';
import { Role } from '@prisma/client';

const sanitize = (u: any) => { if (!u) return u; const { password, refreshToken, ...safe } = u; return safe; };

export class UserService {
  constructor(private userRepo: UserRepository) {}

  async create(dto: CreateUserDto) {
    const existing = await this.userRepo.findByEmail(dto.email);
    if (existing) throw new AppError('Email already used', 400);
    const hashed = await bcrypt.hash(dto.password, 10);
    return sanitize(await this.userRepo.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      password: hashed,
      phone: dto.phone,
      jobTitle: dto.jobTitle,
      department: dto.department,
      role: dto.role || Role.EMPLOYEE,
      company: { connect: { id: dto.companyId } },
      team: dto.teamId ? { connect: { id: dto.teamId } } : undefined
    }));
  }

  async findAll(companyId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      this.userRepo.findMany({ companyId }, { skip, take: limit }),
      this.userRepo.count({ companyId })
    ]);
    return { users: users.map(sanitize), total, page, limit };
  }

  async me(id: string) {
    const user = await this.userRepo.findByIdWithCompany(id);
    if (!user) throw new AppError('User not found', 404);
    return { ...sanitize(user), companyName: user.company?.name };
  }

  // Un utilisateur ne peut modifier que son propre profil, et seulement ces champs.
  async updateMe(id: string, dto: UpdateProfileDto) {
    const { firstName, lastName, phone, jobTitle, department, photo } = dto;
    const data: any = { firstName, lastName, phone, jobTitle, department, photo };
    Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);
    await this.userRepo.update(id, data);
    return this.me(id);
  }

  async findById(id: string) {
    const user = await this.userRepo.findById(id);
    if (!user) throw new AppError('User not found', 404);
    return sanitize(user);
  }

  async update(id: string, dto: UpdateUserDto) {
    return sanitize(await this.userRepo.update(id, dto));
  }

  async delete(id: string) {
    await this.userRepo.update(id, { isActive: false });
  }
}
