import { createRoot } from 'octane'
import App from './App.tsrx'
import 'katex/dist/katex.min.css'
import 'markstream-octane/index.css'
import './shared/test-lab.css'
import './index.css'

const root = document.getElementById('root')
if (!root)
  throw new Error('Missing #root playground mount')

createRoot(root).render(App)
