export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  colorTag?: string; // solo etiqueta
  createdAt: number;
}