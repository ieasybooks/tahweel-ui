import { createApp } from "vue";
import { createPinia } from "pinia";
import { createI18n } from "vue-i18n";

import App from "./App.vue";
import { messages } from "./i18n";
import "./assets/main.css";

const i18n = createI18n({
  legacy: false,
  locale: "ar",
  fallbackLocale: "en",
  messages,
});

const pinia = createPinia();
const app = createApp(App);

app.use(pinia);
app.use(i18n);
app.mount("#app");
