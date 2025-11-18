// src/app/components/f1-dashboard/f1-dashboard.component.ts

import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';

// Syncfusion imports
import { DashboardLayoutModule } from '@syncfusion/ej2-angular-layouts';
import { GridModule, PageService, SortService, FilterService } from '@syncfusion/ej2-angular-grids';
import { ChartModule, ColumnSeriesService, CategoryService, DataLabelService, TooltipService } from '@syncfusion/ej2-angular-charts';

// Models y Services
import { F1LiveTimingService } from '../services/f1-livetiming.service';
import { 
  F1Meeting, 
  SessionGridData, 
  ChartData,
  F1SeasonResponse,
  F1SessionIndex
} from '../models/f1-livetiming.model';

@Component({
  selector: 'app-f1-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    DashboardLayoutModule,
    GridModule,
    ChartModule
  ],
  providers: [
    PageService,
    SortService,
    FilterService,
    ColumnSeriesService,
    CategoryService,
    DataLabelService,
    TooltipService
  ],
  templateUrl: './f1-dashboard.component.html',
  styleUrls: ['./f1-dashboard.component.css']
})
export class F1DashboardComponent implements OnInit, OnDestroy {
  // Estado del componente
  public currentYear = 2025;
  public isLoading = true;
  public errorMessage = '';

  // Datos
  public meetings: F1Meeting[] = [];
  public allSessions: SessionGridData[] = [];
  public chartData: ChartData[] = [];

  // Datos seleccionados
  public selectedSession: SessionGridData | null = null;
  public sessionDetails: (F1SessionIndex & { info?: any }) | null = null;

  // Estadísticas
  public totalRaces = 0;
  public totalSessions = 0;
  public countries: string[] = [];

  // Para gestionar suscripciones
  private destroy$ = new Subject<void>();

  constructor(private f1Service: F1LiveTimingService) {}

  ngOnInit(): void {
    this.loadSeasonData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Carga los datos de la temporada actual
   */
  loadSeasonData(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.f1Service.getSeason(this.currentYear)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data: F1SeasonResponse) => {
          this.meetings = data.Meetings;
          this.processData();
          this.isLoading = false;
        },
        error: (error: unknown) => {
          console.error('Error al cargar datos de F1:', error);
          this.errorMessage = 'Error al cargar los datos. Por favor, intenta de nuevo más tarde.';
          this.isLoading = false;
        }
      });
  }

  /**
   * Procesa los datos de la temporada para generar estadísticas y datos del grid
   */
  private processData(): void {
    this.totalRaces = this.meetings.length;
    this.allSessions = [];

    // Procesar todas las sesiones
    this.meetings.forEach((meeting: F1Meeting) => {
      meeting.Sessions.forEach((session) => {
        this.allSessions.push({
          meetingName: meeting.Name,
          location: meeting.Location || 'N/A',
          country: meeting.Country?.Name || 'N/A',
          sessionType: session.Type,
          sessionName: session.Name,
          startDate: session.StartDate,
          path: session.Path,
          meeting: meeting
        });
      });
    });

    this.totalSessions = this.allSessions.length;

    // Extraer países únicos
    this.countries = [...new Set(
      this.meetings
        .map(m => m.Country?.Name)
        .filter(c => c !== undefined)
    )] as string[];

    // Preparar datos para el gráfico
    this.prepareChartData();
  }

  /**
   * Prepara los datos para el gráfico de tipos de sesión
   */
  private prepareChartData(): void {
    const sessionTypes: { [key: string]: number } = {};
    
    this.allSessions.forEach(session => {
      sessionTypes[session.sessionType] = 
        (sessionTypes[session.sessionType] || 0) + 1;
    });

    this.chartData = Object.entries(sessionTypes).map(([type, count]) => ({
      type,
      count
    }));
  }

  /**
   * Carga los detalles de una sesión seleccionada
   * @param session - Sesión seleccionada del grid
   */
  loadSessionDetails(session: SessionGridData): void {
    this.selectedSession = session;
    this.sessionDetails = null;
    
    this.f1Service.getSessionIndex(session.path)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data: F1SessionIndex) => {
          this.sessionDetails = data;
          
          // Cargar SessionInfo si está disponible
          if (data.Feeds['SessionInfo']) {
            this.loadSessionInfo(session.path, data.Feeds['SessionInfo'].KeyFramePath);
          }
        },
        error: (error: unknown) => {
          console.error('Error al cargar detalles de sesión:', error);
        }
      });
  }

  /**
   * Carga la información detallada de la sesión
   */
  private loadSessionInfo(sessionPath: string, feedPath: string): void {
    this.f1Service.getSessionData(sessionPath, feedPath)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (sessionInfo: unknown) => {
          if (this.sessionDetails) {
            this.sessionDetails.info = sessionInfo;
          }
        },
        error: (err: unknown) => console.error('Error cargando SessionInfo:', err)
      });
  }

  /**
   * Obtiene la lista de feeds disponibles para la sesión seleccionada
   */
  getAvailableFeeds(): string[] {
    if (!this.sessionDetails?.Feeds) return [];
    return Object.keys(this.sessionDetails.Feeds);
  }

  /**
   * Maneja el evento de selección de fila del grid
   */
  onRowSelected(event: { data?: SessionGridData }): void {
    if (event?.data) {
      this.loadSessionDetails(event.data);
    }
  }
}
