import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UiHostComponent } from './core/ui/ui-host.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, UiHostComponent],
  template: '<router-outlet /><app-ui-host />',
})
export class App {}
