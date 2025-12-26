export { auth as middleware } from '@/auth';

export const config = {
  // Proteger todas las rutas excepto login, api/auth, y archivos estáticos
  matcher: [
    '/((?!login|api/auth|_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$).*)',
  ],
};
