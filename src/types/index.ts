import { Request } from 'express';
import { User, UserRole } from '@prisma/client';

// Extend Express Request to include user
export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    cooperativeId: string | null;
    memberId?: string;
  };
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// Pagination
export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Auth types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    cooperativeId: string | null;
    cooperativeName?: string;
  };
  expiresIn: string;
}

// Period type
export interface Period {
  year: number;
  month: number;
}

// Dashboard KPI
export interface DashboardKPI {
  id: string;
  label: string;
  value: number;
  previousValue?: number;
  trend: 'up' | 'down' | 'stable';
  format: 'currency' | 'percentage' | 'number';
}

// Balance Sheet
export interface BalanceSheetSummary {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  isBalanced: boolean;
}

// Cash Flow
export interface CashFlowSummary {
  operating: number;
  investing: number;
  financing: number;
  netCashFlow: number;
}

// Membership Fee Summary
export interface MembershipFeeSummary {
  totalExpected: number;
  totalPaid: number;
  totalDebt: number;
  membersWithDebt: number;
  totalMembers: number;
  collectionRate: number;
}

// Odoo Config
export interface OdooConfigInput {
  url: string;
  database: string;
  username: string;
  apiKey: string;
  companyId?: number;
}

// Notification
export interface SendNotificationInput {
  title: string;
  message: string;
  recipientType: 'all' | 'with_debt' | 'specific';
  specificUserIds?: string[];
}

// Upload Result
export interface UploadResult {
  status: 'success' | 'partial' | 'failed';
  message: string;
  recordsCount: number;
  errors?: string[];
}

// User creation
export interface CreateUserInput {
  email: string;
  name: string;
  role: UserRole;
  password?: string;
}
