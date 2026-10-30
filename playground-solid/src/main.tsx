import { render } from 'solid-js/web'
import '@unocss/reset/tailwind.css'
import 'markstream-solid/index.css'
import 'katex/dist/katex.min.css'
import './style.css'
import './workers'

if (location.pathname === '/component-parity') {
  void import('./ComponentParity').then(module => render(() => <module.default />, document.getElementById('root')!))
}
else if (location.pathname === '/line-number-handoff-check') {
  void import('./HandoffCheck').then(module => render(() => <module.default />, document.getElementById('root')!))
}
else if (new URLSearchParams(location.search).has('hydrate')) {
  void import('./hydrate')
}
else if (new URLSearchParams(location.search).has('benchmark')) {
  void import('./benchmark').then(module => module.mountBenchmark(document.getElementById('root')!))
}
else {
  void import('./App').then(module => render(() => <module.default />, document.getElementById('root')!))
}
