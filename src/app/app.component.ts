import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AuthService } from './services/auth.service';
import { HospitalService } from './services/hospital.service';

import { User, Role } from './models/user.model';
import { Doctor } from './models/doctor.model';
import { Patient } from './models/patient.model';
import { Appointment, AppointmentStatus } from './models/appointment.model';

type View = 'dashboard' | 'patients' | 'doctors' | 'appointments' | 'calendar';

const STATUSES: AppointmentStatus[] = ['programada', 'en_curso', 'finalizada', 'cancelada'];

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function startOfWeek(d: Date) { // Monday
  const x = new Date(d);
  const day = x.getDay(); // 0 Sun
  const diff = (day === 0 ? -6 : 1) - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function pad2(n: number) { return String(n).padStart(2, '0'); }

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent {
  // theme
  theme = signal<'light' | 'dark'>((localStorage.getItem('hp_theme') as any) || 'dark');
  

  // auth
  user = signal<User | null>(null);

  loginEmail = '';
  loginPass = '';
  remember = true;

  regName = '';
  regEmail = '';
  regPass = '';
  regRole: Role = 'recepcion';

  // ui
  view = signal<View>('dashboard');
  toastMsg = signal<string | null>(null);

  // data
  doctors = signal<Doctor[]>([]);
  patients = signal<Patient[]>([]);
  appointments = signal<Appointment[]>([]);
  statuses = STATUSES;

  // filters
  q = signal('');
  statusFilter = signal<'todas' | AppointmentStatus>('todas');
  doctorFilter = signal<string>(''); // doctorId
  onlyToday = signal(false);

  // modals
  patientModal = signal<Patient | null>(null);
  apptModal = signal<Appointment | null>(null);

  // forms: doctor
  newDoctorName = '';
  newDoctorSpec = '';

  // forms: patient
  pName = ''; pDob = ''; pPhone = ''; pEmail = ''; pPhotoUrl = ''; pAllergies = ''; pNotes = '';

  // forms: medical note
  noteTitle = ''; noteDetail = ''; noteDate = todayISO();

  // forms: appointment
  aPatientId = '';
  aDoctorId = '';
  aDateTime = new Date().toISOString().slice(0, 16);
  aReason = '';
  aStatus: AppointmentStatus = 'programada';

  // calendar
  weekStart = signal<Date>(startOfWeek(new Date()));
  hours = Array.from({ length: 11 }, (_, i) => 8 + i); // 8..18
  draggingId = signal<string | null>(null);

  constructor(private auth: AuthService, private hospital: HospitalService) {
    this.applyTheme();
    this.bootstrapSession();
  }

  // ====== theme ======
  toggleTheme() {
    const next = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    localStorage.setItem('hp_theme', next);
    this.applyTheme();
    this.toast(next === 'dark' ? 'Modo oscuro ✅' : 'Modo claro ✅');
  }
  private applyTheme() {
   const t = this.theme();
  document.documentElement.setAttribute('data-theme', t);
  document.body.setAttribute('data-theme', t); // 👈 añade esto
  document.documentElement.style.colorScheme = t; 
  }

  // ====== toast ======
  toast(msg: string) {
    this.toastMsg.set(msg);
    setTimeout(() => this.toastMsg.set(null), 2200);
  }

  // ====== session ======
  bootstrapSession() {
    const u = this.auth.getCurrentUser();
    if (!u) return;
    this.user.set(u);
    this.hospital.setUser(u.id);
    this.refresh();
    this.toast(`Hola, ${u.name} 👋`);
  }

  async resetDemo() {
    await this.auth.resetDemo();
    this.user.set(null);
    this.toast('Demo reseteada ✅');
  }

  async login() {
    try {
      await this.auth.login(this.loginEmail, this.loginPass, this.remember);
      const u = this.auth.getCurrentUser();
      if (!u) throw new Error('No session');
      this.user.set(u);
      this.hospital.setUser(u.id);
      this.refresh();
      this.loginPass = '';
      this.toast('Login OK ✅');
    } catch (e: any) {
      this.toast(e?.message || 'Login incorrecto');
    }
  }

  async register() {
    try {
      await this.auth.register(this.regName, this.regEmail, this.regPass, this.regRole);
      const u = this.auth.getCurrentUser();
      if (!u) throw new Error('No session');
      this.user.set(u);
      this.hospital.setUser(u.id);
      this.refresh();
      this.regPass = '';
      this.toast('Cuenta creada ✅');
    } catch (e: any) {
      this.toast(e?.message || 'No se pudo registrar');
    }
  }

  logout() {
    this.auth.logout();
    this.user.set(null);
    this.doctors.set([]); this.patients.set([]); this.appointments.set([]);
    this.toast('Sesión cerrada');
  }

  // ====== permissions ======
  canManageDoctors = computed(() => this.user()?.role === 'admin');
  canEditPatients = computed(() => {
    const r = this.user()?.role;
    return r === 'admin' || r === 'recepcion';
  });
  canEditAppointments = computed(() => {
    const r = this.user()?.role;
    return r === 'admin' || r === 'recepcion' || r === 'doctor';
  });

  // ====== data refresh ======
  refresh() {
    this.doctors.set(this.hospital.listDoctors());
    this.patients.set(this.hospital.listPatients());
    this.appointments.set(this.hospital.listAppointments());

    if (!this.aPatientId && this.patients().length) this.aPatientId = this.patients()[0].id;
    if (!this.aDoctorId && this.doctors().length) this.aDoctorId = this.doctors()[0].id;
  }

  // ====== lookup ======
  doctorName = computed(() => {
    const map = new Map(this.doctors().map(d => [d.id, d.name] as const));
    return (id: string) => map.get(id) ?? '(sin doctor)';
  });

  patientName = computed(() => {
    const map = new Map(this.patients().map(p => [p.id, p.name] as const));
    return (id: string) => map.get(id) ?? '(paciente)';
  });

  // ====== filtered views ======
  visibleAppointments = computed(() => {
    const u = this.user();
    let list = [...this.appointments()];

    // doctor role: solo sus citas (por “match” con su nombre en doctores si el usuario se llama igual)
    if (u?.role === 'doctor') {
      // opción: el doctor ve todas, pero filtramos por nombre si existe doctor con el mismo nombre que el user
      const myDoc = this.doctors().find(d => d.name.trim().toLowerCase() === u.name.trim().toLowerCase());
      if (myDoc) list = list.filter(a => a.doctorId === myDoc.id);
    }

    const t = this.q().trim().toLowerCase();
    const sf = this.statusFilter();
    const df = this.doctorFilter();
    const onlyToday = this.onlyToday();
    const today = todayISO();

    list = list.filter(a => {
      const p = this.patientName()(a.patientId).toLowerCase();
      const d = this.doctorName()(a.doctorId).toLowerCase();
      const okQ = !t || p.includes(t) || d.includes(t) || (a.reason || '').toLowerCase().includes(t);
      const okS = sf === 'todas' ? true : a.status === sf;
      const okD = !df ? true : a.doctorId === df;
      const okT = onlyToday ? a.dateTime.slice(0, 10) === today : true;
      return okQ && okS && okD && okT;
    });

    // order by date
    list.sort((a, b) => a.dateTime.localeCompare(b.dateTime));
    return list;
  });

  visiblePatients = computed(() => {
    const t = this.q().trim().toLowerCase();
    if (!t) return this.patients();
    return this.patients().filter(p =>
      p.name.toLowerCase().includes(t) ||
      p.phone.toLowerCase().includes(t) ||
      p.email.toLowerCase().includes(t) ||
      p.notes.toLowerCase().includes(t) ||
      p.allergies.toLowerCase().includes(t)
    );
  });

  kpis = computed(() => {
    const list = this.visibleAppointments();
    const total = list.length;
    const prog = list.filter(a => a.status === 'programada').length;
    const enc = list.filter(a => a.status === 'en_curso').length;
    const fin = list.filter(a => a.status === 'finalizada').length;
    const can = list.filter(a => a.status === 'cancelada').length;
    const todayCount = this.visibleAppointments().filter(a => a.dateTime.slice(0,10) === todayISO()).length;
    return { total, prog, enc, fin, can, todayCount };
  });

  nextAppointments = computed(() => {
    const now = new Date();
    return this.visibleAppointments()
      .filter(a => new Date(a.dateTime) >= now && a.status !== 'cancelada')
      .slice(0, 6);
  });

  // ===== doctors =====
  addDoctor() {
    if (!this.canManageDoctors()) return this.toast('Solo admin');
    if (!this.newDoctorName.trim() || !this.newDoctorSpec.trim()) return this.toast('Nombre y especialidad');
    this.hospital.addDoctor(this.newDoctorName, this.newDoctorSpec);
    this.newDoctorName = ''; this.newDoctorSpec = '';
    this.refresh();
    this.toast('Doctor creado ✅');
  }

  removeDoctor(id: string) {
    if (!this.canManageDoctors()) return this.toast('Solo admin');
    if (!confirm('¿Eliminar doctor?')) return;
    this.hospital.removeDoctor(id);
    this.refresh();
    this.toast('Doctor eliminado');
  }

  // ===== patients =====
  addPatient() {
    if (!this.canEditPatients()) return this.toast('Sin permisos');
    if (!this.pName.trim() || !this.pDob) return this.toast('Nombre y DOB obligatorios');
    this.hospital.addPatient({
      name: this.pName.trim(),
      dob: this.pDob,
      phone: this.pPhone.trim(),
      email: this.pEmail.trim(),
      photoUrl: this.pPhotoUrl.trim(),
      allergies: this.pAllergies.trim(),
      notes: this.pNotes.trim(),
    });
    this.pName=''; this.pDob=''; this.pPhone=''; this.pEmail=''; this.pPhotoUrl=''; this.pAllergies=''; this.pNotes='';
    this.refresh();
    this.toast('Paciente creado ✅');
  }

  openPatient(p: Patient) {
    this.patientModal.set(p);
    this.noteTitle = ''; this.noteDetail = ''; this.noteDate = todayISO();
  }
  closePatient() { this.patientModal.set(null); }

  removePatient(id: string) {
    if (!this.canEditPatients()) return this.toast('Sin permisos');
    if (!confirm('¿Eliminar paciente y sus citas?')) return;
    this.hospital.removePatient(id);
    this.closePatient();
    this.refresh();
    this.toast('Paciente eliminado');
  }

  addNote(patientId: string) {
    if (!this.canEditPatients()) return this.toast('Sin permisos');
    if (!this.noteTitle.trim() || !this.noteDetail.trim() || !this.noteDate) return this.toast('Completa la nota');
    this.hospital.addMedicalNote(patientId, this.noteTitle, this.noteDetail, this.noteDate);
    const updated = this.hospital.listPatients().find(p => p.id === patientId) || null;
    this.patients.set(this.hospital.listPatients());
    this.patientModal.set(updated);
    this.noteTitle=''; this.noteDetail=''; this.noteDate=todayISO();
    this.toast('Nota añadida ✅');
  }

  // ===== appointments =====
  addAppointment() {
    if (!this.canEditAppointments()) return this.toast('Sin permisos');
    if (!this.aPatientId || !this.aDoctorId || !this.aDateTime) return this.toast('Paciente/doctor/fecha obligatorios');
    try {
      this.hospital.addAppointment({
        patientId: this.aPatientId,
        doctorId: this.aDoctorId,
        dateTime: this.aDateTime,
        reason: this.aReason.trim(),
        status: this.aStatus,
        doctor: ''
      });
      this.aReason=''; this.aStatus='programada';
      this.refresh();
      this.toast('Cita creada ✅');
    } catch (e: any) {
      this.toast(e?.message || 'Error creando cita');
    }
  }

  openAppt(a: Appointment) { this.apptModal.set(a); }
  closeAppt() { this.apptModal.set(null); }

  setStatus(id: string, s: AppointmentStatus) {
    if (!this.canEditAppointments()) return this.toast('Sin permisos');
    this.hospital.updateAppointmentStatus(id, s);
    this.refresh();
    this.toast('Estado actualizado');
  }

  removeAppt(id: string) {
    if (!this.canEditAppointments()) return this.toast('Sin permisos');
    if (!confirm('¿Eliminar cita?')) return;
    this.hospital.removeAppointment(id);
    this.closeAppt();
    this.refresh();
    this.toast('Cita eliminada');
  }

  // ===== exports =====
  exportJSON() {
    const json = this.hospital.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hospital-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.toast('Export JSON ✅');
  }

  importJSON(ev: Event) {
    if (this.user()?.role !== 'admin') return this.toast('Solo admin');
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        this.hospital.importJSON(String(r.result || ''));
        this.refresh();
        this.toast('Import OK ✅');
      } catch {
        this.toast('JSON inválido ❌');
      }
    };
    r.readAsText(f);
    input.value = '';
  }

  exportCSV() {
    const csv = this.hospital.exportAppointmentsCSV(this.patientName(), this.doctorName());
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `citas-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.toast('Export CSV ✅');
  }

  exportPDF() {
    // simple: impresión del navegador (queda bien con CSS)
    window.print();
  }

  // ===== calendar =====
  weekDays = computed(() => Array.from({ length: 7 }, (_, i) => addDays(this.weekStart(), i)));
  weekLabel = computed(() => {
    const s = this.weekStart();
    const e = addDays(s, 6);
    return `${s.toISOString().slice(0,10)} → ${e.toISOString().slice(0,10)}`;
  });

  prevWeek() { this.weekStart.set(addDays(this.weekStart(), -7)); }
  nextWeek() { this.weekStart.set(addDays(this.weekStart(), 7)); }
  thisWeek() { this.weekStart.set(startOfWeek(new Date())); }

  fmtDay(d: Date) {
    return d.toLocaleDateString('es-ES', { weekday:'short', day:'2-digit', month:'2-digit' });
  }

  slotISO(dayISO: string, hour: number) {
    return `${dayISO}T${pad2(hour)}:00`;
  }

  apptsAt(dayISO: string, hour: number) {
    const key = this.slotISO(dayISO, hour);
    return this.visibleAppointments().filter(a => a.dateTime === key);
  }

  dragStart(apptId: string) {
    this.draggingId.set(apptId);
  }

  allowDrop(ev: DragEvent) {
    ev.preventDefault();
  }

  dropTo(dayISO: string, hour: number) {
    const id = this.draggingId();
    if (!id) return;
    const newDT = this.slotISO(dayISO, hour);
    try {
      this.hospital.moveAppointment(id, newDT);
      this.draggingId.set(null);
      this.refresh();
      this.toast('Cita movida ✅');
    } catch (e: any) {
      this.toast(e?.message || 'No se pudo mover');
      this.draggingId.set(null);
    }
  }

  // quick
  setToday() {
    this.onlyToday.set(true);
    this.view.set('appointments');
  }
  clearFilters() {
    this.q.set('');
    this.statusFilter.set('todas');
    this.doctorFilter.set('');
    this.onlyToday.set(false);
    this.toast('Filtros limpios');
  }
}