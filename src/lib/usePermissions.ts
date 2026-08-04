/**
 * Hook الصلاحيات — يقرأ دور المستخدم الحالي ويكشف دوال المصفوفة جاهزة.
 *
 * مصدر الدور اليوم هو localStorage (كما في بقية النظام القائم).
 * عند تفعيل Custom Claims في الميزة 001 يتغيّر السطر الواحد في
 * currentRole() فقط، وكل ما يعتمد عليه يعمل بلا تعديل.
 */

import { useMemo } from "react";
import { useOfficeSettings } from "./officeSettings";
import { normalizeRole, ROLES, type Role } from "./roles";
import {
  can, canApprove, canCreate, canDelete, canUpdate, canView,
  createsDraftOnly, isFieldLimited, isOwnOnly, isUploadOnly,
  scopeOf, type AccessContext, type Permission, type Scope,
} from "./permissions";

/** دور المستخدم الحالي */
export function currentRole(): Role {
  if (typeof window === "undefined") return ROLES.TRAINEE;
  return normalizeRole(window.localStorage.getItem("userRole"));
}

/** معرّف المستخدم الحالي — لتفسير "المكلف بها" */
export function currentUserId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("userId");
}

/** معرّف المكتب الذي ينتمي له المستخدم */
export function currentLawyerId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("lawyerId");
}

export interface PermissionsApi {
  role: Role;
  userId: string | null;
  lawyerId: string | null;
  scopeOf: (permission: Permission) => Scope;
  can: (permission: Permission) => boolean;
  canView: (permission: Permission, ctx?: AccessContext) => boolean;
  canCreate: (permission: Permission) => boolean;
  canUpdate: (permission: Permission, ctx?: AccessContext) => boolean;
  canDelete: (permission: Permission, ctx?: AccessContext) => boolean;
  canApprove: (permission: Permission) => boolean;
  createsDraftOnly: (permission: Permission) => boolean;
  isFieldLimited: (permission: Permission) => boolean;
  isUploadOnly: (permission: Permission) => boolean;
  isOwnOnly: (permission: Permission) => boolean;
}

export function usePermissions(): PermissionsApi {
  const role = currentRole();
  const userId = currentUserId();
  const lawyerId = currentLawyerId();
  // الاشتراك في تجاوزات المكتب: أي حفظ في الإعدادات يعيد حساب الصلاحيات فوراً
  const office = useOfficeSettings();

  return useMemo<PermissionsApi>(() => {
    // نُكمل السياق بمعرّف المستخدم تلقائياً حتى لا يمرّره كل نداء
    const withUser = (ctx?: AccessContext): AccessContext => ({ userId, ...ctx });

    return {
      role,
      userId,
      lawyerId,
      scopeOf: (p) => scopeOf(role, p),
      can: (p) => can(role, p),
      canView: (p, ctx) => canView(role, p, withUser(ctx)),
      canCreate: (p) => canCreate(role, p),
      canUpdate: (p, ctx) => canUpdate(role, p, withUser(ctx)),
      canDelete: (p, ctx) => canDelete(role, p, withUser(ctx)),
      canApprove: (p) => canApprove(role, p),
      createsDraftOnly: (p) => createsDraftOnly(role, p),
      isFieldLimited: (p) => isFieldLimited(role, p),
      isUploadOnly: (p) => isUploadOnly(role, p),
      isOwnOnly: (p) => isOwnOnly(role, p),
    };
  }, [role, userId, lawyerId, office]);
}
