import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../config/api.config';

export interface RegisterInput {
  email: string;
  name: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface User {
  id: number;
  email: string;
  name: string;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);

  register(data: RegisterInput): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(
      `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.auth.register}`,
      data
    );
  }

  login(data: LoginInput): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(
      `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.auth.login}`,
      data
    );
  }
}

