export interface RfpLineItem {
  id: string;
  description: string;
  qty: number | "";
  unit: string;
  unitPrice: number | "";
  amount: number;
}

export type PaymentMethod = "cash" | "check" | "online" | "";
export type UrgencyLevel = "urgent" | "not_urgent" | "";

export interface DepartmentPreset {
  code: string;
  name: string;
  badgeBg: string;
  badgeText: string;
}

export const DEPARTMENT_PRESETS: DepartmentPreset[] = [
  { code: "COD", name: "COD", badgeBg: "#FF2D78", badgeText: "#FFFFFF" },
  { code: "MARKETING", name: "MARKETING", badgeBg: "#5E3BEE", badgeText: "#FFFFFF" },
  { code: "CRD", name: "CRD", badgeBg: "#9D4EDD", badgeText: "#FFFFFF" },
  { code: "LR", name: "LR", badgeBg: "#E65100", badgeText: "#FFFFFF" },
  { code: "ISD", name: "ISD", badgeBg: "#4A5568", badgeText: "#FFFFFF" }, // Replaced TR with ISD per user request
  { code: "VisMin", name: "VisMin", badgeBg: "#E000B0", badgeText: "#FFFFFF" },
  { code: "CPI", name: "CPI", badgeBg: "#E6ECFE", badgeText: "#3D52A0" },
  { code: "BD", name: "BD", badgeBg: "#E3EEFD", badgeText: "#1E65D6" },
  { code: "HR", name: "HR", badgeBg: "#EAF2FD", badgeText: "#0277BD" },
  { code: "R&A", name: "R&A", badgeBg: "#76B8A3", badgeText: "#134438" },
];

export const DEPARTMENT_NAMES = DEPARTMENT_PRESETS.map((d) => d.name);

export interface SupportingFile {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl: string; // base64 for preview / client upload
}

export interface RfpFormData {
  // Document Reference / Revision
  taskId?: string; // If editing an existing ClickUp task
  
  // Header
  date: string;
  payee: string;
  department: string;
  
  // Items Table
  items: RfpLineItem[];
  totalAmount: number;
  
  // Purpose
  purpose: string;
  
  // Payment Details
  paymentMethod: PaymentMethod;
  paymentMethods?: string[]; // Multi-select: ["cash", "check", "online"]
  bank: string;
  accountName: string;
  accountNumber: string;
  
  // Urgency & Timeline
  urgency: UrgencyLevel;
  urgencyOptions?: string[]; // Multi-select: ["urgent", "not_urgent"]
  dateNeeded: string;
  
  // Requested By (Sign-off)
  requestedByName: string;
  requestedByEmail: string;
  signatureType: "draw" | "upload" | "none";
  signatureDataUrl?: string;
  requestedByRemarks: string;
  
  // Approver / Finance Placeholders
  approvedByName?: string;
  approvedBySignature?: string;
  approverName?: string;
  approverEmail?: string;
  receivedByName?: string;
  receivedBySignature?: string;

  // Supporting files
  supportingFiles?: SupportingFile[];
}

export type FormType = "rfp" | "po" | "pcv";

export interface PoLineItem {
  id: string;
  itemNo: number;
  details: string;
  unit: string;
  quantity: number | "";
  unitPrice: number | "";
  total: number;
}

export interface PoFormData {
  taskId?: string;
  formType?: "po";
  date: string;
  poNumber: string;
  
  // Vendor Information
  vendorName: string;
  address: string;
  tin: string;
  contactNo: string;
  emailAddress: string;
  accountManager: string;
  
  // Items & Financials
  items: PoLineItem[];
  subtotal: number;
  vatRate: number; // e.g. 12
  vatAmount: number;
  netOfVat: number;
  withholdingTaxRate: number; // e.g. 2
  withholdingTaxAmount: number;
  totalAmountDue: number;
  additionalNotes: string;

  // Department & Timeline
  department: string;
  dateNeeded: string;
  urgency: UrgencyLevel;
  
  // Signatures
  preparedByName: string;
  preparedByDate: string;
  notedByName: string;
  notedByDate: string;
  approvedByName: string;
  approvedByDate: string;
  conformeName: string;
  conformeDate: string;

  supportingFiles?: SupportingFile[];
}

export interface PcvParticularItem {
  id: string;
  description: string;
  amount: number | "";
}

export interface PcvFormData {
  taskId?: string;
  formType?: "pcv";
  voucherNo: string;
  date: string;
  payee: string; // Employee
  department: string;
  amount: number; // Auto-sum of particulars
  dateNeeded: string;
  urgency: UrgencyLevel;

  particulars: PcvParticularItem[];
  particularsNotes?: string;

  // Signatures
  requestedByName: string;
  notedByName: string;
  approvedByName: string;
  receivedByName: string;

  supportingFiles?: SupportingFile[];
}

export interface ClickUpTaskResponse {
  id: string;
  name: string;
  url: string;
  custom_id?: string;
  status?: { status: string; color: string };
  isMock?: boolean;
  pendingSync?: boolean;
}

export interface SubmissionResponse {
  success: boolean;
  taskId: string;
  taskUrl: string;
  message: string;
  isMock: boolean;
  taskData?: any;
}

