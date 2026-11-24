import { createRoot } from 'octane'
import { EditingApiDemo } from './EditingApiDemo.tsrx'
import 'markstream-octane/index.css'
import './editing-api.css'

const root = document.getElementById('root')
if (!root)
  throw new Error('Missing #root editing-api mount')

createRoot(root).render(EditingApiDemo)
