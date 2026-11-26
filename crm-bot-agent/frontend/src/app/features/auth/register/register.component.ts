import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { errMsg } from '../../../core/ui/errors';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, CommonModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrls: ['../login/login.component.scss'],
})
export class RegisterComponent {
  name = '';
  email = '';
  password = '';
  companyName = '';
  loading = signal(false);
  error = signal('');

  constructor(private auth: AuthService, private router: Router) {}

  submit() {
    if (this.password.length < 10 || !/\d/.test(this.password) || !/[A-Za-z]/.test(this.password)) {
      this.error.set('La contraseña debe tener al menos 10 caracteres, con letras y números.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.auth
      .register({ name: this.name, email: this.email, password: this.password, companyName: this.companyName })
      .subscribe({
        next: () => this.router.navigate(['/dashboard']),
        error: (err) => {
          this.error.set(errMsg(err, 'No se pudo crear la cuenta'));
          this.loading.set(false);
        },
      });
  }
}
