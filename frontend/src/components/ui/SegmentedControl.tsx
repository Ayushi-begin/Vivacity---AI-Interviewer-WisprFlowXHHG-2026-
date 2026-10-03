import { useRadioGroup } from './radio'

interface Option<T extends string> {
  value: T
  label: string
}

/** A compact radio group. Arrow keys move the selection (WAI-ARIA radio pattern). */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
}) {
  const { onKeyDown, optionProps } = useRadioGroup(
    options.map((o) => o.value),
    value,
    onChange,
  )
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5"
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            {...optionProps(option.value)}
            className={`min-h-9 rounded-md px-3 text-sm font-medium transition-all ${
              selected ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
