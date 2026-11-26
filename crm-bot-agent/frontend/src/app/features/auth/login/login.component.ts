import { Component, signal, inject, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { errMsg } from '../../../core/ui/errors';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent {
  public themeService = inject(ThemeService);
  isLight = computed(() => this.themeService.currentTheme() === 'light');

  email = '';
  password = '';
  fullName = '';
  companyName = '';
  phone = '';

  loading = signal(false);
  error = signal('');
  showPassword = signal(false);
  isRegisterMode = signal(false);

  constructor(private auth: AuthService, private router: Router) {}

  toggleTheme() {
    this.themeService.toggleTheme();
  }

  toggleMode(register: boolean) {
    this.isRegisterMode.set(register);
    this.error.set('');
  }

  submit() {
    if (!this.email || !this.password) {
      this.error.set('Por favor completa todos los campos requeridos');
      return;
    }
    this.loading.set(true);
    this.error.set('');

    if (this.isRegisterMode()) {
      this.auth.register({
        name: this.fullName || 'Administrador',
        email: this.email,
        password: this.password,
        companyName: this.companyName || 'Mi Negocio'
      }).subscribe({
        next: () => this.router.navigate(['/dashboard']),
        error: (err) => {
          this.error.set(errMsg(err, 'No se pudo crear la cuenta'));
          this.loading.set(false);
        },
      });
    } else {
      this.auth.login(this.email, this.password).subscribe({
        next: () => this.router.navigate(['/dashboard']),
        error: (err) => {
          this.error.set(errMsg(err, 'Credenciales incorrectas'));
          this.loading.set(false);
        },
      });
    }
  }

  signInWithGoogle() {
    this.email = 'demo@relay.com';
    this.password = 'password123';
    this.submit();
  }
}
