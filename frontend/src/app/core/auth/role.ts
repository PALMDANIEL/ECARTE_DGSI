/** Rôle et société lus dans le jeton d'accès (affichage uniquement : l'API revérifie toujours les droits). */
export function tokenClaims(): { role?: string; companyId?: string; id?: string } {
  try {
    return JSON.parse(atob((localStorage.getItem('accessToken') || '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return {};
  }
}

export const currentRole = (): string | null => tokenClaims().role || null;
export const isAdminRole = (role = currentRole()): boolean => role === 'ADMIN' || role === 'SUPER_ADMIN';
