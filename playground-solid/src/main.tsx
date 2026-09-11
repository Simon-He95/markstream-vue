import { render } from 'solid-js/web'
import App from './App'
import 'katex/dist/katex.min.css'
import 'markstream-solid/index.css'
import './shared/test-lab.css'
import './index.css'

const root = document.getElementById('root')
if (!root)
  throw new Error('playground-solid: #root is missing')

render(() => (
  <div class="markstream-solid h-full">
    <App />
  </div>
), root)
