import { ScanRepository } from '../../scans/repositories/scan.repository';
import { UserRepository } from '../../users/repositories/user.repository';
import { CompanyRepository } from '../../companies/repositories/company.repository';
import { BusinessCardRepository } from '../../business-cards/repositories/card.repository';
export class AnalyticsService { constructor(private scanRepo: ScanRepository, private userRepo: UserRepository, private companyRepo: CompanyRepository, private cardRepo: BusinessCardRepository) {} async getDashboardStats(companyId?: string, isSuperAdmin = false) { const whereCompany = companyId ? { companyId, isActive: true } : { isActive: true }; const [users, companies, cards, scans] = await Promise.all([this.userRepo.count(whereCompany), this.companyRepo.findMany(isSuperAdmin ? { isActive: true } : { id: companyId, isActive: true }).then(c => c.length), this.cardRepo.findMany({ companyId, isArchived: false }), this.scanRepo.count({ card: { companyId } })]); const last7Days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return d.toISOString().split('T')[0]; }).reverse(); const scansByDay = await Promise.all(last7Days.map(async day => { const start = new Date(day + 'T00:00:00.000Z'); const end = new Date(day + 'T23:59:59.999Z'); return this.scanRepo.count({ scannedAt: { gte: start, lte: end }, card: { companyId } }); })); const grouped = await this.scanRepo.groupByCard({ card: { companyId, isArchived: false } }, 5); const names = new Map(cards.map((c: any) => [c.id, c.fullName])); const top = grouped.map((g: any) => ({ id: g.cardId, name: names.get(g.cardId) || g.cardId, scans: g._count._all })); return { users, companies, cards: cards.length, scans, charts: { labels: last7Days, scans: scansByDay, topCards: top } }; } 
  async getStatistics(companyId: string) {
    const days = 30;
    const labels = Array.from({ length: days }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (days - 1 - i)); return d.toISOString().split('T')[0]; });
    const since = new Date(labels[0] + 'T00:00:00.000Z');
    const [cards, users, totalScans, recent] = await Promise.all([
      this.cardRepo.findMany({ companyId, isArchived: false }),
      this.userRepo.count({ companyId, isActive: true }),
      this.scanRepo.count({ card: { companyId } }),
      this.scanRepo.findMany({ card: { companyId }, scannedAt: { gte: since } })
    ]);
    const perDay = new Map<string, number>(labels.map(l => [l, 0] as [string, number]));
    const devices: Record<string, number> = { mobile: 0, desktop: 0 };
    for (const s of recent as any[]) {
      const day = new Date(s.scannedAt).toISOString().split('T')[0];
      if (perDay.has(day)) perDay.set(day, (perDay.get(day) || 0) + 1);
      const dev = s.device === 'mobile' ? 'mobile' : 'desktop';
      devices[dev]++;
    }
    const activeCards = cards.filter((c: any) => c.isActive).length;
    return {
      totalScans,
      activeCards,
      totalUsers: users,
      scansPerCard: activeCards ? Math.round((totalScans / activeCards) * 10) / 10 : 0,
      charts: { labels, scans: labels.map(l => perDay.get(l) || 0), devices }
    };
  }
}
