import { Moon, Sun } from 'lucide-react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { NAV_SECTIONS } from '@/components/layout/nav'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { useTheme } from '@/providers/theme-context'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Cmd/Ctrl+K palette to jump between pages. */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate()
  const { resolvedTheme, toggleTheme } = useTheme()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  const run = (fn: () => void) => {
    onOpenChange(false)
    fn()
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Command palette" description="Jump to a page or run an action">
      <Command>
        <CommandInput placeholder="Jump to…" />
        <CommandList>
          <CommandEmpty>No matches.</CommandEmpty>
          {NAV_SECTIONS.map((section) => (
            <CommandGroup key={section.label} heading={section.label}>
              {section.items.map((item) => (
                <CommandItem
                  key={item.path}
                  value={item.label}
                  keywords={item.keywords}
                  onSelect={() => run(() => navigate(item.path))}
                >
                  <item.icon />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          <CommandSeparator />
          <CommandGroup heading="Preferences">
            <CommandItem value="Toggle theme" keywords={['dark', 'light', 'mode']} onSelect={() => run(toggleTheme)}>
              {resolvedTheme === 'dark' ? <Sun /> : <Moon />}
              Switch to {resolvedTheme === 'dark' ? 'light' : 'dark'} mode
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
