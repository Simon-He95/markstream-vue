/// <reference types="vite/client" />

declare module 'markstream-vue2/workers/*?worker&inline' {
  const WorkerFactory: {
    new (): Worker
  }
  export default WorkerFactory
}

declare module 'markstream-vue2/workers/*?worker' {
  const WorkerFactory: {
    new (): Worker
  }
  export default WorkerFactory
}
