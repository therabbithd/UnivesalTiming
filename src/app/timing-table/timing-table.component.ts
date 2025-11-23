import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card'; // Importación para <mat-card>
import { MatTableModule } from '@angular/material/table'; // Importación para <table mat-table>

import { F1LiveTimingService } from '../services/f1-livetiming.service';
// Nota: Tu modelo DriverTiming debe ser accesible, asumo que lo has movido
// al mismo archivo de modelo que el servicio si no existe un archivo DriverTiming.model.ts aparte.
import { DriverTiming } from '../models/f1-livetiming.model';
import { Observable, switchMap } from 'rxjs';

@Component({
  selector: 'app-timing-table',
  // 💡 CLAVE 1: Definir como componente Standalone
  standalone: true,
  // 💡 CLAVE 2: Importar módulos de Angular y Material directamente
  imports: [
    CommonModule,
    HttpClientModule,
    MatCardModule,
    MatTableModule
  ],
  templateUrl: './timing-table.component.html',
  styleUrls: ['./timing-table.component.scss'],
  // 🚀 CLAVE: Usar OnPush para mejorar el rendimiento con flujos de datos rápidos
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimingTableComponent implements OnInit {

  // 🏁 CLAVE: Observable para enlazar directamente con la tabla usando la 'async' pipe
  timingData$!: Observable<DriverTiming[]>;

  // 🛠️ Columnas a mostrar en la tabla de Material
  displayedColumns: string[] = [
    'position',
    'driverCode',
    'tyre',
    'lapNumber',
    'lastLapTime',
    'gapToLeader',
    'gapToAhead'
  ];

  constructor(private f1Service: F1LiveTimingService) { }

  ngOnInit(): void {
    // Primero obtener la última sesión disponible y luego iniciar el stream
    this.timingData$ = this.f1Service.getLatestSessionPath().pipe(
      switchMap(path => {
        console.log('Cargando datos de sesión:', path);
        return this.f1Service.getLiveTimingData(path);
      })
    );
  }

  // 🎨 Aplica clases CSS para el estilo condicional (color de mejor vuelta, pit)
  getRowClass(driver: DriverTiming): string {
    if (driver.isPit) return 'row-pit';

    switch (driver.statusColor) {
      case 'session-best':
        return 'row-session-best';
      case 'personal-best':
        return 'row-personal-best';
      default:
        return '';
    }
  }
}