import { useId } from 'hono/jsx/dom'

export interface SelectOption {
  readonly value: string
  readonly label: string
}

export interface SelectFieldProps {
  readonly label?: string
  readonly value: string
  readonly options: readonly SelectOption[]
  readonly onValueChange: (value: string) => void
  readonly disabled?: boolean
  readonly required?: boolean
  readonly errorText?: string
  readonly class?: string
}

export function SelectField(props: SelectFieldProps) {
  const selectId = useId()
  const errorId = `${selectId}-error`
  const hasError = Boolean(props.errorText)

  return (
    <div class={['flex flex-col gap-1.5', props.class ?? ''].join(' ').trim()}>
      {props.label && (
        <label
          for={selectId}
          class="text-xs font-medium text-m3-on-surface-variant tracking-wide"
        >
          {props.label}
          {props.required && <span class="text-m3-danger ml-0.5">*</span>}
        </label>
      )}

      <select
        id={selectId}
        value={props.value}
        disabled={props.disabled}
        required={props.required}
        aria-invalid={hasError}
        aria-describedby={hasError ? errorId : undefined}
        onChange={(e) => {
          const target = e.currentTarget as HTMLSelectElement
          props.onValueChange(target.value)
        }}
        class={[
          'h-11 w-full rounded-xl bg-m3-surface-container-lowest px-3.5 text-sm text-m3-on-surface border transition-all duration-150 focus:outline-none disabled:bg-m3-surface-container disabled:opacity-60 cursor-pointer',
          hasError
            ? 'border-m3-danger focus:ring-2 focus:ring-m3-danger/20'
            : 'border-m3-outline-variant focus:border-m3-primary focus:ring-2 focus:ring-m3-primary/15',
        ].join(' ')}
      >
        {props.options.map((opt) => (
          <option key={opt.value} value={opt.value} selected={opt.value === props.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {props.errorText && (
        <p id={errorId} class="text-xs text-m3-danger">
          {props.errorText}
        </p>
      )}
    </div>
  )
}
