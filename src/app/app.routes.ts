import { Routes } from '@angular/router';
import { RegisterComponent } from './register/register.component';
import { LoginComponent } from './login/login.component';
import { F1DashboardComponent } from './f1-dashboard/f1-dashboard.component';

export const routes: Routes = [
  {
    path: '',
    component: RegisterComponent,
    title: 'Registro | Universal Timing',
  },
  {
    path: 'register',
    component: RegisterComponent,
    title: 'Registro | Universal Timing',
  },
  {
    path: 'login',
    component: LoginComponent,
    title: 'Iniciar Sesión | Universal Timing',
  },
  {
    path: 'dashboard',
    component: F1DashboardComponent,
    title: 'F1 Dashboard | Universal Timing',
  },
  {
    path: '**',
    redirectTo: '',
  },
];
