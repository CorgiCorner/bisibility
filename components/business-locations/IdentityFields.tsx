import { HelpButton } from "@/components/ui/HelpButton";
import { compactInputClassName, Input } from "@/components/ui/Input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { Tooltip } from "@/components/ui/Tooltip";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import type { BusinessTranslator } from "./contracts";
import { type IdentityFormValues, identityFieldNames } from "./identity-form";

export function IdentityFields({
  id,
  register,
  errors,
  role,
  onRoleChange,
  roleDisabled,
  disabled,
  translate: t,
}: {
  id: string;
  register: UseFormRegister<IdentityFormValues>;
  errors: FieldErrors<IdentityFormValues>;
  role: IdentityFormValues["role"];
  onRoleChange: (role: IdentityFormValues["role"]) => void;
  roleDisabled: boolean;
  disabled: boolean;
  translate: BusinessTranslator;
}) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
      {identityFieldNames.map((field) => (
        <div
          key={field}
          className={
            field === "reason" || field === "mapsUrl" ? "min-w-0 sm:col-span-2" : "min-w-0"
          }
        >
          <label
            className="mb-1 block text-[12px] font-medium leading-4 text-fg-muted"
            htmlFor={`${id}-${field}`}
          >
            {t(`fields.${field}`)}
          </label>
          <Input
            className={compactInputClassName}
            id={`${id}-${field}`}
            {...register(field)}
            disabled={disabled}
            inputMode={field === "latitude" || field === "longitude" ? "decimal" : "text"}
            autoComplete="off"
            spellCheck={field === "name" || field === "address" || field === "reason"}
            aria-invalid={Boolean(errors[field])}
            aria-describedby={errors[field] ? `${id}-${field}-error` : undefined}
          />
          {errors[field] ? (
            <p
              id={`${id}-${field}-error`}
              className="m-0 mt-1 text-[11.5px] leading-4 text-red-text"
            >
              {t(
                field === "latitude" || field === "longitude"
                  ? "validation.coordinates"
                  : `validation.${field}`,
              )}
            </p>
          ) : null}
        </div>
      ))}
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-1.5">
          <p className="m-0 text-[12px] font-medium leading-4 text-fg-muted">{t("fields.role")}</p>
          <Tooltip content={t("identityHelp")} semantics="description">
            <HelpButton
              aria-label={t("helpLabel", { section: t("fields.role") })}
              className="size-6 min-h-6 p-0 text-fg-muted"
            />
          </Tooltip>
        </div>
        <MenuSelect
          size="input"
          triggerClassName="min-h-[34px] text-[12px]"
          ariaLabel={t("fields.role")}
          value={role}
          disabled={disabled || roleDisabled}
          options={[
            { value: "subject", label: t("roles.subject") },
            { value: "competitor", label: t("roles.competitor") },
          ]}
          onChange={(value) => {
            if (value === "subject" || value === "competitor") onRoleChange(value);
          }}
        />
      </div>
    </div>
  );
}
