import { Component, inject, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  readonly isSubmitted = signal(false);
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  submit(): void {
    this.isSubmitted.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);

    const { email, password } = this.loginForm.value;

    this.authService
      .login({
        email: email!,
        password: password!,
      })
      .subscribe({
        next: (response) => {
          this.isLoading.set(false);
          // Guardar token en localStorage
          localStorage.setItem('token', response.token);
          localStorage.setItem('user', JSON.stringify(response.user));
          
          this.successMessage.set('¡Inicio de sesión exitoso! Redirigiendo...');
          
          // Redirigir después de 1.5 segundos
          setTimeout(() => {
            this.router.navigate(['/']);
          }, 1500);
        },
        error: (error) => {
          this.isLoading.set(false);
          const message =
            error.error?.message ||
            error.message ||
            'Error al iniciar sesión. Verifica tus credenciales.';
          this.errorMessage.set(message);
        },
      });
  }

  get email() {
    return this.loginForm.get('email');
  }

  get password() {
    return this.loginForm.get('password');
  }
}

