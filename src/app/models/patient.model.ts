export interface MedicalNote {
  id: string;
  dateISO: string; // YYYY-MM-DD
  title: string;
  detail: string;
}

export interface Patient {
  id: string;
  name: string;
  dob: string;      // YYYY-MM-DD
  phone: string;
  email: string;
  photoUrl: string; // url
  allergies: string;
  notes: string;
  createdAt: number;
  history: MedicalNote[];
}