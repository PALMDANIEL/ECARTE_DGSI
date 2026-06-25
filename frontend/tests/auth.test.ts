import { AuthService } from '../src/modules/auth/application/auth.service';

describe('AuthService', () => {
  const authService = new AuthService();

  it('devrait rejeter un login avec mauvais mot de passe', async () => {
    await expect(authService.login('test@test.com', 'wrongpassword'))
      .rejects.toThrow('Identifiants invalides');
  });
});
