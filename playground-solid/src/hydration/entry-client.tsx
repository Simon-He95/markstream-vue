import { hydrate } from 'solid-js/web'
import { HydrationApp } from './HydrationApp'
import 'markstream-solid/index.css'

const root = document.getElementById('app')
if (!root)
  throw new Error('hydration fixture: #app is missing')

hydrate(() => <HydrationApp />, root)
