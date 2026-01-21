<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

const { t } = useI18n();

const emit = defineEmits<{
  (e: "files-dropped", paths: string[]): void;
}>();

const isDragging = ref(false);
let unlistenDragEnter: UnlistenFn | null = null;
let unlistenDragLeave: UnlistenFn | null = null;
let unlistenDrop: UnlistenFn | null = null;

const SUPPORTED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];

function isSupportedFile(path: string): boolean {
  const ext = path.toLowerCase().match(/\.[^.]+$/)?.[0] || "";
  return SUPPORTED_EXTENSIONS.includes(ext);
}

onMounted(async () => {
  // Listen for Tauri drag-drop events
  unlistenDragEnter = await listen("tauri://drag-enter", () => {
    isDragging.value = true;
  });

  unlistenDragLeave = await listen("tauri://drag-leave", () => {
    isDragging.value = false;
  });

  unlistenDrop = await listen<{ paths: string[] }>("tauri://drag-drop", (event) => {
    isDragging.value = false;
    const supportedFiles = event.payload.paths.filter(isSupportedFile);
    if (supportedFiles.length > 0) {
      emit("files-dropped", supportedFiles);
    }
  });
});

onUnmounted(() => {
  unlistenDragEnter?.();
  unlistenDragLeave?.();
  unlistenDrop?.();
});
</script>

<template>
  <!-- Drop Zone Overlay -->
  <Transition
    enter-active-class="transition-opacity duration-200"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-200"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="isDragging"
      class="fixed inset-0 z-50 bg-green-500/20 backdrop-blur-sm flex items-center justify-center"
    >
      <div class="bg-white rounded-2xl shadow-2xl p-8 m-8 border-4 border-dashed border-green-500">
        <div class="text-center space-y-4">
          <svg
            class="w-16 h-16 mx-auto text-green-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <p class="text-xl font-semibold text-gray-700">
            {{ $t("dropzone.dropHere") }}
          </p>
          <p class="text-sm text-gray-500">
            {{ $t("dropzone.supportedFormats") }}
          </p>
        </div>
      </div>
    </div>
  </Transition>
</template>
