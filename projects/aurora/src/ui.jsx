// Small building blocks shared by the page components.
import React from "react";
import { CalendarDays } from "lucide-react";

export const cx = (...values) => values.filter(Boolean).join(" ");

export function Empty({ icon: Icon = CalendarDays, title, children, action }) {
  return (
    <div className="empty">
      <Icon size={28} strokeWidth={1.25} />
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(checked)}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx("toggle", checked && "on")}
    >
      <span />
    </button>
  );
}
