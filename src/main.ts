import { createApp, ref } from 'vue';
import type { Ref } from 'vue';
import App from './App.vue';

// import de la fonction (runtime)
import { initGrist } from './gristBridge';

// import du type uniquement
import type { Task } from './gristBridge';

const tasks: Ref<Task[]> = ref([]);

initGrist((newTasks) => {
  tasks.value = newTasks;
});

const app = createApp(App);
app.provide('tasks', tasks);
app.mount('#app');
