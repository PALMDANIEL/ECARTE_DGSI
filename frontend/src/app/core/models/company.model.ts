export interface Company {
  id: string;
  name: string;
  logo?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
