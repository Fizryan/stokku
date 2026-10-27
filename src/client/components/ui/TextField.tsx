import { useId } from 'hono/jsx/dom'

export interface TextFieldProps {
  readonly label: string
  readonly value: string
  readonly onValueChange: (value: string) => void
  readonly type?: 'text' | 'password' | 'date' | 'number' | 'search'
  readonly placeholder?: string
  readonly helperText?: string
  readonly errorText?: string
  readonly required?: boolean
  readonly disabled?: boolean
  readonly autoComplete?: string
  readonly inputMode?: 'text' | 'numeric' | 'search'
  readonly maxLength?: number
  readonly class?: string
  readonly onKeyDown?: (e: KeyboardEvent) => void
}

export function TextField(props: TextFieldProps) {
  const inputId = useId()
  const errorId = `${inputId}-error`
  const helperId = `${inputId}-helper`
  const hasError = Boolean(props.errorText)
  const descriptionId = hasError ? errorId : props.helperText ? helperId : undefined

  return (
    <div class={['flex flex-col gap-1.5', props.class ?? ''].join(' ').trim()}>
      <label
        for={inputId}
        class="text-xs font-medium text-m3-on-surface-variant tracking-wide"
      >
        {props.label}
        {props.required && <span class="text-m3-danger ml-0.5">*</span>}
      </label>

      <input
        id={inputId}
        type={props.type ?? 'text'}
        value={props.value}
        placeholder={props.placeholder}
        required={props.required}
        disabled={props.disabled}
        aria-invalid={hasError}
        aria-describedby={descriptionId}
        autocomplete={props.autoComplete}
        inputmode={props.inputMode}
        maxlength={props.maxLength}
        onKeyDown={props.onKeyDown}
        onInput={(e) => {
          const target = e.currentTarget as HTMLInputElement
          props.onValueChange(target.value)
        }}
        class={[
          'h-11 w-full rounded-xl bg-m3-surface-container-lowest px-3.5 text-sm text-m3-on-surface placeholder:text-m3-outline transition-all duration-150 border focus:outline-none disabled:bg-m3-surface-container disabled:opacity-60',
          hasError
            ? 'border-m3-danger focus:ring-2 focus:ring-m3-danger/20'
            : 'border-m3-outline-variant focus:border-m3-primary focus:ring-2 focus:ring-m3-primary/15',
        ].join(' ')}
      />

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
