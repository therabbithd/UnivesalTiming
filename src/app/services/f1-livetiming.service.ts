// src/app/services/f1-livetiming.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, timer, switchMap, of, catchError } from 'rxjs';
import { 
  F1IndexResponse, 
  F1SeasonResponse, 
  F1SessionIndex 
} from '../models/f1-livetiming.model';
import { DriverTiming } from '../models/f1-livetiming.model'; // Importamos el nuevo modelo

@Injectable({
  providedIn: 'root'
})
export class F1LiveTimingService {
  
  // Usamos el prefijo del proxy definido en proxy.conf.json
  private readonly baseUrl = '/f1-api/static'; 

  constructor(private http: HttpClient) {}

  // --- MÉTODOS EXISTENTES (Mantener por si los necesitas) ---

  getAvailableYears(): Observable<F1IndexResponse> {
    return this.http.get<F1IndexResponse>(`${this.baseUrl}/Index.json`);
  }

  getSeason(year: number): Observable<F1SeasonResponse> {
    return this.http.get<F1SeasonResponse>(`${this.baseUrl}/${year}/Index.json`);
  }

  getSessionData<T = any>(sessionPath: string, feedPath: string): Observable<T> {
    return this.http.get<T>(`${this.baseUrl}/${sessionPath}${feedPath}`);
  }

  // --- LIVE TIMING SIMULADO ---

  /**
   * 💡 Simulación de Live Timing con HTTP Polling. 
   * En un proyecto real, esto se reemplazaría por una conexión a WebSockets/SignalR.
   * @param sessionPath Ruta de la sesión (ej: "2024/2024-06-23_Spanish_Grand_Prix/2024-06-23_Race/")
   */
  getLiveTimingData(sessionPath: string): Observable<DriverTiming[]> {
    const streamPath = 'TimingData.jsonStream'; // Asumiendo un feed de timing

    // Usamos el timer de RxJS para hacer una petición cada 1000ms (1 segundo)
    return timer(0, 1000).pipe(
      switchMap(() => {
       
        return this.getSessionData<DriverTiming[]>(sessionPath, streamPath);
      }),
      catchError(error => {
        console.error('Error fetching live timing data:', error);
        return of([]); // Devolver un array vacío en caso de error
      })
    );
  }

  
}