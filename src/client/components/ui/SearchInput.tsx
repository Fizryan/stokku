import { useEffect, useRef, useState } from 'hono/jsx/dom'
import { IconClose, IconSearch } from './Icons.js'

export interface SearchInputProps {
  readonly placeholder: string
  readonly ariaLabel?: string
  readonly value?: string
  readonly debounceMs?: number
  readonly onDebouncedChange: (value: string) => void
  readonly onEnterSubmit?: (rawValue: string, clearInput: () => void) => void
  readonly class?: string
}

export function SearchInput(props: SearchInputProps) {
  const [localValue, setLocalValue] = useState(props.value ?? '')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callbackRef = useRef(props.onDebouncedChange)
  callbackRef.current = props.onDebouncedChange

  useEffect(() => {
    if (props.value !== undefined && props.value !== localValue) {
      setLocalValue(props.value)
    }
  }, [props.value])

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  const scheduleEmit = (nextValue: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    const waitMs = props.debounceMs ?? 280
    timerRef.current = setTimeout(() => {
      callbackRef.current(nextValue.trim())
    }, waitMs)
  }

  const clearInput = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    setLocalValue('')
    callbackRef.current('')
  }

  return (
    <div class={['relative flex items-center', props.class ?? ''].join(' ').trim()}>
      <span class="pointer-events-none absolute left-3.5 text-m3-on-surface-variant">
        <IconSearch class="w-4 h-4" />
      </span>

      <input
        type="search"
        value={localValue}
        placeholder={props.placeholder}
        aria-label={props.ariaLabel ?? props.placeholder}
        onInput={(e) => {
          const next = (e.currentTarget as HTMLInputElement).value
          setLocalValue(next)
          scheduleEmit(next)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && props.onEnterSubmit) {
            e.preventDefault()
            const trimmed = localValue.trim()
            if (trimmed.length > 0) {
              props.onEnterSubmit(trimmed, clearInput)
            }
          }
        }}
        class="h-11 w-full rounded-full bg-m3-surface-container-low pl-10 pr-9 text-sm text-m3-on-surface placeholder:text-m3-outline border border-m3-outline-variant/70 focus:bg-m3-surface-container-lowest focus:border-m3-primary focus:ring-2 focus:ring-m3-primary/15 focus:outline-none transition-all duration-150"
      />

      {localValue.length > 0 && (
        <button
          type="button"
          onClick={clearInput}
          aria-label="Bersihkan pencarian"
          class="absolute right-2.5 w-6 h-6 rounded-full flex items-center justify-center text-m3-on-surface-variant hover:bg-m3-surface-container-high cursor-pointer"
        >
          <IconClose class="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
