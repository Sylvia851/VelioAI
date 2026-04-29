import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useCounterStore = defineStore('counter', () => {
  const energy = ref(0)

  const increment = () => {
    energy.value += 1
  }

  return {
    energy,
    increment,
  }
})
