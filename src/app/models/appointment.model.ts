export type AppointmentStatus = 'programada' | 'en_curso' | 'finalizada' | 'cancelada';

export interface Appointment {
  doctorId: string;
  id: string;
  patientId: string;
  doctor: string;
  dateTime: string; // YYYY-MM-DDTHH:mm
  reason: string;
  status: AppointmentStatus;
  createdAt: number;
}