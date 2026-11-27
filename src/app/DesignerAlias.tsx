import { Navigate, useLocation } from 'react-router-dom'

/**
 * The designer used to live at /patterns/design. It is now the "Make your own" tab
 * (/patterns?tab=design&face=…), so arrowing through the tabs never leaves the page; old links
 * keep working, with their face and slices.
 */
export function DesignerAlias() {
  const { search } = useLocation()
  const params = new URLSearchParams([['tab', 'design']])
  for (const [name, value] of new URLSearchParams(search)) if (name !== 'tab') params.append(name, value)
  return <Navigate to={`/patterns?${params}`} replace />
}
