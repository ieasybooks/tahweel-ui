import { defineStore } from "pinia"
import { ref } from "vue"

export interface Toast {
  id: number
  messageKey: string
  messageParams?: Record<string, string | number>
  type: "error" | "success" | "warning" | "info"
  duration?: number
}

let toastId = 0

export const useToastStore = defineStore("toast", () => {
  const toasts = ref<Toast[]>([])

  function addToast(
    messageKey: string,
    type: Toast["type"] = "info",
    duration: number = 5000,
    messageParams?: Record<string, string | number>,
  ) {
    const id = ++toastId
    toasts.value.push({ id, messageKey, messageParams, type, duration })

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id)
      }, duration)
    }

    return id
  }

  function removeToast(id: number) {
    const index = toasts.value.findIndex((t) => t.id === id)
    if (index !== -1) {
      toasts.value.splice(index, 1)
    }
  }

  function error(
    messageKey: string,
    params?: Record<string, string | number>,
    duration?: number,
  ) {
    return addToast(messageKey, "error", duration, params)
  }

  function success(
    messageKey: string,
    params?: Record<string, string | number>,
    duration?: number,
  ) {
    return addToast(messageKey, "success", duration, params)
  }

  function warning(
    messageKey: string,
    params?: Record<string, string | number>,
    duration?: number,
  ) {
    return addToast(messageKey, "warning", duration, params)
  }

  function info(
    messageKey: string,
    params?: Record<string, string | number>,
    duration?: number,
  ) {
    return addToast(messageKey, "info", duration, params)
  }

  function clear() {
    toasts.value = []
  }

  return {
    toasts,
    addToast,
    removeToast,
    error,
    success,
    warning,
    info,
    clear,
  }
})
