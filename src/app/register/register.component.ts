import { Component, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';

const passwordMatchValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const password = control.get('password')?.value;
  const confirm = control.get('confirmPassword')?.value;

  if (!password || !confirm) {
    return null;
  }

  return password !== confirm ? { passwordMismatch: true } : null;
};

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly registrationForm = this.fb.group(
    {
      fullName: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
      acceptTerms: [false, [Validators.requiredTrue]],
    },
    { validators: passwordMatchValidator },
  );

  readonly isSubmitted = signal(false);
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  readonly passwordMismatch = computed(() => {
    const confirmTouched = this.confirmPassword?.touched;
    return (
      this.registrationForm.hasError('passwordMismatch') &&
      (confirmTouched || this.isSubmitted())
    );
  });

  submit(): void {
    this.isSubmitted.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    if (this.registrationForm.invalid) {
      this.registrationForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);

    const { fullName, email, password } = this.registrationForm.value;

    this.authService
      .register({
        name: fullName!,
        email: email!,
        password: password!,
      })
      .subscribe({
        next: (response) => {
          this.isLoading.set(false);
          // Guardar token en localStorage
          localStorage.setItem('token', response.token);
          localStorage.setItem('user', JSON.stringify(response.user));
          
          this.successMessage.set('¡Cuenta creada exitosamente! Redirigiendo...');
          
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
            'Error al crear la cuenta. Por favor, intenta de nuevo.';
          this.errorMessage.set(message);
        },
      });
  }

  get fullName() {
    return this.registrationForm.get('fullName');
  }

  get email() {
    return this.registrationForm.get('email');
  }

  get password() {
    return this.registrationForm.get('password');
  }

  get confirmPassword() {
    return this.registrationForm.get('confirmPassword');
  }
}

