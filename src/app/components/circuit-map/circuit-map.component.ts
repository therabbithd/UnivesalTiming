// circuit-map.component.ts
import { Component, Input, OnChanges, SimpleChanges, ElementRef, ViewChild, AfterViewInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { catchError, of, Subscription } from 'rxjs';
import Chart from 'chart.js/auto';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { F1LiveTimingStreamService } from '../../services/f1-livetiming.service';

interface DriverPosition {
  racingNumber: string;
  x: number;
  y: number;
  z: number;
  teamColor: string;
  driverCode: string;
}

@Component({
  selector: 'app-circuit-map',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './circuit-map.component.html',
  styleUrls: ['./circuit-map.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CircuitMapComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() circuitKey: number | string | undefined;
  @Input() year: number | string | undefined;
  
  @ViewChild('mapCanvas') mapCanvas!: ElementRef<HTMLCanvasElement>;

  trackData: any = null;
  isLoading = false;
  error: string | null = null;
  chart: Chart | null = null;
  streamSubscription: Subscription | null = null;

  // Rotation state
  rotation: number = 0;

  // Circuit info
  circuitName: string = '';
  location: string = '';

  constructor(
    private http: HttpClient, 
    private streamService: F1LiveTimingStreamService,
    private cdr: ChangeDetectorRef
  ) {
    Chart.register(ChartDataLabels);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['circuitKey'] || changes['year']) {
      this.loadMap();
    }
  }

  ngAfterViewInit(): void {
    if (this.trackData) {
      this.renderChart();
    }
    
    // Suscribirse al stream para actualizaciones de posición en tiempo real
    this.subscribeToPositions();
  }

  ngOnDestroy(): void {
    if (this.chart) {
      this.chart.destroy();
    }

    if (this.streamSubscription) {
      this.streamSubscription.unsubscribe();
    }
  }

  loadMap() {
    if (!this.circuitKey || !this.year) return;

    this.isLoading = true;
    this.error = null;

    const url = `https://api.multiviewer.app/api/v1/circuits/${this.circuitKey}/${this.year}`;

    this.http.get(url).pipe(
      catchError(err => {
        console.error('Error loading circuit map:', err);
        this.error = 'Could not load track map.';
        this.isLoading = false;
        this.cdr.markForCheck();
        return of(null);
      })
    ).subscribe((data: any) => {
      this.isLoading = false;
      if (data) {
        this.trackData = data;
        this.rotation = data.rotation || 0;
        this.circuitName = data.name || '';
        this.location = data.location || '';
        this.renderChart();
      }
      this.cdr.markForCheck();
    });
  }

  subscribeToPositions() {
    // Desuscribirse de suscripción previa si existe
    if (this.streamSubscription) {
      this.streamSubscription.unsubscribe();
    }

    // Suscribirse al stream para recibir posiciones en tiempo real
    this.streamSubscription = this.streamService.state$.subscribe(() => {
      const positions = this.extractDriverPositions();
      if (positions.length > 0) {
        this.updateDriverPositions(positions);
      }
    });
  }

  extractDriverPositions(): DriverPosition[] {
    const state = this.streamService.getCurrentState();
    
    if (!state.Position?.Position || !state.DriverList) {
      return [];
    }

    const positions: DriverPosition[] = [];
    const positionData = state.Position.Position;
    const driverList = state.DriverList;

    // Extraer posiciones de cada piloto
    for (const [driverNumber, posData] of Object.entries(positionData)) {
      const driver = driverList[driverNumber];
      
      if (driver && posData && typeof posData === 'object') {
        const pos = posData as any;
        
        positions.push({
          racingNumber: driver.RacingNumber || driverNumber,
          x: pos.X || 0,
          y: pos.Y || 0,
          z: pos.Z || 0,
          teamColor: driver.TeamColour || '000000',
          driverCode: driver.Tla || ''
        });
      }
    }

    return positions;
  }

  updateDriverPositions(positions: DriverPosition[]) {
    if (!this.chart || !this.trackData || positions.length === 0) return;

    // Transformar coordenadas con rotación
    const rotatedPositions = this.transformCoordinates(
      positions.map(p => p.x),
      positions.map(p => p.y)
    );

    // Actualizar dataset de pilotos (índice 1)
    this.chart.data.datasets[1].data = rotatedPositions.map((p, i) => ({
      x: p.x,
      y: p.y,
      driverInfo: positions[i]
    }));

    // Actualizar colores de los puntos
    const colors = positions.map(p => '#' + p.teamColor);
    (this.chart.data.datasets[1] as any).pointBackgroundColor = colors;

    // Actualizar el gráfico
    this.chart.update('none'); // 'none' mode for performance
  }

  transformCoordinates(xArr: number[], yArr: number[]): { x: number, y: number }[] {
    // 1. Invertir Y (coordenadas de canvas vs coordenadas del mundo)
    const yInverted = yArr.map(y => -y);

    // 2. Rotar según la rotación del circuito
    const rotationDeg = this.rotation || 0;
    const rad = (rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    return xArr.map((x, i) => ({
      x: x * cos - yInverted[i] * sin,
      y: x * sin + yInverted[i] * cos
    }));
  }

  renderChart() {
    if (!this.mapCanvas || !this.trackData) return;

    if (this.chart) {
      this.chart.destroy();
    }

    const ctx = this.mapCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    // Transformar datos del circuito
    const trackPoints = this.transformCoordinates(this.trackData.x, this.trackData.y);

    this.chart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            // Track Line (Circuito)
            data: trackPoints,
            borderColor: '#e10600',
            borderWidth: 5,
            showLine: true,
            pointRadius: 0,
            fill: false,
            tension: 0,
            borderJoinStyle: 'round',
            borderCapStyle: 'round',
            order: 2 // Renderizar debajo de los pilotos
          },
          {
            // Drivers (Pilotos)
            data: [], // Se poblará con streaming en tiempo real
            pointRadius: 8,
            pointHoverRadius: 10,
            pointBackgroundColor: [],
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            showLine: false,
            order: 1, // Renderizar encima del circuito
            datalabels: {
              display: true,
              color: '#ffffff',
              font: {
                weight: 'bold',
                size: 9
              },
              formatter: (value: any) => {
                return value.driverInfo ? value.driverInfo.racingNumber : '';
              },
              align: 'center',
              anchor: 'center',
              textStrokeColor: '#000000',
              textStrokeWidth: 2
            }
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 0 // Sin animación inicial para mejor rendimiento
        },
        plugins: {
          legend: { display: false },
          tooltip: { 
            enabled: true,
            callbacks: {
              label: (context: any) => {
                const driver = context.raw?.driverInfo;
                if (driver) {
                  return `${driver.driverCode} (#${driver.racingNumber})`;
                }
                return '';
              }
            }
          },
          datalabels: {
            display: (context: any) => {
              // Solo mostrar labels en el dataset de pilotos (índice 1)
              return context.datasetIndex === 1;
            }
          }
        },
        scales: {
          x: { 
            display: false, 
            grid: { display: false }
          },
          y: { 
            display: false, 
            grid: { display: false }
          }
        },
        layout: {
          padding: 20
        }
      }
    });
  }
}
