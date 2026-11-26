import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/** Añade el JWT y, si el backend responde 401 con sesión iniciada, cierra la sesión. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.getToken();
  const isAuthCall = /\/auth\/(login|register)$/.test(req.url);
  const authed = token && !isAuthCall ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(authed).pipe(
    catchError((e: HttpErrorResponse) => {
      if (e.status === 401 && token && !isAuthCall) auth.logout();
      return throwError(() => e);
    }),
  );
};
