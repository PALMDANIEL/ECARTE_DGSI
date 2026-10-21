import { Component, OnInit } from '@angular/core';
import { Store } from '@ngrx/store';
import { AppState } from '../../../../core/store';
import { loadStatistics } from '../../../../core/store/statistics/statistics.actions';
import { selectStatisticsStats } from '../../../../core/store/statistics/statistics.selectors';
@Component({
  selector: 'app-statistics',
  standalone: false,
  template: `
    <div class="ec-page">
      <header class="ec-page-header">
        <div>
          <h1 class="ec-display">Statistiques</h1>
          <p class="ec-mono">ANALYSE DÉTAILLÉE DE VOS DONNÉES</p>
        </div>
      </header>

      <div class="ec-stats-grid">
        <div class="ec-stat-card" *ngFor="let stat of stats">
          <div class="ec-stat-icon" [style.background]="stat.bg" [style.color]="stat.fg"><i [class]="stat.icon"></i></div>
          <div class="ec-stat-body">
            <div class="ec-stat-value">{{ stat.value }}</div>
            <div class="ec-stat-label ec-mono">{{ stat.label | uppercase }}</div>
          </div>
        </div>
      </div>

      <div class="ec-charts-grid">
        <div class="ec-chart-panel">
          <h2 class="ec-panel-title">Scans par jour (30 derniers jours)</h2>
          <p-chart type="line" [data]="lineData" [options]="lineOptions" height="280px"></p-chart>
        </div>
        <div class="ec-chart-panel">
          <h2 class="ec-panel-title">Répartition des appareils</h2>
          <p-chart type="doughnut" [data]="doughnutData" [options]="doughnutOptions" height="280px"></p-chart>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .ec-stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .ec-stat-card { background: var(--ec-paper-raised); border: 1px solid var(--ec-line); border-radius: 14px; padding: 20px; display: flex; align-items: center; gap: 16px; }
    .ec-stat-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; flex-shrink: 0; }
    .ec-stat-value { font-family: var(--ec-font-display); font-size: 1.7rem; font-weight: 600; color: var(--ec-ink); line-height: 1; }
    .ec-stat-label { font-size: 0.65rem; color: var(--ec-ink-soft); margin-top: 6px; }
    .ec-charts-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; }
    .ec-chart-panel { background: var(--ec-paper-raised); border: 1px solid var(--ec-line); border-radius: 14px; padding: 20px; }
    .ec-panel-title { font-family: var(--ec-font-display); font-size: 1.1rem; margin: 0 0 16px; color: var(--ec-ink); }
    @media (max-width: 900px) { .ec-charts-grid { grid-template-columns: 1fr; } }
  `]
})
export class StatisticsComponent implements OnInit {
  stats: { label: string; value: number | string; icon: string; bg: string; fg: string }[] = [
    { label: 'Total scans', value: 0, icon: 'pi pi-eye', bg: '#EAF6F6', fg: '#0F8B8D' },
    { label: 'Cartes actives', value: 0, icon: 'pi pi-id-card', bg: '#EEF0F8', fg: '#12172B' },
    { label: 'Utilisateurs', value: 0, icon: 'pi pi-users', bg: '#FBF3E3', fg: '#C89B3C' },
    { label: 'Scans / carte', value: 0, icon: 'pi pi-chart-line', bg: '#FBEAEA', fg: '#D64545' }
  ];
  lineData: any = { labels: [], datasets: [{ label: 'Scans', data: [], borderColor: '#0F8B8D', backgroundColor: 'rgba(15,139,141,0.1)', fill: true, tension: 0.3 }] };
  lineOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } };
  doughnutData: any = { labels: ['Mobile', 'Ordinateur'], datasets: [{ data: [0, 0], backgroundColor: ['#0F8B8D', '#C89B3C'] }] };
  doughnutOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } };
  constructor(private store: Store<AppState>) {}
  ngOnInit() {
    this.store.dispatch(loadStatistics());
    this.store.select(selectStatisticsStats).subscribe((data: any) => {
      if (!data) return;
      this.stats[0].value = data.totalScans || 0;
      this.stats[1].value = data.activeCards || 0;
      this.stats[2].value = data.totalUsers || 0;
      this.stats[3].value = data.scansPerCard || 0;
      if (data.charts) {
        const labels = (data.charts.labels || []).map((d: string) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }));
        this.lineData = { ...this.lineData, labels, datasets: [{ ...this.lineData.datasets[0], data: data.charts.scans || [] }] };
        const dev = data.charts.devices || {};
        this.doughnutData = { ...this.doughnutData, datasets: [{ ...this.doughnutData.datasets[0], data: [dev.mobile || 0, dev.desktop || 0] }] };
      }
    });
  }
}
