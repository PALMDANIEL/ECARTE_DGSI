import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router } from '@angular/router';
import { currentRole } from '../auth/role';

/** Réserve une route aux rôles listés dans `data.roles` ; sinon retour au tableau de bord. */
@Injectable({ providedIn: 'root' })
export class RoleGuard implements CanActivate {
  constructor(private router: Router) {}
  canActivate(route: ActivatedRouteSnapshot): boolean {
    const roles: string[] = route.data['roles'] || [];
    const role = currentRole();
    if (role && roles.includes(role)) return true;
    this.router.navigate(['/dashboard']);
    return false;
  }
}
