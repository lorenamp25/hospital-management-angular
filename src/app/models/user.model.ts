export type Role = 'admin' | 'recepcion' | 'doctor';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  passHash: string;
  createdAt: number;
}