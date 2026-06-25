import { Component, OnInit } from '@angular/core';
import { ChartModule } from 'primeng/chart';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [ChartModule],
  template: `
    <div class="card p-4">
      <h3>Evolution des Scans</h3>
      <p-chart type="line" [data]="data" [options]="options"></p-chart>
    </div>
  `
})
export class DashboardComponent implements OnInit {
  data: any;
  options: any;

  ngOnInit() {
    this.data = {
      labels: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
      datasets: [{ label: 'Scans', data: [65, 59, 80, 81, 56, 55, 40], fill: true, borderColor: '#42A5F5' }]
    };
    this.options = { responsive: true, maintainAspectRatio: false };
  }
}
