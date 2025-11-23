import { Component, Input, OnChanges, SimpleChanges, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { catchError, of, Subscription, interval, switchMap } from 'rxjs';
import Chart from 'chart.js/auto';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { F1LiveTimingService } from '../../services/f1-livetiming.service';

@Component({
    selector: 'app-circuit-map',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './circuit-map.component.html',
    styleUrls: ['./circuit-map.component.scss']
})
export class CircuitMapComponent implements OnChanges, AfterViewInit, OnDestroy {
    @Input() circuitKey: number | string | undefined;
    @Input() year: number | string | undefined;
    @Input() sessionPath: string | undefined;

    @ViewChild('mapCanvas') mapCanvas!: ElementRef<HTMLCanvasElement>;

    trackData: any = null;
    isLoading = false;
    error: string | null = null;
    chart: Chart | null = null;
    driverPositionsSub: Subscription | null = null;

    // Rotation state
    rotation: number = 0;

    constructor(private http: HttpClient, private f1Service: F1LiveTimingService) {
        Chart.register(ChartDataLabels);
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['circuitKey'] || changes['year']) {
            this.loadMap();
        }
        if (changes['sessionPath'] && this.sessionPath) {
            this.startDriverPolling();
        }
    }

    ngAfterViewInit(): void {
        if (this.trackData) {
            this.renderChart();
        }
    }

    ngOnDestroy(): void {
        if (this.chart) {
            this.chart.destroy();
        }
        if (this.driverPositionsSub) {
            this.driverPositionsSub.unsubscribe();
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
                return of(null);
            })
        ).subscribe((data: any) => {
            this.isLoading = false;
            if (data) {
                this.trackData = data;
                this.rotation = data.rotation || 0;
                this.renderChart();
            }
        });
    }

    startDriverPolling() {
        if (this.driverPositionsSub) {
            this.driverPositionsSub.unsubscribe();
        }

        if (!this.sessionPath) return;

        this.driverPositionsSub = this.f1Service.getDriverPositions(this.sessionPath)
            .subscribe(positions => {
                this.updateDriverPositions(positions);
            });
    }

    updateDriverPositions(positions: any[]) {
        if (!this.chart || !this.trackData) return;

        // console.log(`Updating driver positions: ${positions.length}`);

        const rotatedPositions = this.transformCoordinates(
            positions.map(p => p.x),
            positions.map(p => p.y)
        );

        // Update dataset 1 (Drivers)
        this.chart.data.datasets[1].data = rotatedPositions.map((p, i) => ({
            x: p.x,
            y: p.y,
            driverInfo: positions[i] // Store full driver info for tooltip/datalabels
        }));

        // Update colors
        const colors = positions.map(p => '#' + (p.teamColor || '000000'));
        (this.chart.data.datasets[1] as any).pointBackgroundColor = colors;

        this.chart.update(); // Remove 'none' to allow canvas clear
    }

    transformCoordinates(xArr: number[], yArr: number[]): { x: number, y: number }[] {
        // 1. Invert Y (Canvas/Screen coordinates vs World coordinates usually flipped)
        const yInverted = yArr.map(y => -y);

        // 2. Rotate
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

        // Transform track data
        const trackPoints = this.transformCoordinates(this.trackData.x, this.trackData.y);

        this.chart = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [
                    {
                        // Track Line
                        data: trackPoints,
                        borderColor: '#e10600',
                        borderWidth: 5,
                        showLine: true,
                        pointRadius: 0,
                        fill: false,
                        tension: 0,
                        borderJoinStyle: 'round',
                        borderCapStyle: 'round',
                        order: 2 // Render below drivers
                    },
                    {
                        // Drivers
                        data: [], // Will be populated by polling
                        pointRadius: 6,
                        pointHoverRadius: 8,
                        pointBackgroundColor: [], // Dynamic
                        pointBorderColor: '#000000',
                        pointBorderWidth: 1,
                        showLine: false,
                        order: 1, // Render on top
                        datalabels: {
                            display: true,
                            color: '#000000', // Black text on colored dot? Or white text?
                            // Let's try white text with a stroke or just contrasting color.
                            // Actually, standard F1 map often has the number inside the dot.
                            font: {
                                weight: 'bold',
                                size: 8
                            },
                            formatter: (value: any, context: any) => {
                                return value.driverInfo ? value.driverInfo.racingNumber : '';
                            },
                            align: 'center',
                            anchor: 'center'
                        }
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 0 // Disable initial animation for faster load, or keep it low
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }, // Custom tooltips maybe later
                    datalabels: {
                        // Global datalabels settings
                        color: 'white'
                    }
                },
                scales: {
                    x: { display: false, grid: { display: false } },
                    y: { display: false, grid: { display: false } }
                },
                layout: {
                    padding: 20
                }
            }
        });
    }
}
