import { render } from 'hono/jsx/dom'
import { App } from './App.js'
import { AuthProvider } from './stores/auth.store.js'
import { PosCartProvider } from './stores/pos-cart.store.js'
import { RouterProvider } from './stores/router.store.js'
import { ToastProvider } from './stores/toast.store.js'
import './styles/app.css'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root tidak ditemukan di index.html')
}

render(
  <ToastProvider>
    <RouterProvider>
      <AuthProvider>
        <PosCartProvider>
          <App />
        </PosCartProvider>
      </AuthProvider>
    </RouterProvider>
  </ToastProvider>,
  rootElement,
)
