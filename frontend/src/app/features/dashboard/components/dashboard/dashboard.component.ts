import { Component, OnInit } from '@angular/core';
import { Store } from '@ngrx/store';
import { AppState } from '../../../../core/store';
import { loadDashboardStats } from '../../../../core/store/dashboard/dashboard.actions';
import { selectDashboardStats } from '../../../../core/store/dashboard/dashboard.selectors';

@Component({
  selector: 'app-dashboard',
  standalone: false,
  template: `
    <div class="ec-page">
      <header class="ec-page-header">
        <div>
          <h1 class="ec-display">Tableau de bord</h1>
          <p class="ec-mono">VUE D'ENSEMBLE ECARTE</p>
        </div>
      </header>

      <div class="ec-stats-grid">
        <div class="ec-stat-card" *ngFor="let stat of stats">
          <div class="ec-stat-icon" [style.background]="stat.bg" [style.color]="stat.fg">
            <i [class]="stat.icon"></i>
          </div>
          <div class="ec-stat-body">
            <div class="ec-stat-value">{{ stat.value }}</div>
            <div class="ec-stat-label ec-mono">{{ stat.label | uppercase }}</div>
          </div>
          <div class="ec-stat-change" *ngIf="stat.change">
            <i class="pi pi-arrow-up"></i> {{ stat.change }}%
          </div>
        </div>
      </div>

      <div class="ec-charts-grid">
        <div class="ec-chart-panel ec-chart-wide">
          <h2 class="ec-panel-title">Évolution des scans</h2>
          <p-chart type="line" [data]="chartData" [options]="chartOptions" height="260px"></p-chart>
        </div>
        <div class="ec-chart-panel">
          <h2 class="ec-panel-title">Top cartes</h2>
          <p-chart type="bar" [data]="barChartData" [options]="barChartOptions" height="260px"></p-chart>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .ec-stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .ec-stat-card {
      background: var(--ec-paper-raised);
      border: 1px solid var(--ec-line);
      border-radius: 14px;
      padding: 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      position: relative;
      transition: transform .15s ease, box-shadow .15s ease;
    }
    .ec-stat-card:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(18,23,43,0.08); }
    .ec-stat-icon {
      width: 48px; height: 48px;
      border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      font-size: 1.3rem;
      flex-shrink: 0;
    }
    .ec-stat-body { flex: 1; }
    .ec-stat-value {
      font-family: var(--ec-font-display);
      font-size: 1.7rem;
      font-weight: 600;
      color: var(--ec-ink);
      line-height: 1;
    }
    .ec-stat-label { font-size: 0.65rem; color: var(--ec-ink-soft); margin-top: 6px; }
    .ec-stat-change {
      position: absolute;
      top: 16px; right: 16px;
      display: flex; align-items: center; gap: 4px;
      font-size: 0.7rem; font-weight: 600;
      color: var(--ec-teal);
      background: #EAF6F6;
      padding: 3px 8px;
      border-radius: 999px;
    }

    .ec-charts-grid {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 16px;
    }
    .ec-chart-panel {
      background: var(--ec-paper-raised);
      border: 1px solid var(--ec-line);
      border-radius: 14px;
      padding: 20px;
    }
    .ec-panel-title {
      font-family: var(--ec-font-display);
      font-size: 1.1rem;
      margin: 0 0 16px;
      color: var(--ec-ink);
    }

    @media (max-width: 900px) {
      .ec-charts-grid { grid-template-columns: 1fr; }
    }
  `]
})
export class DashboardComponent implements OnInit {
  stats: any[] = [];

  chartData = {
    labels: [] as string[],
    datasets: [{
      label: 'Scans',
      data: [] as number[],
      borderColor: '#0F8B8D',
      backgroundColor: 'rgba(15,139,141,0.1)',
      fill: true,
      tension: 0.35
    }]
  };
  chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#E4E1D8' } } }
  };

  barChartData = {
    labels: [] as string[],
    datasets: [{ label: 'Scans', data: [] as number[], backgroundColor: '#C89B3C', borderRadius: 6 }]
  };
  barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#E4E1D8' } } }
  };

  constructor(private store: Store<AppState>) {}

  ngOnInit() {
    this.store.dispatch(loadDashboardStats());
    this.store.select(selectDashboardStats).subscribe(data => {
      if (data) {
        this.stats = [
          { label: 'Utilisateurs', value: data.users || 0, icon: 'pi pi-users', bg: '#EAF6F6', fg: '#0F8B8D', change: data.usersChange },
          { label: 'Entreprises', value: data.companies || 0, icon: 'pi pi-building', bg: '#FBF3E3', fg: '#C89B3C', change: data.companiesChange },
          { label: 'Cartes', value: data.cards || 0, icon: 'pi pi-id-card', bg: '#EEF0F8', fg: '#12172B', change: data.cardsChange },
          { label: 'Scans', value: data.scans || 0, icon: 'pi pi-eye', bg: '#FBEAEA', fg: '#D64545', change: data.scansChange }
        ];
        if (data.charts) {
          const scans: number[] = data.charts.scans || [];
          const labels: string[] = (data.charts.labels || []).map((d: string) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }));
          const top: { name: string; scans: number }[] = data.charts.topCards || [];
          // Nouveaux objets pour que p-chart se redessine
          this.chartData = { ...this.chartData, labels, datasets: [{ ...this.chartData.datasets[0], data: scans }] };
          this.barChartData = { ...this.barChartData, labels: top.map(t => t.name), datasets: [{ ...this.barChartData.datasets[0], data: top.map(t => t.scans) }] };
        }
      }
    });
  }
}
