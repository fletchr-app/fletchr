import { IonicVue } from '@ionic/vue'
import { createApp } from 'vue'

import '@ionic/vue/css/core.css'
import '@ionic/vue/css/normalize.css'
import '@ionic/vue/css/structure.css'
import '@ionic/vue/css/typography.css'
import '@ionic/vue/css/palettes/dark.class.css'

import App from './App.vue'
import { initTheme } from './composables/useTheme'
import router from './router'
import './assets/main.css'

initTheme()

createApp(App).use(IonicVue).use(router).mount('#app')
