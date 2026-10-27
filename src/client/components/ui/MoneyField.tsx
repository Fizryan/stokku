import { useId } from 'hono/jsx/dom'
import { formatInteger, parseDigitsToInt } from '../../../shared/formatters.js'

export interface MoneyFieldProps {
  readonly label: string
  readonly value: number
  readonly onValueChange: (amount: number) => void
  readonly helperText?: string
  readonly errorText?: string
  readonly required?: boolean
  readonly disabled?: boolean
  readonly placeholder?: string
  readonly class?: string
}

export function MoneyField(props: MoneyFieldProps) {
  const inputId = useId()
  const errorId = `${inputId}-error`
  const helperId = `${inputId}-helper`
  const hasError = Boolean(props.errorText)
  const descriptionId = hasError ? errorId : props.helperText ? helperId : undefined
  const displayValue = props.value === 0 ? '0' : formatInteger(props.value)

  return (
    <div class={['flex flex-col gap-1.5', props.class ?? ''].join(' ').trim()}>
      <label
        for={inputId}
        class="text-xs font-medium text-m3-on-surface-variant tracking-wide"
      >
        {props.label}
        {props.required && <span class="text-m3-danger ml-0.5">*</span>}
      </label>

      <div class="relative flex items-center">
        <span class="pointer-events-none absolute left-3.5 text-xs font-semibold text-m3-on-surface-variant">
          Rp
        </span>
        <input
          id={inputId}
          type="text"
          inputmode="numeric"
          value={displayValue}
          placeholder={props.placeholder ?? '0'}
          required={props.required}
          disabled={props.disabled}
          aria-invalid={hasError}
          aria-describedby={descriptionId}
          onInput={(e) => {
            const target = e.currentTarget as HTMLInputElement
            const parsed = parseDigitsToInt(target.value)
            props.onValueChange(parsed)
          }}
          class={[
            'h-11 w-full rounded-xl bg-m3-surface-container-lowest pl-9 pr-3.5 text-sm font-medium tabular-nums text-m3-on-surface transition-all duration-150 border focus:outline-none disabled:bg-m3-surface-container disabled:opacity-60',
            hasError
              ? 'border-m3-danger focus:ring-2 focus:ring-m3-danger/20'
              : 'border-m3-outline-variant focus:border-m3-primary focus:ring-2 focus:ring-m3-primary/15',
          ].join(' ')}
        />
      </div>

      {props.errorText ? (
        <p id={errorId} class="text-xs text-m3-danger">
          {props.errorText}
        </p>
      ) : props.helperText ? (
        <p id={helperId} class="text-xs text-m3-on-surface-variant">
          {props.helperText}
        </p>
      ) : null}
    </div>
  )
}
