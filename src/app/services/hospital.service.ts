import { Injectable } from '@angular/core';
import { Doctor } from '../models/doctor.model';
import { Patient, MedicalNote } from '../models/patient.model';
import { Appointment, AppointmentStatus } from '../models/appointment.model';

function uid() {
  return Math.random().toString(16).slice(2) + '-' + Date.now().toString(16);
}

type Store = {
  doctors: Doctor[];
  patients: Patient[];
  appointments: Appointment[];
};

@Injectable({ providedIn: 'root' })
export class HospitalService {
  private userId: string | null = null;
  private store: Store = { doctors: [], patients: [], appointments: [] };

  setUser(userId: string) {
    this.userId = userId;
    this.store = this.load();
    if (!this.store.doctors.length && !this.store.patients.length && !this.store.appointments.length) {
      this.seed();
    }
  }

  // ===== Doctors =====
  listDoctors(): Doctor[] {
    return [...this.store.doctors].sort((a, b) => a.name.localeCompare(b.name));
  }

  addDoctor(name: string, specialty: string) {
    const d: Doctor = { id: uid(), name: name.trim(), specialty: specialty.trim(), createdAt: Date.now() };
    this.store.doctors = [d, ...this.store.doctors];
    this.save();
  }

  removeDoctor(id: string) {
    this.store.doctors = this.store.doctors.filter(d => d.id !== id);
    // no borramos citas automáticamente, pero marcamos doctorId como '' si hiciera falta
    this.store.appointments = this.store.appointments.map(a => a.doctorId === id ? { ...a, doctorId: '' } : a);
    this.save();
  }

  // ===== Patients =====
  listPatients(): Patient[] {
    return [...this.store.patients].sort((a, b) => b.createdAt - a.createdAt);
  }

  addPatient(input: Omit<Patient, 'id' | 'createdAt' | 'history'>) {
    const p: Patient = { ...input, id: uid(), createdAt: Date.now(), history: [] };
    this.store.patients = [p, ...this.store.patients];
    this.save();
  }

  updatePatient(id: string, patch: Partial<Omit<Patient, 'id' | 'createdAt'>>) {
    this.store.patients = this.store.patients.map(p => p.id === id ? { ...p, ...patch } : p);
    this.save();
  }

  removePatient(id: string) {
    this.store.patients = this.store.patients.filter(p => p.id !== id);
    this.store.appointments = this.store.appointments.filter(a => a.patientId !== id);
    this.save();
  }

  addMedicalNote(patientId: string, title: string, detail: string, dateISO: string) {
    const note: MedicalNote = { id: uid(), title: title.trim(), detail: detail.trim(), dateISO };
    this.store.patients = this.store.patients.map(p => {
      if (p.id !== patientId) return p;
      return { ...p, history: [note, ...(p.history || [])] };
    });
    this.save();
  }

  // ===== Appointments =====
  listAppointments(): Appointment[] {
    return [...this.store.appointments].sort((a, b) => b.dateTime.localeCompare(a.dateTime));
  }

  addAppointment(input: Omit<Appointment, 'id' | 'createdAt'>) {
    const doctorId = input.doctorId;
    const dt = input.dateTime;

    const collision = this.store.appointments.some(a =>
      a.status !== 'cancelada' &&
      a.doctorId === doctorId &&
      a.dateTime === dt
    );
    if (collision) throw new Error('Colisión: ese doctor ya tiene cita a esa hora');

    const a: Appointment = { ...input, id: uid(), createdAt: Date.now() };
    this.store.appointments = [a, ...this.store.appointments];
    this.save();
  }

  moveAppointment(id: string, newDateTime: string) {
    const ap = this.store.appointments.find(a => a.id === id);
    if (!ap) return;

    const collision = this.store.appointments.some(a =>
      a.id !== id &&
      a.status !== 'cancelada' &&
      a.doctorId === ap.doctorId &&
      a.dateTime === newDateTime
    );
    if (collision) throw new Error('Colisión al mover: doctor ocupado');

    this.store.appointments = this.store.appointments.map(a => a.id === id ? { ...a, dateTime: newDateTime } : a);
    this.save();
  }

  updateAppointmentStatus(id: string, status: AppointmentStatus) {
    this.store.appointments = this.store.appointments.map(a => a.id === id ? { ...a, status } : a);
    this.save();
  }

  removeAppointment(id: string) {
    this.store.appointments = this.store.appointments.filter(a => a.id !== id);
    this.save();
  }

  // ===== Export =====
  exportJSON(): string {
    return JSON.stringify(this.store, null, 2);
  }

  importJSON(json: string) {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') throw new Error('JSON inválido');
    if (!Array.isArray(parsed.doctors) || !Array.isArray(parsed.patients) || !Array.isArray(parsed.appointments)) {
      throw new Error('Estructura inválida');
    }
    this.store = { doctors: parsed.doctors, patients: parsed.patients, appointments: parsed.appointments };
    this.save();
  }

  exportAppointmentsCSV(getPatientName: (id: string) => string, getDoctorName: (id: string) => string): string {
    const header = ['id','patient','doctor','dateTime','status','reason','createdAt'].join(',');
    const rows = this.store.appointments.map(a => [
      a.id,
      this.csv(getPatientName(a.patientId)),
      this.csv(getDoctorName(a.doctorId)),
      a.dateTime,
      a.status,
      this.csv(a.reason || ''),
      String(a.createdAt)
    ].join(','));
    return [header, ...rows].join('\n');
  }

  private csv(s: string) {
    const t = String(s).replaceAll('"', '""');
    return `"${t}"`;
  }

  // ===== Storage =====
  private key() {
    if (!this.userId) throw new Error('No user');
    return `hp_store_v3_${this.userId}`;
  }

  private load(): Store {
    try {
      const raw = localStorage.getItem(this.key());
      if (!raw) return { doctors: [], patients: [], appointments: [] };
      const p = JSON.parse(raw);
      return {
        doctors: Array.isArray(p.doctors) ? p.doctors : [],
        patients: Array.isArray(p.patients) ? p.patients : [],
        appointments: Array.isArray(p.appointments) ? p.appointments : [],
      };
    } catch {
      return { doctors: [], patients: [], appointments: [] };
    }
  }

  private save() {
    localStorage.setItem(this.key(), JSON.stringify(this.store));
  }

  private seed() {
    const d1: Doctor = { id: uid(), name: 'Dra. Ruiz', specialty: 'Medicina General', createdAt: Date.now() - 500000 };
    const d2: Doctor = { id: uid(), name: 'Dr. Martín', specialty: 'Traumatología', createdAt: Date.now() - 450000 };

    const p1: Patient = {
      id: uid(),
      name: 'Ana Gómez',
      dob: '1992-04-12',
      phone: '600123123',
      email: 'ana@example.com',
      photoUrl: '',
      allergies: 'Polen',
      notes: 'Paciente estable',
      createdAt: Date.now() - 400000,
      history: [{ id: uid(), dateISO: '2026-02-10', title: 'Revisión', detail: 'Sin incidencias.' }]
    };

    const p2: Patient = {
      id: uid(),
      name: 'Carlos Pérez',
      dob: '1985-11-03',
      phone: '699555444',
      email: 'carlos@example.com',
      photoUrl: '',
      allergies: '',
      notes: 'Hipertensión controlada',
      createdAt: Date.now() - 390000,
      history: [{ id: uid(), dateISO: '2026-01-18', title: 'Analítica', detail: 'Valores correctos.' }]
    };

    const next = (h: number) => {
      const d = new Date();
      d.setHours(d.getHours() + h, 0, 0, 0);
      return d.toISOString().slice(0, 16);
    };

    const a1: Appointment = {
        id: uid(), patientId: p1.id, doctorId: d1.id, dateTime: next(2), reason: 'Revisión', status: 'programada', createdAt: Date.now() - 200000,
        doctor: ''
    };
    const a2: Appointment = {
        id: uid(), patientId: p2.id, doctorId: d2.id, dateTime: next(5), reason: 'Dolor lumbar', status: 'programada', createdAt: Date.now() - 180000,
        doctor: ''
    };

    this.store = { doctors: [d1, d2], patients: [p1, p2], appointments: [a1, a2] };
    this.save();
  }
}