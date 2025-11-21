// src/app/models/f1-livetiming.model.ts

export interface F1Year {
  Year: number;
  Path: string;
}

export interface F1IndexResponse {
  Years: F1Year[];
}

export interface F1Session {
  Key: number;
  Type: string;
  Name: string;
  StartDate?: string;
  EndDate?: string;
  Path: string;
}

export interface F1Meeting {
  Key: number;
  Name: string;
  OfficialName?: string;
  Location?: string;
  Country?: {
    Code: string;
    Name: string;
  };
  Circuit?: {
    Key: number;
    ShortName: string;
  };
  Sessions: F1Session[];
}

export interface F1SeasonResponse {
  Year: number;
  Meetings: F1Meeting[];
}

export interface F1SessionFeed {
  KeyFramePath: string;
  StreamPath: string;
}

export interface F1SessionIndex {
  Feeds: {
    [key: string]: F1SessionFeed;
  };
}

export interface SessionGridData {
  meetingName: string;
  location: string;
  country: string;
  sessionType: string;
  sessionName: string;
  startDate?: string;
  path: string;
  meeting: F1Meeting;
}

export interface ChartData {
  type: string;
  count: number;
}
export interface DriverTiming {
  position: any;
  driverCode: string; // Ej: 'VER', 'HAM'
  driverName: string; // Ej: 'Verstappen', 'Hamilton'
  lapNumber: number;
  lastLapTime: string; // Ej: "1:20.555"
  gapToLeader: string; // Ej: "+1.200"
  gapToAhead: string; // Ej: "Gap" o "+0.500"
  isPit: boolean; // Si está en el pit lane
  statusColor: 'personal-best' | 'session-best' | 'normal' | 'none'; // Para resaltar tiempos
  teamName?: string;
  teamColor?: string;
}

export interface DriverInfo {
  RacingNumber: string;
  BroadcastName: string;
  FullName: string;
  Tla: string;
  Line: number;
  TeamName: string;
  TeamColour: string;
  FirstName: string;
  LastName: string;
  Reference: string;
  HeadshotUrl: string;
}