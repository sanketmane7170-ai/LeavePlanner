export type Role = "ADMIN" | "EMPLOYEE";
export type LeaveType = "SICK" | "TRANSPORT_WEATHER" | "PERSONAL" | "GENERAL";
export type ProbationRule = "NONE" | "NO_LEAVES" | "UNPAID_ALLOWED";
export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "ABSENT";
export type WfhStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export type HalfDaySlot = "FIRST_HALF" | "SECOND_HALF";
export type SaturdayRule =
  | "NONE"
  | "ALL"
  | "FIRST"
  | "SECOND"
  | "THIRD"
  | "FOURTH"
  | "FIRST_THIRD"
  | "SECOND_FOURTH";

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  isFirstLogin: boolean;
  employee: {
    fullName: string;
    employeeId: string;
    canViewTeamCalendar: boolean;
  } | null;
}

export interface Employee {
  id: string;
  userId: string;
  employeeId: string;
  fullName: string;
  personalEmail?: string;
  mobile?: string;
  department?: string;
  designation?: string;
  dateOfJoining?: string;
  birthday?: string;
  probationMonths: number;
  reportingManagerId?: string;
  reportingManager?: Pick<Employee, "id" | "fullName" | "employeeId">;
  isActive: boolean;
  leavePolicyId?: string;
  leavePolicy?: LeavePolicy;
  wfhPolicyId?: string;
  wfhPolicy?: WfhPolicy;
  workingSchedule?: WorkingSchedule;
  canViewTeamCalendar: boolean;
  user: { email: string; role: Role };
  createdAt: string;
  updatedAt: string;
}

export interface CreateEmployeeDto {
  fullName: string;
  email: string;
  personalEmail?: string;
  mobile?: string;
  department?: string;
  designation?: string;
  dateOfJoining?: string;
  birthday?: string;
  probationMonths?: number;
  reportingManagerId?: string;
  canViewTeamCalendar?: boolean;
}

export interface UpdateEmployeeDto {
  fullName?: string;
  personalEmail?: string;
  mobile?: string;
  department?: string;
  designation?: string;
  dateOfJoining?: string;
  birthday?: string;
  probationMonths?: number;
  reportingManagerId?: string;
  isActive?: boolean;
  leavePolicyId?: string;
  wfhPolicyId?: string;
  canViewTeamCalendar?: boolean;
}

export interface PolicyException {
  id: string;
  policyId: string;
  employeeId: string;
  employee: Pick<Employee, "id" | "fullName" | "employeeId">;
  overrideDays: number;
  blackoutFrom: string;
  blackoutTo: string;
  createdAt: string;
}

export type PolicyRuleOperator = "GTE" | "GT" | "LTE" | "LT" | "EQ";

export interface PolicyRule {
  id: string;
  policyId: string;
  operator: PolicyRuleOperator;
  minDays: number;
  approvalRequired: boolean;
  noticeRequired: boolean;
  minNoticeDays: number;
  exception?: string | null;
  createdAt: string;
}

export interface LeavePolicy {
  id: string;
  name: string;
  leaveType: LeaveType;
  daysAllowed: number;
  approvalRequired: boolean;
  noticeRequired: boolean;
  minNoticeDays: number;
  halfDayAllowed: boolean;
  carryForward: boolean;
  probationRule: ProbationRule;
  createdAt: string;
  employees?: Pick<Employee, "id" | "fullName" | "employeeId">[];
  exceptions?: PolicyException[];
  rules?: PolicyRule[];
}

export interface WfhPolicyException {
  id: string;
  policyId: string;
  employeeId: string;
  employee: Pick<Employee, "id" | "fullName" | "employeeId">;
  overrideDays: number;
  blackoutFrom: string;
  blackoutTo: string;
  createdAt: string;
}

export interface WfhPolicyRule {
  id: string;
  policyId: string;
  operator: PolicyRuleOperator;
  minDays: number;
  approvalRequired: boolean;
  noticeRequired: boolean;
  minNoticeDays: number;
  exception?: string | null;
  createdAt: string;
}

export interface WfhPolicy {
  id: string;
  name: string;
  daysAllowed: number;
  approvalRequired: boolean;
  noticeRequired: boolean;
  minNoticeDays: number;
  halfDayAllowed: boolean;
  probationRule: ProbationRule;
  createdAt: string;
  employees?: Pick<Employee, "id" | "fullName" | "employeeId">[];
  exceptions?: WfhPolicyException[];
  rules?: WfhPolicyRule[];
}

export interface WorkingSchedule {
  id: string;
  employeeId: string;
  workingDays: string[];
  saturdayRule: SaturdayRule;
  monthlyTarget?: number;
}

export interface LeaveApplication {
  id: string;
  employeeId: string;
  employee?: Pick<Employee, "id" | "fullName" | "employeeId">;
  leaveType: LeaveType;
  fromDate: string;
  toDate: string;
  isHalfDay: boolean;
  halfDaySlot?: HalfDaySlot;
  totalDays: number;
  reason: string;
  attachmentUrl?: string;
  status: LeaveStatus;
  adminComment?: string;
  isAdminEntry: boolean;
  isUnpaid: boolean;
  paidDays?: number | null;
  unpaidDays?: number | null;
  noticeViolation?: boolean;
  createdAt: string;
}

export interface WfhApplication {
  id: string;
  employeeId: string;
  employee?: Pick<Employee, "id" | "fullName" | "employeeId">;
  date: string;
  toDate?: string;
  isHalfDay: boolean;
  halfDaySlot?: HalfDaySlot;
  totalDays: number;
  reason: string;
  status: WfhStatus;
  adminComment?: string;
  createdAt: string;
}

export interface LeaveBalance {
  id: string;
  employeeId: string;
  leaveType: LeaveType;
  year: number;
  totalDays: number;
  usedDays: number;
  unpaidDaysUsed: number;
  remainingDays: number;
}

export interface PublicHoliday {
  id: string;
  date: string;
  name: string;
  year: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type AnnouncementPriority = "HIGH" | "MEDIUM" | "LOW";

export interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: AnnouncementPriority;
  scheduledAt?: string;
  expiresAt?: string;
  isActive: boolean;
  isBirthday: boolean;
  targetEmployeeId?: string;
  createdAt: string;
  updatedAt: string;
}
