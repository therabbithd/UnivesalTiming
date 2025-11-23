import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { Observable, switchMap } from 'rxjs';

import { F1LiveTimingService } from '../services/f1-livetiming.service';
import { DriverTiming } from '../models/f1-livetiming.model';
import { CircuitMapComponent } from '../components/circuit-map/circuit-map.component';

@Component({
  selector: 'app-timing-table',
  standalone: true,
  imports: [
    CommonModule,
    HttpClientModule,
    MatCardModule,
    MatTableModule,
    CircuitMapComponent
  ],
  templateUrl: './timing-table.component.html',
  styleUrls: ['./timing-table.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TimingTableComponent implements OnInit {
  public timingData$!: Observable<DriverTiming[]>;
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

  constructor(
    private f1Service: F1LiveTimingService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.timingData$ = this.f1Service.getLatestSessionPath().pipe(
      switchMap(sessionInfo => {
        console.log('Cargando datos de sesión:', sessionInfo);
        this.circuitKey = sessionInfo.circuitKey;
        this.year = sessionInfo.year;
        this.sessionPath = sessionInfo.path;
        this.cdr.markForCheck();
        return this.f1Service.getLiveTimingData(sessionInfo.path);
      })
    );
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
}