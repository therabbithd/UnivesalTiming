// src/app/services/f1-livetiming.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, timer, switchMap, of, catchError, startWith, scan } from 'rxjs';
import { map } from 'rxjs/operators';
import { DriverTiming } from '../models/f1-livetiming.model';

@Injectable({
  providedIn: 'root'
})
export class F1LiveTimingService {

  private readonly baseUrl = '/f1-api/static';

  constructor(private http: HttpClient) { }

  // Métodos existentes (sin cambios)
  getAvailableYears() { /* ... */ }
  getSeason(year: number) { /* ... */ }
  getSessionData<T = any>(sessionPath: string, feedPath: string): Observable<T> {
    return this.http.get<T>(`${this.baseUrl}/${sessionPath}${feedPath}`);
  }

  /**
   * LIVE TIMING REAL F1 - FUNCIONA CON TimingData.jsonStream
   * Soporta el formato real: timestamp + JSON pegado + múltiples actualizaciones
   */
  getLiveTimingData(sessionPath: string): Observable<DriverTiming[]> {
    const streamPath = 'TimingData.jsonStream';

    return timer(0, 1000).pipe( // Cada segundo
      switchMap(() =>
        this.http.get(`${this.baseUrl}/${sessionPath}${streamPath}`, { responseType: 'text' })
          .pipe(
            catchError(err => {
              console.error('Error obteniendo stream:', err);
              return of('');
            })
          )
      ),
      map((rawStream: string) => {
        if (!rawStream || rawStream.trim() === '') {
          return [];
        }

        // Parsear todas las actualizaciones del stream
        const updates = this.parseTimingStream(rawStream);
        console.log('Total actualizaciones encontradas:', updates.length);

        // Calcular el estado final de los pilotos aplicando todas las actualizaciones en orden
        const finalState = this.processUpdatesToState(updates);

        console.log('Total pilotos en estado final:', finalState.length);
        return finalState;
      }),
      catchError(err => {
        console.error('Error en live timing:', err);
        return of([] as DriverTiming[]);
      })
    );
  }

  /**
   * Procesa una lista de actualizaciones para generar el estado final de los pilotos
   */
  private processUpdatesToState(updates: Partial<DriverTiming>[]): DriverTiming[] {
    const driverMap = new Map<string, DriverTiming>();

    updates.forEach(update => {
      const key = update.driverCode;
      if (key) {
        const existing = driverMap.get(key);
        if (existing) {
          // Merge con datos existentes
          driverMap.set(key, { ...existing, ...update } as DriverTiming);
        } else {
          // Nuevo piloto - crear entrada completa con valores por defecto
          driverMap.set(key, {
            position: update.position || 0,
            driverCode: key,
            driverName: update.driverName || '',
            lapNumber: update.lapNumber || 0,
            lastLapTime: update.lastLapTime || '',
            gapToLeader: update.gapToLeader || '',
            gapToAhead: update.gapToAhead || '',
            isPit: update.isPit || false,
            statusColor: update.statusColor || 'normal',
            ...update
          } as DriverTiming);
        }
      }
    });

    // Convertimos a array y ordenamos por posición
    const result = Array.from(driverMap.values());
    result.sort((a, b) => (a.position || 999) - (b.position || 999));

    return result;
  }

  /**
   * Parsea el stream real de F1: múltiples líneas como 00:00:04.219{"Lines":{...}}
   */
  private parseTimingStream(raw: string): Partial<DriverTiming>[] {
    const updates: Partial<DriverTiming>[] = [];

    // Dividir por timestamps (formato: HH:MM:SS.mmm)
    const timestampRegex = /(\d{2}:\d{2}:\d{2}\.\d{3})/g;
    const parts = raw.split(timestampRegex);

    // Procesar cada bloque timestamp + JSON
    for (let i = 1; i < parts.length; i += 2) {
      if (i + 1 >= parts.length) break;

      const jsonPart = parts[i + 1].trim();
      if (!jsonPart.startsWith('{')) continue;

      try {
        // Intentar parsear el JSON completo
        const data = JSON.parse(jsonPart);

        if (data.Lines) {
          // Cada entrada en "Lines" es una actualización de un piloto
          Object.keys(data.Lines).forEach(key => {
            const driverData = data.Lines[key];
            // Mapeamos los campos del JSON de F1 al modelo DriverTiming
            const mappedUpdate = this.mapF1DataToDriverTiming(key, driverData);
            if (mappedUpdate) {
              updates.push(mappedUpdate);
            }
          });
        }
      } catch (e) {
        // Si un bloque está corrupto, intentar extraer el JSON manualmente
        const jsonMatch = jsonPart.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const data = JSON.parse(jsonMatch[0]);
            if (data.Lines) {
              Object.keys(data.Lines).forEach(key => {
                const driverData = data.Lines[key];
                const mappedUpdate = this.mapF1DataToDriverTiming(key, driverData);
                if (mappedUpdate) {
                  updates.push(mappedUpdate);
                }
              });
            }
          } catch (e2) {
            console.warn('Bloque JSON ignorado:', e2);
          }
        }
      }
    }

    return updates;
  }

  /**
   * Mapea los datos del JSON de F1 al modelo DriverTiming
   * Estructura real: LastLapTime.Value, IntervalToPositionAhead.Value, etc.
   */
  private mapF1DataToDriverTiming(racingNumber: string, f1Data: any): Partial<DriverTiming> | null {
    try {
      // Extraer valores de objetos anidados
      const lastLapTime = f1Data.LastLapTime?.Value ||
        (typeof f1Data.LastLapTime === 'string' ? f1Data.LastLapTime : '');
      const gapToAhead = f1Data.IntervalToPositionAhead?.Value ||
        (typeof f1Data.IntervalToPositionAhead === 'string' ? f1Data.IntervalToPositionAhead : '');
      const gapToLeader = f1Data.GapToLeader || '';

      // Mapeo de campos del JSON de F1 al modelo DriverTiming
      const update: Partial<DriverTiming> = {
        driverCode: f1Data.Driver || f1Data.DriverCode || racingNumber,
        driverName: f1Data.DriverName || f1Data.Name || '',
        lapNumber: f1Data.NumberOfLaps ?? f1Data.Lap ?? f1Data.LapNumber ?? 0,
        lastLapTime: this.formatLapTime(lastLapTime),
        gapToLeader: this.formatGap(gapToLeader),
        gapToAhead: this.formatGap(gapToAhead),
        isPit: f1Data.InPit === true,
        statusColor: this.determineStatusColor(f1Data)
      };

      // Solo actualizar posición si viene en los datos
      // Position: usar Line directamente (es número), o parsear Position si es string
      if (f1Data.Line !== undefined && f1Data.Line !== null) {
        update.position = f1Data.Line;
      } else if (f1Data.Position) {
        const parsedPos = parseInt(f1Data.Position, 10);
        if (!isNaN(parsedPos)) {
          update.position = parsedPos;
        }
      }

      return update;
    } catch (e) {
      console.warn('Error mapeando datos del piloto:', e, f1Data);
      return null;
    }
  }

  /**
   * Formatea el tiempo de vuelta
   */
  private formatLapTime(time: any): string {
    if (!time && time !== 0) return '';

    // Si es un objeto, intentar extraer Value
    if (typeof time === 'object' && time !== null) {
      if (time.Value !== undefined && time.Value !== null) {
        time = time.Value;
      } else {
        return ''; // Si no tiene Value, devolver vacío
      }
    }

    if (typeof time === 'string') {
      return time;
    }

    if (typeof time === 'number') {
      // Convertir milisegundos a formato mm:ss.SSS
      const minutes = Math.floor(time / 60000);
      const seconds = Math.floor((time % 60000) / 1000);
      const milliseconds = time % 1000;
      return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
    }

    return '';
  }

  /**
   * Formatea el gap
   */
  private formatGap(gap: any): string {
    if (!gap && gap !== 0) return '';

    // Si es un objeto, intentar extraer Value
    if (typeof gap === 'object' && gap !== null) {
      if (gap.Value !== undefined && gap.Value !== null) {
        gap = gap.Value;
      } else {
        return ''; // Si no tiene Value, devolver vacío
      }
    }

    if (typeof gap === 'string') {
      // Si ya tiene formato, devolverlo tal cual
      if (gap.startsWith('+') || gap === 'Gap' || gap === 'Leader' || gap === '') {
        return gap;
      }
      // Si es un número como string, agregar +
      if (!isNaN(parseFloat(gap))) {
        return `+${gap}`;
      }
      return gap;
    }

    if (typeof gap === 'number') {
      return gap === 0 ? 'Leader' : `+${gap.toFixed(3)}`;
    }

    return '';
  }

  /**
   * Determina el color de estado basado en los datos de F1
   */
  private determineStatusColor(f1Data: any): 'personal-best' | 'session-best' | 'normal' | 'none' {
    // Verificar si es la mejor vuelta personal (PersonalFastest)
    if (f1Data.LastLapTime?.PersonalFastest === true) {
      return 'personal-best';
    }
    // Verificar si es la mejor vuelta de la sesión (OverallFastest)
    if (f1Data.LastLapTime?.OverallFastest === true) {
      return 'session-best';
    }
    // Verificar en los sectores
    if (f1Data.Sectors) {
      for (const sector of f1Data.Sectors) {
        if (sector.OverallFastest === true) {
          return 'session-best';
        }
        if (sector.PersonalFastest === true) {
          return 'personal-best';
        }
      }
    }
    return 'normal';
  }
}
