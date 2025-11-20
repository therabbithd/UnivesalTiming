// src/app/services/f1-livetiming.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { 
  F1IndexResponse, 
  F1SeasonResponse, 
  F1SessionIndex 
} from '../models/f1-livetiming.model';

@Injectable({
  providedIn: 'root'
})
export class F1LiveTimingService {
  // CAMBIO CLAVE 1: Usar el prefijo del proxy y quitar el dominio externo
  // El proxy se encargará de mapear "/f1-api" a "https://livetiming.formula1.com"
  private readonly baseUrl = '/f1-api/static'; 

  constructor(private http: HttpClient) {}

  /**
   * Obtiene la lista de años disponibles en la API
   */
  getAvailableYears(): Observable<F1IndexResponse> {
    // CAMBIO CLAVE 2: La ruta ahora es: /f1-api/static/Index.json
    return this.http.get<F1IndexResponse>(`${this.baseUrl}/Index.json`);
  }

  /**
   * Obtiene todos los Grandes Premios y sesiones de una temporada
   * @param year - Año de la temporada (ej: 2025)
   */
  getSeason(year: number): Observable<F1SeasonResponse> {
    // CAMBIO CLAVE 3: La ruta ahora es: /f1-api/static/{year}/Index.json
    return this.http.get<F1SeasonResponse>(`${this.baseUrl}/${year}/Index.json`);
  }

  /**
   * Obtiene el índice de feeds disponibles para una sesión específica
   * @param sessionPath - Ruta de la sesión (ej: "2024/2024-06-23_Spanish_Grand_Prix/2024-06-23_Race/")
   */
  getSessionIndex(sessionPath: string): Observable<F1SessionIndex> {
    // La ruta ahora es: /f1-api/static/{sessionPath}Index.json
    return this.http.get<F1SessionIndex>(
      `${this.baseUrl}/${sessionPath}Index.json`
    );
  }

  /**
   * Obtiene los datos de un feed específico de una sesión
   * @param sessionPath - Ruta de la sesión
   * @param feedPath - Ruta del feed (ej: "SessionInfo.json")
   */
  getSessionData<T = any>(sessionPath: string, feedPath: string): Observable<T> {
    // La ruta ahora es: /f1-api/static/{sessionPath}{feedPath}
    return this.http.get<T>(`${this.baseUrl}/${sessionPath}${feedPath}`);
  }

  /**
   * Obtiene los datos del stream de un feed
   * @param sessionPath - Ruta de la sesión
   * @param streamPath - Ruta del stream (ej: "SessionInfo.jsonStream")
   */
  getSessionStream<T = any>(sessionPath: string, streamPath: string): Observable<T> {
    // La ruta ahora es: /f1-api/static/{sessionPath}{streamPath}
    return this.http.get<T>(`${this.baseUrl}/${sessionPath}${streamPath}`);
  }
}