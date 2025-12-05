// src/app/services/f1-livetiming-stream.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import * as pako from 'pako';
import { DriverTiming, DriverInfo, TyreStint } from '../models/f1-livetiming.model';

interface SignalRMessage {
  M?: Array<{ M: string; A: any[] }>;
  R?: any;
  I?: string;
}

interface LiveTimingState {
  TimingData?: {
    Lines?: {
      [driverNumber: string]: {
        Position?: string;
        RacingNumber?: string;
        Line?: number;
        Retired?: boolean;
        InPit?: boolean;
        PitOut?: boolean;
        Stopped?: boolean;
        Status?: number;
        LastLapTime?: {
          Value?: string;
          PersonalFastest?: boolean;
          OverallFastest?: boolean;
        };
        BestLapTime?: {
          Value?: string;
        };
        NumberOfLaps?: number;
        GapToLeader?: string;
        IntervalToPositionAhead?: {
          Value?: string;
        };
      };
    };
  };
  DriverList?: {
    [driverNumber: string]: {
      RacingNumber?: string;
      BroadcastName?: string;
      FullName?: string;
      Tla?: string;
      Line?: number;
      TeamName?: string;
      TeamColour?: string;
      FirstName?: string;
      LastName?: string;
      Reference?: string;
      HeadshotUrl?: string;
    };
  };
  TimingAppData?: {
    Lines?: {
      [driverNumber: string]: {
        Stints?: TyreStint[];
      };
    };
  };
  Position?: {
    Position?: {
      [driverNumber: string]: {
        X?: number;
        Y?: number;
        Z?: number;
      };
    };
  };
  CarData?: any;
  SessionInfo?: any;
  SessionData?: any;
  TrackStatus?: any;
  WeatherData?: any;
  RaceControlMessages?: any;
  TeamRadio?: any;
  ExtrapolatedClock?: any;
  LapCount?: any;
  Heartbeat?: any;
}

@Injectable({
  providedIn: 'root'
})
export class F1LiveTimingStreamService {
  private readonly SIGNALR_HUB = 'Streaming';
  private readonly RETRY_FREQ = 10000;

  private ws: WebSocket | null = null;
  private liveState = new BehaviorSubject<LiveTimingState>({});
  private messageCount = 0;
  private emptyMessageCount = 0;
  private reconnectTimeout: any;

  // Observables públicos
  public state$: Observable<LiveTimingState> = this.liveState.asObservable();
  
  constructor() {}

  async connect(): Promise<void> {
    console.log('[F1 Stream] Connecting to live timing stream via proxy');

    const hub = encodeURIComponent(JSON.stringify([{ name: this.SIGNALR_HUB }]));
    
    try {
      // Usar el proxy configurado en Angular
      const negotiation = await fetch(
        `/f1-api/signalr/negotiate?connectionData=${hub}&clientProtocol=1.5`
      );

      const cookie = negotiation.headers.get('Set-Cookie') ?? negotiation.headers.get('set-cookie');
      const data = await negotiation.json();
      const connectionToken = data.ConnectionToken;

      if (connectionToken) {
        console.log('[F1 Stream] HTTP negotiation complete');
        this.setupWebSocket(connectionToken, hub);
      } else {
        console.log('[F1 Stream] HTTP negotiation failed. Is there a live session?');
        this.scheduleReconnect();
      }
    } catch (error) {
      console.error('[F1 Stream] Negotiation error:', error);
      this.scheduleReconnect();
    }
  }

  private setupWebSocket(connectionToken: string, hub: string): void {
    // Construir URL del WebSocket usando el proxy y protocolo actual
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host; // localhost:4200 en desarrollo
    
    const wsUrl = `${protocol}//${host}/f1-api/signalr/connect?clientProtocol=1.5&transport=webSockets&connectionToken=${encodeURIComponent(
      connectionToken
    )}&connectionData=${hub}`;

    console.log('[F1 Stream] Connecting to WebSocket:', wsUrl);
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('[F1 Stream] WebSocket open');
      this.resetState();

      const subscribeMessage = {
        H: this.SIGNALR_HUB,
        M: 'Subscribe',
        A: [[
          'Heartbeat',
          'CarData.z',
          'Position.z',
          'ExtrapolatedClock',
          'TimingStats',
          'TimingAppData',
          'WeatherData',
          'TrackStatus',
          'DriverList',
          'RaceControlMessages',
          'SessionInfo',
          'SessionData',
          'LapCount',
          'TimingData',
          'TeamRadio'
        ]],
        I: 1
      };

      this.ws?.send(JSON.stringify(subscribeMessage));
    };

    this.ws.onmessage = (event) => {
      this.updateState(event.data);
    };

    this.ws.onerror = (error) => {
      console.error('[F1 Stream] WebSocket error:', error);
      this.ws?.close();
    };

    this.ws.onclose = () => {
      console.log('[F1 Stream] WebSocket closed');
      this.resetState();
      this.scheduleReconnect();
    };
  }

  private updateState(data: string): void {
    try {
      const parsed: SignalRMessage = JSON.parse(data);

      if (!Object.keys(parsed).length) {
        this.emptyMessageCount++;
      } else {
        this.emptyMessageCount = 0;
      }

      // Reset state after too many empty messages
      if (this.emptyMessageCount > 5) {
        this.resetState();
        return;
      }

      // Handle feed messages
      if (Array.isArray(parsed.M)) {
        for (const message of parsed.M) {
          if (message.M === 'feed') {
            this.messageCount++;
            let [field, value] = message.A;

            // Decompress if needed
            if (field === 'CarData.z' || field === 'Position.z') {
              const [parsedField] = field.split('.');
              field = parsedField;
              value = this.parseCompressed(value);
            }

            const currentState = this.liveState.value;
            const newState = this.deepObjectMerge(currentState, { [field]: value });
            this.liveState.next(newState);
          }
        }
      }
      // Handle initial response
      else if (Object.keys(parsed.R ?? {}).length && parsed.I === '1') {
        this.messageCount++;
        
        if (parsed.R['CarData.z']) {
          parsed.R['CarData'] = this.parseCompressed(parsed.R['CarData.z']);
        }
        if (parsed.R['Position.z']) {
          parsed.R['Position'] = this.parseCompressed(parsed.R['Position.z']);
        }

        const currentState = this.liveState.value;
        const newState = this.deepObjectMerge(currentState, parsed.R);
        this.liveState.next(newState);
      }
    } catch (e) {
      console.error(`[F1 Stream] Could not update data: ${e}`);
    }
  }

  private parseCompressed(data: string): any {
    try {
      const buffer = Uint8Array.from(atob(data), c => c.charCodeAt(0));
      const inflated = pako.inflateRaw(buffer, { to: 'string' });
      return JSON.parse(inflated);
    } catch (e) {
      console.error('[F1 Stream] Error decompressing data:', e);
      return {};
    }
  }

  private deepObjectMerge(original: any = {}, modifier: any): any {
    if (!modifier) return original;

    const copy = { ...original };

    for (const [key, value] of Object.entries(modifier)) {
      const valueIsObject =
        typeof value === 'object' && !Array.isArray(value) && value !== null;

      if (valueIsObject && Object.keys(value).length) {
        copy[key] = this.deepObjectMerge(copy[key], value);
      } else {
        copy[key] = value;
      }
    }

    return copy;
  }

  // Métodos públicos para obtener datos tipados
  getDriversInfo(): DriverInfo[] {
    const state = this.liveState.value;
    if (!state.DriverList) return [];

    return Object.values(state.DriverList).map(driver => ({
      RacingNumber: driver.RacingNumber || '',
      BroadcastName: driver.BroadcastName || '',
      FullName: driver.FullName || '',
      Tla: driver.Tla || '',
      Line: driver.Line || 0,
      TeamName: driver.TeamName || '',
      TeamColour: driver.TeamColour || '',
      FirstName: driver.FirstName || '',
      LastName: driver.LastName || '',
      Reference: driver.Reference || '',
      HeadshotUrl: driver.HeadshotUrl || ''
    }));
  }

  getDriversTiming(): DriverTiming[] {
    const state = this.liveState.value;
    if (!state.TimingData?.Lines || !state.DriverList) return [];

    const timingLines = state.TimingData.Lines;
    const driverList = state.DriverList;
    const tyreData = state.TimingAppData?.Lines || {};

    return Object.entries(timingLines).map(([driverNumber, timing]) => {
      const driverInfo = driverList[driverNumber];
      const tyreInfo = tyreData[driverNumber];

      return {
        position: timing.Position || timing.Line,
        driverCode: driverInfo?.Tla || '',
        driverName: driverInfo?.LastName || driverInfo?.BroadcastName || '',
        lapNumber: timing.NumberOfLaps || 0,
        lastLapTime: timing.LastLapTime?.Value || '--',
        gapToLeader: timing.GapToLeader || (timing.Position === '1' ? '--' : ''),
        gapToAhead: timing.IntervalToPositionAhead?.Value || 'Gap',
        isPit: timing.InPit || timing.PitOut || false,
        statusColor: this.getStatusColor(timing),
        teamName: driverInfo?.TeamName,
        teamColor: driverInfo?.TeamColour ? `#${driverInfo.TeamColour}` : undefined,
        tyreHistory: tyreInfo?.Stints || []
      };
    }).sort((a, b) => {
      const posA = this.parsePosition(a.position);
      const posB = this.parsePosition(b.position);
      return posA - posB;
    });
  }

  private parsePosition(position: any): number {
    if (typeof position === 'number') return position;
    if (typeof position === 'string') return parseInt(position, 10) || 999;
    return 999;
  }

  private getStatusColor(timing: any): 'personal-best' | 'session-best' | 'normal' | 'none' {
    if (timing.LastLapTime?.OverallFastest) return 'session-best';
    if (timing.LastLapTime?.PersonalFastest) return 'personal-best';
    if (timing.LastLapTime?.Value) return 'normal';
    return 'none';
  }

  getCurrentState(): LiveTimingState {
    return this.liveState.value;
  }

  private resetState(): void {
    this.liveState.next({});
    this.messageCount = 0;
    this.emptyMessageCount = 0;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, this.RETRY_FREQ);
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.resetState();
  }
}
