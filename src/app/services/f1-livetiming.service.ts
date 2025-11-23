import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, timer, switchMap, of, catchError, startWith, scan } from 'rxjs';
import { map } from 'rxjs/operators';
import { DriverTiming, TyreStint } from '../models/f1-livetiming.model';

@Injectable({
  providedIn: 'root'
})
export class F1LiveTimingService {

  private readonly baseUrl = '/f1-api/static';
  private driverInfoMap = new Map<string, any>();
  private tyreDataMap = new Map<string, TyreStint[]>();
  private hasLoggedDebug = false;

  constructor(private http: HttpClient) { }

  // Métodos existentes (sin cambios)
  getAvailableYears() { /* ... */ }
  getSeason(year: number) { /* ... */ }
  getSessionData<T = any>(sessionPath: string, feedPath: string): Observable<T> {
    return this.http.get<T>(`${this.baseUrl}/${sessionPath}${feedPath}`);
  }

  /**
   * Obtiene el path de la última sesión disponible en 2025
   */
  /**
   * Obtiene el path de la última sesión disponible en 2025 y datos del circuito
   */
  getLatestSessionPath(): Observable<{ path: string, circuitKey: string, year: number }> {
    // const t = new Date().getTime();
    const year = 2025;
    return this.http.get<any>(`${this.baseUrl}/${year}/Index.json`).pipe(
      map(response => {
        if (!response || !response.Meetings || response.Meetings.length === 0) {
          console.error('Respuesta Index.json inválida:', response);
          throw new Error('No se encontraron meetings en 2025');
        }

        console.log(`Encontrados ${response.Meetings.length} meetings.`);

        // Buscar el último meeting que tenga sesiones
        const meetings = response.Meetings;
        let lastSessionPath = '';
        let circuitKey = '';

        // Iterar desde el final para encontrar el más reciente
        // Recorremos los meetings de atrás hacia adelante
        for (let i = meetings.length - 1; i >= 0; i--) {
          const meeting = meetings[i];
          if (meeting.Sessions && meeting.Sessions.length > 0) {
            // Recorremos las sesiones de este meeting de atrás hacia adelante
            // para encontrar la última que tenga un Path válido
            for (let j = meeting.Sessions.length - 1; j >= 0; j--) {
              const session = meeting.Sessions[j];
              if (session.Path) {
                lastSessionPath = session.Path;
                circuitKey = meeting.Circuit?.Key || '';
                console.log(`Última sesión disponible encontrada: ${meeting.Name} - ${session.Name}`, lastSessionPath, circuitKey);
                break;
              }
            }
          }

          // Si ya encontramos una sesión, terminamos la búsqueda
          if (lastSessionPath) {
            break;
          }
        }

        if (!lastSessionPath) {
          throw new Error('No se encontraron sesiones disponibles');
        }

        return { path: lastSessionPath, circuitKey, year };
      }),
      catchError(err => {
        console.error('Error obteniendo la última sesión. Detalles:', err);
        // Fallback a la última sesión conocida (Pre-Season Testing Day 3)
        // Asumimos Bahrain (Circuit Key 63) para testing si falla
        return of({
          path: '2025/2025-02-28_Pre-Season_Testing/2025-02-28_Day_3/',
          circuitKey: '63',
          year: 2025
        });
      })
    );
  }

  /**
   * LIVE TIMING REAL F1 - FUNCIONA CON TimingData.jsonStream
   * Soporta el formato real: timestamp + JSON pegado + múltiples actualizaciones
   */
  getLiveTimingData(sessionPath: string): Observable<DriverTiming[]> {
    const streamPath = 'TimingData.jsonStream';
    const driverListPath = 'DriverList.json';

    // Iniciar el polling de neumáticos en paralelo (sin bloquear el stream principal)
    this.pollTyreData(sessionPath).subscribe();

    // Primero obtener la lista de pilotos
    return this.http.get(`${this.baseUrl}/${sessionPath}${driverListPath}`).pipe(
      catchError(err => {
        console.warn('No se pudo cargar DriverList.json', err);
        return of({});
      }),
      switchMap((driverList: any) => {
        // Procesar y guardar la info de los pilotos
        this.processDriverList(driverList);

        // Iniciar el stream de datos
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
            // console.log('Total actualizaciones encontradas:', updates.length);

            // Calcular el estado final de los pilotos aplicando todas las actualizaciones en orden
            const finalState = this.processUpdatesToState(updates);

            // console.log('Total pilotos en estado final:', finalState.length);
            return finalState;
          }),
          catchError(err => {
            console.error('Error en live timing:', err);
            return of([] as DriverTiming[]);
          })
        );
      })
    );
  }

  /**
   * Obtiene las posiciones de los pilotos en el circuito
   */
  getDriverPositions(sessionPath: string): Observable<any[]> {
    const streamPath = 'Position.z.jsonStream';

    return timer(0, 1000).pipe(
      switchMap(() =>
        this.http.get(`${this.baseUrl}/${sessionPath}${streamPath}`, { responseType: 'text' }).pipe(
          catchError(err => {
            // console.warn('Error polling positions:', err);
            return of('');
          })
        )
      ),
      map((rawStream: string) => {
        if (!rawStream) return [];

        // El stream contiene múltiples objetos JSON concatenados.
        // Nos interesa el último estado válido.
        const lines = rawStream.split('\r\n').filter(line => line.trim() !== '');
        if (lines.length === 0) return [];

        // Parsear la última línea que tenga datos de posición
        // A veces la última línea es solo un timestamp, hay que buscar hacia atrás
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const data = JSON.parse(lines[i]);
            if (data && data.Position) {
              return data.Position;
            }
          } catch (e) {
            // Ignorar líneas malformadas
          }
        }
        return [];
      }),
      map((positions: any[]) => {
        // Mapear a un formato más amigable y mezclar con info del piloto
        return positions.map(pos => {
          const driverInfo = this.driverInfoMap.get(pos.RacingNumber) || {};
          return {
            racingNumber: pos.RacingNumber,
            x: pos.X,
            y: pos.Y,
            z: pos.Z,
            status: pos.Status,
            driverName: driverInfo.BroadcastName || pos.RacingNumber,
            teamColor: driverInfo.TeamColour || 'ffffff',
            tla: driverInfo.Tla || ''
          };
        });
      })
    );
  }

  /**
   * Polling para obtener datos de neumáticos
   */
  private pollTyreData(sessionPath: string): Observable<any> {
    return timer(0, 5000).pipe( // Cada 5 segundos
      switchMap(() => this.http.get<any>(`${this.baseUrl}/${sessionPath}TyreStintSeries.json`)),
      map(response => {
        if (response && response.Stints) {
          Object.keys(response.Stints).forEach(racingNumber => {
            const stints = response.Stints[racingNumber];
            if (Array.isArray(stints) && stints.length > 0) {
              // Guardamos todos los stints
              this.tyreDataMap.set(racingNumber, stints);
            }
          });
        }
      }),
      catchError(err => {
        console.warn('Error obteniendo TyreStintSeries.json', err);
        return of(null);
      })
    );
  }

  private processDriverList(driverList: any) {
    this.driverInfoMap.clear();
    if (driverList) {
      Object.keys(driverList).forEach(key => {
        const driver = driverList[key];
        // Guardar por número de carrera y por TLA si es posible
        this.driverInfoMap.set(driver.RacingNumber, driver);
        this.driverInfoMap.set(driver.Tla, driver);
      });
    }
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
          // Intentar completar datos faltantes desde driverInfoMap
          const driverInfo = this.driverInfoMap.get(key) || this.driverInfoMap.get(update.driverCode || '');

          driverMap.set(key, {
            position: update.position || 0,
            driverCode: key,
            driverName: update.driverName || (driverInfo ? driverInfo.BroadcastName : ''),
            teamName: update.teamName || (driverInfo ? driverInfo.TeamName : ''),
            teamColor: update.teamColor || (driverInfo ? driverInfo.TeamColour : ''),
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

      // Actualizar información de neumáticos si existe
      if (key) {
        const driver = driverMap.get(key);
        if (driver) {
          // Intentar obtener el número de carrera
          let racingNumber = '';
          const info = this.driverInfoMap.get(key);
          if (info) {
            racingNumber = info.RacingNumber;
          } else {
            // Si key ya es un número, usarlo
            if (!isNaN(Number(key))) {
              racingNumber = key;
            }
          }

          if (racingNumber) {
            const tyreInfo = this.tyreDataMap.get(racingNumber);
            if (tyreInfo) {
              driver.tyreHistory = tyreInfo;
            }
          }
        }
      }
    });

    // Convertimos a array y ordenamos por posición
    const result = Array.from(driverMap.values());
    result.sort((a, b) => {
      // Asegurar que undefined se vaya al final, pero permitir 0 si es válido
      const posA = (a.position !== undefined && a.position !== null) ? a.position : 999;
      const posB = (b.position !== undefined && b.position !== null) ? b.position : 999;
      return posA - posB;
    });

    // DEBUG: Loggear los primeros 5 para ver qué está pasando
    if (result.length > 0) {
      console.log('Top 5 drivers:', result.slice(0, 5).map(d => ({
        pos: d.position,
        code: d.driverCode,
        name: d.driverName
      })));
    }

    return result;
  }

  /**
   * Parsea el stream real de F1: múltiples líneas como 00:00:04.219{"Lines":{...}}
   */
  private parseTimingStream(raw: string): Partial<DriverTiming>[] {
    const updates: Partial<DriverTiming>[] = [];

    // Dividir por timestamps (formato: HH:MM:SS.mmm, aceptando 1 o 2 dígitos para la hora)
    const timestampRegex = /(\d{1,2}:\d{2}:\d{2}\.\d{3})/g;
    const parts = raw.split(timestampRegex);

    if (!this.hasLoggedDebug && parts.length > 0) {
      console.log('--- DEBUG START ---');
      console.log('Raw Stream Start (first 200 chars):', raw.substring(0, 200));
      console.log('Split parts count:', parts.length);
    }

    // Procesar cada bloque timestamp + JSON
    for (let i = 1; i < parts.length; i += 2) {
      if (i + 1 >= parts.length) break;

      const jsonPart = parts[i + 1].trim();
      if (!jsonPart.startsWith('{')) continue;

      try {
        // Intentar parsear el JSON completo
        const data = JSON.parse(jsonPart);

        if (!this.hasLoggedDebug && data.Lines) {
          // Buscar si hay alguien con Position 1 o Line 1
          const leader = Object.values(data.Lines).find((d: any) => d.Position === '1' || d.Line === 1);
          if (leader) {
            console.log('Found potential leader in stream:', leader);
          }
        }

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

    if (!this.hasLoggedDebug && parts.length > 0) {
      this.hasLoggedDebug = true;
      console.log('--- DEBUG END ---');
    }

    return updates;
  }

  /**
   * Mapea los datos del JSON de F1 al modelo DriverTiming
   * Estructura real: LastLapTime.Value, IntervalToPositionAhead.Value, etc.
   */
  private mapF1DataToDriverTiming(racingNumber: string, f1Data: any): Partial<DriverTiming> | undefined {
    try {
      // Extraer valores de objetos anidados
      const lastLapTime = f1Data.LastLapTime?.Value ||
        (typeof f1Data.LastLapTime === 'string' ? f1Data.LastLapTime : '');

      // Mapeo de Gaps: F1 usa TimeDiffToPositionAhead y TimeDiffToFastest en el stream
      const gapToAhead = f1Data.TimeDiffToPositionAhead || f1Data.IntervalToPositionAhead?.Value ||
        (typeof f1Data.IntervalToPositionAhead === 'string' ? f1Data.IntervalToPositionAhead : '');

      const gapToLeader = f1Data.TimeDiffToFastest || f1Data.GapToLeader || '';

      // Intentar obtener info estática del piloto
      const driverInfo = this.driverInfoMap.get(racingNumber);

      // Mapeo de campos del JSON de F1 al modelo DriverTiming
      const update: Partial<DriverTiming> = {
        driverCode: f1Data.Driver || f1Data.DriverCode || (driverInfo ? driverInfo.Tla : racingNumber)
      };

      if (driverInfo) {
        if (!update.driverName) update.driverName = driverInfo.BroadcastName;
        if (!update.teamName) update.teamName = driverInfo.TeamName;
        if (!update.teamColor) update.teamColor = driverInfo.TeamColour;
      }

      if (f1Data.DriverName || f1Data.Name) {
        update.driverName = f1Data.DriverName || f1Data.Name;
      }

      if (f1Data.NumberOfLaps !== undefined) {
        update.lapNumber = f1Data.NumberOfLaps;
      }

      if (lastLapTime) {
        update.lastLapTime = this.formatLapTime(lastLapTime);
      }

      if (gapToLeader) {
        update.gapToLeader = this.formatGap(gapToLeader);
      }

      if (gapToAhead) {
        update.gapToAhead = this.formatGap(gapToAhead);
      }

      if (f1Data.InPit !== undefined) {
        update.isPit = f1Data.InPit === true;
      }

      const status = this.determineStatusColor(f1Data);
      if (status !== 'normal') {
        update.statusColor = status;
      }

      // Solo actualizar posición si viene en los datos
      // PRIORIDAD: Position > Line
      if (f1Data.Position) {
        const parsedPos = parseInt(f1Data.Position, 10);
        if (!isNaN(parsedPos)) {
          update.position = parsedPos;
        }
      } else if (f1Data.Line !== undefined && f1Data.Line !== null) {
        // Fix: Usar f1Data.Line en lugar de f1Data.Position que es undefined aquí
        update.position = Number(f1Data.Line);
      }

      return update;
    } catch (e) {
      console.warn('Error mapeando datos del piloto:', e, f1Data);
      return undefined;
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
      // Sectors puede ser Array o Object (diccionario)
      let sectorsList: any[] = [];

      if (Array.isArray(f1Data.Sectors)) {
        sectorsList = f1Data.Sectors;
      } else if (typeof f1Data.Sectors === 'object') {
        sectorsList = Object.values(f1Data.Sectors);
      }

      for (const sector of sectorsList) {
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
