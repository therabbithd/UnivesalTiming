// timing-table.component.ts
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, model } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { Subscription } from 'rxjs';
import { F1LiveTimingStreamService } from '../services/f1-livetiming.service';
import { DriverTiming } from '../models/f1-livetiming.model';
import { CircuitMapComponent } from '../components/circuit-map/circuit-map.component';

@Component({
  selector: 'app-timing-table',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatTableModule,
    CircuitMapComponent
  ],
  templateUrl: './timing-table.component.html',
  styleUrls: ['./timing-table.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TimingTableComponent implements OnInit, OnDestroy {
  public timingData: DriverTiming[] = [];
  public displayedColumns: string[] = [
    'position',
    'driverCode',
    'tyre',
    'lapNumber',
    'lastLapTime',
    'gapToLeader',
    'gapToAhead'
  ];

  public circuitKey: string | number = '';
  public year: number = 2025;
  public sessionPath: string = '';
  public isConnected: boolean = false;

  private subscription?: Subscription;

  constructor(
    private streamService: F1LiveTimingStreamService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Conectar al stream de F1
    this.streamService.connect();
    this.isConnected = true;

    // Suscribirse a las actualizaciones de timing
    this.subscription = this.streamService.state$.subscribe(() => {
      this.timingData = this.streamService.getDriversTiming();
      
      // Obtener información de sesión si está disponible
      const state = this.streamService.getCurrentState();
      if (state.SessionInfo) {
        // Extraer información de la sesión actual si es necesaria
        this.updateSessionInfo(state.SessionInfo);
      }

      // Marcar para detección de cambios
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    // Desconectar y limpiar
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    this.streamService.disconnect();
    this.isConnected = false;
  }

  private updateSessionInfo(sessionInfo: any): void {
    // Actualizar información de sesión si es necesaria
    // Puedes extraer datos como circuito, año, etc.
    if (sessionInfo.Meeting) {
      this.circuitKey = sessionInfo.Meeting.Circuit?.Key || '';
    }
  }

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

  getTyreClass(compound: string): string {
    const compoundLower = compound.toLowerCase();
    return `tyre-${compoundLower}`;
  }

  // Método auxiliar para mostrar el estado de conexión
  getConnectionStatus(): string {
    return this.isConnected ? 'Conectado' : 'Desconectado';
  }
}
