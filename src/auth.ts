import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { query, queryOne } from '@/lib/db';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
    // Credentials provider para login con email/password
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }
        
        const email = credentials.email as string;
        const password = credentials.password as string;
        
        // Buscar usuario por email
        const user = await queryOne<{
          id: string;
          email: string;
          password_hash: string;
          display_name: string | null;
        }>(
          'SELECT id, email, password_hash, display_name FROM users WHERE email = $1',
          [email.toLowerCase()]
        );
        
        if (!user) {
          return null;
        }
        
        // Verificar password (usando bcrypt en producción)
        // Por ahora comparación simple - implementar bcrypt después
        const isValid = user.password_hash === password; // TODO: usar bcrypt
        
        if (!isValid) {
          return null;
        }
        
        return {
          id: user.id,
          email: user.email,
          name: user.display_name,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      
      try {
        // Verificar si el usuario existe
        const existingUser = await queryOne<{ id: string }>(
          'SELECT id FROM users WHERE email = $1',
          [user.email.toLowerCase()]
        );
        
        if (!existingUser) {
          // Crear nuevo usuario
          await query(
            `INSERT INTO users (id, email, display_name, created_at)
             VALUES (gen_random_uuid(), $1, $2, NOW())
             ON CONFLICT (email) DO NOTHING`,
            [user.email.toLowerCase(), user.name ?? null]
          );
        }
        
        return true;
      } catch (error) {
        console.error('Error in signIn callback:', error);
        return false;
      }
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        // Obtener ID del usuario de la BD
        const dbUser = await queryOne<{ id: string }>(
          'SELECT id FROM users WHERE email = $1',
          [session.user.email?.toLowerCase()]
        );
        
        if (dbUser) {
          session.user.id = dbUser.id;
        }
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  trustHost: true,
});

// Tipos extendidos para la sesión
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
    };
  }
}
