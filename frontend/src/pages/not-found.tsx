import { Compass } from 'lucide-react'
import { Link } from 'react-router-dom'

import { EmptyState } from '@/components/signature'
import { Button } from '@/components/ui/button'

export default function NotFoundPage() {
  return (
    <EmptyState
      icon={Compass}
      title="Page not found"
      description="That page doesn’t exist. Use the sidebar or press Ctrl K to jump somewhere."
      action={
        <Button asChild variant="outline" size="sm">
          <Link to="/">Back to dashboard</Link>
        </Button>
      }
    />
  )
}
