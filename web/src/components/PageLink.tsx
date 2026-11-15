import { Link, useNavigate } from 'react-router-dom'
import type { LinkProps } from 'react-router-dom'
import { transitionPage } from '@/lib/pageMotion'

export function PageLink({ to, onClick, ...props }: LinkProps) {
  const navigate = useNavigate()
  return (
    <Link {...props} to={to} onClick={(event) => {
      onClick?.(event)
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey
        || (props.target && props.target !== '_self')) return
      event.preventDefault()
      transitionPage(() => {
        navigate(to)
        window.scrollTo({ top: 0, behavior: 'instant' })
      })
    }} />
  )
}
