/**
 * بوابة الصلاحيات — تُظهر محتواها فقط إن كان الدور الحالي يملك الصلاحية.
 *
 * ⚠️ هذا للراحة البصرية فقط. إخفاء الزر ليس حماية —
 *    الحماية الفعلية في قواعد Firestore وعلى الخادم.
 */

import type { ReactNode } from "react";
import { usePermissions } from "../lib/usePermissions";
import type { AccessContext, Permission } from "../lib/permissions";

type Action = "view" | "create" | "update" | "delete" | "approve";

interface PermissionGateProps {
  permission: Permission;
  /** نوع العملية المطلوبة — الافتراضي "view" */
  action?: Action;
  /** سياق السجل — لازم لتفسير "المكلف بها" */
  ctx?: AccessContext;
  /** ما يُعرض عند عدم امتلاك الصلاحية — الافتراضي لا شيء */
  fallback?: ReactNode;
  children: ReactNode;
}

export default function PermissionGate({
  permission,
  action = "view",
  ctx,
  fallback = null,
  children,
}: PermissionGateProps) {
  const perms = usePermissions();

  const allowed =
    action === "create"  ? perms.canCreate(permission)
    : action === "update" ? perms.canUpdate(permission, ctx)
    : action === "delete" ? perms.canDelete(permission, ctx)
    : action === "approve" ? perms.canApprove(permission)
    : perms.canView(permission, ctx);

  return <>{allowed ? children : fallback}</>;
}
