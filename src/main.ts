import { createApp } from 'vue'

import App from './App.vue'
import router from './router'
import './assets/main.css'

// Follow the system's light or dark setting, also while the app is open.
const dark = window.matchMedia('(prefers-color-scheme: dark)')
const applyTheme = () => document.documentElement.setAttribute('data-bs-theme', dark.matches ? 'dark' : 'light')
applyTheme()
dark.addEventListener('change', applyTheme)

createApp(App).use(router).mount('#app')
