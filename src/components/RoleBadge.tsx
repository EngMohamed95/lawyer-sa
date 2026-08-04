/** شارة الدور — تعرض اسم الدور بالعربية بلون مميّز */

import { normalizeRole, ROLE_COLORS, ROLE_LABELS_AR } from "../lib/roles";

interface RoleBadgeProps {
  role: unknown;
  size?: "sm" | "md";
  className?: string;
}

export default function RoleBadge({ role, size = "sm", className = "" }: RoleBadgeProps) {
  const r = normalizeRole(role);
  const sizing = size === "md" ? "text-sm px-3 py-1" : "text-[11px] px-2 py-0.5";

  return (
    <span
      className={`inline-flex items-center rounded-full border font-bold whitespace-nowrap ${ROLE_COLORS[r]} ${sizing} ${className}`}
    >
      {ROLE_LABELS_AR[r]}
    </span>
  );
}
