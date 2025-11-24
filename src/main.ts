// src/main.ts
import { createApp, ref } from 'vue';
import type { Ref } from 'vue';
import App from './App.vue';
import { initGrist } from './gristBridge';
import type { Task } from './gristBridge';

// État réactif partagé contenant les tâches issues de Grist
const tasks: Ref<Task[]> = ref([]);

initGrist((newTasks) => {
  tasks.value = newTasks;
});

const app = createApp(App);
app.provide('tasks', tasks);
app.mount('#app');
