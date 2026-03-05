import { Injectable } from '@angular/core';
import { Role, User } from '../models/user.model';

const LS_USERS = 'hp_users_v1';
const LS_SESSION = 'hp_session_v1';

function uid() {
  return Math.random().toString(16).slice(2) + '-' + Date.now().toString(16);
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

type Session = { userId: string };

@Injectable({ providedIn: 'root' })
export class AuthService {
  private users: User[] = [];
  private session: Session | null = null;

  constructor() {
    this.users = this.loadUsers();
    this.session = this.loadSession();
    this.seedAdminIfNeeded();
  }

  getCurrentUser(): User | null {
    if (!this.session) return null;
    return this.users.find(u => u.id === this.session!.userId) ?? null;
  }

  logout() {
    this.session = null;
    localStorage.removeItem(LS_SESSION);
  }

  async login(email: string, password: string, remember: boolean) {
    email = (email || '').trim().toLowerCase();
    const pass = (password || '').trim();

    const user = this.users.find(u => u.email === email);
    if (!user) throw new Error('Usuario o contraseña incorrectos');

    const hash = await sha256Hex(pass);
    if (hash !== user.passHash) throw new Error('Usuario o contraseña incorrectos');

    this.session = { userId: user.id };
    if (remember) localStorage.setItem(LS_SESSION, JSON.stringify(this.session));
    else localStorage.removeItem(LS_SESSION);
  }

  async register(name: string, email: string, password: string, role: Role) {
    name = (name || '').trim();
    email = (email || '').trim().toLowerCase();
    password = (password || '').trim();

    if (!name || !email || !password) throw new Error('Rellena todos los campos');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email inválido');

    // password fuerte
    const strong = password.length >= 8
      && /[A-Z]/.test(password)
      && /[a-z]/.test(password)
      && /[0-9]/.test(password)
      && /[^A-Za-z0-9]/.test(password);
    if (!strong) throw new Error('Contraseña débil (8+, mayus, minus, número y símbolo)');

    if (this.users.some(u => u.email === email)) throw new Error('Ese email ya existe');

    const user: User = {
      id: uid(),
      name,
      email,
      role,
      passHash: await sha256Hex(password),
      createdAt: Date.now(),
    };

    this.users = [user, ...this.users];
    this.saveUsers();

    // auto-login
    this.session = { userId: user.id };
    localStorage.setItem(LS_SESSION, JSON.stringify(this.session));
  }

  // Demo reset
  async resetDemo() {
    localStorage.removeItem(LS_USERS);
    localStorage.removeItem(LS_SESSION);
    this.users = [];
    this.session = null;
    await this.seedAdminIfNeeded(true);
  }

  // ===== storage =====
  private loadUsers(): User[] {
    try {
      const raw = localStorage.getItem(LS_USERS);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  private saveUsers() {
    localStorage.setItem(LS_USERS, JSON.stringify(this.users));
  }

  private loadSession(): Session | null {
    try {
      const raw = localStorage.getItem(LS_SESSION);
      const s = raw ? JSON.parse(raw) : null;
      if (!s || typeof s !== 'object') return null;
      if (!s.userId) return null;
      return s as Session;
    } catch {
      return null;
    }
  }

  private async seedAdminIfNeeded(force = false) {
    this.users = this.loadUsers();

    const adminEmail = 'admin@demo.com';
    const exists = this.users.some(u => u.email === adminEmail);

    if (!exists || force) {
      const admin: User = {
        id: uid(),
        name: 'Admin Demo',
        email: adminEmail,
        role: 'admin',
        passHash: await sha256Hex('Admin123!'),
        createdAt: Date.now(),
      };

      // si force, dejamos solo admin
      this.users = force ? [admin] : [admin, ...this.users];
      this.saveUsers();
    }
  }
}